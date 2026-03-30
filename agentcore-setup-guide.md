# AgentCore Gateway 설정 가이드

이 문서는 Customer Trends MCP Server의 백엔드로 사용되는 Amazon Bedrock AgentCore Gateway를 설정하는 방법을 안내합니다.

## 사전 준비

- AWS 계정에 로그인된 상태
- Lambda MCP Server가 CDK로 배포 완료 (Lambda ARN 필요)
- IAM 권한: AgentCore Gateway 생성, Lambda 함수 관련 권한

## Step 1: AgentCore 콘솔 접속

1. [AgentCore 콘솔](https://console.aws.amazon.com/bedrock-agentcore/home#) 접속
2. 왼쪽 메뉴에서 Gateways 선택

## Step 2: Gateway 생성

1. Create gateway 클릭
2. Gateway name: `trendbot-gateway` (원하는 이름)
3. Inbound Auth configurations:
   - Quick create configurations with Cognito 선택 (가장 간단)
4. Additional configurations:
   - Enable semantic search 체크 (권장)
5. Create 클릭

생성 완료 후 Gateway URL이 표시됩니다. 예:
```
https://trendbot-gateway-xxxxx.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp
```

이 URL을 메모해두세요.

## Step 3: Lambda Target 추가

1. 생성된 Gateway 상세 페이지에서 Targets 탭 선택
2. Add target 클릭
3. Target type: Lambda 선택
4. Lambda ARN: CDK 배포 시 생성된 Lambda 함수의 ARN 입력
   - Lambda 콘솔에서 확인 가능 (함수 이름: `McpInfraStack-McpLambdaFunction-xxxxx`)
5. Target schema에 다음 JSON 입력:

```json
[
  {
    "name": "search_customer_trends",
    "description": "담당 고객사의 최신 뉴스, AWS 모범사례 블로그, 경쟁 솔루션 동향을 통합 조회합니다.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "customer_name": {
          "type": "string",
          "description": "고객사 이름"
        },
        "search_period": {
          "type": "string",
          "description": "검색 기간"
        },
        "include_competitors": {
          "type": "boolean",
          "description": "경쟁 솔루션 검색 포함 여부"
        }
      },
      "required": ["customer_name", "search_period"]
    }
  }
]
```

6. Add target 클릭

## Step 4: Lambda 환경변수에 Gateway URL 설정

CDK 스택의 `AGENTCORE_ENDPOINT` 환경변수에 Gateway URL을 설정합니다.

`infra/lib/mcp-infra-stack.ts`에서:

```typescript
environment: {
  S3_BUCKET_NAME: this.newsBucket.bucketName,
  BEDROCK_REGION: "us-east-1",
  AGENTCORE_ENDPOINT: "https://your-gateway-xxxxx.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp",
},
```

또는 Lambda 콘솔에서 직접 환경변수를 수정할 수도 있습니다:
1. Lambda 콘솔 → 함수 선택 → Configuration → Environment variables
2. `AGENTCORE_ENDPOINT` 값을 Gateway URL로 변경

## Step 5: 재배포 (CDK로 설정한 경우)

```bash
cd ~/trendbot
git pull origin main
cd infra
npx cdk deploy --all --require-approval never
```

## Step 6: 동작 확인

Kiro IDE에서 Tool을 호출하여 AgentCore Gateway 연동이 정상 동작하는지 확인합니다.

```
삼성전자 VD의 최근 7일 트렌드를 검색해 줘
```

CloudWatch Logs에서 Lambda 로그를 확인하여 AgentCore Gateway 호출이 성공하는지 확인합니다.

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| `AgentCore Gateway 연결 실패: https://agentcore.example.com` | AGENTCORE_ENDPOINT가 placeholder | Step 4에서 실제 Gateway URL로 변경 |
| `Forbidden` | Gateway IAM 권한 부족 | Gateway의 실행 역할에 Lambda InvokeFunction 권한 확인 |
| `Target not found` | Target schema 미설정 | Step 3에서 Target schema 재설정 |
| `Timeout` | Lambda 타임아웃 또는 Gateway 연결 문제 | Lambda 타임아웃(5분) 확인, Gateway 상태 확인 |
