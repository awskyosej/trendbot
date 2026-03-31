"""
경쟁사 동향 검색 에이전트 - AgentCore Runtime + BrowserClient
"""

import os
import logging
import contextlib
from typing import Dict, Any

from strands import Agent, tool
from strands.models import BedrockModel
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from bedrock_agentcore.tools.browser_client import BrowserClient
from browser_use import Agent as BrowserUseAgent
from browser_use.browser.session import BrowserSession as BU_BrowserSession
from browser_use.browser import BrowserProfile as BU_BrowserProfile
from langchain_aws import ChatBedrockConverse

app = BedrockAgentCoreApp()
logger = logging.getLogger("search-competitors")

REGION = os.getenv("AWS_REGION", "us-east-1")
BROWSER_MODEL = "anthropic.claude-3-5-sonnet-20241022-v2:0"
AGENT_MODEL = "us.anthropic.claude-sonnet-4-20250514-v1:0"


@tool
async def search_web(query: str) -> str:
    """웹에서 경쟁사 뉴스를 검색합니다. query: 검색어"""
    logger.info("브라우저 검색: %s", query)
    client = BrowserClient(region=REGION)
    bu_session = None
    try:
        client.start()
        ws_url, headers = client.generate_ws_headers()
        profile = BU_BrowserProfile(headers=headers, timeout=180000)
        bu_session = BU_BrowserSession(cdp_url=ws_url, browser_profile=profile)
        await bu_session.start()

        llm = ChatBedrockConverse(model_id=BROWSER_MODEL, region_name=REGION)
        task = (
            f"Google에서 '{query}'를 검색하세요. "
            f"경쟁 클라우드 솔루션 뉴스를 찾아 제목, URL, 출처, 날짜, 경쟁사명, 요약을 JSON 배열로 반환하세요."
        )
        browser_agent = BrowserUseAgent(task=task, llm=llm, browser_session=bu_session)
        result = await browser_agent.run()
        return str(result)
    finally:
        if bu_session:
            with contextlib.suppress(Exception):
                await bu_session.close()
        with contextlib.suppress(Exception):
            client.stop()


@app.entrypoint
async def invoke(payload: Dict[str, Any], context=None):
    customer = payload.get("customer_name", "")
    period = payload.get("search_period", "최근 7일")
    prompt = payload.get("prompt") or f"{customer} 관련 경쟁 클라우드(Azure, GCP) 최신 뉴스를 {period} 기간으로 검색해 주세요."

    model = BedrockModel(model_id=AGENT_MODEL)
    agent = Agent(
        model=model,
        tools=[search_web],
        system_prompt="경쟁사 동향 검색 전문가입니다. search_web 도구로 검색하고 경쟁사별로 JSON으로 반환하세요.",
    )

    stream = agent.stream_async(prompt)
    async for event in stream:
        if "data" in event and isinstance(event["data"], str):
            yield event["data"]


if __name__ == "__main__":
    app.run()
