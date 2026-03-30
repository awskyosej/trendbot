/**
 * 에이전트 계층 타입 정의
 * Bedrock/AgentCore 연동 및 각 에이전트 결과 인터페이스
 */

// --- 트렌드 검색 요청/결과 ---

export interface TrendSearchRequest {
  customerName: string;
  searchPeriod: string;
  includeCompetitors: boolean;
}

export interface TrendSearchResult {
  newsSummary: AgentResult<NewsSummaryItem[]>;
  blogSummary: AgentResult<BlogSummaryItem[]>;
  competitorTrends: AgentResult<CompetitorTrendItem[]> | null;
}

// --- 에이전트 결과 래퍼 ---

export interface AgentResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// --- 뉴스 요약 ---

export interface NewsSummaryItem {
  headline: string;
  summary: string;
  publishedDate: string;
  source: string;
  url: string;
}

// --- AWS 블로그 요약 ---

export interface BlogSummaryItem {
  headline: string;
  summary: string;
  publishedDate: string;
  url: string;
  category: string;
}

// --- 경쟁사 동향 ---

export interface CompetitorTrendItem {
  headline: string;
  summary: string;
  publishedDate: string;
  competitor: string;
  source: string;
  url: string;
}

// --- 뉴스 검색 관련 ---

export interface NewsSearchRequest {
  customerName: string;
  searchPeriod: string;
}

export interface NewsArticle {
  title: string;
  source: string;
  publishedDate: string;
  content: string;
  url: string;
}

// --- Bedrock 관련 ---

export interface BedrockInferenceRequest {
  prompt: string;
  customerName: string;
  searchPeriod: string;
  includeCompetitors: boolean;
}

export type BedrockSubtaskType =
  | "news_search"
  | "news_summary"
  | "aws_blog"
  | "competitor_trends";

export interface BedrockSubtask {
  type: BedrockSubtaskType;
  parameters: Record<string, unknown>;
}
