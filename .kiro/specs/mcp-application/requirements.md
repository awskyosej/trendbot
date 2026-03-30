# 요구사항 문서

## 소개

Kiro IDE에서 MCP(Model Context Protocol)로 등록하여 사용할 수 있는 MCP 애플리케이션을 개발한다. MCP는 AI 모델이 외부 도구, 리소스, 프롬프트에 접근할 수 있도록 하는 표준 프로토콜이다. 이 애플리케이션은 MCP 서버로 동작하며, Kiro IDE의 MCP 클라이언트가 연결하여 도구(Tool)를 호출하고 리소스(Resource)를 조회할 수 있도록 한다.

## 사용자 페르소나

### 페르소나: AWS Account Manager

| 항목 | 설명 |
|------|------|
| 역할 | AWS Account Manager로서 고객사를 담당하며, 고객 미팅 준비 및 솔루션 제안을 수행한다 |
| 기술 수준 | 고객 워크로드를 기반으로 클라우드 서비스, 아키텍처 등에 대한 실무 경험이 있으나, 체계적인 개발/엔지니어링 교육을 받은 것은 아니다. 기술 개념을 이해하지만 깊은 구현 세부사항에는 익숙하지 않다 |
| 니즈/관심사 | 담당 고객사의 최신 동향을 빠르게 파악하고, 경쟁 클라우드 솔루션(Azure, GCP 등) 대비 AWS의 강점을 이해하여 고객 대응에 활용하고자 한다 |
| 사용 맥락 | 고객 미팅 전 준비 단계에서 Kiro IDE를 통해 MCP Tool을 호출하여 고객 뉴스 및 AWS 모범사례를 조회한다. 짧은 시간 내에 핵심 정보를 파악해야 하는 상황이 많다 |
| 기대 결과물 | 기술 용어가 최소화된, 읽기 쉬운 요약 형태의 결과를 기대한다 |

### UX 시사점

1. 결과 표시 시 기술 전문 용어를 최소화하고, 비즈니스 관점의 표현을 우선 사용한다
2. 검색 결과는 헤드라인과 짧은 요약 중심으로 구성하여 빠른 스캔이 가능하도록 한다
3. 입력 파라미터는 고객명과 기간 등 직관적인 항목으로 단순화하여 사용 진입 장벽을 낮춘다
4. 경쟁 솔루션 관련 정보를 함께 제공하여 Account Manager의 대응력을 높인다
5. 오류 발생 시 기술적 오류 코드 대신 사용자가 이해할 수 있는 안내 메시지를 제공한다

## 용어 정의

- **MCP_Server**: MCP 프로토콜을 구현하여 도구와 리소스를 제공하는 서버 애플리케이션
- **MCP_Client**: MCP 서버에 연결하여 도구 호출 및 리소스 조회를 수행하는 클라이언트 (Kiro IDE 내장)
- **Tool**: MCP 서버가 제공하는 실행 가능한 기능 단위. 이름, 설명, 입력 스키마를 포함한다
- **Resource**: MCP 서버가 제공하는 읽기 전용 데이터. URI로 식별된다
- **Prompt**: MCP 서버가 제공하는 재사용 가능한 프롬프트 템플릿
- **Transport**: MCP 클라이언트와 서버 간의 통신 방식 (stdio 또는 SSE)
- **JSON_RPC**: MCP 프로토콜의 메시지 교환에 사용되는 원격 프로시저 호출 프로토콜
- **Input_Schema**: Tool의 입력 파라미터를 정의하는 JSON Schema 객체
- **Trend_Search_Agent**: 사용자의 질문을 분석하여 하위 에이전트에게 작업을 분배하고 결과를 취합하는 오케스트레이터 에이전트
- **News_Search_Agent**: 웹 브라우저를 통해 고객명 기반으로 특정 기간의 뉴스를 검색하여 S3에 마크업 형식으로 저장하는 에이전트
- **News_Summary_Agent**: S3에 저장된 뉴스 기사를 읽어 헤드라인 및 50자 요약으로 정리하는 에이전트
- **AWS_Blog_Agent**: AWS 한국어 블로그에서 특정 기간의 아키텍처/구현 모범사례 블로그를 검색하여 헤드라인 및 50자 요약으로 정리하는 에이전트
- **S3_Storage**: 검색된 뉴스 기사 및 블로그 데이터를 저장하는 Amazon S3 스토리지
- **Customer**: AWS Account Manager가 담당하는 고객사
- **Search_Period**: 뉴스 및 블로그 검색 대상 기간 (예: 이번 주, 최근 7일)
- **Competitor_Solution**: AWS와 경쟁하는 클라우드 서비스 제공자(Azure, GCP 등)의 솔루션
- **Competitor_News_Agent**: 경쟁 클라우드 솔루션 관련 뉴스 및 발표를 검색하여 요약하는 에이전트
- **User_Friendly_Formatter**: 기술 용어를 비즈니스 관점의 표현으로 변환하여 결과를 포맷하는 모듈

