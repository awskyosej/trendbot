/**
 * 경쟁사 동향 에이전트 (AgentCore 브라우저 도구 + Claude Sonnet)
 *
 * AgentCore 브라우저 도구로 고객명+경쟁 클라우드 솔루션 키워드를 조합하여
 * 뉴스를 검색하고, Claude Sonnet 모델로 경쟁사별 분류 및 요약을 생성한다.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { callAgentCore } from "../utils/agentcore-client.js";
import type {
  NewsSearchRequest,
  CompetitorTrendItem,
  AgentResult,
} from "../types/agents.js";

/** Bedrock 클라이언트 인스턴스 */
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.BEDROCK_REGION || "us-east-1",
});

/** Claude Sonnet 모델 ID (고품질 분석/요약용) */
const SONNET_MODEL_ID = "anthropic.claude-3-sonnet-20240229-v1:0";

/** AgentCore Gateway 엔드포인트 */
const AGENTCORE_ENDPOINT =
  process.env.AGENTCORE_ENDPOINT || "https://agentcore.example.com";

/** 경쟁 클라우드 솔루션 키워드 목록 */
const COMPETITOR_KEYWORDS = [
  "Azure",
  "Microsoft Azure",
  "GCP",
  "Google Cloud",
  "Oracle Cloud",
  "IBM Cloud",
];

/** 경쟁사 분석 시스템 프롬프트 */
const COMPETITOR_ANALYSIS_SYSTEM_PROMPT = `당신은 클라우드 경쟁사 동향 분석 전문가입니다.
주어진 뉴스 기사들을 분석하여 다음 작업을 수행하세요:

1. 분류: 각 뉴스를 경쟁사별로 분류합니다 (Azure, GCP, Oracle Cloud, IBM Cloud 등)
2. 요약: 각 뉴스에 대해 다음을 생성합니다:
   - headline: 뉴스의 핵심을 담은 헤드라인
   - summary: 50자 이내의 간결한 요약 (반드시 50자를 넘지 마세요)
   - competitor: 경쟁사 이름 (Azure, GCP 등)

응답은 반드시 JSON 배열 형식으로 반환하세요:
[
  {
    "headline": "헤드라인",
    "summary": "50자 이내 요약",
    "publishedDate": "YYYY-MM-DD",
    "competitor": "경쟁사명",
    "source": "출처",
    "url": "URL"
  }
]

검색 결과가 없으면 빈 배열 []을 반환하세요.
중요: summary는 반드시 50자 이내여야 합니다.`;

/** AgentCore 브라우저 도구 응답의 뉴스 항목 */
interface RawNewsItem {
  title?: string;
  url?: string;
  publishedDate?: string;
  source?: string;
  snippet?: string;
  content?: string;
}

/**
 * AgentCore Gateway의 브라우저 도구를 호출하여 경쟁사 관련 뉴스를 검색한다.
 *
 * 고객명과 경쟁 클라우드 솔루션 키워드를 조합하여 검색한다.
 *
 * @param customerName - 고객사 이름
 * @param searchPeriod - 검색 기간
 * @returns 검색된 뉴스 원본 데이터
 */
async function invokeAgentCoreCompetitorSearch(
  customerName: string,
  searchPeriod: string
): Promise<RawNewsItem[]> {
  try {
    // 경쟁사 키워드를 조합한 검색 쿼리 생성
    const competitorQuery = COMPETITOR_KEYWORDS.slice(0, 4).join(" OR ");
    const searchQuery = `${customerName} (${competitorQuery}) 클라우드 ${searchPeriod}`;

    const requestBody = {
      tool: "browser",
      action: "search",
      parameters: {
        query: searchQuery,
        language: "ko",
      },
    };

    const response = await callAgentCore("/tools/browser/search", requestBody);

    if (response.statusCode !== 200) {
      throw new Error(
        `AgentCore 브라우저 도구 호출 실패: ${response.statusCode}`
      );
    }

    const data = JSON.parse(response.body) as { results?: RawNewsItem[] };
    return (data.results || []) as RawNewsItem[];
  } catch (error) {
    throw error;
  }
}

