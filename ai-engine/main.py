from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import httpx
import pdfplumber
import tempfile
import os
import json
import re
from gradient import Gradient

app = FastAPI(title="StockAnalyzer AI Engine")

gradient = Gradient(access_token=os.getenv("GRADIENT_ACCESS_TOKEN", ""))
MODEL_ID = os.getenv("GRADIENT_MODEL_ID", "llama3-8b-chat")  # override via env


class AnalyzeRequest(BaseModel):
    filing_id: int
    pdf_url: str
    company: str
    symbol: str
    quarter: str


EXTRACTION_PROMPT = """You are a financial analyst specializing in Pakistan Stock Exchange (PSX) companies.

Analyze the following Director's Report / Financial Statement text and extract key signals.
Return ONLY valid JSON with no extra text.

Text to analyze:
{text}

Return this exact JSON structure:
{{
  "company": "{company}",
  "quarter": "{quarter}",
  "signals": {{
    "revenue_growth_pct": <number or null>,
    "profit_growth_pct": <number or null>,
    "gross_margin_direction": "<up|down|stable|null>",
    "gross_margin_reason": "<string or null>",
    "exports_milestone": "<string describing export news, or null>",
    "new_projects": "<string describing new projects/capacity, or null>",
    "exchange_gain_loss_pkr_million": <number (positive=gain, negative=loss) or null>,
    "defaulter_status_change": "<string or null>",
    "management_tone": "<positive|cautious|negative>"
  }},
  "score": <integer 0-100>,
  "flags": [<list of strings from: HIGH_PROFIT_GROWTH, HIGH_REVENUE_GROWTH, EXPORT_EXPANSION, NEW_PROJECT, MARGIN_IMPROVEMENT, DEFAULTER_RISK, EXCHANGE_HEADWIND, EXCHANGE_TAILWIND>],
  "summary": "<2-3 sentence plain English summary of key highlights>"
}}

Scoring rules (add points):
- Profit growth > 50%: +30
- Revenue growth > 40%: +20
- Export expansion milestone: +20
- New project / capacity addition: +15
- Margin improvement: +10
- Defaulter risk: -25
- Exchange loss mentioned: -5
Maximum score: 100, minimum: 0"""


async def download_pdf(url: str) -> str:
    """Download PDF to a temp file, return path."""
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        r = await client.get(url)
        r.raise_for_status()

    suffix = ".pdf"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
        f.write(r.content)
        return f.name


def extract_text(pdf_path: str, max_chars: int = 8000) -> str:
    """Extract text from PDF, focusing on director report sections."""
    text_parts = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages[:20]:  # first 20 pages covers director report
            t = page.extract_text()
            if t:
                text_parts.append(t)

    full_text = "\n".join(text_parts)

    # Try to isolate the director's report section
    patterns = [
        r"directors['\s]? report",
        r"chairman['\s]?s? (review|report|message)",
        r"management (discussion|review)",
    ]
    for pattern in patterns:
        match = re.search(pattern, full_text, re.IGNORECASE)
        if match:
            start = match.start()
            return full_text[start : start + max_chars]

    return full_text[:max_chars]


def call_ai(prompt: str) -> str:
    """Call DigitalOcean Gradient LLM."""
    model = gradient.get_base_model(base_model_slug=MODEL_ID)
    response = model.complete(query=prompt, max_generated_token_count=1024)
    return response.generated_output


def parse_ai_response(raw: str) -> dict:
    """Extract JSON from AI response."""
    # Find JSON block
    match = re.search(r"\{[\s\S]+\}", raw)
    if not match:
        raise ValueError("No JSON found in AI response")
    return json.loads(match.group())


@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    pdf_path = None
    try:
        pdf_path = await download_pdf(req.pdf_url)
        text = extract_text(pdf_path)

        prompt = EXTRACTION_PROMPT.format(
            text=text,
            company=req.company,
            quarter=req.quarter,
        )

        raw = call_ai(prompt)
        result = parse_ai_response(raw)

        # Clamp score
        result["score"] = max(0, min(100, int(result.get("score", 0))))
        return result

    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"PDF download failed: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if pdf_path and os.path.exists(pdf_path):
            os.unlink(pdf_path)


@app.get("/health")
def health():
    return {"status": "ok"}


# New endpoints for news and volume analysis

class NewsAnalysisRequest(BaseModel):
    headline: str
    body: str
    source: str = "unknown"


class VolumeSpikeRequest(BaseModel):
    symbol: str
    current_volume: int
    avg_30d_volume: int
    current_price: float
    prev_close: float


class MarketBriefingRequest(BaseModel):
    top_gainers: list  # [{symbol, change_pct, price}]
    top_losers: list
    sector_performance: dict  # {sector: change_pct}
    news_headlines: list  # [headline strings]


