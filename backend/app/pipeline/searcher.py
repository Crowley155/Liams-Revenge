"""
PersonSearcher — DSPy ReAct agent that researches a public figure.

Given a name, role, and organization, this agent uses search tools to find
publicly available information: news articles, school board minutes, election
records, policy documents, public statements.

The agent has two tools:
  - search_web: Google search via SerpAPI/CSE
  - fetch_page: download and read a web page's full text

It decides what to search for, which results look promising, fetches those
pages for deeper reading, and returns a list of rich findings.
"""
from __future__ import annotations

import dspy
from app.pipeline.tools.web_search import search_web, fetch_page


class PersonSearcher(dspy.Module):
    """ReAct agent that searches for and reads information about a public figure."""

    def __init__(self):
        self.agent = dspy.ReAct(
            "person_name, role, organization, state, context -> findings: list[dict]",
            tools=[search_web, fetch_page],
            max_iters=12,
        )

    def forward(self, person_name: str, role: str, organization: str,
                state: str = "KS", context: str = "") -> dspy.Prediction:
        return self.agent(
            person_name=person_name,
            role=role,
            organization=organization,
            state=state,
            context=context,
        )
