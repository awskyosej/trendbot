/**
 * 입력 유효성 검증 모듈
 *
 * Zod 스키마 기반으로 Tool 입력 파라미터를 검증한다.
 * 스키마 미충족 시 구체적 실패 사유를 포함한 오류를 반환한다.
 *
 * Requirements: 6.1, 6.2, 6.3, 13.2, 16.1
 */

import { z } from "zod";

/**
 * search_customer_trends Tool의 완전한 Zod 스키마
 *
 * - customer_name: 고객사 이름 (문자열, 필수)
 * - search_period: 검색 기간 (문자열, 필수)
 * - include_competitors: 경쟁 솔루션 검색 포함 여부 (불리언, 기본값 true)
 */
export const SearchCustomerTrendsSchema = z.object({
  customer_name: z
    .string({ required_error: "customer_name은 필수 파라미터입니다" })
    .min(1, "customer_name은 비어 있을 수 없습니다"),
  search_period: z
    .string({ required_error: "search_period는 필수 파라미터입니다" })
    .min(1, "search_period는 비어 있을 수 없습니다"),
  include_competitors: z.boolean().default(true),
});

/** 검증된 파라미터 타입 */
export type SearchCustomerTrendsInput = z.infer<typeof SearchCustomerTrendsSchema>;

/** 유효성 검증 결과 */
export interface ValidationResult {
  success: true;
  data: SearchCustomerTrendsInput;
}

/** 유효성 검증 오류 */
export interface ValidationError {
  success: false;
  error: string;
  details: string[];
}

/**
 * search_customer_trends Tool의 입력 파라미터를 검증한다.
 *
 * @param params - 검증할 입력 파라미터 (unknown)
 * @returns 검증 성공 시 파싱된 데이터, 실패 시 구체적 오류 사유
 */
export function validateSearchParams(
  params: unknown
): ValidationResult | ValidationError {
  const result = SearchCustomerTrendsSchema.safeParse(params);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const details = result.error.issues.map((issue) => {
    const path = issue.path.join(".");
    if (issue.code === "invalid_type" && issue.received === "undefined") {
      return `필수 파라미터 '${path}'이(가) 누락되었습니다`;
    }
    return `${path}: ${issue.message}`;
  });

  return {
    success: false,
    error: "입력 유효성 검증에 실패했습니다",
    details,
  };
}
