"""Zillow knowledge base tool for FAQ answers."""

import re
from typing import Any

from langchain_core.tools import tool

FAQ_ENTRIES = [
    {
        "id": "commission",
        "triggers": [
            re.compile(r"commission", re.I),
            re.compile(r"\bfee\b", re.I),
            re.compile(r"\bcost\b", re.I),
        ],
        "answer": (
            "Zillow is a listing marketplace and does not collect a sales commission. "
            "Buyer and seller agent commissions are negotiated between the parties, "
            "while agents pay Zillow separately for optional advertising products."
        ),
    },
    {
        "id": "zestimate",
        "triggers": [re.compile(r"zestimate", re.I)],
        "answer": (
            "A Zestimate is Zillow's automated valuation estimate. It is computed from "
            "public records and user-submitted data and is not an appraisal. Actual sale "
            "prices can differ based on inspections, contingencies, and negotiations."
        ),
    },
    {
        "id": "premier-agent",
        "triggers": [re.compile(r"premier\s*agent", re.I), re.compile(r"agent\s*program", re.I)],
        "answer": (
            "Zillow Premier Agent is an advertising program that lets real estate pros "
            "buy placement alongside listings in their chosen markets. It does not grant "
            "exclusivity, and leads are routed through Zillow systems before connecting "
            "with the agent."
        ),
    },
]


@tool("zillowKnowledgeTool")
def zillow_knowledge_base(question: str) -> dict[str, Any]:
    """
    Answer FAQs about Zillow policies and programs.

    Args:
        question: Natural language question about Zillow's services or programs.

    Returns:
        Answer with confidence score, or null answer if no match.
    """
    print(f"zillow-knowledge-base called with question={question}")

    lower = question.lower()

    for entry in FAQ_ENTRIES:
        if any(trigger.search(lower) for trigger in entry["triggers"]):
            return {
                "id": entry["id"],
                "answer": entry["answer"],
                "confidence": 0.9,
            }

    return {
        "id": None,
        "answer": None,
        "confidence": 0,
    }
