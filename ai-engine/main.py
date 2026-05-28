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
