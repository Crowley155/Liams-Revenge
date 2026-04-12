"""
Search and page-fetching tools for the DSPy ReAct agent.

search_web  — SerpAPI or Google CSE, returns titles/snippets/URLs
fetch_page  — downloads a URL and returns readable text via BeautifulSoup
"""
from __future__ import annotations

import logging

import httpx
from bs4 import BeautifulSoup

from app.config import settings

logger = logging.getLogger(__name__)

_client = httpx.Client(timeout=15.0, follow_redirects=True)


def search_web(query: str) -> list[dict]:
    """
    Search the web for a query. Returns a list of results,
    each with 'title', 'snippet', and 'url' keys.
    """
    if settings.serpapi_key:
        return _search_serpapi(query)
    elif settings.google_cse_id and settings.google_cse_api_key:
        return _search_google_cse(query)
    else:
        logger.warning("No search API configured — returning empty results")
        return [{"title": "No search API configured", "snippet": "Set SERPAPI_KEY or GOOGLE_CSE_* in .env", "url": ""}]


def _search_serpapi(query: str) -> list[dict]:
    resp = _client.get(
        "https://serpapi.com/search",
        params={
            "q": query,
            "api_key": settings.serpapi_key,
            "engine": "google",
            "num": 10,
        },
    )
    resp.raise_for_status()
    data = resp.json()

    results = []
    for item in data.get("organic_results", []):
        results.append({
            "title": item.get("title", ""),
            "snippet": item.get("snippet", ""),
            "url": item.get("link", ""),
        })
    return results


def fetch_page(url: str) -> str:
    """Fetch a web page and return its readable text content (up to ~4000 chars)."""
    try:
        resp = _client.get(url)
        resp.raise_for_status()
    except Exception as e:
        logger.warning("Failed to fetch %s: %s", url, e)
        return f"Error fetching page: {e}"

    soup = BeautifulSoup(resp.text, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form"]):
        tag.decompose()
    text = soup.get_text(separator="\n", strip=True)
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    clean = "\n".join(lines)
    return clean[:4000]


def _search_google_cse(query: str) -> list[dict]:
    resp = _client.get(
        "https://www.googleapis.com/customsearch/v1",
        params={
            "q": query,
            "key": settings.google_cse_api_key,
            "cx": settings.google_cse_id,
            "num": 10,
        },
    )
    resp.raise_for_status()
    data = resp.json()

    results = []
    for item in data.get("items", []):
        results.append({
            "title": item.get("title", ""),
            "snippet": item.get("snippet", ""),
            "url": item.get("link", ""),
        })
    return results
