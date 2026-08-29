# StockAnalyzer - 3-Layer Architecture Analysis

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    LAYER 1: FRONTEND                        │
│                  (Next.js + React Query)                    │
│                     Port 3000                               │
└──────────────────────┬──────────────────────────────────────┘
                       │ REST API (HTTP/JSON)
                       │ Bearer Token Auth
┌──────────────────────▼──────────────────────────────────────┐
│                    LAYER 2: API                             │
│              (Laravel + Queue Workers)                      │
│                     Port 8000                               │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP POST (JSON)
                       │ Async Job Queue
┌──────────────────────▼──────────────────────────────────────┐
│                  LAYER 3: AI ENGINE                         │
│              (FastAPI + Gradient SDK)                       │
│                     Port 8003                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎨 LAYER 1: Frontend (Next.js)

**Location**: `/frontend`  
**Technology**: Next.js 16.x, React 19, TanStack Query, Recharts, Tailwind CSS  
**Port**: 3000

### Primary Responsibilities

#### 1. **User Interface & Experience**
- Render interactive dashboards and company pages
- Display charts (price history, sector trends, performance metrics)
- Handle user authentication (login/register/logout)
- Manage client-side routing and navigation

#### 2. **Data Fetching & Caching**
```typescript
// Example from frontend/src/lib/api.ts
const api = axios.create({
  baseURL: "http://localhost:8000/api",
  headers: { "Content-Type": "application/json" }
});

// Automatic token injection
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

**Key Features**:
- React Query for smart caching and automatic refetching
- Optimistic updates for better UX
- Stale-time configurations (e.g., 4 hours for price history)
- Automatic retry on network failures

#### 3. **State Management**
- Uses TanStack Query for server state
- Local state with React hooks (useState, useRef)
- No global state management needed (React Query handles it)

#### 4. **Key Pages & Components**

| Page/Component | Purpose |
|----------------|---------|
| `/` (page.tsx) | Dashboard with company list, market briefing, filters |
| `/companies/[id]` | Detailed company view with charts, AI analysis, projections |
| `/companies` | Company listing with sorting/filtering |
| `/scan` | Scan control panel for triggering analysis |
| `/watchlist` | User's watchlist management |

#### 5. **Data Visualization**
```typescript
// Uses Recharts for all charts
import { LineChart, AreaChart, ComposedChart, Bar } from "recharts";

// Example: Price history chart with multiple time ranges
<ResponsiveContainer width="100%" height={400}>
  <AreaChart data={priceData}>
    <Area dataKey="close" stroke="#3b82f6" fill="#3b82f6" />
  </AreaChart>
</ResponsiveContainer>
```

#### 6. **User Actions Handled**
- ✅ Search and filter companies
- ✅ Sort by score, filing date, name, sector, P/E ratio
- ✅ Rescan individual companies
- ✅ Trigger bulk scans for specific months
- ✅ Add/remove companies from watchlist
- ✅ View company details, news, projections
- ✅ Chat with AI about companies

### What Frontend Does NOT Do
❌ Direct database access  
❌ PDF processing  
❌ AI/ML computations  
❌ Web scraping  
❌ Background job scheduling  

---

## ⚙️ LAYER 2: API (Laravel)

**Location**: `/api`  
**Technology**: Laravel 11.x, PostgreSQL, Redis Queue, Sanctum Auth  
**Port**: 8000

### Primary Responsibilities

#### 1. **RESTful API Endpoints**
Total endpoints: **28**

**Authentication** (3):
- POST `/register` - User registration
- POST `/login` - User login (returns Bearer token)
- POST `/logout` - Invalidate token

**Companies** (9):
- GET `/companies` - List with filtering, sorting, pagination
- GET `/companies/{id}` - Company details with filings
- GET `/companies/{id}/filings` - Filing history
- GET `/companies/{id}/price-history` - Stock price chart data
- GET `/companies/{id}/news` - News articles
- GET `/companies/{id}/projection` - Financial projections
- POST `/companies/{id}/scan` - Initial scan (scrape filings)
- POST `/companies/{id}/rescan` - Re-analyze latest filing
- GET `/companies-sectors` - List of all sectors

**Sectors** (2):
- GET `/sectors-stats` - Aggregated metrics per sector
- GET `/sectors-trends` - Historical sector performance

**Filings** (2):
- GET `/filings` - All filings
- GET `/filings/{id}` - Filing details

**Watchlist** (3):
- GET `/watchlist` - User's watchlist
- POST `/watchlist` - Add company
- DELETE `/watchlist/{company}` - Remove company

**Scanning** (4):
- POST `/scan` - Bulk scan for a month
- POST `/scan/sync-all-filings` - Sync filings from PSX
- POST `/scan/sync-prices` - Update all stock prices
- GET `/scan/progress` - Scan progress status

**Market** (1):
- GET `/market/briefing` - AI-generated market summary

**Chat** (1):
- POST `/chat` - Chat with AI about companies

**Health** (1):
- GET `/health` - System health check

#### 2. **Business Logic & Orchestration**

**Controllers** (6):
- `AuthController` - Authentication
- `CompanyController` - Company operations
- `FilingController` - Filing operations
- `ScanController` - Scan orchestration
- `WatchlistController` - Watchlist CRUD
- `ChatController` - AI chat interface

**Services** (2):
```php
// AiAnalysisService - Bridge to AI Engine
public function analyze(Filing $filing): array {
    $response = Http::timeout(120)
        ->post("{$aiEngineUrl}/analyze", [
            'filing_id' => $filing->id,
            'pdf_url'   => $filing->pdf_url,
            'company'   => $filing->company->name,
            'symbol'    => $filing->company->symbol,
            'quarter'   => $filing->quarter,
        ]);
    return $response->json();
}