## 요구사항

### 요구사항 1: MCP 서버 초기화

**사용자 스토리:** 개발자로서, MCP 서버를 시작하고 초기화할 수 있기를 원한다. 이를 통해 Kiro IDE에서 MCP 서버로 등록하여 사용할 수 있다.

#### 인수 조건

1. WHEN MCP_Client가 초기화 요청(initialize)을 전송하면, THE MCP_Server SHALL 서버 이름, 버전, 지원하는 기능(capabilities) 정보를 포함한 초기화 응답을 반환한다
2. THE MCP_Server SHALL JSON_RPC 2.0 프로토콜을 사용하여 메시지를 교환한다
3. THE MCP_Server SHALL stdio Transport를 통해 MCP_Client와 통신한다
4. WHEN MCP_Client가 초기화 완료 알림(initialized)을 전송하면, THE MCP_Server SHALL 정상적으로 요청을 수락할 준비 상태가 된다

### 요구사항 2: Tool 등록 및 목록 제공

**사용자 스토리:** 개발자로서, MCP 서버에 커스텀 Tool을 등록하고 MCP_Client에 Tool 목록을 제공할 수 있기를 원한다. 이를 통해 AI 모델이 사용 가능한 도구를 파악할 수 있다.

#### 인수 조건

1. THE MCP_Server SHALL 각 Tool에 대해 고유한 이름, 설명, Input_Schema를 정의하여 등록한다
2. WHEN MCP_Client가 도구 목록 요청(tools/list)을 전송하면, THE MCP_Server SHALL 등록된 모든 Tool의 이름, 설명, Input_Schema를 포함한 목록을 반환한다
3. IF 등록된 Tool이 없으면, THEN THE MCP_Server SHALL 빈 배열을 반환한다

### 요구사항 3: Tool 실행

**사용자 스토리:** 개발자로서, MCP_Client가 요청한 Tool을 실행하고 결과를 반환할 수 있기를 원한다. 이를 통해 AI 모델이 외부 기능을 활용할 수 있다.

#### 인수 조건

1. WHEN MCP_Client가 도구 호출 요청(tools/call)을 유효한 Tool 이름과 파라미터로 전송하면, THE MCP_Server SHALL 해당 Tool을 실행하고 결과를 반환한다
2. IF 존재하지 않는 Tool 이름으로 호출 요청이 수신되면, THEN THE MCP_Server SHALL 도구를 찾을 수 없다는 오류 응답을 반환한다
3. IF Tool 실행 중 오류가 발생하면, THEN THE MCP_Server SHALL isError 플래그를 true로 설정하고 오류 메시지를 포함한 응답을 반환한다
4. WHEN Tool이 실행 결과를 반환하면, THE MCP_Server SHALL 결과를 text 또는 image 콘텐츠 타입으로 포맷하여 반환한다

