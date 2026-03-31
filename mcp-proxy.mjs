#!/usr/bin/env node
/**
 * MCP Proxy Server - Gateway 도구 동적 노출 (이름 매핑)
 *
 * AgentCore Gateway의 도구를 Kiro IDE에 깔끔한 이름으로 노출합니다.
 * 예: search-customer-trends___summarize-news → summarize-news
 *
 * 환경변수:
 *   MCP_GATEWAY_URL - AgentCore Gateway MCP URL (필수)
 *   AWS_REGION      - AWS 리전 (기본: us-east-1)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SignatureV4 } from "@smithy/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const GATEWAY_URL = process.env.MCP_GATEWAY_URL;
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

if (!GATEWAY_URL) {
  process.stderr.write("ERROR: MCP_GATEWAY_URL 환경변수가 설정되지 않았습니다.\n");
  process.exit(1);
}

// --- SigV4 ---
const signer = new SignatureV4({
  service: "bedrock-agentcore",
  region: AWS_REGION,
  credentials: defaultProvider(),
  sha256: Sha256,
});

async function sigv4Fetch(input, init) {
  const url = new URL(input.toString());
  const method = init?.method || "GET";
  const body = init?.body ? String(init.body) : undefined;
  const originalHeaders = {};
  if (init?.headers) {
    const h = init.headers;
    if (h instanceof Headers) {
      h.forEach((v, k) => { if (k.toLowerCase() !== "host") originalHeaders[k] = v; });
    } else if (typeof h === "object") {
      for (const [k, v] of Object.entries(h)) {
        if (k.toLowerCase() !== "host") originalHeaders[k] = v;
      }
    }
  }
  const request = {
    method, protocol: url.protocol, hostname: url.hostname,
    port: url.port ? parseInt(url.port) : 443,
    path: url.pathname + url.search,
    headers: { ...originalHeaders, host: url.hostname, "content-type": "application/json" },
    body,
  };
  const signed = await signer.sign(request);
  return globalThis.fetch(input, { ...init, headers: signed.headers });
}

// --- Gateway 클라이언트 ---
let gatewayClient = null;

// 이름 매핑: 짧은 이름 → Gateway 원본 이름
const nameMap = new Map();

async function getGateway() {
  if (gatewayClient) return gatewayClient;
  const transport = new StreamableHTTPClientTransport(new URL(GATEWAY_URL), { fetch: sigv4Fetch });
  const client = new Client({ name: "trendbot-proxy", version: "1.0.0" });
  await client.connect(transport);
  process.stderr.write("[Proxy] Gateway 연결 완료\n");
  gatewayClient = client;
  return client;
}

// Gateway 이름 → 짧은 이름 변환
function toShortName(gatewayName) {
  // "search-customer-trends___summarize-news" → "summarize-news"
  if (gatewayName.includes("___")) {
    return gatewayName.split("___").pop();
  }
  return gatewayName;
}

// --- 로컬 MCP 서버 ---
const server = new Server(
  { name: "customer-trends-mcp", version: "1.0.0" },
  { capabilities: { tools: { listChanged: false } } }
);

// tools/list → Gateway 도구를 짧은 이름으로 매핑하여 노출
server.setRequestHandler(ListToolsRequestSchema, async () => {
  try {
    const gw = await getGateway();
    const result = await gw.listTools();

    nameMap.clear();
    const tools = result.tools.map(t => {
      const shortName = toShortName(t.name);
      nameMap.set(shortName, t.name);
      process.stderr.write("[Proxy] 도구 매핑: " + shortName + " → " + t.name + "\n");
      return { ...t, name: shortName };
    });

    return { tools };
  } catch (err) {
    process.stderr.write("[Proxy] tools/list 오류: " + err.message + "\n");
    return { tools: [] };
  }
});

// tools/call → 짧은 이름을 Gateway 원본 이름으로 변환하여 호출
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;
    const gatewayName = nameMap.get(name) || name;
    process.stderr.write("[Proxy] Tool 호출: " + name + " → " + gatewayName + "\n");

    const gw = await getGateway();
    const result = await gw.callTool({ name: gatewayName, arguments: args });
    return result;
  } catch (err) {
    process.stderr.write("[Proxy] tools/call 오류: " + err.message + "\n");
    return { content: [{ type: "text", text: "오류: " + err.message }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write("MCP Proxy started. Gateway URL: " + GATEWAY_URL + "\n");