@app.post("/analyze-news")
async def analyze_news(req: NewsAnalysisRequest):
    """Analyze news article sentiment and extract mentioned companies."""
    prompt = f"""You are a financial news analyst for Pakistan Stock Exchange (PSX).

Analyze this news article and return ONLY valid JSON:

Headline: {req.headline}
Source: {req.source}
Body: {req.body[:2000]}

Return this exact JSON structure:
{{
  "sentiment": "<positive|neutral|negative>",
  "impact": "<high|medium|low>",
  "mentioned_symbols": ["<list of PSX stock symbols mentioned>"],
  "category": "<earnings|announcement|macro|sector|other>",
  "summary": "<one sentence summary of what this means for investors>"
}}

Rules:
- sentiment: positive if bullish news, negative if bearish, neutral otherwise
- impact: high if major news (results, regulatory), medium if sector news, low if general
- mentioned_symbols: extract only valid PSX symbols (e.g. MARI, OGDC, PSO)
- category: classify the news type
"""

    try:
        raw = call_ai(prompt)
        result = parse_ai_response(raw)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/detect-volume-spike")
async def detect_volume_spike(req: VolumeSpikeRequest):
    """Detect unusual volume activity and explain possible reasons."""
    ratio = req.current_volume / req.avg_30d_volume if req.avg_30d_volume > 0 else 0
    price_change_pct = ((req.current_price - req.prev_close) / req.prev_close * 100) if req.prev_close > 0 else 0

    spike_detected = ratio > 2.0  # 2x average volume

    # Use AI to explain the spike
    if spike_detected:
        prompt = f"""You are a stock analyst. Explain this unusual activity:

Symbol: {req.symbol}
Volume: {req.current_volume:,} (normally {req.avg_30d_volume:,})
Volume ratio: {ratio:.1f}x normal
Price change: {price_change_pct:+.2f}%

Provide a brief explanation (1-2 sentences) of what this volume spike might indicate.
Consider: result announcements, news, sector momentum, or technical breakout.

Return only the explanation text, no JSON.
"""

        try:
            explanation = call_ai(prompt).strip()
        except:
            explanation = f"Volume is {ratio:.1f}x above normal with {price_change_pct:+.1f}% price change."
    else:
        explanation = "No unusual volume activity detected."

    return {
        "spike_detected": spike_detected,
        "volume_ratio": round(ratio, 2),
        "price_change_pct": round(price_change_pct, 2),
        "severity": "high" if ratio > 5 else "medium" if ratio > 2 else "low",
        "explanation": explanation
    }


@app.post("/generate-market-briefing")
async def generate_market_briefing(req: MarketBriefingRequest):
    """Generate AI-powered daily market summary."""

    gainers_text = "\n".join([f"- {g.get('symbol')}: +{g.get('change_pct')}%" for g in req.top_gainers[:5]])
    losers_text = "\n".join([f"- {l.get('symbol')}: {l.get('change_pct')}%" for l in req.top_losers[:5]])
    sectors_text = "\n".join([f"- {sector}: {change:+.1f}%" for sector, change in req.sector_performance.items()])
    news_text = "\n".join([f"- {h}" for h in req.news_headlines[:3]])

    prompt = f"""You are a PSX market analyst. Write a concise daily market briefing (3-4 sentences).

Today's Market Data:

TOP GAINERS:
{gainers_text}

TOP LOSERS:
{losers_text}

SECTOR PERFORMANCE:
{sectors_text}

MAJOR NEWS:
{news_text}

Write a professional briefing that explains:
1. Overall market sentiment
2. Which sectors led/lagged and why
3. Key drivers (news, macro, results)

Keep it under 100 words. Write in past tense. Be specific, not generic.
"""

    try:
        briefing = call_ai(prompt).strip()
        return {
            "date": "today",
            "briefing": briefing,
            "top_themes": extract_themes(req)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def extract_themes(req: MarketBriefingRequest) -> list:
    """Extract key themes from market data."""
    themes = []

    # Check sector movements
    for sector, change in req.sector_performance.items():
        if abs(change) > 2:
            themes.append(f"{sector} {'rallied' if change > 0 else 'declined'}")

    # Check if market is broad or concentrated
    if len(req.top_gainers) > 10:
        themes.append("broad-based rally")
    elif len(req.top_losers) > 10:
        themes.append("broad-based selloff")

    return themes[:3]


@app.post("/explain-movement")
async def explain_movement(symbol: str, price_change_pct: float, volume_ratio: float,
                          recent_news: str = "", sector_change_pct: float = 0):
    """Explain why a specific stock moved today."""

    prompt = f"""You are a PSX analyst. Explain why {symbol} moved today.

Data:
- Price change: {price_change_pct:+.1f}%
- Volume: {volume_ratio:.1f}x normal
- Sector performance: {sector_change_pct:+.1f}%
- Recent news: {recent_news if recent_news else "No major news"}

Write a 2-3 sentence explanation of the likely reasons for this movement.
Consider: company-specific news, sector trends, volume confirmation, or technical factors.

Return only the explanation text.
"""

    try:
        explanation = call_ai(prompt).strip()

        # Determine primary driver
        if abs(price_change_pct) > 5 and volume_ratio > 3:
            driver = "news or announcement"
        elif abs(price_change_pct - sector_change_pct) < 1:
            driver = "sector momentum"
        elif volume_ratio < 1.5:
            driver = "technical or passive movement"
        else:
            driver = "mixed factors"

        return {
            "symbol": symbol,
            "explanation": explanation,
            "primary_driver": driver,
            "confidence": "high" if volume_ratio > 2 else "medium"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