### 요구사항 4: Resource 등록 및 조회

**사용자 스토리:** 개발자로서, MCP 서버에 Resource를 등록하고 MCP_Client가 조회할 수 있기를 원한다. 이를 통해 AI 모델이 컨텍스트 데이터에 접근할 수 있다.

#### 인수 조건

1. THE MCP_Server SHALL 각 Resource에 대해 고유한 URI, 이름, 설명, MIME 타입을 정의하여 등록한다
2. WHEN MCP_Client가 리소스 목록 요청(resources/list)을 전송하면, THE MCP_Server SHALL 등록된 모든 Resource의 URI, 이름, 설명, MIME 타입을 포함한 목록을 반환한다
3. WHEN MCP_Client가 특정 URI로 리소스 읽기 요청(resources/read)을 전송하면, THE MCP_Server SHALL 해당 Resource의 콘텐츠를 반환한다
4. IF 존재하지 않는 URI로 리소스 읽기 요청이 수신되면, THEN THE MCP_Server SHALL 리소스를 찾을 수 없다는 오류 응답을 반환한다

### 요구사항 5: Prompt 템플릿 제공

**사용자 스토리:** 개발자로서, 재사용 가능한 Prompt 템플릿을 등록하고 제공할 수 있기를 원한다. 이를 통해 AI 모델이 일관된 프롬프트를 사용할 수 있다.

#### 인수 조건

1. THE MCP_Server SHALL 각 Prompt에 대해 고유한 이름, 설명, 인자(arguments) 목록을 정의하여 등록한다
2. WHEN MCP_Client가 프롬프트 목록 요청(prompts/list)을 전송하면, THE MCP_Server SHALL 등록된 모든 Prompt의 이름, 설명, 인자 목록을 포함한 목록을 반환한다
3. WHEN MCP_Client가 특정 Prompt 이름과 인자로 프롬프트 가져오기 요청(prompts/get)을 전송하면, THE MCP_Server SHALL 인자가 적용된 메시지 목록을 반환한다
4. IF 존재하지 않는 Prompt 이름으로 요청이 수신되면, THEN THE MCP_Server SHALL 프롬프트를 찾을 수 없다는 오류 응답을 반환한다

### 요구사항 6: 입력 유효성 검증

**사용자 스토리:** 개발자로서, Tool 호출 시 입력 파라미터의 유효성을 검증할 수 있기를 원한다. 이를 통해 잘못된 입력으로 인한 오류를 사전에 방지할 수 있다.

#### 인수 조건

1. WHEN Tool 호출 요청이 수신되면, THE MCP_Server SHALL Input_Schema에 정의된 규칙에 따라 입력 파라미터를 검증한다
2. IF 입력 파라미터가 Input_Schema를 충족하지 않으면, THEN THE MCP_Server SHALL 유효성 검증 실패 오류와 구체적인 실패 사유를 반환한다
3. IF 필수 파라미터가 누락되면, THEN THE MCP_Server SHALL 누락된 파라미터 이름을 포함한 오류 응답을 반환한다

### 요구사항 7: JSON-RPC 메시지 파싱 및 직렬화

**사용자 스토리:** 개발자로서, MCP 프로토콜의 JSON-RPC 메시지를 정확하게 파싱하고 직렬화할 수 있기를 원한다. 이를 통해 MCP_Client와 안정적으로 통신할 수 있다.

#### 인수 조건

1. WHEN 유효한 JSON_RPC 메시지가 수신되면, THE MCP_Server SHALL 메시지를 파싱하여 method, params, id 필드를 추출한다
2. THE MCP_Server SHALL 응답 메시지를 JSON_RPC 2.0 형식으로 직렬화하여 전송한다
3. IF 유효하지 않은 JSON 형식의 메시지가 수신되면, THEN THE MCP_Server SHALL JSON_RPC Parse Error(-32700) 응답을 반환한다
4. IF 유효하지 않은 JSON_RPC 요청이 수신되면, THEN THE MCP_Server SHALL Invalid Request(-32600) 응답을 반환한다
5. FOR ALL 유효한 JSON_RPC 요청에 대해, 직렬화 후 파싱하면 원래 요청과 동일한 객체가 생성된다 (라운드트립 속성)

