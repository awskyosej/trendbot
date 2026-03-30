/**
 * Lambda Handler - MCP 서버 엔트리포인트
 *
 * Lambda function이 MCP 서버로 동작한다.
 * Kiro IDE가 Lambda를 MCP 서버로 등록하여 Lambda invocation을 통해
 * JSON-RPC 메시지를 교환한다.
 *
 * Lambda 타임아웃 설정 가이드:
 * - CDK에서 Lambda 타임아웃을 5분(300초)으로 설정 권장
 * - Bedrock/AgentCore 호출은 각각 최대 60초 소요 가능
 * - 4개 에이전트 병렬 실행 + 포맷팅 시간을 고려하여 충분한 여유 확보 필요
 * - Lambda 타임아웃 발생 시 진행 중인 Bedrock/AgentCore 호출이 중단될 수 있음
 * - 부분 실패 허용: Promise.allSettled()로 일부 에이전트 실패 시에도 성공한 결과 반환
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 3.2, 3.3, 8.1, 8.2, 8.3, 9.4, 9.5
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { LambdaEvent, LambdaResponse, JsonRpcRequest, JsonRpcResponse } from "../types/index.js";
import { JSON_RPC_ERROR_CODES } from "../types/index.js";
import {
  parseEvent,
  formatResponse,
  createErrorResponse,
  handleParseError,
} from "../utils/jsonrpc.js";
import { registerTools } from "./tools.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";

/**
 * 모듈 레벨 MCP 서버 인스턴스 캐시
 *
 * Lambda 웜 스타트 시 기존 인스턴스를 재사용하여 초기화 오버헤드를 줄인다.
 * 콜드 스타트 시에만 새로운 인스턴스를 생성한다.
 *
 * Requirements: 8.1, 8.2, 8.3
 */
let cachedMcpServer: McpServer | null = null;

/**
 * MCP 서버 인스턴스를 가져온다.
 *
 * 웜 스타트 시 캐시된 인스턴스를 재사용하고,
 * 콜드 스타트 시 새로운 인스턴스를 생성하여 캐시한다.
 *
 * @returns McpServer 인스턴스
 */
function getMcpServer(): McpServer {
  if (cachedMcpServer) {
    return cachedMcpServer;
  }

  const server = new McpServer(
    {
      name: "customer-trends-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );

  // Tool 등록
  registerTools(server);

  // Resource 등록
  registerResources(server);

  // Prompt 등록
  registerPrompts(server);

  cachedMcpServer = server;
  return server;
}

/**
 * Lambda 환경용 커스텀 Transport
 *
 * Lambda는 단일 요청-응답 모델이므로, 하나의 JSON-RPC 메시지를 보내고
 * 하나의 응답을 캡처하는 간단한 Transport를 구현한다.
 */
class LambdaTransport implements Transport {
  private _response: JsonRpcResponse | null = null;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: unknown) => void;
  sessionId?: string;

  async start(): Promise<void> {
    // Lambda transport is ready immediately
  }

  async send(message: unknown): Promise<void> {
    // MCP 서버가 보내는 응답을 캡처
    this._response = message as JsonRpcResponse;
  }

  async close(): Promise<void> {
    this.onclose?.();
  }

  /**
   * 외부에서 JSON-RPC 요청을 주입하여 MCP 서버에 전달
   */
  injectMessage(message: JsonRpcRequest): void {
    if (this.onmessage) {
      this.onmessage(message);
    }
  }

  /**
   * MCP 서버의 응답을 가져온다
   */
  getResponse(): JsonRpcResponse | null {
    return this._response;
  }
}

/**
 * Lambda Handler
 *
 * Lambda event에서 JSON-RPC 요청을 파싱하고 MCP 서버에 전달하여
 * 결과를 반환한다.
 *
 * - 콜드 스타트: MCP 서버 인스턴스를 새로 생성하고 캐시
 * - 웜 스타트: 캐시된 MCP 서버 인스턴스를 재사용
 * - 실행 완료 시: Transport를 정리하여 리소스 해제
 */
export const handler = async (event: LambdaEvent): Promise<LambdaResponse> => {
  // 1. JSON-RPC 요청 파싱 (유틸리티 사용)
  let jsonRpcRequest: JsonRpcRequest;
  try {
    jsonRpcRequest = parseEvent(event);
  } catch (error) {
    return handleParseError(error);
  }

  // 2. MCP 서버 인스턴스 가져오기 (웜 스타트 시 캐시 재사용)
  const mcpServer = getMcpServer();
  const transport = new LambdaTransport();

  try {
    await mcpServer.connect(transport);

    // 3. JSON-RPC 요청을 MCP 서버에 전달
    transport.injectMessage(jsonRpcRequest);

    // 4. 응답 대기 (MCP 서버가 비동기로 처리 후 transport.send()를 호출)
    await waitForResponse(transport);

    const response = transport.getResponse();
    if (response) {
      return formatResponse(response);
    }

    // 응답이 없는 경우 (notification 등)
    return formatResponse(
      createErrorResponse(
        jsonRpcRequest.id,
        JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
        "No response from MCP server"
      )
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return formatResponse(
      createErrorResponse(
        jsonRpcRequest.id,
        JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
        errorMessage
      )
    );
  } finally {
    // Transport 리소스 정리 (MCP 서버 인스턴스는 웜 스타트를 위해 유지)
    await transport.close();
  }
};

/**
 * Transport에서 응답이 올 때까지 대기한다.
 * 최대 100ms 간격으로 50회(5초) 대기한다.
 */
async function waitForResponse(
  transport: LambdaTransport,
  maxAttempts = 50,
  intervalMs = 100
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    if (transport.getResponse() !== null) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
