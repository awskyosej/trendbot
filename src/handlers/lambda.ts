/**
 * Lambda Handler - 검색 + 요약/분석 Tool
 *
 * AgentCore Gateway가 이 Lambda를 Tool로 호출합니다.
 *
 * 검색 도구: Runtime 에이전트를 invoke하여 BrowserClient로 실제 웹 검색
 * 요약 도구: Bedrock 모델로 텍스트 요약/분석
 *
 * 지원하는 Tool:
 * - search-news: Runtime 에이전트로 뉴스 검색
 * - search-blog: Runtime 에이전트로 AWS 블로그 검색
 * - search-competitors: Runtime 에이전트로 경쟁사 뉴스 검색
 * - summarize-news: 뉴스 텍스트를 헤드라인 + 50자 요약으로 정리
 * - summarize-blog: AWS 블로그 텍스트를 모범사례 필터링 + 요약
 * - analyze-competitors: 경쟁사 뉴스를 경쟁사별 분류 + 요약
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from "@aws-sdk/client-bedrock-agentcore";

const REGION = process.env.BEDROCK_REGION || "us-east-1";

const bedrockClient = new BedrockRuntimeClient({ region: REGION });
const agentCoreClient = new BedrockAgentCoreClient({ region: REGION });

const HAIKU_MODEL = "anthropic.claude-3-haiku-20240307-v1:0";
const SONNET_MODEL = "anthropic.claude-3-sonnet-20240229-v1:0";

// Runtime 에이전트 ARN (환경변수로 설정)
const SEARCH_NEWS_ARN = process.env.SEARCH_NEWS_AGENT_ARN || "";
const SEARCH_BLOG_ARN = process.env.SEARCH_BLOG_AGENT_ARN || "";
const SEARCH_COMPETITORS_ARN = process.env.SEARCH_COMPETITORS_AGENT_ARN || "";

interface LambdaResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

// --- Runtime 에이전트 호출 ---

async function invokeRuntimeAgent(agentArn: string, payload: Record<string, unknown>): Promise<string> {
  console.log(`[Lambda] Runtime 에이전트 호출: ${agentArn}`);

  const command = new InvokeAgentRuntimeCommand({
    agentRuntimeArn: agentArn,
    qualifier: "DEFAULT",
    payload: Buffer.from(JSON.stringify(payload)),
    contentType: "application/json",
    accept: "application/json",
  });

  const response = await agentCoreClient.send(command);

  // 스트리밍 응답 수집
  const chunks: string[] = [];
  if (response.response) {
    for await (const chunk of response.response as any) {
      if (chunk instanceof Uint8Array) {
        chunks.push(new TextDecoder().decode(chunk));
      } else if (typeof chunk === "string") {
        chunks.push(chunk);
      }
    }
  }

  const result = chunks.join("");
  console.log(`[Lambda] Runtime 에이전트 응답: ${result.substring(0, 200)}`);
  return result;
}

// --- Bedrock 모델 호출 ---

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

// --- 검색 도구 ---

async function searchNews(customerName: string, searchPeriod: string): Promise<string> {
  return await invokeRuntimeAgent(SEARCH_NEWS_ARN, {
    prompt: `${customerName} 관련 최신 뉴스를 ${searchPeriod} 기간으로 검색해 주세요.`,
    customer_name: customerName,
    search_period: searchPeriod,
  });
}

async function searchBlog(searchPeriod: string): Promise<string> {
  return await invokeRuntimeAgent(SEARCH_BLOG_ARN, {
    prompt: `AWS 블로그에서 ${searchPeriod} 기간의 아키텍처/구현 모범사례를 검색해 주세요.`,
    search_period: searchPeriod,
  });
}

async function searchCompetitors(customerName: string, searchPeriod: string): Promise<string> {
  return await invokeRuntimeAgent(SEARCH_COMPETITORS_ARN, {
    prompt: `${customerName} 관련 경쟁 클라우드(Azure, GCP) 최신 뉴스를 ${searchPeriod} 기간으로 검색해 주세요.`,
    customer_name: customerName,
    search_period: searchPeriod,
  });
}

// --- 요약 도구 ---

async function summarizeNews(text: string): Promise<string> {
  const system = `뉴스 기사를 분석하여 각 기사에 대해 JSON 배열로 반환하세요.
각 항목: { "headline": "헤드라인", "summary": "50자 이내 요약", "source": "출처", "url": "URL", "date": "날짜" }
summary는 반드시 50자 이내. 결과가 없으면 빈 배열 [].`;
  return await invokeBedrock(HAIKU_MODEL, system, text);
}

async function summarizeBlog(text: string): Promise<string> {
  const system = `AWS 블로그 게시물을 분석하세요.
단순 출시 공지와 docs.aws.amazon.com은 제외. 아키텍처/구현 모범사례만 선별.
JSON 배열로 반환: { "headline": "헤드라인", "summary": "50자 이내 요약", "category": "분류", "url": "URL", "date": "날짜" }
summary는 반드시 50자 이내. 모범사례가 없으면 빈 배열 [].`;
  return await invokeBedrock(SONNET_MODEL, system, text);
}

async function analyzeCompetitors(text: string): Promise<string> {
  const system = `경쟁 클라우드 솔루션 뉴스를 경쟁사별로 분류하세요.
JSON 배열로 반환: { "headline": "헤드라인", "summary": "50자 이내 요약", "competitor": "경쟁사명", "url": "URL", "date": "날짜" }
summary는 반드시 50자 이내. 결과가 없으면 빈 배열 [].`;
  return await invokeBedrock(SONNET_MODEL, system, text);
}

// --- Lambda Handler ---

export const handler = async (event: Record<string, unknown>): Promise<LambdaResponse> => {
  const headers = { "Content-Type": "application/json" };

  try {
    console.log("[Lambda] Event:", JSON.stringify(event).substring(0, 500));

    const action = (event.action as string) || "";
    const text = (event.text as string) || "";
    const customerName = (event.customer_name as string) || "";
    const searchPeriod = (event.search_period as string) || "최근 7일";

    let result: string;

    switch (action.replace(/_/g, "-")) {
      // 검색 도구 (Runtime 에이전트 호출)
      case "search-news":
        result = await searchNews(customerName, searchPeriod);
        break;
      case "search-blog":
        result = await searchBlog(searchPeriod);
        break;
      case "search-competitors":
        result = await searchCompetitors(customerName, searchPeriod);
        break;

      // 요약 도구 (Bedrock 모델 호출)
      case "summarize-news":
        if (!text) return { statusCode: 400, headers, body: JSON.stringify({ error: "text is required" }) };
        result = await summarizeNews(text);
        break;
      case "summarize-blog":
        if (!text) return { statusCode: 400, headers, body: JSON.stringify({ error: "text is required" }) };
        result = await summarizeBlog(text);
        break;
      case "analyze-competitors":
        if (!text) return { statusCode: 400, headers, body: JSON.stringify({ error: "text is required" }) };
        result = await analyzeCompetitors(text);
        break;

      default:
        return { statusCode: 400, headers, body: JSON.stringify({ error: `Unknown action: ${action}` }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ result }) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Lambda] 오류:", message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: message }) };
  }
};
