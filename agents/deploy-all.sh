#!/bin/bash
# 3개 검색 에이전트를 AgentCore Runtime에 배포하는 스크립트
# /tmp/hyperAmber 프로젝트를 템플릿으로 사용합니다.
#
# 사전 조건: /tmp/hyperAmber가 agentcore create로 생성되어 있어야 함
# 사용법: bash agents/deploy-all.sh

set -e

TEMPLATE_DIR="/tmp/hyperAmber"
AGENTS_DIR="$(dirname "$0")"

if [ ! -d "$TEMPLATE_DIR" ]; then
  echo "❌ $TEMPLATE_DIR 가 없습니다. 먼저 agentcore create를 실행하세요."
  exit 1
fi

# 에이전트 목록: (이름, 소스 디렉토리)
declare -a AGENTS=(
  "search_news_agent:$AGENTS_DIR/search-news"
  "search_blog_agent:$AGENTS_DIR/search-blog"
  "search_competitors_agent:$AGENTS_DIR/search-competitors"
)

for entry in "${AGENTS[@]}"; do
  AGENT_NAME="${entry%%:*}"
  SOURCE_DIR="${entry##*:}"

  echo ""
  echo "=========================================="
  echo "🚀 배포: $AGENT_NAME"
  echo "=========================================="

  # 템플릿 복사
  DEPLOY_DIR="/tmp/deploy-$AGENT_NAME"
  rm -rf "$DEPLOY_DIR"
  cp -r "$TEMPLATE_DIR" "$DEPLOY_DIR"

  # main.py 교체
  cp "$SOURCE_DIR/src/main.py" "$DEPLOY_DIR/src/main.py"

  # yaml에서 에이전트 이름 변경
  sed -i "s/hyperAmber_Agent/$AGENT_NAME/g" "$DEPLOY_DIR/.bedrock_agentcore.yaml"
  sed -i "s/default_agent: hyperAmber_Agent/default_agent: $AGENT_NAME/" "$DEPLOY_DIR/.bedrock_agentcore.yaml"

  # 캐시 제거
  rm -rf "$DEPLOY_DIR/.venv" "$DEPLOY_DIR/uv.lock"

  # 배포
  cd "$DEPLOY_DIR"
  agentcore deploy --auto-update-on-conflict

  echo "✅ $AGENT_NAME 배포 완료"
done

echo ""
echo "=========================================="
echo "✅ 모든 에이전트 배포 완료!"
echo "AgentCore 콘솔에서 Runtime endpoint URL을 확인하고"
echo "Gateway에 MCP Server 타겟으로 등록하세요."
echo "=========================================="
