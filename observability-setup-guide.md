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

1. [AgentCore 콘솔](https://console.aws.amazon.com/bedrock-agentcore/home#) 접속
2. 왼쪽 메뉴 → Gateways → Gateway 선택
3. Observability 탭 또는 Settings에서 로그 대상 설정
4. CloudWatch Logs 선택 시 로그 그룹이 자동 생성됨:
   `/aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/{gateway_id}`

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
