# StockAnalyzer Roadmap — Closing the Gap

## Current State
- ✅ Quarterly filings analyzed (director reports, AI scoring)
- ✅ Company tracking, watchlist, auth
- ❌ No daily price/volume data
- ❌ No news ingestion
- ❌ No "stocks moving today" feature

---

## Phase 1: Daily Price Data (Week 1)
**Goal:** Track daily price movements so we can show "top gainers/losers today"

### Tasks:
1. Add `daily_prices` table:
   ```sql
   - symbol
   - date
   - open, high, low, close
   - volume
   - change_pct
   ```
2. Build PSX market scraper (scrape EOD prices from `dps.psx.com.pk`)
3. Run daily at market close (5PM PKT)
4. Add API endpoint: `GET /api/market/movers?period=1d` (top gainers/losers)
5. Update frontend dashboard: replace "top quarterly filings" with "top movers today"

**Validation:** User can see which stocks moved >3% today.

---

## Phase 2: News Ingestion + Sentiment (Week 2)
**Goal:** Scrape business news and detect if a stock is mentioned positively/negatively

### Tasks:
1. Add `news_articles` table:
   ```sql
   - url, headline, source, published_at
   - body_text
   - mentioned_symbols (JSON array)
   - sentiment (positive/neutral/negative)
   ```
2. Build news scrapers:
   - Dawn.com business section
   - Express Tribune markets
   - PSX announcements RSS feed
3. Run sentiment analysis via Gradient SDK (classify as positive/neutral/negative)
4. Link news to companies (mention detection: regex for stock symbols in article text)
5. Add API: `GET /api/companies/{id}/news` (latest news for a company)
6. Update company detail page: show recent news + sentiment badges

**Validation:** User sees "MARI mentioned in 2 positive news articles today"

---

## Phase 3: AI Market Summary (Week 3)
**Goal:** Generate daily briefing: "What happened in PSX today?"

### Tasks:
1. Build daily summary job:
   - Top 5 gainers/losers
   - Sector performance
   - Major news headlines
   - Macro indicators (USD/PKR, oil price from external API)
2. Send to Gradient SDK with prompt:
   ```
   Summarize today's PSX market in 3-4 sentences.
   Top gainers: [...]
   Top losers: [...]
   News: [...]
   ```
3. Store result in `market_summaries` table
4. Add to dashboard: "Today's Market Brief" card at top
5. Add endpoint: `GET /api/market/briefing?date=2026-05-28`

**Validation:** User sees AI-written summary like:
> "Today PSX closed flat as E&P sector declined 2% on oil price weakness. Banks rallied 3% following SBP rate cut. MARI surged 8% on strong quarterly results."

---

## Phase 4: Enhanced Scoring Model (Week 4)
**Goal:** Score stocks based on **daily** signals, not just quarterly filings

### New Scoring Formula:
```
Daily Score (0-100):
- Price momentum (vs 30-day avg): 20 pts
- Volume spike (vs 30-day avg): 20 pts
- News sentiment (positive): 20 pts
- Quarterly filing signals (existing): 20 pts
- Sector trend alignment: 10 pts
- Macro tailwind (PKR depreciation for exporters): 10 pts
```

### Tasks:
1. Update `Score` model to include `daily_score` + `quarterly_score`
2. Build `DailyScoreJob` — runs every evening after market close
3. Calculate volume spike: current volume / 30-day avg volume
4. Calculate price momentum: (price - 30d avg) / 30d avg
5. Aggregate news sentiment: count positive mentions in last 7 days
6. Update dashboard: sort by `daily_score` instead of `quarterly_score`

**Validation:** User sees "OGDC score: 85/100 — volume spike + positive news + sector strength"

---

## Phase 5: Alerts & Notifications (Week 5)
**Goal:** Notify users when watchlist companies have unusual activity

### Tasks:
1. Add `alerts` table:
   ```sql
   - user_id, company_id
   - trigger (price_spike, volume_spike, news_mention, filing)
   - threshold (e.g., >5% move)
   - delivery (email, push, in-app)
   ```
2. Build alert engine: check conditions every hour
3. Integrate email (Laravel Mail) + push notifications (optional)
4. Add alerts UI: user can set rules like "notify me if MARI moves >5%"
5. Show in-app notifications badge in navbar

**Validation:** User receives email: "MEBL moved +7% today with high volume"

---

## Phase 6: AI Chat (Week 6)
**Goal:** Conversational AI that answers stock questions

### Tasks:
1. Add `POST /api/chat` endpoint
2. Prompt engineering:
   ```
   You are a PSX stock analyst. User asked: "Why is OGDC moving?"
   
   Context:
   - OGDC: +5% today, volume 2.5x avg
   - News: "Oil prices rise on OPEC cuts"
   - Sector: E&P up 3%
   
   Respond in 2-3 sentences.
   ```
3. Build chat UI component (chat bubbles)
4. Add to company detail page + dashboard
5. Support queries like:
   - "Why is [SYMBOL] moving?"
   - "Compare MEBL and BAFL"
   - "Show undervalued cement stocks"

**Validation:** User asks "Why is MARI moving?" and gets:
> "MARI is up 8% today following strong Q3 results (profit grew 45%). Volume is 3x normal, indicating high investor interest. The fertilizer sector is also up 2% as crop season approaches."

---

## Phase 7: Sector Heatmap + Macro Indicators (Week 7)
**Goal:** Visualize sector performance + track USD/PKR, oil, interest rates

### Tasks:
1. Build sector performance calculator:
   - Average daily % change per sector
   - Store in `sector_performance` table
2. Add heatmap component (Recharts treemap)
3. Integrate macro data sources:
   - USD/PKR: SBP exchange rate API
   - Oil: Brent crude from external API
   - Interest rate: SBP policy rate (manual update)
4. Show macro indicators on dashboard sidebar
5. AI uses macro context: "PKR depreciated 2% → textile exporters likely to benefit"

**Validation:** User sees sector heatmap showing E&P -2%, Banks +3%, Textiles +1%

---

## Success Metrics

After 7 weeks, the app should answer:

| Question | Feature That Answers It |
|---|---|
| Which stocks are moving today? | Top movers dashboard (Phase 1) |
| Why is this stock moving? | News sentiment + AI explanation (Phase 2) |
| Which stocks have strong signals? | Enhanced daily scoring (Phase 4) |
| Is movement due to news or sector? | AI chat (Phase 6) |
| What should I watch? | Watchlist alerts (Phase 5) |
| What happened today? | Daily briefing (Phase 3) |

---

## Technical Debt to Address

1. **PSX scraper reliability:** Current scraper assumes HTML structure — PSX may change it. Add error handling + fallback to API if available.
2. **Rate limiting:** If scraping news sites, add delays to avoid IP bans.
3. **Performance:** 400+ companies × daily prices = DB will grow fast. Add indexes on `symbol, date`.
4. **Multi-tenancy:** Current DB has `tenant_id` stub but no enforcement. Implement when scaling to B2B.

---

## Optional Features (Post-MVP)

- Portfolio tracking (user enters holdings, see P&L)
- Backtesting (simulate "what if I bought MARI 3 months ago")
- Comparison tool (side-by-side MEBL vs BAFL)
- Export reports (PDF/Excel download of watchlist)
- Mobile app (React Native or PWA)
