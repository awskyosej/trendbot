/**
 * MCP 프로토콜 핵심 타입 정의
 * JSON-RPC 2.0 메시지 및 Tool/Resource/Prompt 관련 인터페이스
 */

// --- JSON-RPC 2.0 ---

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// --- JSON-RPC 에러 코드 ---

export const JSON_RPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

// --- Tool 관련 ---

export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

export interface ToolResult {
  content: Array<TextContent | ImageContent>;
  isError?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (params: Record<string, unknown>) => Promise<ToolResult>;
}

// --- Resource 관련 ---

export interface ResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  handler: () => Promise<ResourceContent>;
}

export interface ResourceContent {
  uri: string;
  text: string;
  mimeType: string;
}

// --- Prompt 관련 ---

export interface PromptArgument {
  name: string;
  description: string;
  required: boolean;
}

export interface PromptMessage {
  role: "user" | "assistant";
  content: TextContent;
}

export interface PromptDefinition {
  name: string;
  description: string;
  arguments: PromptArgument[];
  handler: (args: Record<string, string>) => Promise<PromptMessage[]>;
}

// --- Lambda 이벤트 ---

export interface LambdaEvent {
  body?: string;
  headers?: Record<string, string>;
  requestContext?: Record<string, unknown>;
}

export interface LambdaResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}
