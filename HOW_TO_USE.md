# How to Use PSX StockAnalyzer

## Quick Start Guide

### Step 1: Login First! 🔐

**IMPORTANT:** You must be logged in to see any data.

1. Go to http://localhost:3000/login
2. Enter credentials:
   - Email: `demo@stockanalyzer.com`
   - Password: `demo123`
3. Click "Sign in"

**If login button does nothing:**
- Press F12 (open browser console)
- Look for red errors
- See [LOGIN_TROUBLESHOOTING.md](LOGIN_TROUBLESHOOTING.md)

---

### Step 2: View Dashboard 📊

After logging in, you'll be redirected to http://localhost:3000

**What you should see:**
- ✅ 2 companies with high scores (MARI: 85, OGDC: 78)
- ✅ Green badges showing flags (HIGH_PROFIT_GROWTH, EXPORT_EXPANSION, etc.)
- ✅ Summary text explaining the opportunity

**If dashboard is empty:**
- Check browser console (F12) for errors
- Make sure you're logged in (navbar shows "Logout" button)
- Try refreshing the page

---

### Step 3: Browse All Companies 🏢

Click "Companies" in the navbar → http://localhost:3000/companies

**What you should see:**
- ✅ 5 companies total (MARI, OGDC, PSO, LUCK, HBL)
- ✅ Companies with filings show scores
- ✅ Companies without filings show no score

**If you see "no data":**
- Make sure you're logged in
- Check browser Network tab (F12 → Network)
- Look for request to `http://localhost:8000/api/companies`
- If it shows 401 Unauthorized → login expired, login again

---

### Step 4: View Company Details 🔍

Click on any company name (e.g., "Mari Petroleum")

**What you should see:**
- ✅ Company info (sector, price, exchange type)
- ✅ Tabs for each quarter (Q3-FY2024)
- ✅ AI Summary card with explanation
- ✅ Key Signals breakdown (revenue growth, profit growth, etc.)
- ✅ Flags (HIGH_PROFIT_GROWTH, EXPORT_EXPANSION, etc.)
- ✅ Score out of 100
- ✅ Link to PDF filing
- ✅ "Add to Watchlist" button

---

### Step 5: Use Watchlist ⭐

1. On any company detail page, click "Add to Watchlist"
2. Go to "Watchlist" in navbar → http://localhost:3000/watchlist
3. See all your tracked companies
4. Click "Remove" to untrack

**Use case:** Track companies across quarters to see if signals improve

---

### Step 6: Run a Scan 🔍

Go to "Scan" in navbar → http://localhost:3000/scan

1. Pick a month (e.g., `2024-04`)
2. Click "Run Scan"
3. Wait for results

**How to know if scan is done:**

#### Option A: Check the Scan Page
- Status badges will show:
  - 🟡 `pending` → Not analyzed yet
  - 🟠 `processing` → AI is analyzing
  - 🟢 `done` → Analysis complete
  - 🔴 `failed` → Error occurred
- Click "Refresh Results" to update the list

#### Option B: Check Laravel Queue
```bash
# In terminal
cd api
php artisan queue:work
# Watch the output for "Processing: App\Jobs\AnalyzeFilingJob"
```

#### Option C: Check Database
```bash
cd api
php artisan tinker --execute='
echo "Total filings: " . \App\Models\Filing::count() . "\n";
echo "Done: " . \App\Models\Filing::where("status", "done")->count() . "\n";
echo "Processing: " . \App\Models\Filing::where("status", "processing")->count() . "\n";
echo "Pending: " . \App\Models\Filing::where("status", "pending")->count() . "\n";
'
```

**⚠️ Important:**
- Scan will **fail** without a queue worker running
- PSX scraper may **fail** if website structure changed
- AI analysis **requires** Gradient token in `ai-engine/.env`

---

## Troubleshooting: "I don't see companies"

### Check 1: Are you logged in?
- Look at navbar → should show "Logout" button
- If it shows "Login" → you're not logged in
- Login at http://localhost:3000/login

### Check 2: Is the API running?
```bash
curl http://localhost:8000/api/companies
# Should return: {"message":"Unauthenticated."}
# If connection refused → API is down
```

### Check 3: Check browser console
1. Press F12
2. Go to "Console" tab
3. Look for red errors
4. Common issues:
   - `401 Unauthorized` → Login expired, login again
   - `Network error` → API is down
   - `CORS error` → API CORS misconfigured

### Check 4: Check Network tab
1. Press F12 → Network tab
2. Try loading http://localhost:3000/companies
3. Look for request to `http://localhost:8000/api/companies`
4. Click on it to see:
   - Status code (should be 200)
   - Response (should be JSON with company data)

