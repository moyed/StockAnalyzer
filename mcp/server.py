"""
StockAnalyzer PSX MCP Server

Exposes Pakistan Stock Exchange company data, AI scores, projections,
news, and sector analytics as MCP tools for customer query answering.
"""

import os
import httpx
from typing import Optional
from mcp.server.fastmcp import FastMCP
from dotenv import load_dotenv

load_dotenv()

API_BASE = os.getenv("API_BASE_URL", "http://localhost:8000/api")
API_TOKEN = os.getenv("API_TOKEN", "")

mcp = FastMCP(
    "StockAnalyzer PSX",
    instructions=(
        "Pakistan Stock Exchange (PSX) company analysis platform. "
        "Search companies, get AI-powered financial scores, forward-looking projections, "
        "news sentiment, and sector-level analytics."
    ),
)


def _headers() -> dict:
    return {"Authorization": f"Bearer {API_TOKEN}", "Accept": "application/json"}


async def _get(path: str, params: dict | None = None) -> dict | list:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(
            f"{API_BASE}{path}",
            headers=_headers(),
            params=params or {},
        )
        r.raise_for_status()
        return r.json()


# ─── Tools ────────────────────────────────────────────────────────────────────


@mcp.tool()
async def search_companies(
    query: str = "",
    sector: str = "",
    sharia_only: bool = False,
    exclude_defaulters: bool = False,
    sort_by: str = "score",
    limit: int = 20,
) -> dict:
    """
    Search PSX-listed companies by name or stock symbol.

    Returns a paginated list of companies with their latest AI analysis score (0–100),
    sector, price, and defaulter/sharia status.

    Args:
        query: Company name or ticker symbol to search (e.g. "ENGRO" or "Engro").
        sector: Filter by sector name (e.g. "Cement", "Textile", "Banks").
        sharia_only: If True, return only Sharia-compliant companies.
        exclude_defaulters: If True, exclude companies on the defaulter list.
        sort_by: Sort order — "score" (default), "name", "filing_date", or "sector".
        limit: Max results to return (1–100).
    """
    params: dict = {"per_page": min(max(limit, 1), 100), "sort": sort_by}
    if query:
        params["search"] = query
    if sector:
        params["sector"] = sector
    if sharia_only:
        params["sharia"] = "1"
    if exclude_defaulters:
        params["defaulter"] = "0"
    return await _get("/companies", params)


@mcp.tool()
async def get_company(symbol: str) -> dict:
    """
    Get full details for a PSX company by its stock symbol.

    Returns company info, the last 8 quarterly filings (each with its AI analysis
    score, flags, and signals), current market price, and defaulter/sharia status.

    Args:
        symbol: PSX ticker symbol (e.g. "ENGRO", "LUCK", "OGDC"). Case-insensitive.
    """
    return await _get(f"/companies/{symbol.upper()}")


@mcp.tool()
async def get_company_filings(symbol: str, limit: int = 8) -> dict:
    """
    Get quarterly filing history for a company, including AI analysis for each filing.

    Each filing includes: quarter, filing date, AI score (0–100), flags
    (e.g. HIGH_PROFIT_GROWTH, EXPORT_EXPANSION), signals (revenue/profit growth %,
    margin direction, management tone), and a plain-English summary.

    Args:
        symbol: PSX ticker symbol (e.g. "ENGRO").
        limit: Number of recent filings to return (max 8).
    """
    return await _get(f"/companies/{symbol.upper()}/filings")


@mcp.tool()
async def get_company_projection(symbol: str) -> dict:
    """
    Get the AI-generated forward-looking projection for a company.

    Includes next-quarter outlook, projected revenue/profit growth ranges,
    key catalysts and risks, analyst recommendation (Strong Buy → Strong Sell),
    confidence level, and estimated price upside/downside %.

    Args:
        symbol: PSX ticker symbol (e.g. "ENGRO").
    """
    return await _get(f"/companies/{symbol.upper()}/projection")


@mcp.tool()
async def get_company_news(symbol: str) -> dict:
    """
    Get the latest news articles for a company with AI sentiment analysis.

    Each article includes headline, source, publication date, sentiment
    (positive/neutral/negative), impact rating, and an AI-generated summary.

    Args:
        symbol: PSX ticker symbol (e.g. "ENGRO").
    """
    return await _get(f"/companies/{symbol.upper()}/news")


@mcp.tool()
async def get_company_price_history(
    symbol: str,
    from_date: str = "",
    to_date: str = "",
) -> dict:
    """
    Get historical OHLCV (open/high/low/close/volume) price data for a company.

    Args:
        symbol: PSX ticker symbol (e.g. "ENGRO").
        from_date: Start date in YYYY-MM-DD format (defaults to 1 year ago).
        to_date: End date in YYYY-MM-DD format (defaults to today).
    """
    params: dict = {}
    if from_date:
        params["from"] = from_date
    if to_date:
        params["to"] = to_date
    return await _get(f"/companies/{symbol.upper()}/price-history", params)


@mcp.tool()
async def get_sector_stats() -> list:
    """
    Get analytics for every sector on the PSX.

    Returns each sector with: total companies, number scored, average score,
    top score, top company, defaulter count, and Sharia-compliant count.
    Sorted by average score descending.
    """
    return await _get("/sectors-stats")


