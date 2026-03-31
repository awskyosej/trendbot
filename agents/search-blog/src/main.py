"""
AWS 블로그 검색 에이전트 - AgentCore Runtime + BrowserClient (직접 CDP)
"""

import os
import logging
from typing import Dict, Any

from strands import Agent, tool
from strands.models import BedrockModel
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from bedrock_agentcore.tools.browser_client import BrowserClient

app = BedrockAgentCoreApp()
logger = logging.getLogger("search-blog")

REGION = os.getenv("AWS_REGION", "us-east-1")
AGENT_MODEL = "us.anthropic.claude-sonnet-4-20250514-v1:0"


@tool
def search_web(query: str) -> str:
    """AgentCore 브라우저로 AWS 블로그를 검색합니다. query: 검색어"""
    logger.info("브라우저 검색: %s", query)
    client = BrowserClient(region=REGION)
    try:
        client.start()
        search_url = f"https://www.google.com/search?q={query.replace(' ', '+')}"
        client.navigate(search_url)
        page_text = client.get_text()
        return page_text or "검색 결과를 가져올 수 없습니다."
    except Exception as e:
        return f"검색 오류: {str(e)}"
    finally:
        try:
            client.stop()
        except Exception:
            pass


@app.entrypoint
async def invoke(payload: Dict[str, Any], context=None):
    period = payload.get("search_period", "최근 7일")
    prompt = payload.get("prompt") or (
        f"AWS 블로그에서 {period} 기간의 아키텍처/구현 모범사례를 검색해 주세요. "
        f"site:aws.amazon.com/blogs"
    )

    model = BedrockModel(model_id=AGENT_MODEL)
    agent = Agent(
        model=model,
        tools=[search_web],
        system_prompt=(
            "AWS 블로그 검색 전문가입니다. search_web 도구로 검색하고 "
            "모범사례 블로그만 선별하여 제목, URL, 날짜, 카테고리, 요약을 JSON으로 반환하세요. "
            "단순 출시 공지와 docs.aws.amazon.com은 제외하세요."
        ),
    )

    stream = agent.stream_async(prompt)
    async for event in stream:
        if "data" in event and isinstance(event["data"], str):
            yield event["data"]


if __name__ == "__main__":
    app.run()
