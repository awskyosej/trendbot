/**
 * Lambda Handler - HTTP API 엔트리포인트
 *
 * Lambda Function URL을 통해 HTTP 요청을 받아 Tool을 실행한다.
 * MCP 프로토콜은 로컬 mcp-proxy.js가 처리하고,
 * Lambda는 순수 Tool 실행 API로 동작한다.
 *
 * Requirements: 1.1, 1.2, 3.2, 3.3, 8.1, 8.2, 8.3, 9.4, 9.5
 */

import { validateSearchParams } from "../utils/validation.js";
import { executeTrendSearch } from "../agents/bedrock-client.js";
import { formatTrendSearchResult } from "../formatters/user-friendly-formatter.js";

interface LambdaEvent {
  body?: string;
  headers?: Record<string, string>;
  requestContext?: Record<string, unknown>;
}

interface LambdaResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

interface ToolRequest {
  tool: string;
  arguments: Record<string, unknown>;
}

/**
 * Lambda Handler
 *
 * Function URL로 들어온 HTTP 요청에서 tool/arguments를 파싱하고
 * 해당 Tool을 실행하여 결과를 반환한다.
 */
export const handler = async (event: LambdaEvent): Promise<LambdaResponse> => {
  const headers = { "Content-Type": "application/json" };

  try {
    // 1. 요청 파싱
    let requestBody: ToolRequest;
    try {
      const body = event.body || "{}";
      console.log("[Lambda] Raw event:", JSON.stringify(event).substring(0, 500));
      console.log("[Lambda] Body:", body.substring(0, 500));
      requestBody = JSON.parse(body) as ToolRequest;
    } catch {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Invalid JSON in request body" }),
      };
    }

    const { tool, arguments: args } = requestBody;

    // 2. Tool 라우팅
    if (tool !== "search_customer_trends" && tool !== "search-customer-trends") {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: `Tool not found: ${tool}` }),
      };
    }

    // 3. 입력 검증
    const validation = validateSearchParams(args);
    if (!validation.success) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: validation.error,
          details: validation.details,
        }),
      };
    }

    const { customer_name, search_period, include_competitors } = validation.data;

    // 4. Tool 실행
    console.log(`[Lambda] search_customer_trends 실행: customer=${customer_name}, period=${search_period}`);

    const searchResult = await executeTrendSearch({
      customerName: customer_name,
      searchPeriod: search_period,
      includeCompetitors: include_competitors,
    });

    // 5. 결과 포맷팅
    const formatted = formatTrendSearchResult(
      searchResult,
      customer_name,
      search_period,
      include_competitors,
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(formatted),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Lambda] 오류:", message);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Internal server error",
        message: "트렌드 검색 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      }),
    };
  }
};