// PsxScraperService - Scrape PSX website
public function fetchTransmissions(string $month): array {
    // Scrapes PSX announcements page
    // Returns array of filings with PDF URLs
}
```

#### 3. **Background Job Queue System**

**Queue Workers**: 4 parallel instances processing jobs

**Jobs** (11):

| Job | Queue | Purpose | Calls AI Engine |
|-----|-------|---------|----------------|
| `AnalyzeFilingJob` | rescan/default | Download PDF → Send to AI → Save results | ✅ `/analyze` |
| `GenerateProjectionJob` | rescan/default | Generate financial projections | ✅ `/project-agentic` |
| `AssessMacroRiskJob` | rescan/default | Assess macro-economic risks | ✅ `/assess-macro-risk` |
| `DetectVolumeSpikeJob` | rescan/default | Detect unusual trading volume | ✅ `/detect-volume-spike` |
| `ExplainMovementJob` | rescan/default | Explain price movements | ✅ `/explain-movement` |
| `ScrapeNewsJob` | rescan/default | Scrape and analyze news | ✅ `/analyze-news` |
| `GenerateMarketBriefingJob` | default | Generate market summary | ✅ `/generate-market-briefing` |
| `ScanMonthJob` | default | Scrape PSX for a month | ❌ (uses PsxScraperService) |
| `SyncCompanyFilingsJob` | default | Sync all filings for a company | ❌ (uses PsxScraperService) |
| `WorkerHeartbeatJob` | default | Queue health monitoring | ❌ |

**Job Flow Example (Rescan)**:
```
POST /companies/634/rescan
  ↓
AnalyzeFilingJob dispatched
  ↓ (calls AI Engine /analyze)
Result saved to filing.ai_analysis
  ↓
GenerateProjectionJob dispatched
  ↓ (calls AI Engine /project-agentic)
Result saved to projections table
  ↓
5 more jobs dispatched in parallel:
- AssessMacroRiskJob
- DetectVolumeSpikeJob
- ExplainMovementJob
- ScrapeNewsJob
- (Price sync already done)
```

#### 4. **Database Models & Relationships**

**Models** (8):
- `Company` - PSX listed companies (718 total)
- `Filing` - Quarterly reports with PDF URLs
- `Score` - AI-generated scores and flags
- `Projection` - Financial projections
- `MacroRisk` - Macro-economic risk assessments
- `NewsArticle` - News with AI sentiment analysis
- `User` - Authenticated users
- `Watchlist` - User's tracked companies

**Database Schema** (simplified):
```sql
companies
  ├─ id, symbol, name, sector
  ├─ last_price, price_updated_at, volume
  ├─ is_defaulter, is_sharia_compliant
  └─ (many) filings

filings
  ├─ id, company_id, quarter, filing_date
  ├─ pdf_url, status (pending/processing/done/failed)
  ├─ ai_analysis (JSONB - full AI response)
  ├─ eps, revenue, net_profit, shares_outstanding
  └─ (one) score