@mcp.tool()
async def list_sectors() -> list:
    """
    List all distinct sectors represented on the PSX.

    Use sector names returned here as the `sector` filter in search_companies.
    """
    return await _get("/companies-sectors")


@mcp.tool()
async def get_top_companies(
    sector: str = "",
    sharia_only: bool = False,
    exclude_defaulters: bool = True,
    limit: int = 10,
) -> dict:
    """
    Get the highest-scored companies on the PSX, ranked by latest AI analysis score.

    Useful for answering "what are the best stocks to buy?" or "top performers in cement sector?"

    Args:
        sector: Filter to a specific sector (e.g. "Cement", "Fertilizer").
        sharia_only: Only include Sharia-compliant companies.
        exclude_defaulters: Exclude defaulter companies (default True).
        limit: Number of companies to return (max 50).
    """
    params: dict = {
        "per_page": min(max(limit, 1), 50),
        "sort": "score",
    }
    if sector:
        params["sector"] = sector
    if sharia_only:
        params["sharia"] = "1"
    if exclude_defaulters:
        params["defaulter"] = "0"
    return await _get("/companies", params)


@mcp.tool()
async def get_market_briefing() -> dict:
    """
    Get the latest AI-generated daily market briefing for the PSX.

    Includes market-wide highlights, top movers, sector trends, and
    key events — updated daily by the platform's briefing engine.
    """
    return await _get("/market/briefing")


@mcp.tool()
async def compare_companies(symbols: list[str]) -> list[dict]:
    """
    Compare multiple PSX companies side by side.

    Fetches full details for each symbol and returns them as a list,
    making it easy to compare scores, sectors, prices, and projections.

    Args:
        symbols: List of PSX ticker symbols to compare (e.g. ["ENGRO", "EFERT", "FFC"]).
    """
    results = []
    for sym in symbols[:5]:  # cap at 5 to avoid timeouts
        try:
            data = await _get(f"/companies/{sym.strip().upper()}")
            results.append(data)
        except httpx.HTTPStatusError as e:
            results.append({"symbol": sym, "error": f"Not found ({e.response.status_code})"})
    return results


# ─── Resources ────────────────────────────────────────────────────────────────


@mcp.resource("psx://sectors")
async def sectors_resource() -> str:
    """List of all PSX sectors available in this platform."""
    sectors = await _get("/companies-sectors")
    if isinstance(sectors, list):
        return "PSX Sectors:\n" + "\n".join(f"- {s}" for s in sectors)
    return str(sectors)


@mcp.resource("psx://company/{symbol}")
async def company_resource(symbol: str) -> str:
    """Quick summary of a PSX company."""
    data = await _get(f"/companies/{symbol.upper()}")
    company = data.get("company", data)
    name = company.get("name", symbol)
    sector = company.get("sector", "N/A")
    price = company.get("last_price", "N/A")
    sharia = "Yes" if company.get("is_sharia_compliant") else "No"
    defaulter = "Yes" if company.get("is_defaulter") else "No"

    # Latest score from most recent filing
    filings = company.get("filings", [])
    score_str = "N/A"
    if filings and filings[0].get("score"):
        score_str = str(filings[0]["score"].get("score", "N/A"))

    return (
        f"Company: {name} ({symbol.upper()})\n"
        f"Sector: {sector}\n"
        f"Last Price: PKR {price}\n"
        f"Latest AI Score: {score_str}/100\n"
        f"Sharia Compliant: {sharia}\n"
        f"Defaulter: {defaulter}"
    )


# ─── Prompts ──────────────────────────────────────────────────────────────────


@mcp.prompt()
def analyze_stock(symbol: str) -> str:
    """Generate a comprehensive stock analysis prompt for a PSX company."""
    return (
        f"Please provide a comprehensive analysis of {symbol.upper()} listed on the Pakistan Stock Exchange (PSX).\n\n"
        "Use the available tools to:\n"
        f"1. Get full company details and latest AI score via get_company('{symbol}')\n"
        f"2. Review recent filings and signals via get_company_filings('{symbol}')\n"
        f"3. Get the forward-looking projection via get_company_projection('{symbol}')\n"
        f"4. Check latest news sentiment via get_company_news('{symbol}')\n\n"
        "Then provide:\n"
        "- A summary of the company's financial health and recent performance\n"
        "- Key strengths and risks based on the filing signals\n"
        "- The AI analyst recommendation and projection outlook\n"
        "- Any notable news or events affecting the stock\n"
        "- A final investment perspective (suitable for retail investors in Pakistan)"
    )


@mcp.prompt()
def sector_comparison(sector: str) -> str:
    """Generate a sector comparison prompt."""
    return (
        f"Please provide a sector analysis for '{sector}' companies on the PSX.\n\n"
        "Use the available tools to:\n"
        f"1. Get sector statistics via get_sector_stats()\n"
        f"2. Get top companies in the sector via get_top_companies(sector='{sector}', limit=10)\n"
        "3. For the top 3 companies by score, get their projections\n\n"
        "Then provide:\n"
        f"- An overview of the {sector} sector's performance on PSX\n"
        "- Rankings of the top companies with their scores and key signals\n"
        "- Which companies are recommended and why\n"
        "- Sector-level risks and opportunities"
    )


if __name__ == "__main__":
    mcp.run()
