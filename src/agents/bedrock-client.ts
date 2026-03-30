/**
 * Bedrock Inference 클라이언트
 *
 * 사용자 프롬프트를 Bedrock inference에 전달하여 4가지 subtask로 분리하고,
 * 각 하위 에이전트를 Promise.allSettled()로 병렬 실행하여 통합 결과를 반환한다.
 *
 * Requirements: 9.1, 9.2, 16.2, 16.3
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type {
  TrendSearchRequest,
  TrendSearchResult,
  AgentResult,
  NewsSummaryItem,
  BlogSummaryItem,
  CompetitorTrendItem,
  NewsArticle,
} from "../types/agents.js";
import { searchNews } from "./news-search.js";
import { summarizeNews } from "./news-summary.js";
import { searchAwsBlogs } from "./aws-blog.js";
import { searchCompetitorNews } from "./competitor-news.js";

/** Bedrock 클라이언트 인스턴스 (모듈 레벨 싱글턴) */
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.BEDROCK_REGION || "us-east-1",
});

/** Bedrock 모델 ID */
const ORCHESTRATOR_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0";

/**
 * 오케스트레이터 시스템 프롬프트
 *
 * 사용자 프롬프트를 분석하여 4가지 subtask로 분리하는 역할을 수행한다.
 * - 뉴스 검색 (news_search)
 * - 뉴스 정리 (news_summary)
 * - AWS 블로그 정리 (aws_blog)
 * - 경쟁사 동향 (competitor_trends) - include_competitors 플래그에 따라 포함/제외
 */
const ORCHESTRATOR_SYSTEM_PROMPT = `당신은 고객 트렌드 검색 오케스트레이터입니다.
사용자의 요청을 분석하여 다음 4가지 하위 작업(subtask)으로 분리합니다:

1. news_search: 고객명 기반 뉴스 검색
2. news_summary: 검색된 뉴스 기사 요약 정리
3. aws_blog: AWS 한국어 블로그에서 모범사례 검색 및 요약
4. competitor_trends: 경쟁 클라우드 솔루션(Azure, GCP 등) 동향 검색 및 요약

각 subtask에 필요한 파라미터(customerName, searchPeriod)를 추출하여 JSON 형식으로 반환하세요.

응답 형식:
{
  "subtasks": [
    { "type": "news_search", "parameters": { "customerName": "...", "searchPeriod": "..." } },
    { "type": "news_summary", "parameters": { "customerName": "...", "searchPeriod": "..." } },
    { "type": "aws_blog", "parameters": { "searchPeriod": "..." } },
    { "type": "competitor_trends", "parameters": { "customerName": "...", "searchPeriod": "..." } }
  ]
}`;

/**
 * Bedrock 모델을 호출하여 프롬프트 분석 결과를 받는다.
 *
 * @param prompt - 사용자 프롬프트
 * @param includeCompetitors - 경쟁사 동향 포함 여부
 * @returns Bedrock 모델 응답 텍스트
 */
async function invokeBedrockModel(
  prompt: string,
  includeCompetitors: boolean
): Promise<string> {
  const systemPrompt = includeCompetitors
    ? ORCHESTRATOR_SYSTEM_PROMPT
    : ORCHESTRATOR_SYSTEM_PROMPT +
      "\n\n주의: competitor_trends subtask는 제외하세요. 사용자가 경쟁사 동향 검색을 비활성화했습니다.";

  const requestBody = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  };

  const command = new InvokeModelCommand({
    modelId: ORCHESTRATOR_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(requestBody),
  });

  const response = await bedrockClient.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));

  return responseBody.content?.[0]?.text || "";
}


/**
 * 트렌드 검색을 실행한다.
 *
 * 사용자 요청을 기반으로 하위 에이전트들을 병렬 실행하고 결과를 통합한다.
 * - 뉴스 검색 → 뉴스 정리 (순차)
 * - AWS 블로그 검색 (병렬)
 * - 경쟁사 동향 검색 (병렬, include_competitors=true일 때만)
 *
 * @param request - 트렌드 검색 요청
 * @returns 통합 트렌드 검색 결과
 */
export async function executeTrendSearch(
  request: TrendSearchRequest
): Promise<TrendSearchResult> {
  const { customerName, searchPeriod, includeCompetitors } = request;

  // 하위 에이전트 작업 정의
  const newsSearchRequest = { customerName, searchPeriod };

  // 뉴스 검색 + 요약 파이프라인 (순차 실행)
  const newsTask = async (): Promise<AgentResult<NewsSummaryItem[]>> => {
    try {
      const searchResult = await searchNews(newsSearchRequest);
      if (!searchResult.success || !searchResult.data?.length) {
        return searchResult.success
          ? { success: true, data: [] }
          : { success: false, error: searchResult.error };
      }
      return await summarizeNews(searchResult.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "뉴스 검색/요약 중 알 수 없는 오류 발생";
      console.error("[BedrockClient] 뉴스 파이프라인 오류:", message);
      return { success: false, error: message };
    }
  };

  // AWS 블로그 검색 작업
  const blogTask = async (): Promise<AgentResult<BlogSummaryItem[]>> => {
    try {
      return await searchAwsBlogs(searchPeriod);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AWS 블로그 검색 중 알 수 없는 오류 발생";
      console.error("[BedrockClient] AWS 블로그 오류:", message);
      return { success: false, error: message };
    }
  };

  // 경쟁사 동향 검색 작업 (includeCompetitors=true일 때만)
  const competitorTask = includeCompetitors
    ? async (): Promise<AgentResult<CompetitorTrendItem[]>> => {
        try {
          return await searchCompetitorNews(newsSearchRequest);
        } catch (error) {
          const message = error instanceof Error ? error.message : "경쟁사 동향 검색 중 알 수 없는 오류 발생";
          console.error("[BedrockClient] 경쟁사 동향 오류:", message);
          return { success: false, error: message };
        }
      }
    : null;

  // Promise.allSettled()로 병렬 실행
  // 부분 실패 허용: 일부 에이전트가 실패하더라도 성공한 에이전트의 결과를 반환한다.
  // Lambda 타임아웃(CDK에서 5분 권장) 내에 모든 에이전트가 완료되어야 하며,
  // 개별 에이전트의 Bedrock/AgentCore 호출 타임아웃은 각 에이전트 내부에서 처리한다.
  const tasks: Promise<unknown>[] = [newsTask(), blogTask()];
  if (competitorTask) {
    tasks.push(competitorTask());
  }

  const results = await Promise.allSettled(tasks);

  // 결과 추출
  const newsResult = extractResult<NewsSummaryItem[]>(results[0]);
  const blogResult = extractResult<BlogSummaryItem[]>(results[1]);
  const competitorResult = includeCompetitors
    ? extractResult<CompetitorTrendItem[]>(results[2])
    : null;

  return {
    newsSummary: newsResult,
    blogSummary: blogResult,
    competitorTrends: competitorResult,
  };
}

/**
 * Promise.allSettled 결과에서 AgentResult를 추출한다.
 */
function extractResult<T>(
  settledResult: PromiseSettledResult<unknown>
): AgentResult<T> {
  if (settledResult.status === "fulfilled") {
    return settledResult.value as AgentResult<T>;
  }
  const reason = settledResult.reason;
  const errorMessage =
    reason instanceof Error ? reason.message : "에이전트 실행 중 오류 발생";
  return { success: false, error: errorMessage };
}
