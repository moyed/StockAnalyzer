from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import httpx
import pdfplumber
import tempfile
import os
import json
import re
import time
import asyncio
from gradient import Gradient
from ddgs import DDGS
from concurrent.futures import ThreadPoolExecutor

try:
    from pdf2image import convert_from_path
    import pytesseract
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False

# Semaphore limits concurrent OCR jobs so they can't saturate the thread pool
import threading
_ocr_semaphore = threading.Semaphore(3)

from dotenv import load_dotenv
load_dotenv()  # Load .env file first!

# Increase thread pool for concurrent blocking operations (AI calls, PDF processing)
executor = ThreadPoolExecutor(max_workers=10)

# Import agentic projection agent (Gradient-based)
try:
    from agentic_projection_gradient import ProjectionAgentGradient
    AGENTIC_AVAILABLE = True
except ImportError as e:
    AGENTIC_AVAILABLE = False
    print(f"Warning: Agentic projection not available: {e}")

app = FastAPI(title="StockAnalyzer AI Engine")

# DigitalOcean Gradient SDK configuration
GRADIENT_TOKEN = os.getenv("GRADIENT_ACCESS_TOKEN", "")
MODEL_ID = os.getenv("GRADIENT_MODEL_ID", "kimi-k2.6")

# Initialize Gradient client
gradient = Gradient(model_access_key=GRADIENT_TOKEN, timeout=120.0) if GRADIENT_TOKEN else None


class AnalyzeRequest(BaseModel):
    filing_id: int
    pdf_url: str
    company: str
    symbol: str
    quarter: str


# Static system prompt + small dynamic user message. Gradient's automatic prefix
# caching (open-source models) only matches identical leading tokens, so ALL
# per-filing content must live in the user message, never in the system prompt.
EXTRACTION_SYSTEM_PROMPT = """You are a financial analyst specializing in Pakistan Stock Exchange (PSX) companies.

You will be given a company name, a filing quarter, and the text of that company's
Director's Report / Financial Statement. Analyze the text and extract key signals.
Return ONLY valid JSON with no extra text.

Return this exact JSON structure:
{
  "company": "<the company name exactly as supplied>",
  "quarter": "<the quarter exactly as supplied>",
  "financials": {
    "eps": <number (earnings per share in PKR) or null>,
    "revenue": <number (total revenue/sales in PKR) or null>,
    "net_profit": <number (net profit after tax in PKR) or null>,
    "shares_outstanding": <number (total number of shares) or null>
  },
  "signals": {
    "revenue_growth_pct": <number or null>,
    "profit_growth_pct": <number or null>,
    "gross_margin_direction": "<up|down|stable|null>",
    "gross_margin_reason": "<string or null>",
    "exports_milestone": "<string describing export news, or null>",
    "new_projects": "<string describing new projects/capacity, or null>",
    "exchange_gain_loss_pkr_million": <number (positive=gain, negative=loss) or null>,
    "defaulter_status_change": "<string or null>",
    "management_tone": "<positive|cautious|negative>"
  },
  "score": <integer 0-100>,
  "flags": [<list of strings from: HIGH_PROFIT_GROWTH, HIGH_REVENUE_GROWTH, EXPORT_EXPANSION, NEW_PROJECT, MARGIN_IMPROVEMENT, DEFAULTER_RISK, EXCHANGE_HEADWIND, EXCHANGE_TAILWIND>],
  "summary": "<2-3 sentence plain English summary of key highlights>"
}

Scoring rules:
Start at 50 for any company with positive earnings. Adjust up or down:
Upward:
- Profit growth > 50%: +30
- Profit growth 20–50%: +20
- Profit growth 5–20%: +10
- Revenue growth > 40%: +15
- Revenue growth 10–40%: +10
- Revenue growth 0–10%: +5
- Export expansion milestone: +10
- New project / capacity addition: +10
- Margin improving: +10
Downward:
- Net loss reported: -30
- Margin significantly declining: -10
- Defaulter risk: -30
- Large exchange loss (> 5% of profit): -5
Maximum score: 100, minimum: 0"""

EXTRACTION_USER_TEMPLATE = """Company: {company}
Quarter: {quarter}

Text to analyze:
{text}"""


async def download_pdf(url: str) -> str:
    """Download PDF to a temp file, return path."""
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        r = await client.get(url)
        r.raise_for_status()
        content = r.content  # Access content while client is still open

    suffix = ".pdf"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
        f.write(content)
        return f.name


def _ocr_pdf_sync(pdf_path: str, max_chars: int = 14000) -> str:
    """OCR fallback for image-based PDFs using pdf2image + tesseract."""
    if not OCR_AVAILABLE:
        return ""
    with _ocr_semaphore:  # max 3 concurrent OCR jobs to avoid saturating thread pool
        try:
            with pdfplumber.open(pdf_path) as pdf:
                total_pages = len(pdf.pages)
            # Limit OCR to first 30 pages — beyond that is mostly boilerplate tables
            ocr_limit = min(30, total_pages)
            images = convert_from_path(pdf_path, first_page=1, last_page=ocr_limit, dpi=300)
            texts = []
            for img in images:
                t = pytesseract.image_to_string(img, lang="eng", config="--psm 6")
                if t.strip():
                    texts.append(t)
            return "\n".join(texts)[:max_chars]
        except Exception as e:
            print(f"[OCR] Failed: {e}")
            return ""


