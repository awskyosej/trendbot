"""
경쟁사 동향 검색 에이전트 - AgentCore Runtime

AgentCore 브라우저 도구로 경쟁 클라우드 솔루션
(Azure, GCP 등) 관련 뉴스를 검색합니다.
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

AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
MODEL_ID = os.getenv("BEDROCK_MODEL_ID", "anthropic.claude-3-5-sonnet-20241022-v2:0")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("search-competitors")

SYSTEM_PROMPT = """당신은 클라우드 경쟁사 동향 검색 전문가입니다.
run_browser_search 도구를 사용하여 경쟁 클라우드 솔루션 뉴스를 검색하세요.
경쟁사: Azure, GCP, Oracle Cloud, IBM Cloud
결과를 JSON 형식으로 반환하세요. 반드시 실제 URL을 포함하세요."""


@tool
async def run_browser_search(query: str, starting_page: str = "https://www.google.com/") -> str:
    """웹 브라우저로 경쟁사 뉴스를 검색합니다.

    query: 검색어 (예: "삼성전자 Azure GCP 클라우드")
    starting_page: 검색 시작 페이지 URL
    """
    logger.info("브라우저 검색 시작: query=%s", query)

    client = BrowserClient(region=AWS_REGION)
    bu_session = None
    try:
        client.start()
        ws_url, headers = client.generate_ws_headers()

        profile = BU_BrowserProfile(headers=headers, timeout=180000)
        bu_session = BU_BrowserSession(cdp_url=ws_url, browser_profile=profile)
        await bu_session.start()

        bedrock_chat = ChatBedrockConverse(model_id=MODEL_ID, region_name=AWS_REGION)

        task = (
            f"Google에서 '{query}'를 검색하세요.\n"
            f"검색 결과에서 경쟁 클라우드 솔루션 뉴스를 찾아 다음 정보를 추출하세요:\n"
            f"- 뉴스 제목\n"
            f"- 뉴스 URL (실제 링크)\n"
            f"- 출처\n"
            f"- 게시일\n"
            f"- 경쟁사명 (Azure, GCP, Oracle Cloud, IBM Cloud 등)\n"
            f"- 뉴스 요약 (100자 이내)\n"
            f"JSON 배열로 반환하세요."
        )

        browser_agent = BrowserUseAgent(task=task, llm=bedrock_chat, browser_session=bu_session)
        result = await browser_agent.run()
        return str(result)
    finally:
        if bu_session:
            with contextlib.suppress(Exception):
                await bu_session.close()
        with contextlib.suppress(Exception):
            client.stop()


@app.entrypoint
async def invoke(payload: Dict[str, Any], context=None) -> Dict[str, Any]:
    message = payload.get("prompt") or payload.get("message", "")
    customer_name = payload.get("customer_name", "")
    search_period = payload.get("search_period", "최근 7일")

    if not message and customer_name:
        message = f"{customer_name} 관련 경쟁 클라우드 솔루션(Azure, GCP 등) 최신 뉴스를 {search_period} 기간으로 검색해 주세요."

    if not message:
        return {"error": "No message or customer_name provided", "status": "error"}

    model = BedrockModel(
        model_id="anthropic.claude-3-5-haiku-20241022-v1:0",
        region=AWS_REGION,
    )

    agent = Agent(model=model, tools=[run_browser_search], system_prompt=SYSTEM_PROMPT)
    result = agent(message)
    return {"response": str(result), "status": "success"}


if __name__ == "__main__":
    app.run()
