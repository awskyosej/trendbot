/**
 * Lambda Handler - AgentCore Gateway Tool 타겟
 *
 * AgentCore Gateway가 이 Lambda를 Tool로 호출할 때,
 * Tool arguments를 event 최상위 레벨로 직접 전달합니다.
 * 예: { "customer_name": "삼성전자", "search_period": "최근 7일", "include_competitors": true }
 *
 * 또한 직접 HTTP 호출(Function URL)도 지원합니다.
 * 이 경우 event.body에 JSON이 포함됩니다.
 */

import { validateSearchParams } from "../utils/validation.js";
import { executeTrendSearch } from "../agents/bedrock-client.js";
import { formatTrendSearchResult } from "../formatters/user-friendly-formatter.js";

interface LambdaResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

export const handler = async (event: Record<string, unknown>): Promise<LambdaResponse> => {
  const headers = { "Content-Type": "application/json" };

  try {
    console.log("[Lambda] Event:", JSON.stringify(event).substring(0, 500));

    // AgentCore Gateway: arguments가 event 최상위에 직접 전달됨
    // Function URL: event.body에 JSON으로 래핑됨
    let args: Record<string, unknown>;

    if (event.body && typeof event.body === "string") {
      // Function URL 호출
      try {
        const parsed = JSON.parse(event.body as string);
        args = parsed.arguments || parsed;
      } catch {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
      }
    } else if (event.customer_name || event.search_period) {
      // AgentCore Gateway 직접 호출
      args = event;
    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "No arguments provided" }) };
    }

    // 입력 검증
    const validation = validateSearchParams(args);
    if (!validation.success) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: validation.error, details: validation.details }),
      };
    }

    const { customer_name, search_period, include_competitors } = validation.data;

    console.log(`[Lambda] 실행: customer=${customer_name}, period=${search_period}`);

    const searchResult = await executeTrendSearch({
      customerName: customer_name,
      searchPeriod: search_period,
      includeCompetitors: include_competitors,
    });

    const formatted = formatTrendSearchResult(
      searchResult, customer_name, search_period, include_competitors,
    );

    return { statusCode: 200, headers, body: JSON.stringify(formatted) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Lambda] 오류:", message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error", message }),
    };
  }
};
