/**
 * User Friendly Formatter
 *
 * 기술 용어를 비즈니스 관점의 표현으로 변환하고,
 * 에이전트 결과를 사용자 친화적인 JSON 구조로 포맷팅한다.
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5
 */

import type { FormatterInput, FormattedOutput, FormattedSection, FormattedItem } from "../types/formatter.js";
import type { AgentResult, NewsSummaryItem, BlogSummaryItem, CompetitorTrendItem } from "../types/agents.js";

/**
 * 기술 용어 → 비즈니스 표현 매핑 테이블
 */
const TERM_MAPPING: Record<string, string> = {
  "API Gateway": "서비스 연결 관리",
  "Microservices": "독립 서비스 구조",
  "Container": "애플리케이션 실행 환경",
  "Serverless": "서버 관리 불필요 서비스",
  "CI/CD": "자동 배포 파이프라인",
  "Kubernetes": "컨테이너 오케스트레이션 플랫폼",
  "Lambda": "서버리스 함수 실행 서비스",
  "EC2": "가상 서버 인스턴스",
  "S3": "클라우드 스토리지",
  "VPC": "가상 네트워크 환경",
  "IAM": "접근 권한 관리",
  "CloudFormation": "인프라 자동 구성 도구",
  "ECS": "컨테이너 관리 서비스",
  "EKS": "쿠버네티스 관리 서비스",
  "RDS": "관리형 데이터베이스",
  "DynamoDB": "NoSQL 데이터베이스 서비스",
  "CloudFront": "콘텐츠 전송 네트워크",
  "Route 53": "도메인 관리 서비스",
  "SQS": "메시지 큐 서비스",
  "SNS": "알림 서비스",
  "DevOps": "개발 운영 자동화",
  "IaC": "인프라 코드 관리",
  "Auto Scaling": "자동 확장 기능",
  "Load Balancer": "트래픽 분산 장치",
  "CDN": "콘텐츠 전송 네트워크",
};

/**
 * 텍스트 내 기술 용어를 비즈니스 표현으로 변환한다.
 *
 * @param text - 변환할 텍스트
 * @returns 기술 용어가 비즈니스 표현으로 변환된 텍스트
 */
export function convertTechnicalTerms(text: string): string {
  let result = text;
  for (const [technical, business] of Object.entries(TERM_MAPPING)) {
    // 대소문자 무시 매칭을 위해 정규식 사용
    const escaped = technical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "gi");
    result = result.replace(regex, business);
  }
  return result;
}


/**
 * 항목 배열을 publishedDate 기준 내림차순(최신순)으로 정렬한다.
 */
function sortByDateDescending<T extends { publishedDate: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const dateA = new Date(a.publishedDate).getTime();
    const dateB = new Date(b.publishedDate).getTime();
    return dateB - dateA;
  });
}

/**
 * 뉴스 요약 섹션을 생성한다.
 */
function formatNewsSection(result: AgentResult<NewsSummaryItem[]>): FormattedSection {
  if (!result.success) {
    return {
      type: "news",
      title: "고객사 뉴스 요약",
      status: "error",
      message: "뉴스 조회에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  if (!result.data || result.data.length === 0) {
    return {
      type: "news",
      title: "고객사 뉴스 요약",
      status: "empty",
      message: "해당 기간에 고객사 관련 뉴스가 없습니다.",
    };
  }

  const sorted = sortByDateDescending(result.data);
  const items: FormattedItem[] = sorted.map((item) => ({
    headline: convertTechnicalTerms(item.headline),
    summary: convertTechnicalTerms(item.summary),
    publishedDate: item.publishedDate,
    source: item.source,
    url: item.url,
  }));

  return {
    type: "news",
    title: "고객사 뉴스 요약",
    status: "success",
    items,
  };
}

/**
 * AWS 블로그 요약 섹션을 생성한다.
 */
function formatBlogSection(result: AgentResult<BlogSummaryItem[]>): FormattedSection {
  if (!result.success) {
    return {
      type: "blog",
      title: "AWS 모범사례 블로그",
      status: "error",
      message: "AWS 블로그 조회에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  if (!result.data || result.data.length === 0) {
    return {
      type: "blog",
      title: "AWS 모범사례 블로그",
      status: "empty",
      message: "해당 기간에 관련 AWS 모범사례 블로그가 없습니다.",
    };
  }

  const sorted = sortByDateDescending(result.data);
  const items: FormattedItem[] = sorted.map((item) => ({
    headline: convertTechnicalTerms(item.headline),
    summary: convertTechnicalTerms(item.summary),
    publishedDate: item.publishedDate,
    url: item.url,
  }));

  return {
    type: "blog",
    title: "AWS 모범사례 블로그",
    status: "success",
    items,
  };
}

/**
 * 경쟁 솔루션 동향 섹션을 생성한다.
 */
function formatCompetitorSection(
  result: AgentResult<CompetitorTrendItem[]> | null
): FormattedSection {
  if (result === null) {
    return {
      type: "competitor",
      title: "경쟁 솔루션 동향",
      status: "empty",
      message: "경쟁 솔루션 검색이 비활성화되어 있습니다.",
    };
  }

  if (!result.success) {
    return {
      type: "competitor",
      title: "경쟁 솔루션 동향",
      status: "error",
      message: "경쟁 솔루션 동향 조회에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  if (!result.data || result.data.length === 0) {
    return {
      type: "competitor",
      title: "경쟁 솔루션 동향",
      status: "empty",
      message: "해당 기간에 경쟁 솔루션 관련 뉴스가 없습니다.",
    };
  }

  const sorted = sortByDateDescending(result.data);
  const items: FormattedItem[] = sorted.map((item) => ({
    headline: convertTechnicalTerms(item.headline),
    summary: convertTechnicalTerms(item.summary),
    publishedDate: item.publishedDate,
    competitor: item.competitor,
    source: item.source,
    url: item.url,
  }));

  return {
    type: "competitor",
    title: "경쟁 솔루션 동향",
    status: "success",
    items,
  };
}

/**
 * 트렌드 검색 결과를 사용자 친화적인 JSON 구조로 포맷팅한다.
 *
 * - 기술 용어를 비즈니스 표현으로 변환
 * - 세 섹션(뉴스 요약, AWS 블로그 요약, 경쟁 솔루션 동향)으로 구분
 * - 각 섹션 내 항목을 일자별 정렬
 * - 결과 없는 섹션에 안내 메시지, 오류 섹션에 사용자 친화적 메시지 포함
 * - metadata 포함 (customerName, searchPeriod, generatedAt, includeCompetitors)
 *
 * @param input - 에이전트 결과 (FormatterInput)
 * @param customerName - 고객사 이름
 * @param searchPeriod - 검색 기간
 * @param includeCompetitors - 경쟁 솔루션 검색 포함 여부
 * @returns 포맷팅된 출력 (FormattedOutput)
 */
export function formatTrendSearchResult(
  input: FormatterInput,
  customerName: string,
  searchPeriod: string,
  includeCompetitors: boolean
): FormattedOutput {
  const sections: FormattedSection[] = [
    formatNewsSection(input.newsSummary),
    formatBlogSection(input.blogSummary),
    formatCompetitorSection(input.competitorTrends),
  ];

  return {
    sections,
    metadata: {
      customerName,
      searchPeriod,
      generatedAt: new Date().toISOString(),
      includeCompetitors,
    },
  };
}