def _extract_text_sync(pdf_path: str, max_chars: int = 14000) -> str:
    """Synchronous PDF text extraction (runs in thread pool)."""
    with pdfplumber.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)
        # Large annual reports need deeper scanning
        if total_pages > 100:
            scan_limit = min(130, total_pages)
        elif total_pages > 40:
            scan_limit = min(90, total_pages)
        else:
            scan_limit = min(35, total_pages)

        page_texts = [page.extract_text() or "" for page in pdf.pages[:scan_limit]]

    full_text = "\n".join(page_texts)

    # OCR fallback: if pdfplumber got almost nothing, or the text is garbled
    def _is_garbled(text: str) -> bool:
        if not text.strip():
            return True
        # Count printable ASCII letters/digits/spaces
        printable = sum(1 for c in text if c.isalpha() or c.isdigit() or c.isspace())
        ratio = printable / len(text) if text else 0
        return ratio < 0.6  # less than 60% readable chars = garbled

    if OCR_AVAILABLE and (len(full_text.strip()) < 200 or _is_garbled(full_text)):
        print(f"[EXTRACT] Sparse/garbled text ({len(full_text.strip())} chars) — trying OCR fallback")
        ocr_text = _ocr_pdf_sync(pdf_path, max_chars)
        if len(ocr_text.strip()) > len(full_text.strip()):
            print(f"[EXTRACT] OCR yielded {len(ocr_text)} chars")
            full_text = ocr_text

    # Find best narrative start (director/CEO/chairman report or review)
    narrative_patterns = [
        r"directors['\s]?'?\s*(report|review)",
        r"chairman['\s]?s?\s*(review|report|message)",
        r"ceo['\s]?s?\s*(message|report|review)",
        r"management\s*(discussion|review)",
        r"future\s+outlook",
    ]
    narrative_start = None
    for pat in narrative_patterns:
        for m in re.finditer(pat, full_text, re.IGNORECASE):
            # Skip TOC-style matches: real section has text after the header, not just a page number
            line = full_text[m.start(): m.start() + 120].split("\n")[0]
            if re.search(r"\d{1,3}\s*$", line.strip()):
                continue  # looks like "DIRECTOR'S REVIEW 05" in a TOC — skip
            if narrative_start is None or m.start() < narrative_start:
                narrative_start = m.start()
            break

    # Find the actual financial tables, not just cover page / TOC mentions
    # Patterns that inherently include data (can't appear in a TOC line)
    data_bearing_patterns = [
        r"gross\s+sales\s+[\d,]+",
        r"net\s+(sales|revenue)\s+[\d,]+",
        r"revenue\s+(growth|increased|decreased)\b",
        r"turnover\s+(increased|decreased|grew)\b",
        r"profit\s+and\s+loss\s+summary",
        r"key\s+financial\s+highlights",
        r"financial\s+highlights",
        r"revenue\s+trajectory",
    ]
    # Patterns that may appear in TOC — apply same line-ends-with-number filter
    toc_risk_financial = [
        r"statement\s+of\s+profit\s+or\s+loss",
        r"profit\s+(and|or|&)\s+loss\s+(account|statement)",
    ]
    financial_start = None

    def _toc_safe_find(pat, text):
        for m in re.finditer(pat, text, re.IGNORECASE):
            line = text[m.start(): m.start() + 120].split("\n")[0]
            if re.search(r"\d{1,3}\s*$", line.strip()):
                continue
            return m.start()
        return None

    for pat in data_bearing_patterns:
        m = re.search(pat, full_text, re.IGNORECASE)
        if m and (financial_start is None or m.start() < financial_start):
            financial_start = m.start()

    for pat in toc_risk_financial:
        pos = _toc_safe_find(pat, full_text)
        if pos is not None and (financial_start is None or pos < financial_start):
            financial_start = pos

    # Build combined extract: narrative (up to 8000 chars) + financial (up to 6000 chars)
    parts = []
    if narrative_start is not None:
        parts.append(full_text[narrative_start : narrative_start + 8000])
    if financial_start is not None:
        # Only add if it's a different section (at least 500 chars away from narrative)
        if narrative_start is None or abs(financial_start - narrative_start) > 500:
            parts.append(full_text[financial_start : financial_start + 6000])

    if parts:
        combined = "\n\n--- FINANCIAL DATA ---\n\n".join(parts)
        return combined[:max_chars]

    return full_text[:max_chars]


async def extract_text(pdf_path: str, max_chars: int = 14000) -> str:
    """Extract text asynchronously via thread pool to avoid blocking event loop."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, _extract_text_sync, pdf_path, max_chars)


def _call_ai_sync(prompt: str) -> str:
    """Synchronous LLM call (runs in thread pool)."""
    if not gradient:
        raise RuntimeError("Gradient client not initialized. Check GRADIENT_ACCESS_TOKEN in .env")

    try:
        # Use the new Gradient SDK chat completions API
        response = gradient.chat.completions.create(
            model=MODEL_ID,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=768,
            temperature=0.1
        )
        _log_cache_usage(response)
        return response.choices[0].message.content
    except Exception as e:
        raise RuntimeError(f"Gradient API error: {str(e)}")


async def call_ai(prompt: str) -> str:
    """Call LLM asynchronously via thread pool to avoid blocking event loop."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, _call_ai_sync, prompt)


def _log_cache_usage(response) -> None:
    """Log Gradient prompt-cache hits so savings are visible in the log."""
    try:
        usage = response.usage
        details = getattr(usage, "prompt_tokens_details", None)
        cached = getattr(details, "cached_tokens", None) or getattr(usage, "cache_read_input_tokens", 0) or 0
        if usage and usage.prompt_tokens:
            pct = 100 * cached / usage.prompt_tokens
            print(f"[CACHE] prompt_tokens={usage.prompt_tokens} cached={cached} ({pct:.0f}% cached)")
    except Exception:
        pass  # never let telemetry break an AI call


def _call_ai_messages_sync(messages: list) -> str:
    """Synchronous LLM call with messages (runs in thread pool)."""
    if not gradient:
        raise RuntimeError("Gradient client not initialized. Check GRADIENT_ACCESS_TOKEN in .env")
    response = gradient.chat.completions.create(
        model=MODEL_ID,
        messages=messages,
        max_tokens=1024,
        temperature=0.2,
    )
    _log_cache_usage(response)
    return response.choices[0].message.content


