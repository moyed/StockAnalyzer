# Health Monitoring & Dashboard Guide

## What Was Created

### 1. **CLI Monitoring Command** 📊
Real-time terminal dashboard that auto-refreshes to show system health.

**Usage:**
```bash
cd api
php artisan system:monitor           # Default: refresh every 5 seconds
php artisan system:monitor --refresh=2  # Custom refresh interval
```

**Shows:**
- 📊 Filing status (processing, pending, done, failed)
- 📋 Queue stats (jobs queued, failed jobs)
- 👷 Worker count and status
- 🤖 AI engine health and model info
- ⚡ Processing rate and ETA

**Screenshot:**
```
╔════════════════════════════════════════════════════════════╗
║         StockAnalyzer System Monitor                      ║
║         2026-06-21 19:30:45                               ║
╚════════════════════════════════════════════════════════════╝

📊 FILING STATUS
  Processing: 3 | Pending: 209 | Done: 2711 | Failed: 146
  Total: 3177 | Rate: ~0.4 filings/min
  ETA: ~523 minutes for pending filings

📋 QUEUE STATUS
  Jobs queued: 1558 (default: 147, rescan: 1411)
  Failed jobs: 20

👷 QUEUE WORKERS
  Active workers: 14

🤖 AI ENGINE
  Processes: 1
  Status: ok
  Model: deepseek-4-flash

Press Ctrl+C to exit | Refreshing every 5 seconds...
```

---

### 2. **Health API Endpoint** 🔌
Comprehensive JSON API for programmatic health checks.

**Endpoint:** `GET /api/health`

**Response Schema:**
```json
{
  "timestamp": "2026-06-21T19:30:45+05:00",
  "filings": {
    "processing": 3,
    "pending": 209,
    "done": 2711,
    "failed": 146,
    "total": 3177,
    "rate_per_minute": 0.4,
    "eta_minutes": 523,
    "percent_complete": 85.3
  },
  "queue": {
    "total_jobs": 1558,
    "default_queue": 147,
    "rescan_queue": 1411,
    "failed_jobs": 20,
    "status": "active"
  },
  "workers": {
    "count": 14,
    "status": "running",
    "healthy": true
  },
  "ai_engine": {
    "process_count": 1,
    "status": "ok",
    "healthy": true,
    "model": "deepseek-4-flash",
    "features": {...},
    "response_time_ms": 125.5
  },
  "database": {
    "status": "connected",
    "healthy": true,
    "response_time_ms": 2.3,
    "driver": "mysql"
  },
  "system": {
    "php_version": "8.3.0",
    "laravel_version": "11.x",
    "environment": "local",
    "load_average": 2.5,
    "timezone": "UTC"
  }
}
```

**Test it:**
```bash
curl http://localhost:3001/api/health | jq '.'
```

---

### 3. **Web Dashboard** 🌐
Beautiful visual dashboard accessible from the UI.

**URL:** `http://localhost:3000/health`

**Features:**
- ✅ Real-time auto-refresh (every 5 seconds)
- 🎨 Color-coded health indicators
- 📊 Visual progress bars
- ⚡ Response time metrics
- 📈 Processing rate and ETA
- 🔴 Error state handling

**Dashboard Sections:**

1. **System Overview Cards**
   - Database (status, response time, driver)
   - Queue Workers (count, status)
   - AI Engine (processes, model, response time)
   - System (PHP, Laravel, load average)

2. **Filing Processing Panel**
   - Live counts (processing, pending, done, failed)
   - Progress bar with percentage
   - Processing rate (filings/minute)
   - Estimated time remaining

3. **Queue Details**
   - Total jobs
   - Jobs by queue (default, rescan)
   - Failed jobs count

**Access:** Click "Health" in the navigation bar

---

## Quick Start

### Start Monitoring (CLI)
```bash
cd /Users/ansari/Projects/AI\ Projects/StockAnalyzer/api
php artisan system:monitor
```

### View Dashboard (Web)
1. Ensure the frontend is running: `cd frontend && npm run dev`
2. Visit: http://localhost:3000/health
3. Dashboard auto-refreshes every 5 seconds

### Check API Health
```bash
# Simple status check
curl http://localhost:3001/api/health | jq '.filings.processing'

# Full health data
curl http://localhost:3001/api/health | jq '.'
```

---

## Interpreting Health Status

### 🟢 Healthy System
- Workers: ≥3 active
- AI Engine: Status "ok", process count >0
- Database: Connected, low response time (<50ms)
- Processing rate: >0 filings/minute

### 🟡 Degraded System
- Workers: 1-2 active (below recommended)
- AI Engine: High response time (>500ms)
- Queue: Many failed jobs (>50)

### 🔴 Unhealthy System
- Workers: 0 active (STOPPED)
- AI Engine: Unreachable or error status
- Database: Connection error
- Processing rate: 0 (nothing completing)

---

## Troubleshooting

### No Workers Showing
```bash
# Check if workers are running
ps aux | grep queue:work

# Start workers
cd api
for i in {1..10}; do
  php artisan queue:work --queue=default,rescan --sleep=1 --tries=3 --timeout=600 > /dev/null 2>&1 &
done
```

### AI Engine Unreachable
```bash
# Check if AI engine is running
ps aux | grep uvicorn | grep 8003

# Test directly
curl http://localhost:8003/health

# Restart if needed
cd ai-engine
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8003 &
```

### High Response Times
- AI Engine >1000ms → Gradient API might be slow
- Database >100ms → Check database connection/queries
- Queue growing → Need more workers

---

## Integration Examples

### Shell Script Monitoring
```bash
#!/bin/bash
# Monitor and alert if system unhealthy

HEALTH=$(curl -s http://localhost:3001/api/health)
WORKERS=$(echo $HEALTH | jq -r '.workers.count')

if [ "$WORKERS" -lt 3 ]; then
  echo "WARNING: Only $WORKERS workers running!"
  # Send alert, restart workers, etc.
fi
```

### Python Health Check
```python
import requests

response = requests.get('http://localhost:3001/api/health')
health = response.json()

if not health['workers']['healthy']:
    print(f"⚠️  Only {health['workers']['count']} workers running")

if health['filings']['pending'] > 0:
    eta = health['filings']['eta_minutes']
    print(f"⏱️  {health['filings']['pending']} filings pending, ETA: {eta} min")
```

---

## Files Created

```
api/
├── app/
│   ├── Console/Commands/
│   │   └── MonitorSystem.php          # CLI monitoring command
│   └── Http/Controllers/Api/
│       └── HealthController.php        # Health API endpoint
└── routes/
    └── api.php                         # Route: GET /api/health

frontend/
└── src/
    ├── app/
    │   └── health/
    │       └── page.tsx                # Health dashboard page
    └── components/
        └── Navbar.tsx                  # Added "Health" link
```

---

## Next Steps

1. **Monitor your system:**
   ```bash
   cd api && php artisan system:monitor
   ```

2. **View the dashboard:**
   - Open http://localhost:3000/health in your browser

3. **Set up alerts** (optional):
   - Use the health API to create custom monitoring scripts
   - Integrate with external monitoring tools (Datadog, New Relic, etc.)

---

**Pro Tips:**
- Keep the CLI monitor running in a terminal while processing large batches
- Bookmark the health dashboard for quick system checks
- Use the API endpoint for automated health checks in CI/CD pipelines
