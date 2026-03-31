# Runtime 검색 에이전트 배포 가이드

AgentCore Runtime에 3개의 검색 에이전트를 배포하고, Gateway에 도구로 등록합니다.

## 에이전트 목록

| 에이전트 | 디렉토리 | 역할 |
|---------|---------|------|
| search-news-agent | `agents/search-news/` | 고객사 뉴스 검색 (브라우저 도구) |
| search-blog-agent | `agents/search-blog/` | AWS 블로그 모범사례 검색 (브라우저 도구) |
| search-competitors-agent | `agents/search-competitors/` | 경쟁사 동향 검색 (브라우저 도구) |

## 사전 준비

```bash
pip install bedrock-agentcore-starter-toolkit
```

## 배포 (각 에이전트별)

### 1. search-news-agent

```bash
cd agents/search-news
agentcore deploy
```

### 2. search-blog-agent

```bash
cd agents/search-blog
agentcore deploy
```

### 3. search-competitors-agent

```bash
cd agents/search-competitors
agentcore deploy
```

## 배포 후 Gateway에 등록

각 에이전트 배포 후 Runtime endpoint URL이 출력됩니다.
이 URL을 AgentCore Gateway에 MCP Server 타겟으로 추가하세요:

1. AgentCore 콘솔 → Gateways → Gateway 선택 → Targets
2. Add target → MCP server
3. 각 에이전트의 Runtime endpoint URL 입력

## 로컬 테스트

```bash
cd agents/search-news
agentcore dev
# 다른 터미널에서:
agentcore invoke --dev '{"customer_name": "삼성전자 VD", "search_period": "최근 7일"}'
```
