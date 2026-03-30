/**
 * Resource Registry
 *
 * MCP 서버에 Resource를 등록하는 모듈.
 * server.resource() 메서드를 사용하여 Resource 등록 인프라를 제공한다.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * MCP 서버에 Resource를 등록한다.
 *
 * 현재는 예시 리소스(서버 상태)를 등록하여 Resource 등록 인프라를 검증한다.
 * 향후 비즈니스 리소스가 추가되면 이 함수에서 등록한다.
 *
 * @param server - McpServer 인스턴스
 */
export function registerResources(server: McpServer): void {
  // NOTE: Zod v3.25+와 MCP SDK 간 타입 추론 깊이 제한 이슈로 인해
  // server를 any로 캐스팅하여 resource() 호출. 런타임 동작에는 영향 없음.
  const srv = server as any;

  // 예시 리소스: 서버 상태 정보
  srv.resource(
    "server-status",
    "mcp://customer-trends-mcp/status",
    {
      description: "MCP 서버의 현재 상태 및 버전 정보를 제공합니다.",
      mimeType: "application/json",
    },
    async (uri: URL) => {
      const status = {
        name: "customer-trends-mcp",
        version: "1.0.0",
        status: "running",
        timestamp: new Date().toISOString(),
        capabilities: ["tools", "resources", "prompts"],
      };

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(status, null, 2),
          },
        ],
      };
    }
  );
}