scores
  ├─ id, filing_id
  ├─ score (0-100)
  ├─ flags (array: HIGH_PROFIT_GROWTH, etc.)
  └─ price_at_filing

projections
  ├─ id, company_id, filing_id
  ├─ status (pending/processing/done/failed)
  └─ result (JSONB - projection data)

macro_risks
  ├─ id, company_id
  ├─ adjustment (-30 to +30)
  └─ reasoning (text)

news_articles
  ├─ id, headline, url, source
  ├─ sentiment, impact, category
  ├─ mentioned_symbols (array)
  └─ ai_summary
```

#### 5. **Data Aggregation & Analytics**

**Complex Queries**:
```php
// Sector trends - 365 days of cumulative performance
public function sectorTrends() {
    // Groups by sector → date
    // Accumulates scores and macro risks
    // Returns time-series data for charts
}

// P/E ratio filtering
// Joins companies with latest filings
// Calculates P/E = last_price / eps
// Filters by range
```

#### 6. **External Integrations**

**PSX Website Scraping**:
- Scrapes `https://dps.psx.com.pk/announcements`
- POST request with date range
- Parses HTML table → extracts PDF URLs
- Filters for "Transmission" filings only

**Price Fetching**:
- Scrapes `https://dps.psx.com.pk/company/{symbol}`
- Regex to extract current price
- Updates `companies.last_price`

#### 7. **Queue Configuration**
```php
// Queue priority: rescan > default
Workers: 4 instances
Timeout: 300 seconds per job
Retries: 3 attempts
Sleep: 3 seconds between jobs
```

### What Laravel Does NOT Do
❌ PDF text extraction  
❌ AI/ML inference  
❌ LLM calls  
❌ Complex NLP  
❌ Chart rendering  

---

## 🤖 LAYER 3: AI Engine (FastAPI + Python)

**Location**: `/ai-engine`  
**Technology**: FastAPI, Gradient SDK, DuckDuckGo Search, PDFPlumber  
**Port**: 8003  
**Model**: DeepSeek-4-Flash (via DigitalOcean Gradient)

### Primary Responsibilities

#### 1. **API Endpoints**

Total endpoints: **10**

| Endpoint | Purpose | Model Used |
|----------|---------|------------|
| **POST** `/analyze` | Extract financials + score filing | DeepSeek-4-Flash |
| **POST** `/project` | Basic financial projection | DeepSeek-4-Flash |
| **POST** `/project-agentic` | Advanced multi-agent projection | DeepSeek-4-Flash |
| **POST** `/assess-macro-risk` | Macro-economic risk analysis | DeepSeek-4-Flash |
| **POST** `/detect-volume-spike` | Identify unusual trading activity | DeepSeek-4-Flash |
| **POST** `/explain-movement` | Explain price changes | DeepSeek-4-Flash |
| **POST** `/analyze-news` | Sentiment analysis on news | DeepSeek-4-Flash |
| **POST** `/generate-market-briefing` | Market summary generation | DeepSeek-4-Flash |
| **POST** `/chat` | Conversational AI about stocks | DeepSeek-4-Flash |
| **GET** `/health` | Service health check | N/A |

#### 2. **PDF Processing**

```python
# Download PDF from PSX
async def download_pdf(url: str) -> str:
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.get(url)
        # Save to temp file
        return temp_path

# Extract text
def extract_text(pdf_path: str, max_pages=20) -> str:
    with pdfplumber.open(pdf_path) as pdf:
        text = ""
        for page in pdf.pages[:max_pages]:
            text += page.extract_text() or ""
    return text
```

