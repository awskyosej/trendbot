#!/usr/bin/env node
/**
 * MCP Proxy - Lambda Function URL stdio 브릿지
 *
 * Kiro IDE의 MCP 클라이언트(stdin/stdout)와
 * Lambda Function URL(HTTP) 사이를 중계합니다.
 *
 * 환경변수:
 *   MCP_LAMBDA_URL - Lambda Function URL (필수)
 *   AWS_REGION     - AWS 리전 (기본: us-east-1)
 */

const { URL } = require("url");
const https = require("https");
const http = require("http");
const readline = require("readline");

const LAMBDA_URL = process.env.MCP_LAMBDA_URL;
if (!LAMBDA_URL) {
  process.stderr.write("ERROR: MCP_LAMBDA_URL 환경변수가 설정되지 않았습니다.\n");
  process.exit(1);
}

const parsedUrl = new URL(LAMBDA_URL);
const httpModule = parsedUrl.protocol === "https:" ? https : http;

/**
 * Lambda Function URL에 JSON-RPC 요청을 전송하고 응답을 반환한다.
 */
function sendToLambda(jsonRpcMessage) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ body: JSON.stringify(jsonRpcMessage) });

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
      path: parsedUrl.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = httpModule.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const response = JSON.parse(data);
          // Lambda 응답의 body 필드에 JSON-RPC 응답이 들어있음
          if (response.body) {
            resolve(JSON.parse(response.body));
          } else {
            resolve(response);
          }
        } catch (e) {
          reject(new Error("Lambda 응답 파싱 실패: " + data));
        }
      });
    });

    req.on("error", (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

// stdin에서 줄 단위로 JSON-RPC 메시지를 읽어 Lambda로 전달
const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on("line", async (line) => {
  if (!line.trim()) return;

  try {
    const message = JSON.parse(line);
    const response = await sendToLambda(message);
    // stdout으로 JSON-RPC 응답 전송 (줄바꿈으로 구분)
    process.stdout.write(JSON.stringify(response) + "\n");
  } catch (err) {
    process.stderr.write("Proxy error: " + err.message + "\n");
    // JSON-RPC 에러 응답 반환
    const errorResponse = {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32603, message: err.message },
    };
    process.stdout.write(JSON.stringify(errorResponse) + "\n");
  }
});

rl.on("close", () => process.exit(0));

process.stderr.write("MCP Proxy started. Lambda URL: " + LAMBDA_URL + "\n");
