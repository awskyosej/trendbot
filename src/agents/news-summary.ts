/**
 * 뉴스 정리 에이전트 (Claude Haiku)
 *
 * S3에서 저장된 뉴스 기사를 읽어와 Claude Haiku 모델로
 * 각 기사에 대해 헤드라인과 50자 이내 요약을 생성한다.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type {
  NewsArticle,
  NewsSummaryItem,
  AgentResult,
} from "../types/agents.js";

/** Bedrock 클라이언트 인스턴스 */
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.BEDROCK_REGION || "us-east-1",
});

/** Claude Haiku 모델 ID (비용 효율적 요약용) */
const HAIKU_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0";

/** 뉴스 요약 시스템 프롬프트 */
const NEWS_SUMMARY_SYSTEM_PROMPT = `당신은 뉴스 기사 요약 전문가입니다.
주어진 뉴스 기사들을 분석하여 각 기사에 대해 다음을 생성하세요:
1. headline: 기사의 핵심을 담은 헤드라인
2. summary: 50자 이내의 간결한 요약 (반드시 50자를 넘지 마세요)

응답은 반드시 JSON 배열 형식으로 반환하세요:
[
  {
    "headline": "헤드라인",
    "summary": "50자 이내 요약",
    "publishedDate": "YYYY-MM-DD",
    "source": "출처",
    "url": "URL"
  }
]

중요: summary는 반드시 50자 이내여야 합니다.`;

/**
 * Claude Haiku 모델을 호출하여 뉴스 기사를 요약한다.
 *
 * @param articles - 요약할 뉴스 기사 배열
 * @returns 요약된 뉴스 항목 배열
 */
async function invokeHaikuForSummary(
  articles: NewsArticle[]
): Promise<NewsSummaryItem[]> {
  const articlesText = articles
    .map(
      (a, i) =>
        `[기사 ${i + 1}]\n제목: ${a.title}\n출처: ${a.source}\n게시일: ${a.publishedDate}\nURL: ${a.url}\n본문: ${a.content}\n`
    )
    .join("\n---\n");

  const requestBody = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 2048,
    system: NEWS_SUMMARY_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `다음 뉴스 기사들을 요약해 주세요:\n\n${articlesText}`,
      },
    ],
  };

  const command = new InvokeModelCommand({
    modelId: HAIKU_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(requestBody),
  });

  const response = await bedrockClient.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  const responseText: string = responseBody.content?.[0]?.text || "[]";

  // JSON 배열 추출 (응답에 마크다운 코드블록이 포함될 수 있음)
  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.warn("[NewsSummary] 모델 응답에서 JSON 배열을 추출할 수 없습니다");
    return [];
  }

  const parsed = JSON.parse(jsonMatch[0]) as NewsSummaryItem[];

  // summary 50자 제한 보장
  return parsed.map((item) => ({
    ...item,
    summary: item.summary.length > 50 ? item.summary.slice(0, 50) : item.summary,
  }));
}

/**
 * 뉴스 기사를 요약 정리한다.
 *
 * Claude Haiku 모델을 사용하여 각 기사에 대해 헤드라인과 50자 이내 요약을 생성하고,
 * 일자별로 정렬하여 반환한다.
 *
 * @param articles - 요약할 뉴스 기사 배열
 * @returns 요약된 뉴스 항목 배열을 AgentResult로 래핑
 */
export async function summarizeNews(
  articles: NewsArticle[]
): Promise<AgentResult<NewsSummaryItem[]>> {
  try {
    console.log(`[NewsSummary] 뉴스 요약 시작: ${articles.length}건`);

    if (articles.length === 0) {
      return { success: true, data: [] };
    }

    const summaries = await invokeHaikuForSummary(articles);

    // 일자별 정렬 (최신순)
    summaries.sort(
      (a, b) =>
        new Date(b.publishedDate).getTime() -
        new Date(a.publishedDate).getTime()
    );

    console.log(`[NewsSummary] 뉴스 요약 완료: ${summaries.length}건`);

    return { success: true, data: summaries };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "뉴스 요약 중 알 수 없는 오류 발생";
    console.error(`[NewsSummary] 오류:`, message);
    return { success: false, error: message };
  }
}