### 요구사항 8: 서버 종료 처리

**사용자 스토리:** 개발자로서, MCP 서버를 안전하게 종료할 수 있기를 원한다. 이를 통해 리소스 누수 없이 서버를 관리할 수 있다.

#### 인수 조건

1. WHEN MCP_Client가 종료 요청을 전송하면, THE MCP_Server SHALL 진행 중인 요청을 완료한 후 정상적으로 종료한다
2. WHEN 프로세스 종료 시그널(SIGINT, SIGTERM)이 수신되면, THE MCP_Server SHALL 리소스를 정리하고 정상적으로 종료한다
3. IF 비정상적인 연결 종료가 감지되면, THEN THE MCP_Server SHALL 할당된 리소스를 정리한다

### 요구사항 9: 트렌드 검색 오케스트레이션

**사용자 스토리:** AWS Account Manager로서, 담당 고객사의 최신 뉴스와 AWS 모범사례 블로그를 한 번의 질문으로 통합 조회할 수 있기를 원한다. 이를 통해 고객 미팅 준비 시간을 단축할 수 있다.

#### 인수 조건

1. WHEN 사용자가 Customer 이름과 Search_Period를 포함한 트렌드 검색 질문을 전송하면, THE Trend_Search_Agent SHALL 질문을 분석하여 뉴스 검색 작업과 AWS 블로그 검색 작업으로 분리한다
2. WHEN 질문이 분리되면, THE Trend_Search_Agent SHALL News_Search_Agent, AWS_Blog_Agent, Competitor_News_Agent에게 각각 하위 작업을 전달한다
3. WHEN 모든 하위 에이전트가 결과를 반환하면, THE Trend_Search_Agent SHALL 뉴스 요약, 블로그 요약, 경쟁 솔루션 동향을 하나의 통합 응답으로 취합하여 사용자에게 반환한다
4. IF 하위 에이전트 중 하나가 오류를 반환하면, THEN THE Trend_Search_Agent SHALL 성공한 에이전트의 결과와 함께 실패한 에이전트의 오류 사유를 포함하여 응답한다
5. IF 사용자의 질문에서 Customer 이름 또는 Search_Period를 추출할 수 없으면, THEN THE Trend_Search_Agent SHALL 누락된 정보를 명시하여 사용자에게 재입력을 요청한다

### 요구사항 10: 고객 뉴스 검색 및 저장

**사용자 스토리:** AWS Account Manager로서, 담당 고객사의 특정 기간 뉴스를 자동으로 검색하여 저장할 수 있기를 원한다. 이를 통해 고객사 동향을 체계적으로 파악할 수 있다.

#### 인수 조건

1. WHEN Trend_Search_Agent가 Customer 이름과 Search_Period를 포함한 뉴스 검색 요청을 전달하면, THE News_Search_Agent SHALL 웹 브라우저를 통해 해당 Customer의 뉴스 기사를 검색한다
2. WHEN 뉴스 검색 결과가 수집되면, THE News_Search_Agent SHALL 각 기사를 일자별로 분류하여 마크업 형식으로 S3_Storage에 저장한다
3. THE News_Search_Agent SHALL 저장되는 마크업 파일에 기사 제목, 출처, 게시일, 본문 내용을 포함한다
4. IF Search_Period 내에 해당 Customer의 뉴스가 존재하지 않으면, THEN THE News_Search_Agent SHALL 검색 결과가 없음을 Trend_Search_Agent에게 반환한다
5. IF 웹 검색 중 네트워크 오류가 발생하면, THEN THE News_Search_Agent SHALL 오류 내용을 로그에 기록하고 Trend_Search_Agent에게 오류 응답을 반환한다

