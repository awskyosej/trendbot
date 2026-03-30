/**
 * 뉴스 검색 에이전트 (AgentCore 브라우저 도구)
 *
 * AgentCore Gateway의 브라우저 도구를 사용하여 고객명 기반 뉴스 검색을 수행하고,
 * 검색 결과를 마크업 형식으로 변환하여 S3에 저장한다.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { callAgentCore } from "../utils/agentcore-client.js";
import type {
  NewsSearchRequest,
  NewsArticle,
  AgentResult,
} from "../types/agents.js";

/** S3 클라이언트 인스턴스 */
const s3Client = new S3Client({
  region: process.env.BEDROCK_REGION || "us-east-1",
});

/** S3 버킷 이름 */
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || "mcp-news-articles";

/** AgentCore Gateway 엔드포인트 */
const AGENTCORE_ENDPOINT =
  process.env.AGENTCORE_ENDPOINT || "https://agentcore.example.com";

/**
 * AgentCore Gateway의 브라우저 도구를 호출하여 뉴스를 검색한다.
 *
 * NOTE: AgentCore Gateway SDK가 아직 없으므로 HTTP 호출 placeholder로 구현.
 * 실제 연동 시 AgentCore SDK 또는 HTTP 클라이언트로 교체한다.
 *
 * @param customerName - 고객사 이름
 * @param searchPeriod - 검색 기간
 * @returns 검색된 뉴스 기사 배열
 */
async function invokeAgentCoreBrowserSearch(
  customerName: string,
  searchPeriod: string
): Promise<NewsArticle[]> {
  try {
    const requestBody = {
      tool: "browser",
      action: "search",
      parameters: {
        query: `${customerName} 뉴스 ${searchPeriod}`,
        language: "ko",
      },
    };

    const response = await callAgentCore("/tools/browser/search", requestBody);

    if (response.statusCode !== 200) {
      throw new Error(
        `AgentCore 브라우저 도구 호출 실패: ${response.statusCode}`
      );
    }

    const data = JSON.parse(response.body) as { results?: Record<string, unknown>[] };

    // AgentCore 응답을 NewsArticle[] 형식으로 변환
    const articles: NewsArticle[] = (data.results || []).map(
      (item: Record<string, unknown>) => ({
        title: (item.title as string) || "제목 없음",
        source: (item.source as string) || "출처 미상",
        publishedDate: (item.publishedDate as string) || new Date().toISOString().split("T")[0],
        content: (item.content as string) || (item.snippet as string) || "",
        url: (item.url as string) || "",
      })
    );

    return articles;
  } catch (error) {
    if (error instanceof Error && error.message.includes("AgentCore")) {
      throw error;
    }
    throw error;
  }
}

/**
 * 뉴스 기사를 마크업 형식으로 변환한다.
 *
 * frontmatter(제목, 출처, 게시일, URL, 고객명) + 본문 형식의 마크다운을 생성한다.
 *
 * @param article - 뉴스 기사
 * @param customerName - 고객사 이름
 * @returns 마크업 형식 문자열
 */
function convertToMarkup(article: NewsArticle, customerName: string): string {
  return `---
title: "${article.title}"
source: "${article.source}"
publishedDate: "${article.publishedDate}"
url: "${article.url}"
customerName: "${customerName}"
---

# ${article.title}

${article.content}
`;
}

/**
 * 뉴스 기사를 S3에 저장한다.
 *
 * 저장 경로: news/{customerName}/{YYYY-MM-DD}/{articleId}.md
 *
 * @param article - 뉴스 기사
 * @param customerName - 고객사 이름
 * @param articleIndex - 기사 인덱스 (articleId 생성용)
 */
async function saveArticleToS3(
  article: NewsArticle,
  customerName: string,
  articleIndex: number
): Promise<void> {
  const date = article.publishedDate.split("T")[0]; // ISO 8601에서 날짜 부분 추출
  const articleId = `article-${articleIndex.toString().padStart(4, "0")}`;
  const key = `news/${customerName}/${date}/${articleId}.md`;
  const markup = convertToMarkup(article, customerName);

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
    Body: markup,
    ContentType: "text/markdown; charset=utf-8",
  });

  await s3Client.send(command);
  console.log(`[NewsSearch] S3 저장 완료: ${key}`);
}

/**
 * 고객명 기반 뉴스 검색을 수행하고 결과를 S3에 저장한다.
 *
 * @param request - 뉴스 검색 요청 (customerName, searchPeriod)
 * @returns 검색된 뉴스 기사 배열을 AgentResult로 래핑
 */
export async function searchNews(
  request: NewsSearchRequest
): Promise<AgentResult<NewsArticle[]>> {
  const { customerName, searchPeriod } = request;

  try {
    console.log(
      `[NewsSearch] 뉴스 검색 시작: 고객=${customerName}, 기간=${searchPeriod}`
    );

    // AgentCore 브라우저 도구로 뉴스 검색
    const articles = await invokeAgentCoreBrowserSearch(
      customerName,
      searchPeriod
    );

    // 검색 결과 없음 처리
    if (articles.length === 0) {
      console.log(`[NewsSearch] 검색 결과 없음: ${customerName}`);
      return { success: true, data: [] };
    }

    // S3에 기사 저장 (병렬)
    const savePromises = articles.map((article, index) =>
      saveArticleToS3(article, customerName, index).catch((err) => {
        console.error(
          `[NewsSearch] S3 저장 실패 (기사 ${index}):`,
          err instanceof Error ? err.message : err
        );
      })
    );
    await Promise.allSettled(savePromises);

    console.log(
      `[NewsSearch] 뉴스 검색 완료: ${articles.length}건 검색됨`
    );

    return { success: true, data: articles };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "뉴스 검색 중 알 수 없는 오류 발생";
    console.error(`[NewsSearch] 오류:`, message);
    return { success: false, error: message };
  }
}
