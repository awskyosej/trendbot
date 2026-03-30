/**
 * 포맷팅 계층 타입 정의
 * User Friendly Formatter 입출력 인터페이스
 */

import type { AgentResult, NewsSummaryItem, BlogSummaryItem, CompetitorTrendItem } from "./agents";

// --- 포맷터 입력 ---

export interface FormatterInput {
  newsSummary: AgentResult<NewsSummaryItem[]>;
  blogSummary: AgentResult<BlogSummaryItem[]>;
  competitorTrends: AgentResult<CompetitorTrendItem[]> | null;
}

// --- 포맷터 출력 ---

export interface FormattedOutput {
  sections: FormattedSection[];
  metadata: {
    customerName: string;
    searchPeriod: string;
    generatedAt: string;
    includeCompetitors: boolean;
  };
}

export interface FormattedSection {
  type: "news" | "blog" | "competitor";
  title: string;
  status: "success" | "empty" | "error";
  message?: string;
  items?: FormattedItem[];
}

export interface FormattedItem {
  headline: string;
  summary: string;
  publishedDate: string;
  source?: string;
  url?: string;
  competitor?: string;
}
