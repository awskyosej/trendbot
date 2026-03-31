/**
 * Lambda Handler - Bedrock 요약/분석 전용 Tool
 *
 * AgentCore Gateway가 이 Lambda를 Tool로 호출합니다.
 * 검색은 AgentCore의 브라우저 도구가 담당하고,
 * 이 Lambda는 텍스트 요약/분석만 수행합니다.
 *
 * 지원하는 Tool:
 * - summarize-news: 뉴스 기사 텍스트를 헤드라인 + 50자 요약으로 정리
 * - summarize-blog: AWS 블로그 텍스트를 분석하여 모범사례 필터링 + 요약
 * - analyze-competitors: 경쟁사 뉴스 텍스트를 경쟁사별 분류 + 요약
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.BEDROCK_REGION || "us-east-1",
});

const HAIKU_MODEL = "anthropic.claude-3-haiku-20240307-v1:0";
const SONNET_MODEL = "anthropic.claude-3-sonnet-20240229-v1:0";

interface LambdaResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

async function invokeBedrock(modelId: string, system: string, userMessage: string): Promise<string> {
  const command = new InvokeModelCommand({
    modelId,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  const response = await bedrockClient.send(command);
  const body = JSON.parse(new TextDecoder().decode(response.body));
  return body.content?.[0]?.text || "";
}

// --- Tool 핸들러 ---

async function summarizeNews(text: string): Promise<string> {
  const system = `뉴스 기사를 분석하여 각 기사에 대해 JSON 배열로 반환하세요.
각 항목: { "headline": "헤드라인", "summary": "50자 이내 요약", "source": "출처", "date": "날짜" }
summary는 반드시 50자 이내. 결과가 없으면 빈 배열 [].`;
  return await invokeBedrock(HAIKU_MODEL, system, text);
}

async function summarizeBlog(text: string): Promise<string> {
  const system = `AWS 블로그 게시물(한국어 및 글로벌 블로그 포함)을 분석하세요.

다음은 반드시 제외하세요:
- 단순 기능/서비스 출시 공지 (예: "XX 서비스 출시", "XX now available")
- AWS Documentation 페이지 (docs.aws.amazon.com)
- 가격 변경 공지

아키텍처 설계, 구현 사례, 모범사례(Best Practice), 고객 사례가 포함된 블로그만 선별하세요.

JSON 배열로 반환:
{
  "headline": "헤드라인",
  "summary": "50자 이내 요약",
  "category": "분류 (아키텍처/구현사례/보안/비용최적화/마이그레이션 등)",
  "url": "블로그 URL",
  "date": "날짜"
}

중요:
- summary는 반드시 50자 이내
- url 필드에 해당 블로그의 원본 URL을 포함하세요 (텍스트에서 추출)
- 모범사례가 없으면 빈 배열 []
- 한국어 블로그와 영문 블로그 모두 포함`;
  return await invokeBedrock(SONNET_MODEL, system, text);
}

async function analyzeCompetitors(text: string): Promise<string> {
  const system = `경쟁 클라우드 솔루션 뉴스를 분석하여 경쟁사별로 분류하세요.
JSON 배열로 반환: { "headline": "헤드라인", "summary": "50자 이내 요약", "competitor": "경쟁사명", "date": "날짜" }
summary는 반드시 50자 이내. 결과가 없으면 빈 배열 [].`;
  return await invokeBedrock(SONNET_MODEL, system, text);
}

export const handler = async (event: Record<string, unknown>): Promise<LambdaResponse> => {
  const headers = { "Content-Type": "application/json" };

  try {
    console.log("[Lambda] Event:", JSON.stringify(event).substring(0, 500));

    const action = (event.action as string) || "";
    const text = (event.text as string) || "";

    if (!text) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "text is required" }) };
    }

    let result: string;

    switch (action) {
      case "summarize-news":
        result = await summarizeNews(text);
        break;
      case "summarize-blog":
        result = await summarizeBlog(text);
        break;
      case "analyze-competitors":
        result = await analyzeCompetitors(text);
        break;
      default:
        // action이 없으면 범용 요약
        result = await summarizeNews(text);
    }

    return { statusCode: 200, headers, body: JSON.stringify({ result }) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Lambda] 오류:", message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: message }) };
  }
};
