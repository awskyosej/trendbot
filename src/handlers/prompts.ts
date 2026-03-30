/**
 * Prompt Registry
 *
 * MCP 서버에 Prompt를 등록하는 모듈.
 * server.prompt() 메서드를 사용하여 Prompt 등록 인프라를 제공한다.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * MCP 서버에 Prompt를 등록한다.
 *
 * 현재는 예시 프롬프트(트렌드 검색 프롬프트 템플릿)를 등록하여
 * Prompt 등록 인프라를 검증한다.
 * 향후 비즈니스 프롬프트가 추가되면 이 함수에서 등록한다.
 *
 * @param server - McpServer 인스턴스
 */
export function registerPrompts(server: McpServer): void {
  // NOTE: Zod v3.25+와 MCP SDK 간 타입 추론 깊이 제한 이슈로 인해
  // server를 any로 캐스팅하여 prompt() 호출. 런타임 동작에는 영향 없음.
  const srv = server as any;

  // 예시 프롬프트: 고객 트렌드 검색 프롬프트 템플릿
  srv.prompt(
    "search-customer-trends",
    "고객사의 최신 뉴스, AWS 모범사례 블로그, 경쟁 솔루션 동향을 통합 조회하는 프롬프트 템플릿입니다.",
    {
      customer_name: z.string().describe("고객사 이름"),
      search_period: z.string().describe("검색 기간 (예: '이번 주', '최근 7일')"),
    },
    async (args: { customer_name: string; search_period: string }) => {
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `${args.customer_name}의 ${args.search_period} 동안의 최신 트렌드를 조회해 주세요. 고객사 관련 뉴스, AWS 모범사례 블로그, 경쟁 클라우드 솔루션 동향을 포함해 주세요.`,
            },
          },
        ],
      };
    }
  );
}
