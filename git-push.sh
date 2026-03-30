#!/bin/bash
# Customer Trends MCP Server - Git Push 스크립트
# 사용법: bash git-push.sh <remote-repo-url>
# 예시: bash git-push.sh https://github.com/username/customer-trends-mcp.git

set -e

REPO_URL=$1

if [ -z "$REPO_URL" ]; then
  echo "사용법: bash git-push.sh <remote-repo-url>"
  echo "예시: bash git-push.sh https://github.com/username/customer-trends-mcp.git"
  exit 1
fi

# Git 초기화 (이미 초기화되어 있으면 스킵)
if [ ! -d ".git" ]; then
  echo ">>> Git 초기화..."
  git init
  git branch -M main
fi

# Remote 설정
if git remote get-url origin > /dev/null 2>&1; then
  echo ">>> Remote origin 업데이트..."
  git remote set-url origin "$REPO_URL"
else
  echo ">>> Remote origin 추가..."
  git remote add origin "$REPO_URL"
fi

# 모든 파일 스테이징 및 커밋
echo ">>> 파일 스테이징..."
git add -A

echo ">>> 커밋..."
git commit -m "feat: Customer Trends MCP Server 초기 구현

- Lambda 기반 MCP 서버 (MCP SDK + Zod)
- Bedrock/AgentCore 연동 에이전트 4종 (뉴스검색, 뉴스정리, AWS블로그, 경쟁사동향)
- User Friendly Formatter (기술용어→비즈니스표현 변환, JSON 출력)
- CDK 인프라 (Lambda, S3, IAM, Function URL)
- 스펙 문서 (요구사항, 설계, 태스크)"

# Push
echo ">>> Push to origin/main..."
git push -u origin main

echo ">>> 완료! $REPO_URL 에 푸시되었습니다."
