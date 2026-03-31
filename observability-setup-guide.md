# AgentCore Gateway 모니터링 설정 가이드

이 문서는 AgentCore Gateway의 로그 활성화와 CloudWatch 대시보드 설정 방법을 안내합니다.

## 1. CloudWatch Transaction Search 활성화 (최초 1회)

AgentCore의 스팬/트레이스를 보려면 CloudWatch Transaction Search를 먼저 활성화해야 합니다.

1. [CloudWatch 콘솔](https://console.aws.amazon.com/cloudwatch) 접속
2. 왼쪽 메뉴 → Application Signals (APM) → Transaction search
3. Enable Transaction Search 클릭
4. "Ingest spans as structured logs" 체크박스 선택
5. Save

## 2. AgentCore Gateway 로그 활성화

AgentCore Gateway는 CloudWatch Logs, S3, Firehose로 로그를 출력할 수 있습니다.

### 콘솔에서 설정

1. [AgentCore 콘솔 - Gateways](https://console.aws.amazon.com/bedrock-agentcore/toolsAndGateways) 접속
2. Gateways 목록에서 Gateway 선택
3. 아래로 스크롤하여 Log delivery 섹션 찾기
4. Add 클릭
5. 드롭다운에서 CloudWatch Logs group 선택
6. Destination log group은 기본값 사용 (또는 커스텀 로그 그룹 지정)
7. Add 클릭

### Tracing 활성화 (스팬/트레이스)

1. 같은 Gateway 상세 페이지에서 Tracing 섹션 찾기
2. Edit 클릭
3. "Enable trace delivery to CloudWatch to track the flow of interactions through your application allowing you to visualize requests, identify performance bottlenecks, troubleshoot errors, and optimize performance." 확인
4. Enable 토글 → Save
5. 스팬이 `aws/spans` 로그 그룹에 저장됨

> Tracing을 활성화하려면 CloudWatch Transaction Search가 먼저 활성화되어 있어야 합니다 (섹션 1 참조).

### CLI로 설정

```bash
aws bedrock-agentcore update-gateway \
  --gateway-id <gateway-id> \
  --logging-config '{
    "logDestination": {
      "cloudWatchLogs": {
        "logGroupArn": "arn:aws:logs:us-east-1:<account-id>:log-group:/aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/<gateway-id>"
      }
    }
  }'
```

### 로그에 포함되는 정보

- Gateway 요청 처리 시작/완료
- 타겟 설정 오류
- 인증 헤더 누락/오류
- 잘못된 요청 파라미터
- 요청/응답 본문 (span_id, trace_id 포함)

## 3. CloudWatch에서 Gateway 메트릭 확인

AgentCore Gateway는 `Bedrock-AgentCore` 네임스페이스로 메트릭을 자동 발행합니다.

### 메트릭 확인 방법

1. [CloudWatch 콘솔](https://console.aws.amazon.com/cloudwatch) → All metrics
2. Browse → `Bedrock-AgentCore` 네임스페이스 선택
3. 차원(Dimension) 선택: Operation, Method, Protocol, Resource, Name

### 주요 메트릭

| 메트릭 | 설명 | 단위 |
|--------|------|------|
| Invocations | API 호출 총 수 | Count |
| Throttles | 스로틀된 요청 수 (429) | Count |
| SystemErrors | 5xx 오류 수 | Count |
| UserErrors | 4xx 오류 수 (429 제외) | Count |
| Latency | 첫 응답까지 시간 | Milliseconds |
| Duration | 전체 처리 시간 | Milliseconds |
| TargetExecutionTime | 타겟(Lambda 등) 실행 시간 | Milliseconds |

### 차원(Dimensions)

| 차원 | 설명 | 예시 |
|------|------|------|
| Operation | API 작업 이름 | InvokeGateway |
| Protocol | 프로토콜 | MCP |
| Method | MCP 작업 | tools/list, tools/call |
| Resource | 리소스 식별자 | Gateway ARN |
| Name | 도구 이름 | summarize-news |

## 4. CloudWatch 알람 설정

높은 오류율이나 지연 시간에 대한 알람을 설정할 수 있습니다.

```bash
# 시스템 오류 알람 (5분 내 5건 초과 시)
aws cloudwatch put-metric-alarm \
  --alarm-name "TrendBot-HighErrorRate" \
  --alarm-description "Gateway 시스템 오류율 초과" \
  --metric-name "SystemErrors" \
  --namespace "Bedrock-AgentCore" \
  --statistic "Sum" \
  --dimensions "Name=Resource,Value=<gateway-arn>" \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 5 \
  --comparison-operator "GreaterThanThreshold"

# 높은 지연 시간 알람 (평균 10초 초과 시)
aws cloudwatch put-metric-alarm \
  --alarm-name "TrendBot-HighLatency" \
  --alarm-description "Gateway 지연 시간 초과" \
  --metric-name "Latency" \
  --namespace "Bedrock-AgentCore" \
  --statistic "Average" \
  --dimensions "Name=Resource,Value=<gateway-arn>" \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 10000 \
  --comparison-operator "GreaterThanThreshold"
```

## 5. GenAI Observability 대시보드

AgentCore의 통합 대시보드를 CloudWatch에서 확인할 수 있습니다:

1. [CloudWatch GenAI Observability](https://console.aws.amazon.com/cloudwatch/home#gen-ai-observability) 페이지 접속
2. AgentCore 섹션에서 Gateway 메트릭, 트레이스, 로그를 통합 확인

## 6. CDK CloudWatch 대시보드 배포

CDK 스택에 `CustomerTrends-MCP-Dashboard`가 포함되어 있습니다. Lambda 메트릭과 AgentCore Gateway 메트릭을 한 화면에서 볼 수 있습니다.

### 배포

```bash
cd ~/trendbot
git pull origin main
cd infra
npx cdk deploy --all --require-approval never
```

### 대시보드 확인

1. [CloudWatch 콘솔](https://console.aws.amazon.com/cloudwatch) → Dashboards
2. `CustomerTrends-MCP-Dashboard` 선택

### 대시보드에 포함된 위젯

| 섹션 | 위젯 | 메트릭 |
|------|------|--------|
| Lambda | 호출 수 & 오류 | Invocations, Errors |
| Lambda | 실행 시간 | Duration (ms) |
| Lambda | 스로틀 | Throttles |
| Lambda | 요약 | Invocations, Errors, Duration 단일 값 |
| AgentCore Gateway | 호출 수 | Invocations (InvokeGateway) |
| AgentCore Gateway | 오류 | SystemErrors, UserErrors |
| AgentCore Gateway | 지연 시간 | Latency, Duration (ms) |
| 도구별 | MCP tools/call 호출 수 | Invocations (Method=tools/call) |
| 도구별 | 타겟 실행 시간 | TargetExecutionTime (ms) |

> AgentCore Gateway 메트릭은 `Bedrock-AgentCore` 네임스페이스에서 자동 발행됩니다. Gateway를 통해 도구를 호출한 후 데이터가 표시됩니다.
