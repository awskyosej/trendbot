# 구현 계획: MCP Application

## 개요

Lambda 기반 MCP 서버를 구현하여 Kiro IDE에서 고객 트렌드 검색 Tool을 호출할 수 있도록 한다. MCP 프로토콜 계층, Bedrock/AgentCore 연동 계층, 포맷팅 계층을 순차적으로 구현하며, 각 단계에서 이전 단계의 코드를 통합한다.

## Tasks

- [x] 1. 프로젝트 초기 설정 및 핵심 타입 정의
  - [x] 1.1 프로젝트 구조 생성 및 의존성 설정
    - `package.json` 생성: `@modelcontextprotocol/sdk`, `@aws-sdk/client-bedrock-runtime`, `@aws-sdk/client-s3`, `zod` 의존성 추가
    - `tsconfig.json` 생성: Lambda Node.js 런타임에 맞는 TypeScript 설정
    - 디렉토리 구조: `src/`, `src/types/`, `src/handlers/`, `src/agents/`, `src/formatters/`, `src/utils/`
    - _Requirements: 1.1, 1.2_
  - [x] 1.2 핵심 타입 및 인터페이스 정의
    - `src/types/index.ts`: `JsonRpcRequest`, `JsonRpcResponse`, `JsonRpcError`, `ToolDefinition`, `ToolResult`, `TextContent` 인터페이스 정의
    - `src/types/agents.ts`: `TrendSearchRequest`, `TrendSearchResult`, `AgentResult<T>`, `NewsSummaryItem`, `BlogSummaryItem`, `CompetitorTrendItem` 인터페이스 정의
    - `src/types/formatter.ts`: `FormattedOutput`, `FormattedSection`, `FormattedItem`, `FormatterInput` 인터페이스 정의
    - _Requirements: 7.1, 7.2, 9.3, 13.4, 15.2_

- [x] 2. MCP 서버 코어 및 Lambda 핸들러 구현
  - [x] 2.1 Lambda 핸들러 및 MCP 서버 인스턴스 생성
    - `src/handlers/lambda.ts`: Lambda handler 함수 구현, MCP 서버 인스턴스 생성 (`McpServer` 사용)
    - 서버 이름 `customer-trends-mcp`, 버전 `1.0.0`, capabilities에 tools/resources/prompts 포함
    - Lambda event에서 JSON-RPC 요청을 파싱하고 MCP 서버에 전달하는 로직 구현
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [x] 2.2 JSON-RPC 파싱/직렬화 유틸리티 구현
    - `src/utils/jsonrpc.ts`: Lambda event를 JSON-RPC 요청으로 파싱하는 `parseEvent` 함수 구현
    - JSON-RPC 2.0 응답 포맷팅 `formatResponse` 함수 구현
    - 유효하지 않은 JSON → Parse Error(-32700), 유효하지 않은 JSON-RPC → Invalid Request(-32600) 오류 처리
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - [ ]* 2.3 JSON-RPC 라운드트립 속성 테스트 작성
    - **Property 7: JSON-RPC 직렬화/파싱 라운드트립**
    - **Property 8: 유효하지 않은 JSON/JSON-RPC 오류 응답**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**

- [x] 3. 레지스트리 및 입력 검증 구현
  - [x] 3.1 Tool Registry 구현
    - `src/handlers/tools.ts`: `server.tool()` 메서드를 사용하여 Tool 등록 로직 구현
    - `tools/list` 요청 시 등록된 모든 Tool의 이름, 설명, Input_Schema 반환
    - 등록된 Tool이 없으면 빈 배열 반환
    - 존재하지 않는 Tool 호출 시 오류 응답 반환
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2_
  - [x] 3.2 Resource Registry 구현
    - `src/handlers/resources.ts`: `server.resource()` 메서드를 사용하여 Resource 등록 로직 구현
    - `resources/list` 요청 시 URI, 이름, 설명, MIME 타입 포함 목록 반환
    - `resources/read` 요청 시 해당 콘텐츠 반환, 존재하지 않는 URI 시 오류 응답
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [x] 3.3 Prompt Registry 구현
    - `src/handlers/prompts.ts`: `server.prompt()` 메서드를 사용하여 Prompt 등록 로직 구현
    - `prompts/list` 요청 시 이름, 설명, 인자 목록 반환
    - `prompts/get` 요청 시 인자가 적용된 메시지 목록 반환, 존재하지 않는 Prompt 시 오류 응답
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [x] 3.4 입력 유효성 검증 구현
    - `src/utils/validation.ts`: Zod 스키마 기반 `SearchCustomerTrendsSchema` 정의
    - `customer_name`(문자열, 필수), `search_period`(문자열, 필수), `include_competitors`(불리언, 기본값 true) 파라미터 검증
    - 스키마 미충족 시 구체적 실패 사유 포함 오류 반환, 필수 파라미터 누락 시 누락 파라미터명 포함 오류 반환
    - _Requirements: 6.1, 6.2, 6.3, 13.2, 16.1_
  - [ ]* 3.5 레지스트리 및 입력 검증 테스트 작성
    - **Property 1: Tool 목록 완전성**
    - **Property 2: 존재하지 않는 엔티티 오류 처리**
    - **Property 4: Resource 목록 완전성 및 읽기**
    - **Property 5: Prompt 목록 완전성 및 인자 적용**
    - **Property 6: 입력 유효성 검증 거부**
    - **Validates: Requirements 2.1, 2.2, 3.2, 4.1~4.4, 5.1~5.4, 6.1, 6.2**