async def call_ai_messages(messages: list) -> str:
    """Call LLM with messages asynchronously via thread pool."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, _call_ai_messages_sync, messages)


def parse_ai_response(raw: str) -> dict:
    """Extract JSON from AI response, with light repair for common AI formatting mistakes."""
    match = re.search(r"\{[\s\S]+\}", raw)
    if not match:
        raise ValueError("No JSON found in AI response")
    candidate = match.group()
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        pass
    # Repair: remove trailing commas before } or ]
    repaired = re.sub(r",\s*([}\]])", r"\1", candidate)
    # Repair: replace Python-style None/True/False with JSON equivalents
    repaired = re.sub(r"\bNone\b", "null", repaired)
    repaired = re.sub(r"\bTrue\b", "true", repaired)
    repaired = re.sub(r"\bFalse\b", "false", repaired)
    return json.loads(repaired)


class ProjectRequest(BaseModel):
    company: str
    symbol: str
    quarter: str                       # the filing quarter (source of signals)
    target_quarter: str | None = None  # the upcoming quarter to project for
    current_date: str | None = None    # today's date (YYYY-MM-DD) for context
    signals: dict  # revenue_growth_pct, profit_growth_pct, gross_margin_direction, management_tone, etc.
    score: int
    flags: list
    summary: str
    current_price: float | None = None
    data_age_months: int | None = None  # months since the filing date; set when data is stale
    macro_context: str | None = None   # optional macro risk summary to incorporate


# Static system prompt (cache-friendly shared prefix) + dynamic user message.
PROJECTION_SYSTEM_PROMPT = """You are a senior financial analyst specializing in Pakistan Stock Exchange (PSX) companies.

You will be given the latest available filing analysis for a PSX company (the supplied inputs).
Generate a forward-looking projection for the target quarter named in the supplied inputs.
Return ONLY valid JSON with no extra text.

━━━ EVIDENCE PRIORITY ━━━
Rank evidence in this strict order — lower-ranked sources must never override higher-ranked:
  1. Latest quarterly filing (the signals and summary above)
  2. Management guidance (if mentioned in the summary)
  3. Financial signals provided above
  4. Macro risk section (if supplied)
  5. Historical PSX sector knowledge

Never allow general market knowledge to override the supplied company data.

If evidence is insufficient: narrow the projection range, lower confidence, avoid aggressive
recommendations. Do not fabricate growth expectations.

━━━ REASONING STEPS ━━━
Reason internally before producing any numbers. Execute these steps in order:

Step 1 — Identify revenue drivers from the signals (volume, price, product mix, exports).
Step 2 — Identify margin drivers (input costs, energy, currency, operating leverage).
Step 3 — Identify cash flow drivers (working capital, capex cycle, dividend capacity).
Step 4 — Identify one-time items that must NOT be extrapolated:
          asset sales, tax reversals, FX translation gains, insurance claims,
          litigation settlements, impairment reversals.
Step 5 — Separate structural improvements from temporary events.
          Structural = likely to persist beyond the target quarter.
          Temporary = unlikely to repeat next quarter.
Step 6 — Determine whether the company has seasonal earnings by sector:
          fertilizer (urea offtake peaks), cement (construction season), textile (export orders),
          pharma (winter/summer demand), banks (NII spread cycle), power (hydro vs thermal mix),
          E&P (gas curtailment seasons), technology (project delivery cycles).
          Adjust target-quarter expectations for seasonality.
Step 7 — Project revenue and profit independently. Revenue growth may improve while profit
          declines due to margins, finance cost, taxation, input prices, or currency moves.
          Never conflate revenue growth with profit growth.
Step 8 — Anchor growth estimates to actual evidence:
          historical trend in signals, company guidance, sector outlook, macro environment.
          Avoid arbitrary percentages with no basis in the supplied data.
Step 9 — Use current market price to sense-check upside estimates. Avoid assigning +30% upside
          if the analysis already indicates the stock is fairly valued. Avoid excessive downside
          if the current valuation already reflects negative news.
Step 10 — Only after completing Steps 1–9, produce the final recommendation and ranges.

━━━ CONSISTENCY RULES ━━━
All seven output fields must tell the same story — never contradict:

  Revenue projection → Profit projection → Catalysts → Risks → Recommendation → Upside → Confidence

Examples of invalid output:
  ✗ Revenue +20%, Profit +18%, Recommendation = Sell
  ✗ Confidence = high, but signals are conflicting or macro is uncertain
  ✗ Upside +25%, but Recommendation = Hold
  ✗ Outlook = positive, key_risks empty

Confidence calibration:
  high   — strong filing, clear catalysts, stable macro, evidence is unambiguous
  medium — mixed signals, one or more uncertain drivers, moderate macro risk
  low    — conflicting signals, stale data, uncertain macro, limited evidence

Target upside must consider projected earnings growth, current valuation, macro risk, sector
outlook, and execution risk — not just the recommendation label.

Catalysts must be company-specific and supported by the supplied evidence.
Avoid generic statements ("improved economy", "higher demand") unless explicitly in the signals.

Risks must be material and sector-specific (e.g. gas shortage, PKR depreciation, refinery margin
compression, fertilizer subsidy cuts, export slowdown). Avoid generic risks ("market volatility")
that apply equally to every listed company.

Scope: project only the target quarter. Do not assume multi-year structural changes unless
explicitly supported by management guidance in the supplied summary.

━━━ OUTPUT FORMAT ━━━
Return this exact JSON structure — no markdown, no extra text, nothing outside the braces:

{
  "next_quarter_outlook": "<3 sentences: what changed in the latest filing, whether improvements are structural or temporary, and the specific outlook for the target quarter — name the quarter explicitly>",
  "projected_revenue_growth_min": <integer percentage, derived from evidence>,
  "projected_revenue_growth_max": <integer percentage, derived from evidence>,
  "projected_profit_growth_min": <integer percentage, independent of revenue — see Step 7>,
  "projected_profit_growth_max": <integer percentage, independent of revenue — see Step 7>,
  "key_catalysts": ["<company-specific catalyst supported by supplied evidence>", "<second catalyst>"],
  "key_risks": ["<material sector-specific risk>", "<second material risk>"],
  "recommendation": "<Strong Buy|Buy|Hold|Sell|Strong Sell>",
  "confidence": "<high|medium|low>",
  "target_upside_min_pct": <integer — never null, negative means expected price decline>,
  "target_upside_max_pct": <integer — never null, negative means expected price decline>
}

Upside reference (starting point only — must be refined by valuation and macro in Step 9):
  Strong Buy → ~15 to 30  |  Buy → ~5 to 20  |  Hold → ~-5 to 5
  Sell → ~-15 to -5  |  Strong Sell → ~-30 to -15

