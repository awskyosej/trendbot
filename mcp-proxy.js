#!/usr/bin/env node
/**
 * MCP Proxy Server - Lambda Function URL stdio 브릿지
 *
 * 이 스크립트가 로컬에서 MCP 서버 역할을 하며,
 * Kiro IDE(stdin/stdout) ↔ Lambda Function URL(HTTP) 사이를 중계합니다.
 *
 * MCP 프로토콜(initialize, tools/list, tools/call 등)을 직접 처리하고,
 * tools/call 요청만 Lambda로 전달합니다.
 *
 * 환경변수:
 *   MCP_LAMBDA_URL - Lambda Function URL (필수)
 */

const https = require("https");
const http = require("http");
const { URL } = require("url");
const readline = require("readline");

const LAMBDA_URL = process.env.MCP_LAMBDA_URL;
if (!LAMBDA_URL) {
  process.stderr.write("ERROR: MCP_LAMBDA_URL 환경변수가 설정되지 않았습니다.\n");
  process.exit(1);
}

const parsedUrl = new URL(LAMBDA_URL);
const httpModule = parsedUrl.protocol === "https:" ? https : http;

// --- MCP 서버 메타데이터 ---

const SERVER_INFO = {
  name: "customer-trends-mcp",
  version: "1.0.0",
};

const TOOLS = [
  {
    name: "search_customer_trends",
    description: "담당 고객사의 최신 뉴스, AWS 모범사례 블로그, 경쟁 솔루션 동향을 통합 조회합니다.",
    inputSchema: {
      type: "object",
      properties: {
        customer_name: { type: "string", description: "고객사 이름" },
        search_period: { type: "string", description: "검색 기간 (예: '이번 주', '최근 7일')" },
        include_competitors: { type: "boolean", description: "경쟁 솔루션 검색 포함 여부", default: true },
      },
      required: ["customer_name", "search_period"],
    },
  },
];

// --- Lambda 호출 ---

function callLambda(body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
      timeout: 180000,
    };

    const req = httpModule.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve({ statusCode: res.statusCode, body: data });
        } catch (e) {
          reject(new Error("응답 처리 실패: " + e.message));
        }
      });
    });

    req.on("timeout", () => { req.destroy(); reject(new Error("Lambda 타임아웃")); });
    req.on("error", (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

// --- MCP 프로토콜 핸들러 ---

function handleInitialize(id) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      protocolVersion: "2024-11-05",
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
    },
  };
}

function handleToolsList(id) {
  return {
    jsonrpc: "2.0",
    id,
    result: { tools: TOOLS },
  };
}

async function handleToolsCall(id, params) {
  const toolName = params.name;
  const args = params.arguments || {};

  if (toolName !== "search_customer_trends") {
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "Tool not found: " + toolName },
    };
  }

  try {
    process.stderr.write("[Proxy] Lambda 호출 중: " + JSON.stringify(args) + "\n");

    const lambdaPayload = {
      tool: "search_customer_trends",
      arguments: args,
    };

    const response = await callLambda(lambdaPayload);
    process.stderr.write("[Proxy] Lambda 응답 status: " + response.statusCode + "\n");

    let resultText;
    try {
      const parsed = JSON.parse(response.body);
      resultText = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
    } catch {
      resultText = response.body;
    }

    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: resultText }],
      },
    };
  } catch (err) {
    process.stderr.write("[Proxy] Lambda 호출 오류: " + err.message + "\n");
    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: "Lambda 호출 중 오류가 발생했습니다: " + err.message }],
        isError: true,
      },
    };
  }
}

// --- 메시지 라우터 ---

async function handleMessage(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case "initialize":
      return handleInitialize(id);

    case "notifications/initialized":
      return null; // notification, 응답 불필요

    case "tools/list":
      return handleToolsList(id);

    case "tools/call":
      return await handleToolsCall(id, params);

    case "ping":
      return { jsonrpc: "2.0", id, result: {} };

    default:
      if (!id) return null; // notification
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: "Method not found: " + method },
      };
  }
}

// --- stdin/stdout 처리 ---

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on("line", async (line) => {
  if (!line.trim()) return;

  try {
    const msg = JSON.parse(line);
    process.stderr.write("[Proxy] 수신: " + JSON.stringify(msg).substring(0, 200) + "\n");
    const response = await handleMessage(msg);
    if (response) {
      process.stderr.write("[Proxy] 응답: " + JSON.stringify(response).substring(0, 200) + "\n");
      process.stdout.write(JSON.stringify(response) + "\n");
    }
  } catch (err) {
    process.stderr.write("[Proxy] 처리 오류: " + err.message + "\n");
  }
});

rl.on("close", () => process.exit(0));

process.stderr.write("MCP Proxy started. Lambda URL: " + LAMBDA_URL + "\n");