- [x] 4. Checkpoint - 핵심 MCP 프로토콜 계층 검증
  - MCP 서버 초기화, 레지스트리, 입력 검증이 정상 동작하는지 확인한다. 모든 테스트가 통과하는지 확인하고, 질문이 있으면 사용자에게 문의한다.

- [x] 5. Bedrock Inference 및 AgentCore Gateway 연동 구현
  - [x] 5.1 Bedrock Inference 클라이언트 구현
    - `src/agents/bedrock-client.ts`: `BedrockRuntimeClient` 초기화 및 프롬프트 전달 함수 구현
    - 사용자 프롬프트를 분석하여 4가지 subtask(뉴스검색, 뉴스정리, AWS 블로그정리, 경쟁사 동향)로 분리하는 시스템 프롬프트 설계
    - `include_competitors` 플래그에 따라 경쟁사 동향 subtask 포함/제외 로직 구현
    - _Requirements: 9.1, 9.2, 16.2, 16.3_
  - [x] 5.2 뉴스 검색 에이전트 구현 (AgentCore 브라우저 도구)
    - `src/agents/news-search.ts`: AgentCore Gateway의 브라우저 도구를 사용하여 고객명 기반 뉴스 검색 수행
    - 검색 결과를 마크업 형식(제목, 출처, 게시일, 본문)으로 변환하여 S3에 `news/{customerName}/{date}/{articleId}.md` 경로로 저장
    - 검색 결과 없음 및 네트워크 오류 처리
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  - [x] 5.3 뉴스 정리 에이전트 구현 (Claude Haiku)
    - `src/agents/news-summary.ts`: S3에서 저장된 뉴스 기사를 읽어오는 로직 구현
    - Claude Haiku 모델을 사용하여 각 기사에 대해 헤드라인과 50자 이내 요약 생성
    - 일자별 정렬하여 `NewsSummaryItem[]` 형태로 결과 반환
    - S3 읽기 오류 처리
    - _Requirements: 11.1, 11.2, 11.3, 11.4_
  - [x] 5.4 AWS 블로그 에이전트 구현 (AgentCore 브라우저 도구 + Claude Sonnet)
    - `src/agents/aws-blog.ts`: AgentCore 브라우저 도구로 AWS 한국어 블로그(https://aws.amazon.com/ko/blogs/korea/) 검색
    - Claude Sonnet 모델로 단순 기능 출시 공지 필터링, 아키텍처/구현 모범사례만 선별
    - 각 블로그에 대해 헤드라인과 50자 이내 요약 생성, 게시일 기준 정렬
    - 모범사례 블로그 없음 및 접근 오류 처리
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_
  - [x] 5.5 경쟁사 동향 에이전트 구현 (AgentCore 브라우저 도구 + Claude Sonnet)
    - `src/agents/competitor-news.ts`: AgentCore 브라우저 도구로 고객명+경쟁 클라우드 솔루션 키워드 조합 뉴스 검색
    - Claude Sonnet 모델로 경쟁사별(Azure, GCP 등) 분류 및 헤드라인과 50자 이내 요약 생성
    - 검색 결과 없음 및 검색 오류 처리
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_
  - [ ]* 5.6 에이전트 오케스트레이션 테스트 작성
    - **Property 9: 오케스트레이터 부분 실패 처리**
    - **Property 10: 필수 입력 누락 시 재입력 요청**
    - **Property 11: 뉴스 기사 마크업 형식 완전성**
    - **Property 12: 요약 길이 제한**
    - **Property 13: 블로그 필터링 정확성**
    - **Property 14: 경쟁사별 분류 정확성**
    - **Property 18: include_competitors 플래그 동작**
    - **Validates: Requirements 9.3~9.5, 10.2, 10.3, 11.2, 12.2, 12.3, 14.2, 14.3, 16.2, 16.3**

- [x] 6. Checkpoint - Bedrock/AgentCore 연동 검증
  - Bedrock inference 연동 및 각 에이전트가 정상 동작하는지 확인한다. 모든 테스트가 통과하는지 확인하고, 질문이 있으면 사용자에게 문의한다.

- [x] 7. 포맷팅 계층 구현
  - [x] 7.1 User Friendly Formatter 구현
    - `src/formatters/user-friendly-formatter.ts`: `FormatterInput`을 받아 `FormattedOutput` JSON 구조로 변환하는 함수 구현
    - 기술 용어 → 비즈니스 표현 변환 매핑 테이블 구현 (API Gateway→서비스 연결 관리, Microservices→독립 서비스 구조 등)
    - 세 섹션(뉴스 요약, AWS 블로그 요약, 경쟁 솔루션 동향) 구분, 각 섹션 내 항목 일자별 정렬
    - 결과 없는 섹션 `status: "empty"` + 안내 메시지, 오류 섹션 `status: "error"` + 사용자 친화적 메시지 (기술적 오류 코드 미노출)
    - metadata 포함 (customerName, searchPeriod, generatedAt, includeCompetitors)
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_
  - [ ]* 7.2 포맷터 테스트 작성
    - **Property 15: 포맷터 JSON 출력 구조 및 정렬**
    - **Property 16: 포맷터 빈 섹션 및 오류 메시지**
    - **Property 17: 기술 용어 변환**
    - **Validates: Requirements 13.4, 15.1~15.5**

- [x] 8. Tool 등록 및 전체 통합
  - [x] 8.1 search_customer_trends Tool 등록 및 핸들러 연결
    - `src/handlers/tools.ts`에 `search_customer_trends` Tool 등록: `server.tool()` 메서드 사용
    - Zod 스키마(`SearchCustomerTrendsSchema`)를 Input_Schema로 연결
    - Tool 핸들러에서 Bedrock Inference → AgentCore Gateway → User Friendly Formatter 파이프라인 연결
    - Tool 실행 결과를 `text` 콘텐츠 타입으로 반환, 오류 시 `isError: true` 설정
    - _Requirements: 3.1, 3.3, 3.4, 13.1, 13.2, 13.3, 13.4_
  - [x] 8.2 오류 처리 통합
    - 부분 실패 허용: 일부 에이전트 실패 시 성공한 결과 + 실패 사유 함께 반환
    - `customer_name` 또는 `search_period` 누락 시 재입력 요청 응답 반환
    - Lambda 타임아웃 설정 및 Bedrock/AgentCore 호출 타임아웃 처리
    - _Requirements: 3.2, 3.3, 9.4, 9.5_
  - [ ]* 8.3 통합 테스트 작성
    - **Property 3: Tool 응답 형식 불변성**
    - **Property 9: 오케스트레이터 부분 실패 처리**
    - **Validates: Requirements 3.1~3.4, 9.3, 9.4**

- [x] 9. 서버 종료 처리 및 마무리
  - [x] 9.1 Lambda 환경 종료 처리 구현
    - Lambda handler에서 실행 완료 시 리소스 정리 로직 구현
    - Lambda 콜드 스타트 시 MCP 서버 초기화, 웜 스타트 시 기존 인스턴스 재사용 로직 구현
    - _Requirements: 8.1, 8.2, 8.3_

- [x] 10. 최종 Checkpoint - 전체 통합 검증
  - 모든 컴포넌트가 통합되어 정상 동작하는지 확인한다. Lambda handler → MCP 서버 → Tool 호출 → Bedrock/AgentCore → Formatter 전체 파이프라인을 검증한다. 모든 테스트가 통과하는지 확인하고, 질문이 있으면 사용자에게 문의한다.

- [x] 11. CDK 프로젝트 초기 설정
  - [x] 11.1 CDK 프로젝트 구조 생성 및 의존성 설정
    - 프로젝트 루트에 `infra/` 디렉토리 생성 후 CDK TypeScript 프로젝트 초기화 (`cdk init app --language typescript`)
    - `infra/package.json`에 CDK 의존성 추가: `aws-cdk-lib`, `constructs`, `@aws-cdk/aws-lambda-nodejs` (esbuild 번들링용)
    - `infra/tsconfig.json` CDK 프로젝트용 TypeScript 설정
    - `infra/bin/app.ts` CDK 앱 엔트리포인트 생성, 스택 인스턴스화
    - _Requirements: 1.1, 1.2_
  - [x] 11.2 CDK 환경 설정 파일 구성
    - `infra/cdk.json` CDK 설정 파일 생성 (앱 엔트리포인트, context 설정)
    - 환경별(dev/prod) 설정을 위한 context 파라미터 정의 (리전, 계정 ID 등)
    - `.gitignore`에 `cdk.out/` 디렉토리 추가

- [x] 12. Lambda Function 스택 정의
  - [x] 12.1 Lambda Function 및 IAM Role 정의
    - `infra/lib/lambda-stack.ts` 생성
    - `NodejsFunction` construct를 사용하여 Lambda function 정의 (런타임: Node.js 20.x, 핸들러: `src/handlers/lambda.handler`)
    - esbuild 번들링 설정: `src/` 디렉토리의 TypeScript 코드를 번들링하여 Lambda에 배포
    - Lambda 실행 역할(Execution Role) 정의: 기본 Lambda 실행 권한 + CloudWatch Logs 쓰기 권한
    - Lambda 환경변수 설정: `S3_BUCKET_NAME`, `BEDROCK_REGION`, `AGENTCORE_ENDPOINT`
    - Lambda 메모리(512MB), 타임아웃(5분) 설정
    - _Requirements: 1.1, 1.2, 1.3, 8.1, 8.2_
  - [x] 12.2 Lambda Function URL 설정
    - Lambda Function URL 생성 (인증 타입: `AWS_IAM`)
    - Function URL 출력값을 CDK Output으로 내보내기 (Kiro IDE MCP 서버 등록 시 사용)
    - _Requirements: 1.3, 1.4_

- [x] 13. S3 버킷 스택 정의
  - [x] 13.1 뉴스 기사 저장용 S3 버킷 생성
    - `infra/lib/storage-stack.ts` 생성
    - S3 버킷 정의: 버킷 이름 접두사 `mcp-news-articles`, 버전 관리 비활성화, 암호화(S3 관리형 키)
    - 라이프사이클 규칙: 90일 후 자동 삭제 (뉴스 기사 보관 기간 제한)
    - `removalPolicy: RemovalPolicy.DESTROY` 설정 (실험 프로젝트이므로 스택 삭제 시 버킷도 삭제)
    - `autoDeleteObjects: true` 설정
    - _Requirements: 10.2, 10.3, 11.1_
  - [x] 13.2 Lambda에 S3 읽기/쓰기 권한 부여
    - S3 버킷에 대한 Lambda 함수의 읽기/쓰기 IAM 권한 부여 (`bucket.grantReadWrite(lambdaFunction)`)
    - Lambda 환경변수에 S3 버킷 이름 자동 주입
    - _Requirements: 10.2, 11.1_

- [x] 14. Bedrock 및 AgentCore IAM 권한 설정
  - [x] 14.1 Bedrock Inference 호출 권한 설정
    - `infra/lib/lambda-stack.ts`에 Bedrock 관련 IAM 정책 추가
    - `bedrock:InvokeModel` 권한: Claude Haiku, Claude Sonnet 모델 호출 허용
    - 리소스 ARN을 특정 모델로 제한 (`arn:aws:bedrock:*::foundation-model/anthropic.claude-*`)
    - _Requirements: 9.1, 9.2_
  - [x] 14.2 AgentCore Gateway 호출 권한 설정
    - AgentCore Gateway 엔드포인트 호출을 위한 IAM 정책 추가
    - `bedrock:InvokeAgent` 권한 부여
    - AgentCore 브라우저 도구 사용을 위한 필요 권한 설정
    - _Requirements: 10.1, 12.1, 14.1_

- [x] 15. CDK 배포 스크립트 및 최종 검증
  - [x] 15.1 배포 스크립트 작성
    - `infra/package.json`에 배포 관련 npm 스크립트 추가: `cdk:synth`, `cdk:diff`, `cdk:deploy`, `cdk:destroy`
    - `cdk:deploy` 스크립트: `cdk deploy --all --require-approval broadening`
    - `cdk:destroy` 스크립트: `cdk destroy --all --force`
    - _Requirements: 1.1_
  - [x] 15.2 CDK Synth 및 배포 검증
    - `cdk synth`로 CloudFormation 템플릿 생성 확인
    - 생성된 템플릿에 Lambda, S3, IAM Role/Policy가 올바르게 포함되어 있는지 확인
    - CDK Output에서 Lambda Function URL이 정상 출력되는지 확인

- [x] 16. 최종 Checkpoint - CDK 배포 검증
  - CDK 프로젝트가 정상적으로 synth되는지 확인한다. Lambda, S3, IAM 권한이 올바르게 정의되어 있는지 검증한다. 질문이 있으면 사용자에게 문의한다.

## Notes

- `*` 표시된 태스크는 선택사항(optional)이며 실험 프로젝트 특성상 건너뛸 수 있습니다
- 각 태스크는 특정 요구사항을 참조하여 추적 가능합니다
- Checkpoint에서 점진적 검증을 수행합니다
- TypeScript + MCP SDK + Zod 기반으로 구현합니다
- CDK 배포 태스크(11~16)는 `infra/` 디렉토리에서 AWS CDK (TypeScript)를 사용하여 인프라를 정의합니다
- CDK 배포 전 `cdk bootstrap`이 대상 AWS 계정/리전에 실행되어 있어야 합니다
