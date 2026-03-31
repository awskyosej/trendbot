#!/bin/bash
# 3개 검색 에이전트를 AgentCore Runtime에 배포
# agentcore create 템플릿을 사용하여 배포합니다.
#
# 사용법: cd ~/trendbot && bash agents/deploy-all.sh

set -e

TRENDBOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REGION="us-east-1"

declare -a AGENTS=(
  "searchnews:search-news"
  "searchblog:search-blog"
  "searchcompetitors:search-competitors"
)

for entry in "${AGENTS[@]}"; do
  AGENT_NAME="${entry%%:*}"
  SOURCE_DIR="${entry##*:}"
  DEPLOY_DIR="/tmp/${AGENT_NAME}"

  echo ""
  echo "=========================================="
  echo "🚀 배포: ${AGENT_NAME}_Agent (us-east-1)"
  echo "=========================================="

  # 기존 디렉토리 제거
  rm -rf "$DEPLOY_DIR"

  # agentcore create로 새 프로젝트 생성 (비대화형)
  cd /tmp
  echo -e "strands\n${AGENT_NAME}\n" | agentcore create 2>/dev/null || true

  # main.py 교체
  cp "$TRENDBOT_DIR/agents/$SOURCE_DIR/src/main.py" "$DEPLOY_DIR/src/main.py"

  # 리전을 us-east-1로 변경
  cd "$DEPLOY_DIR"
  sed -i "s/region: .*/region: ${REGION}/" .bedrock_agentcore.yaml

  # 배포
  agentcore deploy --auto-update-on-conflict

  echo "✅ ${AGENT_NAME}_Agent 배포 완료"
  echo ""
done

echo "=========================================="
echo "✅ 모든 에이전트 배포 완료!"
echo "AgentCore 콘솔에서 Runtime endpoint URL을 확인하고"
echo "Gateway에 MCP Server 타겟으로 등록하세요."
echo "=========================================="
