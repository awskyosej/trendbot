/**
 * Tool Registry
 *
 * MCP 서버에 Tool을 등록하는 모듈.
 * server.tool() 메서드를 사용하여 search_customer_trends Tool을 등록하고,
 * 실제 Bedrock/AgentCore → Formatter 파이프라인을 연결한다.
 *
 * Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 13.1, 13.2, 13.3, 13.4
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateSearchParams } from "../utils/validation.js";
import { executeTrendSearch } from "../agents/bedrock-client.js";
import { formatTrendSearchResult } from "../formatters/user-friendly-formatter.js";

/**
 * search_customer_trends Tool의 입력 스키마 (Zod raw shape)
 * - customer_name: 고객사 이름 (필수)
 * - search_period: 검색 기간 (필수)
 * - include_competitors: 경쟁 솔루션 검색 포함 여부 (선택, 기본값 true)
 */
export const SearchCustomerTrendsInputSchema = {
  customer_name: z.string().min(1).describe("고객사 이름"),
  search_period: z.string().min(1).describe("검색 기간 (예: '이번 주', '최근 7일')"),
  include_competitors: z.boolean().default(true).describe("경쟁 솔루션 검색 포함 여부"),
};

/** search_customer_trends Tool의 파라미터 타입 */
export interface SearchCustomerTrendsParams {
  customer_name: string;
  search_period: string;
  include_competitors: boolean;
}

/**
 * MCP 서버에 Tool을 등록한다.
 *
 * search_customer_trends Tool을 등록하고, 핸들러에서
 * 입력 검증 → executeTrendSearch → formatTrendSearchResult → JSON 직렬화
 * 파이프라인을 실행한다.
 *
 * @param server - McpServer 인스턴스
 */
export function registerTools(server: McpServer): void {
  // NOTE: Zod v3.25+와 MCP SDK 간 타입 추론 깊이 제한 이슈로 인해
  // server를 any로 캐스팅하여 tool() 호출. 런타임 동작에는 영향 없음.
  const srv = server as any;
  srv.tool(
    "search_customer_trends",
    "담당 고객사의 최신 뉴스, AWS 모범사례 블로그, 경쟁 솔루션 동향을 통합 조회합니다.",
    SearchCustomerTrendsInputSchema,
    async (params: SearchCustomerTrendsParams) => {
      // 1. 입력 검증 (validateSearchParams 활용)
      const validation = validateSearchParams(params);
      if (!validation.success) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: validation.error,
                details: validation.details,
                message: "필수 파라미터를 확인하고 다시 시도해 주세요.",
              }),
            },
          ],
          isError: true,
        };
      }

      const { customer_name, search_period, include_competitors } = validation.data;

      try {
        // 2. Bedrock/AgentCore 파이프라인 실행
        const searchResult = await executeTrendSearch({
          customerName: customer_name,
          searchPeriod: search_period,
          includeCompetitors: include_competitors,
        });

        // 3. User Friendly Formatter로 결과 포맷팅
        const formatted = formatTrendSearchResult(
          searchResult,
          customer_name,
          search_period,
          include_competitors
        );

        // 4. 부분 실패 여부 확인
        const hasError = formatted.sections.some((s) => s.status === "error");

        // 5. JSON 직렬화하여 text content로 반환
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(formatted),
            },
          ],
          ...(hasError ? { isError: true } : {}),
        };
      } catch (error) {
        // 예상치 못한 오류 처리
        const errorMessage =
          error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다";
        console.error("[Tools] search_customer_trends 실행 오류:", errorMessage);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                message: "트렌드 검색 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );
}