### 요구사항 11: 뉴스 요약 정리

**사용자 스토리:** AWS Account Manager로서, 검색된 뉴스 기사를 헤드라인과 간결한 요약으로 정리하여 볼 수 있기를 원한다. 이를 통해 핵심 내용을 빠르게 파악할 수 있다.

#### 인수 조건

1. WHEN News_Search_Agent가 S3_Storage에 뉴스 기사 저장을 완료하면, THE News_Summary_Agent SHALL S3_Storage에서 해당 기사들을 읽어온다
2. WHEN 기사를 읽어오면, THE News_Summary_Agent SHALL 각 기사에 대해 헤드라인과 50자 이내의 요약을 생성한다
3. THE News_Summary_Agent SHALL 요약 결과를 일자별로 정렬하여 Trend_Search_Agent에게 반환한다
4. IF S3_Storage에서 기사를 읽는 중 오류가 발생하면, THEN THE News_Summary_Agent SHALL 오류 내용을 로그에 기록하고 Trend_Search_Agent에게 오류 응답을 반환한다

### 요구사항 12: AWS 블로그 검색 및 요약

**사용자 스토리:** AWS Account Manager로서, AWS 한국어 블로그에서 특정 기간의 아키텍처/구현 모범사례 블로그를 검색하여 요약된 형태로 볼 수 있기를 원한다. 이를 통해 고객에게 관련 사례를 추천할 수 있다.

#### 인수 조건

