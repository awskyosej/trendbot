/**
 * AWS 블로그 에이전트 (AgentCore 브라우저 도구 + Claude Sonnet)
 *
 * AgentCore 브라우저 도구로 AWS 한국어 블로그를 검색하고,
 * Claude Sonnet 모델로 단순 기능 출시 공지를 필터링하여
 * 아키텍처/구현 모범사례만 선별 및 요약한다.
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { BlogSummaryItem, AgentResult } from "../types/agents.js";

/** Bedrock 클라이언트 인스턴스 */
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.BEDROCK_REGION || "us-east-1",
});

/** Claude Sonnet 모델 ID (고품질 분석/요약용) */
const SONNET_MODEL_ID = "anthropic.claude-3-sonnet-20240229-v1:0";

/** AgentCore Gateway 엔드포인트 */
const AGENTCORE_ENDPOINT =
  process.env.AGENTCORE_ENDPOINT || "https://agentcore.example.com";

/** AWS 한국어 블로그 기본 URL */
const AWS_BLOG_BASE_URL = "https://aws.amazon.com/ko/blogs/korea/";

/** 블로그 분석 시스템 프롬프트 */
const BLOG_ANALYSIS_SYSTEM_PROMPT = `당신은 AWS 블로그 분석 전문가입니다.
주어진 AWS 블로그 게시물 목록을 분석하여 다음 작업을 수행하세요:

1. 필터링: 단순 기능 출시 공지, 서비스 업데이트 알림은 제외합니다.
   아키텍처 설계, 구현 사례, 모범사례(Best Practice)가 포함된 블로그만 선별합니다.
2. 요약: 선별된 각 블로그에 대해 다음을 생성합니다:
   - headline: 블로그의 핵심을 담은 헤드라인
   - summary: 50자 이내의 간결한 요약 (반드시 50자를 넘지 마세요)
   - category: 분류 (아키텍처, 구현 사례, 보안, 비용 최적화 등)

응답은 반드시 JSON 배열 형식으로 반환하세요:
[
  {
    "headline": "헤드라인",
    "summary": "50자 이내 요약",
    "publishedDate": "YYYY-MM-DD",
    "url": "블로그 URL",
    "category": "분류"
  }
]

모범사례 블로그가 없으면 빈 배열 []을 반환하세요.
중요: summary는 반드시 50자 이내여야 합니다.`;

/** AgentCore 브라우저 도구 응답의 블로그 항목 */
interface RawBlogItem {
  title?: string;
  url?: string;
  publishedDate?: string;
  snippet?: string;
  content?: string;
}

/**
 * AgentCore Gateway의 브라우저 도구를 호출하여 AWS 한국어 블로그를 검색한다.
 *
 * @param searchPeriod - 검색 기간
 * @returns 검색된 블로그 원본 데이터
 */
async function invokeAgentCoreBlogSearch(
  searchPeriod: string
): Promise<RawBlogItem[]> {
  try {
    const requestBody = {
      tool: "browser",
      action: "search",
      parameters: {
        query: `site:aws.amazon.com/ko/blogs/korea/ AWS 모범사례 아키텍처 ${searchPeriod}`,
        language: "ko",
      },
    };

    const response = await fetch(`${AGENTCORE_ENDPOINT}/tools/browser/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(
        `AgentCore 브라우저 도구 호출 실패: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as { results?: RawBlogItem[] };
    return (data.results || []) as RawBlogItem[];
  } catch (error) {
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new Error(
        `AgentCore Gateway 연결 실패: ${AGENTCORE_ENDPOINT}에 접근할 수 없습니다`
      );
    }
    throw error;
  }
}

/**
 * Claude Sonnet 모델을 호출하여 블로그를 필터링하고 요약한다.
 *
 * @param blogs - 검색된 블로그 원본 데이터
 * @returns 필터링 및 요약된 블로그 항목 배열
 */
async function invokeSonnetForBlogAnalysis(
  blogs: RawBlogItem[]
): Promise<BlogSummaryItem[]> {
  const blogsText = blogs
    .map(
      (b, i) =>
        `[블로그 ${i + 1}]\n제목: ${b.title || "제목 없음"}\nURL: ${b.url || ""}\n게시일: ${b.publishedDate || "날짜 미상"}\n내용: ${b.content || b.snippet || "내용 없음"}\n`
    )
    .join("\n---\n");

  const requestBody = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 2048,
    system: BLOG_ANALYSIS_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `다음 AWS 블로그 게시물들을 분석하여 모범사례 블로그만 선별하고 요약해 주세요:\n\n${blogsText}`,
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
    console.warn("[AwsBlog] 모델 응답에서 JSON 배열을 추출할 수 없습니다");
    return [];
  }

  const parsed = JSON.parse(jsonMatch[0]) as BlogSummaryItem[];

  // summary 50자 제한 보장
  return parsed.map((item) => ({
    ...item,
    summary: item.summary.length > 50 ? item.summary.slice(0, 50) : item.summary,
  }));
}

/**
 * AWS 한국어 블로그에서 모범사례 블로그를 검색하고 요약한다.
 *
 * AgentCore 브라우저 도구로 블로그를 검색한 후,
 * Claude Sonnet 모델로 단순 기능 출시 공지를 필터링하고
 * 아키텍처/구현 모범사례만 선별하여 요약한다.
 *
 * @param searchPeriod - 검색 기간
 * @returns 요약된 블로그 항목 배열을 AgentResult로 래핑
 */
export async function searchAwsBlogs(
  searchPeriod: string
): Promise<AgentResult<BlogSummaryItem[]>> {
  try {
    console.log(`[AwsBlog] AWS 블로그 검색 시작: 기간=${searchPeriod}`);

    // AgentCore 브라우저 도구로 블로그 검색
    const rawBlogs = await invokeAgentCoreBlogSearch(searchPeriod);

    if (rawBlogs.length === 0) {
      console.log("[AwsBlog] 검색 결과 없음");
      return { success: true, data: [] };
    }

    // Claude Sonnet으로 필터링 및 요약
    const summaries = await invokeSonnetForBlogAnalysis(rawBlogs);

    // 게시일 기준 정렬 (최신순)
    summaries.sort(
      (a, b) =>
        new Date(b.publishedDate).getTime() -
        new Date(a.publishedDate).getTime()
    );

    console.log(
      `[AwsBlog] AWS 블로그 검색 완료: ${rawBlogs.length}건 중 ${summaries.length}건 모범사례 선별`
    );

    return { success: true, data: summaries };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "AWS 블로그 검색 중 알 수 없는 오류 발생";
    console.error(`[AwsBlog] 오류:`, message);
    return { success: false, error: message };
  }
}