━━━ FINAL VALIDATION ━━━
Before returning JSON, verify:
  ✓ JSON is syntactically valid
  ✓ recommendation matches upside range
  ✓ recommendation matches revenue and profit projections
  ✓ confidence matches evidence quality
  ✓ catalysts support the growth projection
  ✓ risks support the downside scenario
  ✓ no one-time items extrapolated into the target quarter
  ✓ no fabricated events or figures
  ✓ no markdown formatting
  ✓ no text outside the JSON object"""

PROJECTION_USER_TEMPLATE = """━━━ SUPPLIED INPUTS ━━━
Company: {company} ({symbol})
Projection Target Quarter: {target_quarter} (as of {current_date})
Latest Filed Quarter (source of signals): {quarter}
Analysis Score: {score}/100
Flags: {flags}
Summary: {summary}
Current Market Price: {current_price_str}

Key Signals from {quarter}:
{signals}
{macro_section}"""


# Static system prompt (cache-friendly shared prefix) + dynamic user message.
MACRO_RISK_SYSTEM_PROMPT = """You are a macro-economic and geopolitical risk analyst specializing in Pakistan and the Pakistan Stock Exchange (PSX).

You will be given a company (with its sector) and current real-world news gathered from the web.
Assess the current macro risk environment for that company and produce a risk adjustment score.
Return ONLY valid JSON with no extra text.

━━━ EVIDENCE RULES ━━━
The supplied news overrides any prior knowledge. Never use information outside the supplied news
unless it is timeless economic knowledge (e.g. higher rates reduce bond prices). If prior knowledge
conflicts with supplied news, trust the supplied news.

If the supplied news contains insufficient evidence for a factor, mark direction as "neutral" and
note "No material current evidence." — do not infer or fabricate missing information.

Ignore articles that do not materially affect the company or its sector:
celebrity news, local crime, sports, entertainment, foreign politics with no Pakistan impact.

Weight evidence in this strict order — lower-ranked sources must never outweigh higher-ranked evidence:
  1. SBP decisions
  2. IMF announcements
  3. Federal Budget / FBR measures
  4. Government regulations
  5. Company filings and disclosures
  6. International geopolitical developments
  7. Reputable financial news (Dawn Business, Business Recorder, The News)
  8. Market commentary and analyst opinion

If multiple articles conflict, prefer: (a) newer date, (b) official announcement, (c) confirmed event.

━━━ REASONING STEPS ━━━
Reason internally before scoring. Execute these steps in order:

Step 1 — Identify all major macro events in the supplied news.
Step 2 — Remove duplicates (multiple articles covering the same event count as one).
Step 3 — Remove opinion pieces, speculative headlines, and unverified rumours.
Step 4 — Classify each remaining event:
          • Structural (long-term, >12 months impact)
          • Cyclical (medium-term, 3–12 months)
          • Temporary (short-term, <3 months)
Step 5 — Estimate Low / Medium / High impact on the company specifically.
Step 6 — Determine the classification of the company's sector from this list:
          export-oriented | import-dependent | regulated | interest-rate sensitive |
          energy-intensive | consumer discretionary | consumer defensive |
          infrastructure | commodity-linked | technology
          Then evaluate every macro event through this sector lens. PSO (energy-intensive,
          regulated) must score very differently from SYS (technology, export-oriented).
Step 7 — Evaluate each factor independently. One event must not be allowed to influence
          unrelated factors. Example: an SBP rate cut is relevant to Macroeconomic and
          Sector — it is NOT relevant to Geopolitical or Natural Disasters.
Step 8 — Only after completing Steps 1–7, assign direction and note for each factor.

━━━ FACTOR DEFINITIONS ━━━
Evaluate these five dimensions as they apply to Pakistan right now (as of the supplied date):

1. GEOPOLITICAL: India-Pakistan tensions, Afghanistan border, Iran-Pakistan relations,
   US-China-Pakistan dynamics, CPEC disruptions, sanctions risk
2. DOMESTIC POLITICS: Government stability, election aftermath, IMF programme compliance,
   constitutional crises, civil unrest, regulatory unpredictability
3. NATURAL DISASTERS: Flood season risk (Jul–Sep), earthquake belt exposure (KPK/Balochistan),
   drought/water stress, climate disruption to agriculture/energy
4. MACROECONOMIC: PKR depreciation trend, inflation (CPI/PPI), interest rate trajectory
   (SBP policy rate), forex reserves, current account deficit, external debt servicing
5. SECTOR-SPECIFIC: How the above risks specifically hit companies in the company's sector
   given the classification determined in Step 6 (e.g. energy price caps, import restrictions,
   export bans, regulatory changes, IT export tax rates, construction activity)

━━━ CALIBRATION RULES ━━━
Do not assign a negative direction solely because negative news exists. Consider:
  • magnitude — how large is the financial impact?
  • duration — structural, cyclical, or temporary?
  • probability — is it confirmed or speculative?
  • relevance — does it specifically affect the company or its sector?
Events with negligible financial impact should be ignored.

If evidence is weak or conflicting, reduce the magnitude of the adjustment rather than guessing.

Extreme adjustment scores (-15, -20, +10) require multiple independent concurrent severe risks.
Do not use any integer outside [-20, +10]. Prefer values divisible by 5 unless the evidence
clearly supports an intermediate step.

━━━ OUTPUT FORMAT ━━━
Return this exact JSON structure — no markdown, no extra text, nothing outside the braces:

{
  "factors": [
    {"label": "Geopolitical",        "direction": "<positive|neutral|negative>", "note": "<see note rules below>"},
    {"label": "Domestic Politics",   "direction": "<positive|neutral|negative>", "note": "<see note rules below>"},
    {"label": "Natural Disasters",   "direction": "<positive|neutral|negative>", "note": "<see note rules below>"},
    {"label": "Macroeconomic",       "direction": "<positive|neutral|negative>", "note": "<see note rules below>"},
    {"label": "Sector (<the company's sector name>)", "direction": "<positive|neutral|negative>", "note": "<see note rules below>"}
  ],
  "adjustment": <integer from -20 to +10>,
  "severity": "<low|moderate|high|critical>",
  "outlook": "<positive|neutral|negative>",
  "summary": "<3 sentences: what changed recently, why investors should care, how it affects the company specifically — do not repeat the factor notes>"
}

Note rules — each factor note must (max 30 words):
  • name the actual event from the supplied news (not a generic statement)
  • explain why it matters for this sector
  • state the impact direction on the company
  If no material evidence exists, write: "No material current evidence for this factor."