/**
 * Claude Sonnet 모델을 호출하여 경쟁사 뉴스를 분류하고 요약한다.
 *
 * @param news - 검색된 뉴스 원본 데이터
 * @param customerName - 고객사 이름 (컨텍스트 제공용)
 * @returns 분류 및 요약된 경쟁사 동향 항목 배열
 */
async function invokeSonnetForCompetitorAnalysis(
  news: RawNewsItem[],
  customerName: string
): Promise<CompetitorTrendItem[]> {
  const newsText = news
    .map(
      (n, i) =>
        `[뉴스 ${i + 1}]\n제목: ${n.title || "제목 없음"}\n출처: ${n.source || "출처 미상"}\n게시일: ${n.publishedDate || "날짜 미상"}\nURL: ${n.url || ""}\n내용: ${n.content || n.snippet || "내용 없음"}\n`
    )
    .join("\n---\n");

  const requestBody = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 2048,
    system: COMPETITOR_ANALYSIS_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `고객사 "${customerName}"과 관련된 다음 경쟁 클라우드 솔루션 뉴스들을 경쟁사별로 분류하고 요약해 주세요:\n\n${newsText}`,
      },
    ],
  };

  const command = new InvokeModelCommand({
    modelId: SONNET_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(requestBody),
  });

  const response = await bedrockClient.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  const responseText: string = responseBody.content?.[0]?.text || "[]";

  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.warn("[CompetitorNews] 모델 응답에서 JSON 배열을 추출할 수 없습니다");
    return [];
  }

  const parsed = JSON.parse(jsonMatch[0]) as CompetitorTrendItem[];

  // summary 50자 제한 보장
  return parsed.map((item) => ({
    ...item,
    summary: item.summary.length > 50 ? item.summary.slice(0, 50) : item.summary,
  }));
}

/**
 * 경쟁사 동향 뉴스를 검색하고 분류/요약한다.
 *
 * AgentCore 브라우저 도구로 고객명+경쟁 클라우드 솔루션 키워드를 조합하여
 * 뉴스를 검색한 후, Claude Sonnet 모델로 경쟁사별 분류 및 요약을 생성한다.
 *
 * @param request - 뉴스 검색 요청 (customerName, searchPeriod)
 * @returns 경쟁사 동향 항목 배열을 AgentResult로 래핑
 */
export async function searchCompetitorNews(
  request: NewsSearchRequest
): Promise<AgentResult<CompetitorTrendItem[]>> {
  const { customerName, searchPeriod } = request;

  try {
    console.log(
      `[CompetitorNews] 경쟁사 동향 검색 시작: 고객=${customerName}, 기간=${searchPeriod}`
    );

    // AgentCore 브라우저 도구로 경쟁사 뉴스 검색
    const rawNews = await invokeAgentCoreCompetitorSearch(
      customerName,
      searchPeriod
    );

    // 검색 결과 없음 처리
    if (rawNews.length === 0) {
      console.log(`[CompetitorNews] 검색 결과 없음: ${customerName}`);
      return { success: true, data: [] };
    }

    // Claude Sonnet으로 분류 및 요약
    const trends = await invokeSonnetForCompetitorAnalysis(
      rawNews,
      customerName
    );

    // 경쟁사별 그룹화 후 게시일 기준 정렬 (최신순)
    trends.sort((a, b) => {
      // 먼저 경쟁사별로 그룹화
      const competitorCompare = a.competitor.localeCompare(b.competitor);
      if (competitorCompare !== 0) return competitorCompare;
      // 같은 경쟁사 내에서는 최신순 정렬
      return (
        new Date(b.publishedDate).getTime() -
        new Date(a.publishedDate).getTime()
      );
    });

    console.log(
      `[CompetitorNews] 경쟁사 동향 검색 완료: ${rawNews.length}건 중 ${trends.length}건 분류됨`
    );

    return { success: true, data: trends };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "경쟁사 동향 검색 중 알 수 없는 오류 발생";
    console.error(`[CompetitorNews] 오류:`, message);
    return { success: false, error: message };
  }
}