1. WHEN Trend_Search_Agent가 Search_Period를 포함한 블로그 검색 요청을 전달하면, THE AWS_Blog_Agent SHALL AWS 한국어 블로그(https://aws.amazon.com/ko/blogs/korea/)에서 해당 기간의 블로그 게시물을 검색한다
2. WHEN 블로그 검색 결과가 수집되면, THE AWS_Blog_Agent SHALL 단순 기능 출시 공지를 제외하고 아키텍처 설계 또는 구현 사례가 포함된 모범사례 블로그만 필터링한다
3. WHEN 필터링이 완료되면, THE AWS_Blog_Agent SHALL 각 블로그에 대해 헤드라인과 50자 이내의 요약을 생성한다
4. THE AWS_Blog_Agent SHALL 요약 결과를 게시일 기준으로 정렬하여 Trend_Search_Agent에게 반환한다
5. IF Search_Period 내에 모범사례 블로그가 존재하지 않으면, THEN THE AWS_Blog_Agent SHALL 해당 기간에 모범사례 블로그가 없음을 Trend_Search_Agent에게 반환한다
6. IF AWS 블로그 사이트 접근 중 오류가 발생하면, THEN THE AWS_Blog_Agent SHALL 오류 내용을 로그에 기록하고 Trend_Search_Agent에게 오류 응답을 반환한다

### 요구사항 13: 트렌드 검색 Tool 등록

**사용자 스토리:** 개발자로서, 트렌드 검색 기능을 MCP Tool로 등록하여 Kiro IDE에서 호출할 수 있기를 원한다. 이를 통해 AI 모델이 트렌드 검색 기능을 활용할 수 있다.

#### 인수 조건

1. THE MCP_Server SHALL 트렌드 검색 기능을 "search_customer_trends"라는 이름의 Tool로 등록한다
2. THE MCP_Server SHALL 해당 Tool의 Input_Schema에 customer_name(문자열, 필수)과 search_period(문자열, 필수) 파라미터를 정의한다
3. WHEN MCP_Client가 "search_customer_trends" Tool을 호출하면, THE MCP_Server SHALL Trend_Search_Agent를 실행하여 결과를 반환한다
4. THE MCP_Server SHALL 트렌드 검색 결과를 뉴스 요약 섹션과 AWS 블로그 요약 섹션으로 구분된 text 콘텐츠로 반환한다

### 요구사항 14: 경쟁 솔루션 동향 검색

**사용자 스토리:** AWS Account Manager로서, 담당 고객사와 관련된 경쟁 클라우드 솔루션(Azure, GCP 등)의 최신 동향을 함께 조회할 수 있기를 원한다. 이를 통해 고객 미팅에서 경쟁사 대비 AWS의 강점을 효과적으로 어필할 수 있다.

#### 인수 조건

1. WHEN Trend_Search_Agent가 Customer 이름과 Search_Period를 포함한 경쟁 솔루션 검색 요청을 전달하면, THE Competitor_News_Agent SHALL 해당 Customer와 관련된 경쟁 클라우드 솔루션 뉴스를 검색한다
2. WHEN 경쟁 솔루션 뉴스 검색 결과가 수집되면, THE Competitor_News_Agent SHALL 각 뉴스에 대해 헤드라인과 50자 이내의 요약을 생성한다
3. THE Competitor_News_Agent SHALL 요약 결과를 경쟁사별로 분류하여 Trend_Search_Agent에게 반환한다
4. IF Search_Period 내에 해당 Customer 관련 경쟁 솔루션 뉴스가 존재하지 않으면, THEN THE Competitor_News_Agent SHALL 검색 결과가 없음을 Trend_Search_Agent에게 반환한다
5. IF 검색 중 오류가 발생하면, THEN THE Competitor_News_Agent SHALL 오류 내용을 로그에 기록하고 Trend_Search_Agent에게 오류 응답을 반환한다

### 요구사항 15: 사용자 친화적 결과 포맷팅

**사용자 스토리:** AWS Account Manager로서, 검색 결과를 기술 용어가 최소화된 비즈니스 관점의 읽기 쉬운 형태로 받아볼 수 있기를 원한다. 이를 통해 기술 배경 없이도 핵심 내용을 빠르게 파악할 수 있다.

#### 인수 조건

1. WHEN Trend_Search_Agent가 통합 결과를 생성하면, THE User_Friendly_Formatter SHALL 기술 전문 용어를 비즈니스 관점의 표현으로 변환한다
2. THE User_Friendly_Formatter SHALL 결과를 뉴스 요약, AWS 블로그 요약, 경쟁 솔루션 동향의 세 섹션으로 구분하여 표시한다
3. THE User_Friendly_Formatter SHALL 각 섹션 내 항목을 일자별로 정렬하고 헤드라인과 요약을 명확히 구분하여 표시한다
4. IF 특정 섹션에 결과가 없으면, THEN THE User_Friendly_Formatter SHALL 해당 섹션에 결과 없음 안내 메시지를 표시한다
5. WHEN 오류가 발생한 섹션이 있으면, THE User_Friendly_Formatter SHALL 기술적 오류 코드 대신 사용자가 이해할 수 있는 안내 메시지를 표시한다

### 요구사항 16: 트렌드 검색 Tool 경쟁 솔루션 옵션

**사용자 스토리:** 개발자로서, 트렌드 검색 Tool에 경쟁 솔루션 검색 포함 여부를 선택할 수 있는 옵션을 제공하고자 한다. 이를 통해 사용자가 필요에 따라 경쟁 솔루션 정보를 함께 조회할 수 있다.

#### 인수 조건

1. THE MCP_Server SHALL "search_customer_trends" Tool의 Input_Schema에 include_competitors(불리언, 선택, 기본값 true) 파라미터를 추가한다
2. WHEN include_competitors가 true로 설정된 상태에서 Tool이 호출되면, THE MCP_Server SHALL Trend_Search_Agent에게 경쟁 솔루션 검색을 포함하도록 지시한다
3. WHEN include_competitors가 false로 설정된 상태에서 Tool이 호출되면, THE MCP_Server SHALL 경쟁 솔루션 검색을 제외하고 고객 뉴스와 AWS 블로그만 검색한다