Adjustment scale:
  +10 : Multiple strong tailwinds — PKR stable, political calm, direct policy support for sector
  +5  : Mildly positive — one clear tailwind, no significant headwinds
   0  : Neutral or mixed — positives and negatives roughly balanced
  -5  : Mild headwinds — moderate inflation, minor political noise, manageable sector stress
  -10 : Significant headwinds — PKR pressure, political uncertainty, clear sector-level stress
  -15 : Severe — major crisis, extreme inflation, sector-specific regulatory shock or price cap
  -20 : Extreme — concurrent war risk, economic meltdown, multiple simultaneous crises

Consistency rules (all four fields must agree — never produce conflicting output):
  severity : low (adjustment 0 to +10) | moderate (-5 to +5) | high (-10 to -14) | critical (-15 to -20)
  outlook  : positive (adjustment > 0) | neutral (adjustment = 0) | negative (adjustment < 0)
  summary  : must be consistent with adjustment and severity — never contradict them

━━━ FINAL VALIDATION ━━━
Before returning JSON, verify:
  ✓ JSON is syntactically valid
  ✓ Each factor direction is consistent with its note
  ✓ summary is consistent with adjustment and severity
  ✓ severity matches the adjustment integer
  ✓ outlook matches the sign of the adjustment
  ✓ every statement in notes and summary is supported by the supplied news
  ✓ no fabricated events or figures
  ✓ no markdown formatting
  ✓ no text outside the JSON object"""

MACRO_RISK_USER_TEMPLATE = """Company: {company} ({symbol})
Sector: {sector}

━━━ SUPPLIED NEWS ━━━
Below is CURRENT real-world news gathered from the web as of {current_date}.