### Check 5: Verify data exists
```bash
cd api
php artisan tinker --execute='echo \App\Models\Company::count();'
# Should print: 5
```

If count is 0, run:
```bash
cd api
php artisan migrate:fresh
php artisan tinker --execute='
// Re-create sample data - see api/database/seeders if you want a proper seeder
'
```

---

## Scan Status Indicators

### In the UI (Scan Page)

| Badge | Meaning | What to Do |
|---|---|---|
| 🟡 `pending` | Not started yet | Wait for queue worker to pick it up |
| 🟠 `processing` | AI is analyzing | Wait a few minutes |
| 🟢 `done` | Complete! | View results on dashboard |
| 🔴 `failed` | Error occurred | Check logs, may need Gradient token |

### How Long Does a Scan Take?

- **Scraping PSX:** 1-2 minutes per 100 filings
- **AI Analysis:** 30-60 seconds per filing (depends on PDF size)
- **Total for 50 filings:** ~30-50 minutes

**To speed up:** Run multiple queue workers in parallel:
```bash
# Terminal 1
php artisan queue:work

# Terminal 2
php artisan queue:work

# Terminal 3
php artisan queue:work
```

---

## What Each Page Should Show

### Dashboard (http://localhost:3000)
- ✅ Top opportunities (score ≥60)
- ✅ 2 cards: MARI (85) and OGDC (78)
- ✅ Click company name to view details

### Companies (http://localhost:3000/companies)
- ✅ All 5 companies in grid
- ✅ MARI and OGDC show scores
- ✅ PSO, LUCK, HBL show no score (no filings yet)

### Company Detail (http://localhost:3000/companies/1)
- ✅ Company header with sector, price
- ✅ Tabs for each quarter
- ✅ AI summary, signals, flags, score

### Watchlist (http://localhost:3000/watchlist)
- ✅ Empty initially
- ✅ Add companies from detail page
- ✅ Shows latest quarter summary

### Scan (http://localhost:3000/scan)
- ✅ Month picker
- ✅ "Run Scan" button
- ✅ Results table with status badges
- ✅ "Refresh Results" button

---

## Expected vs Actual

### ✅ What Should Work Now
- Login/Register
- View 5 companies
- View 2 filings with scores
- Add to watchlist
- Volume spike detection API

### ⚠️ What Needs Setup
- PSX scraper (may need XPath updates)
- AI PDF analysis (needs Gradient token)
- Queue worker (must run manually)
- News analysis (needs Gradient token)

### ❌ What's Not Built Yet
- Daily price tracking
- News scraping
- Real-time alerts
- AI chat
- Sector heatmap

---

## Quick Commands Reference

```bash
# Check if services are running
ps aux | grep -E "(artisan serve|next dev|uvicorn)"

# Check database
cd api && php artisan tinker --execute='
echo "Companies: " . \App\Models\Company::count() . "\n";
echo "Filings: " . \App\Models\Filing::count() . "\n";
'

# Start queue worker
cd api && php artisan queue:work

# Get a fresh auth token
curl -X POST http://localhost:8000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@stockanalyzer.com","password":"demo123"}' \
  | jq -r '.token'

# Test API with token
curl http://localhost:8000/api/companies \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## Still Having Issues?

1. **Read the troubleshooting guides:**
   - [LOGIN_TROUBLESHOOTING.md](LOGIN_TROUBLESHOOTING.md)
   - [STATUS.md](STATUS.md)

2. **Check all services are running:**
   ```bash
   curl http://localhost:3000  # Frontend
   curl http://localhost:8000  # API
   curl http://localhost:8001/health  # AI Engine
   ```

3. **Restart everything:**
   ```bash
   pkill -f "artisan serve"
   pkill -f "next dev"
   pkill -f "uvicorn"
   
   cd api && php artisan serve --port=8000 &
   cd ../frontend && npm run dev &
   cd ../ai-engine && source venv/bin/activate && uvicorn main:app --port=8001 &
   ```

4. **Clear browser cache:**
   - Press Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
   - Or use incognito/private window

---

## Success Checklist

- [ ] Logged in successfully
- [ ] Dashboard shows 2 companies (MARI, OGDC)
- [ ] Companies page shows 5 companies
- [ ] Can click MARI → see detailed signals
- [ ] Can add MARI to watchlist
- [ ] Watchlist shows 1 item
- [ ] Scan page loads
- [ ] AI endpoints tested via `./test_ai_demo.sh`

If all checked ✅ — **app is working!**