**PDF Processing Flow**:
1. Receive PDF URL from Laravel
2. Download PDF to temp file (60s timeout)
3. Extract text from first 20 pages (Director's Report section)
4. Clean and normalize text
5. Send to LLM for analysis
6. Delete temp file

#### 3. **Core Analysis Endpoint: `/analyze`**

**Input**:
```json
{
  "filing_id": 14918,
  "pdf_url": "https://dps.psx.com.pk/...",
  "company": "Sitara Chemicals",
  "symbol": "SSOM",
  "quarter": "Q1-2026"
}
```

**Processing**:
1. Download & extract PDF text
2. Send to LLM with structured prompt
3. Parse JSON response with:
   - Financials (EPS, revenue, net profit, shares)
   - Signals (growth %, margins, tone)
   - Score (0-100)
   - Flags (HIGH_PROFIT_GROWTH, etc.)
   - Summary (plain English)

**Output**:
```json
{
  "company": "Sitara Chemicals",
  "quarter": "Q1-2026",
  "financials": {
    "eps": 24.5,
    "revenue": 15000000000,
    "net_profit": 2000000000,
    "shares_outstanding": 81632653
  },
  "signals": {
    "revenue_growth_pct": 35.2,
    "profit_growth_pct": 42.1,
    "gross_margin_direction": "up",
    "management_tone": "positive"
  },
  "score": 95,
  "flags": ["HIGH_PROFIT_GROWTH", "HIGH_REVENUE_GROWTH"],
  "summary": "Strong quarter with revenue up 35% and profit up 42%..."
}
```

**Scoring Algorithm** (in prompt):
```
Base: 50 (for profitable companies)

Upward adjustments:
+ Profit growth > 50%: +30
+ Profit growth 20-50%: +20
+ Revenue growth > 40%: +15
+ Export expansion: +10
+ New projects: +10
+ Margin improvement: +10

Downward adjustments:
- Net loss: -30
- Defaulter risk: -30
- Margin decline: -10
- Large FX loss: -5

Range: 0-100
```

#### 4. **Agentic Projection System**

**Endpoint**: `/project-agentic`

**Multi-Agent Architecture**:
```python
class ProjectionAgentGradient:
    def project(self, context, news):
        # Agent 1: Fundamental Analyst
        fundamental = self._analyze_fundamentals(context)
        
        # Agent 2: Technical Analyst  
        technical = self._analyze_technical(context)
        
        # Agent 3: News Analyst
        news_impact = self._analyze_news(news)
        
        # Agent 4: Macro Analyst
        macro = self._analyze_macro(context)
        
        # Agent 5: Synthesizer
        projection = self._synthesize(
            fundamental, technical, 
            news_impact, macro
        )
        
        return projection
```

**Output**:
- Revenue projection (3-6 months)
- Profit projection
- Price target (low/base/high)
- Recommendation (Strong Buy → Strong Sell)
- Risk factors
- Catalysts & concerns

#### 5. **News Analysis**

**Endpoint**: `/analyze-news`

**Web Search Integration**:
```python
from ddgs import DDGS

def search_news(symbol: str) -> list:
    ddg = DDGS()
    results = ddg.news(
        f"{symbol} Pakistan Stock Exchange",
        max_results=20
    )
    return results
```

**Processing**:
1. Search DuckDuckGo for "{symbol} PSX" news
2. Collect up to 20 recent articles
3. Send to LLM for batch analysis
4. Extract:
   - Sentiment (positive/neutral/negative)
   - Impact (high/medium/low)
   - Category (earnings/regulatory/sector/etc.)
   - AI summary (2-3 sentences)

#### 6. **Macro Risk Assessment**

**Endpoint**: `/assess-macro-risk`

**Analysis Factors**:
- Exchange rate exposure (USD/PKR volatility)
- Interest rate sensitivity
- Commodity price risk
- Regulatory environment
- Sector-specific headwinds

**Output**:
```json
{
  "adjustment": -5,  // -30 to +30
  "reasoning": "Currency depreciation impacts import costs..."
}
```

#### 7. **Volume Spike Detection**

**Endpoint**: `/detect-volume-spike`

**Logic**:
```python
# Compare recent volume to historical average
avg_volume = historical_avg(30_days)
current_volume = today_volume

if current_volume > avg_volume * 3:
    spike_detected = True
    # LLM explains possible reasons
```

#### 8. **Market Briefing Generation**

**Endpoint**: `/generate-market-briefing`

**Process**:
1. Receives top news from Laravel
2. Sends to LLM with prompt:
   - "Summarize market sentiment"
   - "Identify key themes"
   - "Highlight notable movers"
3. Returns:
   - Briefing text (150-200 words)
   - Top themes (list)
   - Generated timestamp

#### 9. **Chat Interface**

**Endpoint**: `/chat`

**Conversational AI**:
- Receives user question + company context
- Sends to LLM with full context
- Returns natural language answer
- Can reference:
  - Latest financials
  - AI scores
  - News sentiment
  - Price history

#### 10. **Model Configuration**

**Current Setup**:
```python
GRADIENT_TOKEN = os.getenv("GRADIENT_ACCESS_TOKEN")
MODEL_ID = "deepseek-4-flash"

gradient = Gradient(
    model_access_key=GRADIENT_TOKEN,
    timeout=120.0
)
```

**Model Selection**:
- **DeepSeek-4-Flash**: Fast, cost-effective
- Good for structured output
- 120s timeout per request
- Handles JSON formatting well

### What AI Engine Does NOT Do
❌ Database access  
❌ User authentication  
❌ File storage/management  
❌ Job queue management  
❌ HTTP session handling  

---

## 🔄 Data Flow Examples

### Example 1: User Rescans a Company

```
USER CLICKS "Rescan" on frontend
  ↓
FRONTEND: POST /companies/634/rescan
  ↓
LARAVEL API:
  ├─ Update company price from PSX
  ├─ Find latest filing
  ├─ Set status = 'pending'
  ├─ Dispatch AnalyzeFilingJob to queue
  └─ Return 202 Accepted
  ↓
QUEUE WORKER picks up AnalyzeFilingJob
  ↓
LARAVEL → AI ENGINE: POST /analyze
  {
    "filing_id": 14918,
    "pdf_url": "https://...",
    "company": "SSOM",
    "symbol": "SSOM",
    "quarter": "Q1-2026"
  }
  ↓
AI ENGINE:
  ├─ Download PDF
  ├─ Extract text (first 20 pages)
  ├─ Send to DeepSeek-4-Flash
  ├─ Parse LLM JSON response
  └─ Return structured analysis
  ↓
LARAVEL:
  ├─ Save to filing.ai_analysis
  ├─ Extract eps, revenue, net_profit
  ├─ Create/update Score record
  ├─ Set status = 'done'
  ├─ Dispatch GenerateProjectionJob
  └─ Dispatch 5 parallel jobs
  ↓
QUEUE processes remaining jobs:
  ├─ GenerateProjectionJob → AI /project-agentic
  ├─ AssessMacroRiskJob → AI /assess-macro-risk
  ├─ DetectVolumeSpikeJob → AI /detect-volume-spike
  ├─ ExplainMovementJob → AI /explain-movement
  └─ ScrapeNewsJob → AI /analyze-news
  ↓
FRONTEND:
  ├─ React Query auto-refetches /companies/634
  ├─ Sees status = 'done'
  ├─ Displays new score, projection, analysis
  └─ Updates charts
```

### Example 2: User Views Dashboard

```
USER visits /
  ↓
FRONTEND: GET /companies?page=1&sort=score
  ↓
LARAVEL API:
  ├─ Query companies with latest filings
  ├─ Join with scores table
  ├─ Order by score DESC
  ├─ Paginate (10 per page)
  └─ Return JSON
  ↓
FRONTEND:
  ├─ React Query caches response
  ├─ Renders company cards
  ├─ Shows scores with color coding
  └─ Displays flags as badges
```

### Example 3: Bulk Scan for a Month

```
USER clicks "Scan December 2025"
  ↓
FRONTEND: POST /scan { month: "2025-12" }
  ↓
LARAVEL API:
  ├─ Dispatch ScanMonthJob
  └─ Return 202 Accepted
  ↓
QUEUE WORKER picks up ScanMonthJob
  ↓
LARAVEL:
  ├─ Call PsxScraperService
  ├─ Scrape PSX announcements for 2025-12
  ├─ Parse HTML → extract filing URLs
  ├─ Filter "Transmission" filings
  ├─ Create/update Filing records
  ├─ Dispatch AnalyzeFilingJob for each
  └─ Cache progress in Redis
  ↓
MULTIPLE QUEUE WORKERS:
  ├─ Pick up AnalyzeFilingJobs
  ├─ Each calls AI Engine /analyze
  └─ Process 4 filings in parallel
  ↓
AI ENGINE:
  ├─ Downloads 4 PDFs concurrently
  ├─ Processes each with LLM
  └─ Returns 4 analyses
  ↓
LARAVEL:
  ├─ Saves all analyses
  ├─ Updates progress counter
  └─ Dispatches projection jobs
  ↓
FRONTEND:
  ├─ Polls /scan/progress every 3 seconds
  ├─ Shows progress bar
  ├─ Displays completed count
  └─ Updates when all done
```

---

## 🎯 Separation of Concerns

### ✅ Proper Boundaries

| Concern | Owned By |
|---------|----------|
| UI/UX | Frontend |
| User Input Validation | Frontend + Laravel |
| Authentication | Laravel (Sanctum) |
| Authorization | Laravel (Middleware) |
| Business Logic | Laravel (Controllers + Services) |
| Data Persistence | Laravel (Models + Eloquent) |
| Job Orchestration | Laravel (Queue System) |
| External APIs | Laravel (Services) |
| PDF Processing | AI Engine |
| LLM Inference | AI Engine |
| Text Analysis | AI Engine |
| Scoring Algorithms | AI Engine (in prompts) |

### ❌ Anti-Patterns Avoided

- ✅ Frontend does not directly call AI Engine
- ✅ AI Engine does not access database
- ✅ AI Engine does not handle auth
- ✅ Laravel does not do PDF parsing
- ✅ Laravel does not do ML/AI

---

## 🔐 Security Layers

### Frontend
- HTTPS only (production)
- Token stored in localStorage
- Auto-logout on 401
- CORS handled by Laravel

### Laravel
- Sanctum Bearer token auth
- SQL injection protection (Eloquent)
- XSS protection (auto-escaping)
- CSRF protection
- Rate limiting
- Input validation

### AI Engine
- No direct internet exposure
- Only accessible from Laravel (internal network)
- Input validation on all endpoints
- File cleanup (temp PDFs deleted)

---

## 📈 Performance Characteristics

### Frontend
- Initial load: ~2s
- Page transitions: Instant (client-side routing)
- Data refetch: Cached (React Query)
- Chart rendering: Lazy-loaded on scroll

### Laravel
- API response time: 50-200ms (cached)
- Database queries: Optimized with joins
- Queue throughput: ~4 jobs/minute (AI-bound)
- Concurrent requests: 100+ (php-fpm)

### AI Engine
- PDF download: 2-10s (PSX website speed)
- Text extraction: 1-3s
- LLM inference: 5-30s (depends on model)
- Total per filing: 10-45s

---

## 📊 Database Statistics

```sql
-- Current data (as of implementation)
Companies: 718
Filings: ~15,000
Scores: ~15,000
Projections: ~1,000
News Articles: ~5,000
Users: 1 (demo)
```

---

## 🚀 Deployment Topology

### Development (Current)
```
localhost:3000 → Frontend
localhost:8000 → Laravel API + Queue Workers (4)
localhost:8003 → AI Engine
localhost:5432 → PostgreSQL
```

### Production (Recommended)
```
Vercel/Netlify → Frontend (CDN)
DigitalOcean/AWS → Laravel API (Load Balanced)
DigitalOcean/AWS → Queue Workers (Auto-scaling)
DigitalOcean/AWS → AI Engine (GPU instance)
AWS RDS → PostgreSQL (Multi-AZ)
Redis → Queue + Cache
```

---

## 📝 Technology Stack Summary

| Layer | Languages | Frameworks | Key Libraries |
|-------|-----------|------------|---------------|
| **Frontend** | TypeScript | Next.js 16, React 19 | TanStack Query, Recharts, Axios, Tailwind |
| **API** | PHP 8.3+ | Laravel 11 | Eloquent, Sanctum, Queue, HTTP Client |
| **AI Engine** | Python 3.14 | FastAPI | Gradient SDK, PDFPlumber, HTTPX, DuckDuckGo |
| **Database** | SQL | PostgreSQL | - |
| **Cache/Queue** | - | Redis | - |
| **Process Manager** | - | PM2 | - |

---

## 🔄 Future Enhancements (Recommendations)

### Frontend
- [ ] Add real-time WebSocket for live updates
- [ ] Implement service worker for offline support
- [ ] Add progressive image loading

### Laravel
- [ ] Implement horizontal scaling (multiple API servers)
- [ ] Add Redis caching for expensive queries
- [ ] Implement rate limiting per user
- [ ] Add webhook support for external integrations

### AI Engine
- [ ] Add model fine-tuning on PSX-specific data
- [ ] Implement response streaming for chat
- [ ] Add batch processing endpoint
- [ ] Cache LLM responses for identical filings

---

**Last Updated**: $(date)  
**Total Lines of Code**: ~15,000  
**Active Services**: 8 (1 frontend + 1 api + 4 queue workers + 1 scheduler + 1 ai-engine)
