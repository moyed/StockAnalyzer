# PSX StockAnalyzer

AI-powered Pakistan Stock Exchange analyzer that surfaces hidden investment opportunities from quarterly filings.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│  Next.js    │────▶│  Laravel    │────▶│  Python AI   │
│  Frontend   │◀────│  API        │◀────│  Engine      │
└─────────────┘     └─────────────┘     └──────────────┘
                           │                    │
                    ┌──────┴──────┐      ┌──────┴──────┐
                    │  PostgreSQL │      │ DO Gradient │
                    │  + Redis    │      │  (LLM)      │
                    └─────────────┘      └─────────────┘
```

## Features

- ✅ **Quarterly Filing Analysis** — Scrapes PSX transmission filings, extracts director reports
- ✅ **AI Scoring** — Uses DigitalOcean Gradient LLM to score companies 0-100 based on signals
- ✅ **Smart Flags** — Detects high profit growth, export expansion, new projects, margin changes
- ✅ **Watchlist** — Track companies across quarters
- ✅ **Auth** — Laravel Sanctum token-based authentication
- ⚠️ **Daily Price Data** — Not yet implemented (roadmap Phase 1)
- ⚠️ **News Ingestion** — Not yet implemented (roadmap Phase 2)

## Quick Start

### Prerequisites
- PHP 8.3+
- Node 20+
- Python 3.12+
- Composer, npm, pip3
- (Optional) Docker for PostgreSQL/Redis

### Local Development (without Docker)

```bash
# 1. Clone and setup
git clone https://github.com/moyed/StockAnalyzer.git
cd StockAnalyzer
cp .env.example .env

# 2. Setup Laravel API
cd api
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate
php artisan serve --port=8000 &

# 3. Setup Python AI Engine
cd ../ai-engine
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Add your GRADIENT_ACCESS_TOKEN to .env
uvicorn main:app --host 0.0.0.0 --port 8001 &

# 4. Setup Next.js Frontend
cd ../frontend
npm install
npm run dev &

# 5. Open http://localhost:3000
```

### With Docker Compose

```bash
cp .env.example .env
# Add GRADIENT_ACCESS_TOKEN to .env
docker compose up
```

## Usage

### 1. Register an account
Go to http://localhost:3000/register

### 2. Run a scan
- Navigate to `/scan`
- Pick a month (e.g., `2024-04`)
- Click "Run Scan"
- The scraper will fetch all PSX transmission filings for that month
- Each filing gets queued for AI analysis

### 3. View top opportunities
- Dashboard shows companies scored >60/100
- Click any company to see detailed signals

### 4. Add to watchlist
- Click "Add to Watchlist" on company detail page
- View all watched companies at `/watchlist`

## Project Structure

```
StockAnalyzer/
├── api/                    # Laravel 11 backend
│   ├── app/
│   │   ├── Http/Controllers/Api/  # AuthController, CompanyController, etc.
│   │   ├── Jobs/           # ScanMonthJob, AnalyzeFilingJob
│   │   ├── Models/         # Company, Filing, Score, Watchlist
│   │   └── Services/       # PsxScraperService, AiAnalysisService
│   ├── database/migrations/
│   └── routes/api.php
│
├── ai-engine/              # Python FastAPI
│   ├── main.py             # /analyze endpoint
│   └── requirements.txt
│
├── frontend/               # Next.js 16
│   ├── src/app/            # Dashboard, Scan, Companies, Watchlist
│   ├── src/components/     # Navbar, Providers, shadcn/ui
│   └── src/lib/            # api.ts, auth.ts
│
└── docker-compose.yml
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/register` | Create account |
| POST | `/api/login` | Get auth token |
| GET | `/api/companies` | List all companies |
| GET | `/api/companies/{id}` | Company detail + filings |
| GET | `/api/filings?month=2024-04` | Filings for a month |
| POST | `/api/scan` | Trigger scraper for a month |
| GET | `/api/watchlist` | User's watchlist |
| POST | `/api/watchlist` | Add company to watchlist |

## AI Analysis Output

```json
{
  "company": "Interloop Ltd",
  "quarter": "Q3-FY2024",
  "signals": {
    "revenue_growth_pct": 84,
    "profit_growth_pct": 210,
    "exports_milestone": "Entered US and European markets",
    "new_projects": "Hydroponic crop — first harvest July",
    "margin_direction": "down",
    "margin_reason": "PKR appreciation, exchange loss of 773M"
  },
  "score": 87,
  "flags": ["HIGH_PROFIT_GROWTH", "EXPORT_EXPANSION"],
  "summary": "Strong quarter with profit doubling despite margin pressure from currency headwinds."
}
```

## Scoring Logic

```
Score (0-100):
- Profit growth >50%: +30
- Revenue growth >40%: +20
- Export expansion: +20
- New project / capacity: +15
- Margin improvement: +10
- Defaulter risk: -25
- Exchange loss: -5
```

## Daily Cron

The Laravel scheduler runs daily at 6AM PKT (1AM UTC):

```php
Schedule::command('psx:sync')->dailyAt('01:00');
```

This fetches the latest PSX transmission filings and queues them for analysis.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the 7-week plan to add:
- Daily price/volume data
- News ingestion + sentiment analysis
- AI market summaries
- Enhanced scoring model
- Alerts & notifications
- AI chat interface
- Sector heatmap

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, Tailwind CSS, shadcn/ui, Recharts |
| Backend | Laravel 11, Sanctum |
| AI | Python FastAPI, DigitalOcean Gradient SDK |
| Database | PostgreSQL (production), SQLite (dev) |
| Queue | Redis |
| Scraping | PSX website (dps.psx.com.pk) |
| PDF Parsing | pdfplumber |

## Environment Variables

### Root `.env`
```env
GRADIENT_ACCESS_TOKEN=your_do_gradient_token
GRADIENT_MODEL_ID=llama3-8b-chat
```

### `api/.env`
```env
DB_CONNECTION=pgsql
DB_HOST=db
DB_DATABASE=stockanalyzer
DB_USERNAME=stockuser
DB_PASSWORD=stockpass
REDIS_HOST=redis
QUEUE_CONNECTION=redis
AI_ENGINE_URL=http://ai-engine:8001
```

### `frontend/.env.local`
```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

## Troubleshooting

### "Route [login] not defined"
Add this to `api/routes/web.php`:
```php
Route::get('/login', fn() => response()->json(['message' => 'Use /api/login']))->name('login');
```

### "Call to undefined method User::createToken()"
Add `HasApiTokens` trait to User model:
```php
use Laravel\Sanctum\HasApiTokens;
class User extends Authenticatable {
    use HasApiTokens;
}
```

### AI analysis fails
Check that `GRADIENT_ACCESS_TOKEN` is set in `ai-engine/.env`. Test with:
```bash
curl http://localhost:8001/health
# Should return: {"status":"ok"}
```

### PSX scraper returns empty results
The PSX website structure may have changed. Check `api/app/Services/PsxScraperService.php` and update the XPath selectors.

## Contributing

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Run tests: `php artisan test` (when tests are added)
5. Submit a PR

## License

MIT

## Credits

Built with assistance from Claude Sonnet 4.6
