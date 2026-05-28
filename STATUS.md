# PSX StockAnalyzer — Current Status

**Date:** 2026-05-28  
**Repository:** https://github.com/moyed/StockAnalyzer

---

## ✅ What's Running Locally

| Service | URL | Status |
|---|---|---|
| **Frontend** | http://localhost:3000 | ✅ Running |
| **API** | http://localhost:8000 | ✅ Running |
| **AI Engine** | http://localhost:8001 | ✅ Running |
| **Database** | SQLite (local) | ✅ Migrated |

---

## 🧪 Test Credentials

**Email:** `test@example.com`  
**Password:** `password123`

Or register a new account at: http://localhost:3000/register

---

## 📊 Current Data

- **Companies:** 0 (empty — needs PSX scraper)
- **Filings:** 0
- **Users:** 1 (test account)

---

## 🚀 What Works

1. ✅ User registration & login (Sanctum auth)
2. ✅ Dashboard (shows top opportunities — currently empty)
3. ✅ Scan page (UI ready — will trigger PSX scraper)
4. ✅ Companies list (empty until scraped)
5. ✅ Company detail page (ready to show signals)
6. ✅ Watchlist (add/remove companies)
7. ✅ AI Engine health endpoint (`/health` returns OK)

---

## ⚠️ What Needs Testing

1. **PSX Scraper** — Run `php artisan psx:sync --month=2024-04`
   - Depends on PSX website structure
   - May need XPath adjustments if HTML changed
   
2. **AI Analysis** — Requires `GRADIENT_ACCESS_TOKEN`
   - Add token to `ai-engine/.env`
   - Test with: `POST http://localhost:8001/analyze`

3. **Queue Worker** — Not running
   - Start with: `php artisan queue:work`
   - Processes `AnalyzeFilingJob` in background

---

## 🔧 Known Issues

1. **No daily price data** — Only tracks quarterly filings
   - See [ROADMAP.md](ROADMAP.md) Phase 1
   
2. **No news integration** — Can't explain "why stock moved today"
   - See [ROADMAP.md](ROADMAP.md) Phase 2

3. **PSX scraper not validated** — Website may have changed
   - Need to test with real PSX data

4. **No seed data** — Database is empty
   - Need to run actual scrape or create fixtures

---

## 🎯 Next Steps

### Option 1: Test with Real PSX Data
```bash
cd api
php artisan queue:work &
php artisan psx:sync --month=2024-04
# Wait for queue to process filings
# Refresh dashboard to see results
```

### Option 2: Build Daily Price Layer (Phase 1)
Follow [ROADMAP.md](ROADMAP.md) to add:
- Daily price scraper
- Top movers dashboard
- Volume spike detection

### Option 3: Create Demo Data
```php
// In tinker:
$company = Company::create([
    'symbol' => 'MARI',
    'name' => 'Mari Petroleum',
    'sector' => 'E&P',
    'exchange_type' => 'FY',
    'last_price' => 1850.00
]);

$filing = Filing::create([
    'company_id' => $company->id,
    'quarter' => 'Q3-FY2024',
    'filing_date' => '2024-04-15',
    'pdf_url' => 'https://example.com/mari-q3.pdf',
    'status' => 'done',
    'ai_analysis' => [
        'summary' => 'Strong quarter with profit growth of 45%',
        'signals' => [
            'profit_growth_pct' => 45,
            'revenue_growth_pct' => 30,
        ],
        'score' => 85,
        'flags' => ['HIGH_PROFIT_GROWTH']
    ]
]);

Score::create([
    'filing_id' => $filing->id,
    'score' => 85,
    'flags' => ['HIGH_PROFIT_GROWTH'],
    'price_at_filing' => 1750.00
]);
```

---

## 📝 How to Stop Services

```bash
# Stop Laravel
pkill -f "php artisan serve"

# Stop Next.js
pkill -f "next dev"

# Stop Python AI engine
pkill -f "uvicorn main:app"

# Or kill all:
pkill -f "artisan serve" && pkill -f "next dev" && pkill -f "uvicorn"
```

---

## 🐳 Docker Alternative

If you prefer Docker:

```bash
# Sign in to Docker Desktop first
docker compose up

# Access:
# Frontend: http://localhost:3000
# API: http://localhost:8000
# AI: http://localhost:8001
```

---

## 📚 Documentation

- [README.md](README.md) — Setup, usage, API docs
- [ROADMAP.md](ROADMAP.md) — 7-week plan to add daily features
- [Plan](/.claude/plans/synthetic-stargazing-pixel.md) — Original implementation plan

---

## 🤝 Support

GitHub Issues: https://github.com/moyed/StockAnalyzer/issues
