/**
 * JSON-RPC 2.0 파싱/직렬화 유틸리티
 *
 * Lambda event를 JSON-RPC 요청으로 파싱하고,
 * JSON-RPC 응답을 포맷팅/직렬화하는 함수들을 제공한다.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import type {
  LambdaEvent,
  LambdaResponse,
  JsonRpcRequest,
  JsonRpcResponse,
} from "../types/index.js";
import { JSON_RPC_ERROR_CODES } from "../types/index.js";

// --- 커스텀 에러 클래스 ---

/**
 * 유효하지 않은 JSON 파싱 시 발생하는 에러 (Parse Error -32700)
 */
export class JsonRpcParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonRpcParseError";
  }
}

/**
 * 유효하지 않은 JSON-RPC 요청 시 발생하는 에러 (Invalid Request -32600)
 */
export class JsonRpcInvalidRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonRpcInvalidRequestError";
  }
}

// --- 검증 함수 ---

/**
 * JSON-RPC 2.0 요청 형식을 검증한다.
 * - jsonrpc 필드가 "2.0"이어야 한다
 * - method 필드가 문자열이어야 한다
 * - id 필드는 문자열 또는 숫자여야 한다 (없을 수도 있음 - notification)
 */
export function isValidJsonRpcRequest(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    obj.jsonrpc === "2.0" &&
    typeof obj.method === "string" &&
    (obj.id === undefined ||
      typeof obj.id === "string" ||
      typeof obj.id === "number")
  );
}

// --- 파싱 함수 ---

/**
 * Lambda event에서 JSON-RPC 요청을 파싱한다.
 *
 * event.body에 JSON-RPC 2.0 메시지가 포함되어 있다고 가정한다.
 * - body가 비어있으면 Parse Error
 * - 유효하지 않은 JSON이면 Parse Error (-32700)
 * - 유효하지 않은 JSON-RPC 형식이면 Invalid Request (-32600)
 *
 * @throws {JsonRpcParseError} 유효하지 않은 JSON
 * @throws {JsonRpcInvalidRequestError} 유효하지 않은 JSON-RPC 요청
 */
export function parseEvent(event: LambdaEvent): JsonRpcRequest {
  const body = event.body;
  if (!body) {
    throw new JsonRpcParseError("Request body is empty");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new JsonRpcParseError("Invalid JSON");
  }

  if (!isValidJsonRpcRequest(parsed)) {
    throw new JsonRpcInvalidRequestError("Invalid JSON-RPC 2.0 request");
  }

  return parsed as JsonRpcRequest;
}

// --- 응답 생성 함수 ---

/**
 * JSON-RPC 에러 응답을 생성한다.
 */
export function createErrorResponse(
  id: string | number | null,
  code: number,
  message: string
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id: id ?? 0,
    error: {
      code,
      message,
    },
  };
}

/**
 * JSON-RPC 응답을 Lambda 응답 형식으로 포맷팅한다.
 */
export function formatResponse(
  body: JsonRpcResponse,
  statusCode = 200
): LambdaResponse {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

/**
 * JsonRpcResponse를 JSON 문자열로 직렬화한다.
 */
export function serialize(response: JsonRpcResponse): string {
  return JSON.stringify(response);
}

// --- 에러 핸들링 헬퍼 ---

/**
 * 파싱 에러를 적절한 JSON-RPC 에러 응답이 포함된 LambdaResponse로 변환한다.
 * - JsonRpcParseError → Parse Error (-32700)
 * - JsonRpcInvalidRequestError → Invalid Request (-32600)
 * - 기타 → Internal Error (-32603)
 */
export function handleParseError(error: unknown): LambdaResponse {
  if (error instanceof JsonRpcParseError) {
    return formatResponse(
      createErrorResponse(null, JSON_RPC_ERROR_CODES.PARSE_ERROR, error.message)
    );
  }
  if (error instanceof JsonRpcInvalidRequestError) {
    return formatResponse(
      createErrorResponse(
        null,
        JSON_RPC_ERROR_CODES.INVALID_REQUEST,
        error.message
      )
    );
  }
  return formatResponse(
    createErrorResponse(
      null,
      JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
      "Internal server error"
    )
  );
}