{recent_news}
━━━ END OF SUPPLIED NEWS ━━━"""


@app.post("/project")
async def project(req: ProjectRequest):
    from datetime import date
    import json as _json

    today = req.current_date or date.today().isoformat()
    target_quarter = req.target_quarter or f"next quarter after {req.quarter}"

    signals_text = "\n".join([f"- {k}: {v}" for k, v in req.signals.items()])
    flags_text = ", ".join(req.flags) if req.flags else "None"
    current_price_str = f"PKR {req.current_price:.2f}" if req.current_price else "Not available"

    macro_section = ""
    if req.macro_context:
        macro_section = f"\nCurrent Macro Risk Context:\n{req.macro_context}\n"

    stale_note = ""
    if req.data_age_months and req.data_age_months >= 12:
        stale_note = (
            f"\n⚠️ DATA STALENESS WARNING: The most recent filing for {req.company} is "
            f"{req.data_age_months} months old (from {req.quarter}). No newer financial "
            f"statements are available on PSX. You MUST explicitly mention in your "
            f"next_quarter_outlook and key_risks that this projection is based on data "
            f"that is over {req.data_age_months} months old, and that the company has not "
            f"filed recent financials. Treat all signals with lower confidence.\n"
        )

    user_content = PROJECTION_USER_TEMPLATE.format(
        company=req.company,
        symbol=req.symbol,
        quarter=req.quarter,
        target_quarter=target_quarter,
        current_date=today,
        score=req.score,
        flags=flags_text,
        summary=req.summary,
        signals=signals_text,
        current_price_str=current_price_str,
        macro_section=macro_section + stale_note,
    )

    MAX_ATTEMPTS = 3
    last_error = None
    # Static system prompt first — enables Gradient automatic prefix caching
    messages = [
        {"role": "system", "content": PROJECTION_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            raw = await call_ai_messages(messages)
            result = parse_ai_response(raw)
            return result
        except (ValueError, json.JSONDecodeError) as e:
            last_error = e
            messages.append({"role": "assistant", "content": raw})
            messages.append({
                "role": "user",
                "content": (
                    f"Your response was not valid JSON (error: {e}). "
                    "Return ONLY the corrected JSON object with no explanation, "
                    "no markdown, no extra text. Fix the syntax and try again."
                ),
            })
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    raise HTTPException(status_code=500, detail=f"Failed to get valid JSON after {MAX_ATTEMPTS} attempts: {last_error}")


@app.post("/project-agentic")
async def project_agentic(req: ProjectRequest):
    """
    Agentic projection endpoint with autonomous research and tool calls.

    This endpoint uses Gradient AI with iterative reasoning to:
    1. Analyze historical signals
    2. Research recent developments iteratively
    3. Validate assumptions against real-world data
    4. Refine projections based on evidence
    5. Return projection with evidence trail and reasoning chain

    Benefits over /project:
    - More accurate (validates assumptions with real-time data)
    - Evidence-based (shows what research informed the projection)
    - Adaptive (adjusts to breaking news automatically)
    - Confident scoring (agent knows when it's uncertain)

    Tradeoffs:
    - Slower (~15-30s vs ~2s)
    - Uses same Gradient API (no additional cost/setup)
    """
    if not AGENTIC_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Agentic projection not available. Check agentic_projection_gradient.py is present."
        )

    if not gradient:
        raise HTTPException(
            status_code=503,
            detail="Gradient client not initialized. Check GRADIENT_ACCESS_TOKEN in .env"
        )

    from datetime import date

    today = req.current_date or date.today().isoformat()
    target_quarter = req.target_quarter or f"next quarter after {req.quarter}"

    try:
        # Initialize and run the agentic projection agent (Gradient-based)
        agent = ProjectionAgentGradient(
            company=req.company,
            symbol=req.symbol,
            quarter=req.quarter,
            target_quarter=target_quarter,
            signals=req.signals,
            score=req.score,
            flags=req.flags,
            summary=req.summary,
            current_price=req.current_price,
            macro_context=req.macro_context,
            current_date=today,
            max_rounds=6,  # Allow up to 6 rounds of research
            gradient_client=gradient,
            model_id=MODEL_ID
        )

        result = agent.run()
        return result

    except ValueError as e:
        # Configuration error
        raise HTTPException(status_code=503, detail=str(e))
    except RuntimeError as e:
        # Agent failed to finalize
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        # Other errors
        raise HTTPException(status_code=500, detail=f"Agentic projection failed: {str(e)}")


class MacroRiskRequest(BaseModel):
    company: str
    symbol: str
    sector: str = "Unknown"
    force_refresh: bool = False


@app.post("/assess-macro-risk")
async def assess_macro_risk(req: MacroRiskRequest):
    from datetime import date

    today = date.today().isoformat()
    year = today[:4]

    search_fn = web_search if req.force_refresh else cached_web_search

    # Pull live context - OPTIMIZED: Run searches in parallel when both are needed
    searches = [
        search_fn(
            f"Pakistan economy geopolitical risk latest news {year} "
            "inflation rupee dollar IMF SBP interest rate political tension"
        )
    ]

    if req.sector and req.sector.lower() != "unknown":
        searches.append(
            search_fn(f"Pakistan {req.sector} sector news outlook {year}")
        )

    # Execute searches in parallel
    results = await asyncio.gather(*searches)
    national_news = results[0]
    sector_news = results[1] if len(results) > 1 else None

    parts = [f"=== RECENT PAKISTAN MACRO / GEOPOLITICAL NEWS ===\n{national_news}"]
    if sector_news:
        parts.append(f"=== RECENT {req.sector.upper()} SECTOR NEWS ===\n{sector_news}")

    recent_news = "\n\n".join(parts)

    user_content = MACRO_RISK_USER_TEMPLATE.format(
        company=req.company,
        symbol=req.symbol,
        sector=req.sector,
        current_date=today,
        recent_news=recent_news,
    )

    MAX_ATTEMPTS = 3
    last_error = None
    # Static system prompt first — enables Gradient automatic prefix caching
    messages = [
        {"role": "system", "content": MACRO_RISK_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            raw = await call_ai_messages(messages)
            result = parse_ai_response(raw)

            result["adjustment"] = max(-20, min(10, int(result.get("adjustment", 0))))
            result.setdefault("severity", "moderate")
            result.setdefault("outlook", "neutral")
            result.setdefault("factors", [])
            result.setdefault("summary", "")

            return result
        except (ValueError, json.JSONDecodeError) as e:
            last_error = e
            messages.append({"role": "assistant", "content": raw})
            messages.append({
                "role": "user",
                "content": (
                    f"Your response was not valid JSON (error: {e}). "
                    "Return ONLY the corrected JSON object with no explanation, "
                    "no markdown, no extra text. Fix the syntax and try again."
                ),
            })
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    raise HTTPException(status_code=500, detail=f"Failed to get valid JSON after {MAX_ATTEMPTS} attempts: {last_error}")


@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    pdf_path = None
    start_time = time.time()
    try:
        print(f"[ANALYZE] Starting analysis for {req.symbol} ({req.filing_id})...")

        # Download PDF
        t0 = time.time()
        pdf_path = await download_pdf(req.pdf_url)
        print(f"[ANALYZE] PDF download took {time.time() - t0:.2f}s")

        # Extract text
        t0 = time.time()
        text = await extract_text(pdf_path)
        print(f"[ANALYZE] Text extraction took {time.time() - t0:.2f}s ({len(text)} chars)")

        # Call AI — static system prompt first for Gradient prefix caching
        t0 = time.time()
        user_content = EXTRACTION_USER_TEMPLATE.format(
            text=text,
            company=req.company,
            quarter=req.quarter,
        )
        raw = await call_ai_messages([
            {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ])
        print(f"[ANALYZE] AI call took {time.time() - t0:.2f}s")

        result = parse_ai_response(raw)

        # Clamp score
        result["score"] = max(0, min(100, int(result.get("score", 0))))

        total_time = time.time() - start_time
        print(f"[ANALYZE] ✓ Complete for {req.symbol} in {total_time:.2f}s")
        return result

    except httpx.HTTPError as e:
        print(f"[ANALYZE] ✗ PDF download failed for {req.symbol}: {e}")
        raise HTTPException(status_code=502, detail=f"PDF download failed: {e}")
    except Exception as e:
        print(f"[ANALYZE] ✗ Error for {req.symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if pdf_path and os.path.exists(pdf_path):
            os.unlink(pdf_path)


CHAT_SYSTEM_PROMPT = """You are a financial analyst AI assistant embedded in the PSX StockAnalyzer platform.
PSX StockAnalyzer analyzes quarterly filings of Pakistan Stock Exchange (PSX) listed companies and produces AI scores.

Score scale (0–100): 70+ Strong Buy, 55–69 Buy, 40–54 Hold, 25–39 Underweight, <25 Avoid.
Flags that can appear on a company: HIGH_PROFIT_GROWTH, HIGH_REVENUE_GROWTH, EXPORT_EXPANSION, NEW_PROJECT,
MARGIN_IMPROVEMENT, DEFAULTER_RISK, EXCHANGE_HEADWIND, EXCHANGE_TAILWIND.
Recommendations: Strong Buy, Buy, Hold, Sell, Strong Sell.

Rules:
- Answer only from the platform data provided in this conversation.
- Be concise and specific. Use bullet points for lists.
- Show monetary values in PKR.
- Always note: "This is AI-generated analysis, not financial advice."
- If data for a specific company is not in the context, say so clearly.
"""


class ChatRequest(BaseModel):
    question: str
    context: dict = {}


def _format_context(ctx: dict) -> str:
    parts: list[str] = []

    if ctx.get("market_briefing"):
        b = ctx["market_briefing"]
        parts.append(f"=== TODAY'S MARKET BRIEFING ===\n{b.get('briefing', 'N/A')}")
        if b.get("top_themes"):
            parts.append("Top themes: " + ", ".join(b["top_themes"]))

    if ctx.get("sector_stats"):
        lines = ["=== SECTOR STATS (ranked by avg score) ==="]
        for s in ctx["sector_stats"][:15]:
            lines.append(
                f"  {s['sector']}: avg={s.get('avg_score','N/A')} "
                f"companies={s['company_count']} top={s.get('top_company_symbol','?')}({s.get('top_score','?')})"
            )
        parts.append("\n".join(lines))

    if ctx.get("top_companies"):
        lines = ["=== TOP COMPANIES BY AI SCORE ==="]
        for c in ctx["top_companies"][:20]:
            f = c.get("latest_filing") or {}
            score = (f.get("score") or {}).get("score", "?")
            ai = f.get("ai_analysis") or {}
            flags = (f.get("score") or {}).get("flags", [])
            flags_str = ", ".join(flags) if flags else "none"
            lines.append(
                f"  {c['symbol']} | {c['name']} | sector={c.get('sector','?')} "
                f"| score={score} | price=PKR {c.get('last_price','?')} "
                f"| sharia={c.get('is_sharia_compliant',False)} "
                f"| defaulter={c.get('is_defaulter',False)} "
                f"| flags=[{flags_str}]"
                + (f"\n    summary: {ai.get('summary','')}" if ai.get("summary") else "")
            )
        parts.append("\n".join(lines))

    if ctx.get("company"):
        c = ctx["company"].get("company", ctx["company"])
        lines = [f"=== COMPANY DETAIL: {c.get('symbol','?')} ==="]
        lines.append(f"Name: {c.get('name','?')} | Sector: {c.get('sector','?')}")
        lines.append(f"Price: PKR {c.get('last_price','?')} | Sharia: {c.get('is_sharia_compliant')} | Defaulter: {c.get('is_defaulter')}")
        for filing in (c.get("filings") or [])[:3]:
            ai = filing.get("ai_analysis") or {}
            sc = (filing.get("score") or {})
            sig = ai.get("signals") or {}
            lines.append(
                f"  Filing {filing.get('quarter','?')}: score={sc.get('score','?')} "
                f"flags={sc.get('flags',[])} "
                f"rev_growth={sig.get('revenue_growth_pct','?')}% "
                f"profit_growth={sig.get('profit_growth_pct','?')}% "
                f"tone={sig.get('management_tone','?')}"
            )
            if ai.get("summary"):
                lines.append(f"    summary: {ai['summary']}")
        parts.append("\n".join(lines))

    if ctx.get("projection"):
        p = ctx["projection"]
        if p.get("status") == "done":
            lines = ["=== LATEST PROJECTION ==="]
            lines.append(f"Recommendation: {p.get('recommendation','?')} | Confidence: {p.get('confidence','?')}")
            lines.append(f"Outlook: {p.get('next_quarter_outlook','?')}")
            lines.append(f"Rev growth: {p.get('projected_revenue_growth_min','?')}–{p.get('projected_revenue_growth_max','?')}%")
            lines.append(f"Profit growth: {p.get('projected_profit_growth_min','?')}–{p.get('projected_profit_growth_max','?')}%")
            lines.append(f"Upside: {p.get('target_upside_min_pct','?')}–{p.get('target_upside_max_pct','?')}%")
            if p.get("key_catalysts"):
                lines.append("Catalysts: " + "; ".join(p["key_catalysts"]))
            if p.get("key_risks"):
                lines.append("Risks: " + "; ".join(p["key_risks"]))
            parts.append("\n".join(lines))

    if ctx.get("news"):
        articles = ctx["news"].get("news", [])[:5]
        if articles:
            lines = ["=== RECENT NEWS ==="]
            for a in articles:
                lines.append(
                    f"  [{a.get('sentiment','?')}] {a.get('headline','?')} "
                    f"({a.get('source','?')})"
                    + (f"\n    {a.get('ai_summary','')}" if a.get("ai_summary") else "")
                )
            parts.append("\n".join(lines))

    return "\n\n".join(parts)


def _web_search_sync(query: str, max_results: int = 5) -> str:
    """Synchronous web search (runs in thread pool)."""
    try:
        # Add Pakistan/PSX context to all queries to get relevant results
        # Only add if not already present to avoid redundancy
        psx_keywords = ["pakistan", "psx", "karachi stock exchange", "kse"]
        query_lower = query.lower()
        needs_context = not any(kw in query_lower for kw in psx_keywords)

        if needs_context:
            # Add Pakistan PSX context to focus on Pakistani market
            enhanced_query = f"{query} Pakistan PSX"
        else:
            enhanced_query = query

        with DDGS() as ddgs:
            results = list(ddgs.text(enhanced_query, max_results=max_results))
        if not results:
            return "No results found."
        lines = []
        for r in results:
            lines.append(f"- {r.get('title', '')}: {r.get('body', '')[:300]}")
            if r.get("href"):
                lines.append(f"  Source: {r['href']}")
        return "\n".join(lines)
    except Exception as e:
        return f"Search failed: {e}"


async def web_search(query: str, max_results: int = 5) -> str:
    """Run web search asynchronously via thread pool."""
    return await asyncio.to_thread(_web_search_sync, query, max_results)


# In-process TTL cache for web searches. Macro/geopolitical news moves slowly and is
# shared across companies, so caching avoids hundreds of duplicate searches during the
# daily batch reassessment.
_SEARCH_CACHE: dict[str, tuple[float, str]] = {}
_SEARCH_CACHE_TTL = 6 * 3600  # 6 hours


async def cached_web_search(query: str, max_results: int = 5) -> str:
    """Async web_search with a 6-hour TTL cache, keyed by query."""
    now = time.time()
    cached = _SEARCH_CACHE.get(query)
    if cached and now - cached[0] < _SEARCH_CACHE_TTL:
        return cached[1]
    result = await web_search(query, max_results=max_results)
    # Only cache real results so a transient failure retries next time.
    if result and not result.startswith("Search failed") and result != "No results found.":
        _SEARCH_CACHE[query] = (now, result)
    return result


TOOL_DECISION_PROMPT = """You are a PSX (Pakistan Stock Exchange) financial analyst assistant with access to a web_search tool.

You have PSX StockAnalyzer platform data (company AI scores, filings, sector rankings).
You ALSO have web_search for anything beyond that data.

ALWAYS use web_search when the question involves any of these:
- Pakistan budget, taxes, duties, government policy, or regulatory announcements
- "After [event]", "impact of [event]", "following [news/budget/policy]"
- Current economic conditions: PKR exchange rate, inflation, interest rates, IMF, SBP (State Bank of Pakistan)
- Recent news, latest developments, or anything time-sensitive about Pakistan or PSX companies
- Outlook or predictions that require knowing what has happened in the real world recently
- Any sector forecast or recommendation that depends on external policy or macro events in Pakistan
- Market trends, SECP regulations, or PSX-specific developments

Use platform data ONLY when the question asks purely about company scores, filing summaries,
sector rankings, or projections already stored in the system.

If web_search is needed, respond ONLY with this JSON (no other text):
  {{"tool": "web_search", "query": "<specific, targeted search query about Pakistan/PSX>", "reason": "<one-line reason>"}}

IMPORTANT: Search queries should focus on Pakistan/PSX context (e.g., "Pakistan cement sector outlook", "PSX banking stocks performance", "SECP regulations").

If platform data is sufficient, provide the complete answer now.
When in doubt, search — it is always better to search than to refuse or give an incomplete answer."""


# Keywords that always warrant a web search regardless of LLM decision
_SEARCH_TRIGGERS = [
    "budget", "tax", "duty", "tariff", "policy", "regulation", "government",
    "after", "impact", "effect", "following",
    "news", "latest", "recent", "current", "today", "now",
    "exchange rate", "inflation", "interest rate", "sbp", "imf", "gdp",
    "rupee", "pkr", "dollar", "election", "political",
    "outlook", "forecast", "predict", "expect",
]

def _force_search(question: str) -> str | None:
    """Return a search query if the question clearly needs web data, skipping LLM decision."""
    lower = question.lower()
    for trigger in _SEARCH_TRIGGERS:
        if trigger in lower:
            return question  # use the raw question as the search query
    return None


@app.post("/chat")
async def chat(req: ChatRequest):
    context_text = _format_context(req.context)

    # ── Step 1: keyword shortcut — bypass LLM decision for obvious web-search questions ──
    forced_query = _force_search(req.question)
    search_results_text = ""

    if forced_query:
        search_results_text = await web_search(forced_query)
    else:
        # ── Step 1b: ask the model whether it needs a web search ──
        decision_messages = [
            {"role": "user", "content": TOOL_DECISION_PROMPT},
            {"role": "assistant", "content": "Understood. I will decide whether to search or answer directly."},
        ]
        if context_text:
            decision_messages.append({"role": "user", "content": f"Platform data:\n\n{context_text}"})
            decision_messages.append({"role": "assistant", "content": "Got it. I have the platform data."})
        decision_messages.append({"role": "user", "content": req.question})

        try:
            decision_raw = await call_ai_messages(decision_messages)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

        # ── Step 2: check if the model wants to search ──
        tool_match = re.search(r'\{\s*"tool"\s*:\s*"web_search"[^}]*\}', decision_raw, re.DOTALL)
        if tool_match:
            try:
                tool_call = json.loads(tool_match.group())
                query = tool_call.get("query", req.question)
                search_results_text = await web_search(query)
            except (json.JSONDecodeError, Exception):
                pass

    # ── Step 3: if we searched, do a second pass with results; otherwise use step-1 answer ──
    if search_results_text:
        search_system = (
            CHAT_SYSTEM_PROMPT.replace(
                "- Answer only from the platform data provided in this conversation.",
                "- Answer using the platform data AND the web search results provided below. "
                "Clearly integrate both sources. Cite when you are drawing from search results."
            )
        )
        final_messages = [
            {"role": "user", "content": search_system},
            {"role": "assistant", "content": "Understood. I will answer using both the platform data and the web search results provided."},
        ]
        if context_text:
            final_messages.append({"role": "user", "content": f"Platform data:\n\n{context_text}"})
            final_messages.append({"role": "assistant", "content": "Got it. I have the platform data. Ready for questions."})
        final_messages.append({
            "role": "user",
            "content": f"{req.question}\n\n[Web search results:]\n{search_results_text}",
        })
        try:
            answer = await call_ai_messages(final_messages)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
        return {"answer": answer.strip(), "used_web_search": True}

    # No search — answer directly from platform data (or fall back if LLM emitted unparseable JSON)
    direct_messages = [
        {"role": "user", "content": CHAT_SYSTEM_PROMPT},
        {"role": "assistant", "content": "Understood. I will answer only from the PSX StockAnalyzer data you provide."},
    ]
    if context_text:
        direct_messages.append({"role": "user", "content": f"Platform data:\n\n{context_text}"})
        direct_messages.append({"role": "assistant", "content": "Got it. I have the platform data. Ready for questions."})
    direct_messages.append({"role": "user", "content": req.question})
    try:
        answer = await call_ai_messages(direct_messages)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"answer": answer.strip(), "used_web_search": False}


@app.get("/health")
def health():
    """
    Checks health of both standard and agentic AI systems:
      1. API is reachable (always ok if we got here)
      2. Gradient token is configured
      3. Gradient inference works
      4. Agentic projection available (uses Gradient - same as standard)
    """
    checks: dict = {
        "api": "ok",
        "gradient_configured": bool(GRADIENT_TOKEN),
        "inference": "not_configured",
        "model": MODEL_ID,
        "agentic_available": AGENTIC_AVAILABLE,
        "agentic_engine": "gradient",  # Now using Gradient instead of Anthropic
    }

    # Check standard Gradient inference
    if gradient:
        try:
            resp = gradient.chat.completions.create(
                model=MODEL_ID,
                messages=[{"role": "user", "content": "Reply with the single word: ok"}],
                max_tokens=5,
                temperature=0,
            )
            reply = (resp.choices[0].message.content or "").strip().lower()
            checks["inference"] = "ok" if reply else "empty_response"
        except Exception as e:
            checks["inference"] = f"error: {str(e)}"

    # Agentic uses same Gradient client, so if inference works, agentic works
    checks["agentic_configured"] = AGENTIC_AVAILABLE and checks["inference"] == "ok"

    checks["status"] = "ok" if checks["inference"] == "ok" else "degraded"
    checks["features"] = {
        "standard_projection": checks["inference"] == "ok",
        "agentic_projection": checks["agentic_configured"]
    }
    return checks


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
        raw = await call_ai(prompt)
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
            explanation = (await call_ai(prompt)).strip()
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
        briefing = (await call_ai(prompt)).strip()
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


class ExplainMovementRequest(BaseModel):
    symbol: str
    price_change_pct: float
    volume_ratio: float
    recent_news: str = ""
    sector_change_pct: float = 0


@app.post("/explain-movement")
async def explain_movement(req: ExplainMovementRequest):
    """Explain why a specific stock moved."""
    symbol = req.symbol
    price_change_pct = req.price_change_pct
    volume_ratio = req.volume_ratio
    recent_news = req.recent_news
    sector_change_pct = req.sector_change_pct

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
        explanation = (await call_ai(prompt)).strip()

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
