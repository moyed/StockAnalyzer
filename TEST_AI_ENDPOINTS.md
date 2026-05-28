# Testing AI Engine Endpoints

All endpoints are now live at `http://localhost:8001`

---

## 1. News Sentiment Analysis

**Endpoint:** `POST /analyze-news`

**Test:**
```bash
curl -X POST http://localhost:8001/analyze-news \
  -H "Content-Type: application/json" \
  -d '{
    "headline": "MARI announces record quarterly profits, up 45%",
    "body": "Mari Petroleum Company Ltd reported record profits for Q3-FY2024, with net income growing 45% year-over-year. The company attributed the strong performance to higher gas production and favorable oil prices.",
    "source": "Dawn Business"
  }'
```

**Expected Response:**
```json
{
  "sentiment": "positive",
  "impact": "high",
  "mentioned_symbols": ["MARI"],
  "category": "earnings",
  "summary": "MARI's 45% profit growth signals strong operational performance and favorable market conditions."
}
```

**Note:** Requires `GRADIENT_ACCESS_TOKEN` in `ai-engine/.env`

---

## 2. Volume Spike Detection

**Endpoint:** `POST /detect-volume-spike`

**Test:**
```bash
curl -X POST http://localhost:8001/detect-volume-spike \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "OGDC",
    "current_volume": 15000000,
    "avg_30d_volume": 5000000,
    "current_price": 185.50,
    "prev_close": 180.00
  }'
```

**Expected Response:**
```json
{
  "spike_detected": true,
  "volume_ratio": 3.0,
  "price_change_pct": 3.06,
  "severity": "medium",
  "explanation": "Volume spike of 3x combined with 3% price gain suggests strong buying interest, possibly triggered by quarterly results or sector momentum in E&P stocks."
}
```

---

## 3. Stock Movement Explanation

**Endpoint:** `POST /explain-movement`

**Test:**
```bash
curl -X POST "http://localhost:8001/explain-movement?symbol=PSO&price_change_pct=5.2&volume_ratio=2.8&sector_change_pct=1.5&recent_news=Oil%20prices%20rise%20on%20OPEC%20cuts" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "symbol": "PSO",
  "explanation": "PSO's 5.2% gain on 2.8x volume suggests strong buying triggered by rising oil prices. The movement outpaced the sector (1.5%), indicating company-specific demand alongside broader energy sector strength.",
  "primary_driver": "news or announcement",
  "confidence": "high"
}
```

---

## 4. Daily Market Briefing

**Endpoint:** `POST /generate-market-briefing`

**Test:**
```bash
curl -X POST http://localhost:8001/generate-market-briefing \
  -H "Content-Type: application/json" \
  -d '{
    "top_gainers": [
      {"symbol": "MARI", "change_pct": 8.2, "price": 1850},
      {"symbol": "PSO", "change_pct": 5.3, "price": 280},
      {"symbol": "OGDC", "change_pct": 4.1, "price": 185}
    ],
    "top_losers": [
      {"symbol": "LUCK", "change_pct": -3.2, "price": 950},
      {"symbol": "DGKC", "change_pct": -2.8, "price": 120}
    ],
    "sector_performance": {
      "E&P": 3.5,
      "Oil & Gas": 2.8,
      "Cement": -2.1,
      "Banks": 0.5
    },
    "news_headlines": [
      "Oil prices surge 4% on OPEC production cuts",
      "SBP keeps interest rate unchanged at 15%",
      "Cement sector faces demand slowdown"
    ]
  }'
```

**Expected Response:**
```json
{
  "date": "today",
  "briefing": "PSX closed higher as energy stocks rallied on oil price gains, with E&P leading at +3.5% and MARI surging 8.2%. Cement sector lagged (-2.1%) amid demand concerns, while banks remained flat despite SBP maintaining rates. The session was driven by commodity price movements and sector-specific fundamentals.",
  "top_themes": [
    "E&P rallied",
    "Oil & Gas rallied",
    "Cement declined"
  ]
}
```

---

## 5. PDF Filing Analysis (Original)

**Endpoint:** `POST /analyze`

**Test with Mock Data:**

Since we don't have a real PSX PDF URL readily available, here's how to test once you have one:

```bash
# Example (will fail without real PDF)
curl -X POST http://localhost:8001/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "filing_id": 1,
    "pdf_url": "https://dps.psx.com.pk/download/announcement-12345.pdf",
    "company": "Mari Petroleum",
    "symbol": "MARI",
    "quarter": "Q3-FY2024"
  }'
```

**To test with real data:**
1. Go to https://dps.psx.com.pk/announcements
2. Filter by "Transmission" category
3. Find a recent filing, right-click PDF link → Copy Link Address
4. Use that URL in the request above

---

## Testing Without Gradient Token

If you don't have `GRADIENT_ACCESS_TOKEN` set, the AI calls will fail. To test the structure without AI:

### Mock Test (No AI)
```bash
# Volume spike (no AI needed for basic logic)
curl -X POST http://localhost:8001/detect-volume-spike \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "TEST",
    "current_volume": 1000000,
    "avg_30d_volume": 5000000,
    "current_price": 100,
    "prev_close": 100
  }'

# Response (no spike):
{
  "spike_detected": false,
  "volume_ratio": 0.2,
  "price_change_pct": 0.0,
  "severity": "low",
  "explanation": "No unusual volume activity detected."
}
```

---

## API Documentation

FastAPI auto-generates interactive docs:

**Swagger UI:** http://localhost:8001/docs  
**ReDoc:** http://localhost:8001/redoc

Open these in your browser to:
- See all endpoints
- Test requests interactively
- View request/response schemas

---

## Integration with Laravel

To use these endpoints from the Laravel API, update `AiAnalysisService.php`:

```php
// Add to AiAnalysisService.php

public function analyzeNews(string $headline, string $body, string $source = 'unknown'): array
{
    $response = Http::timeout(60)->post("{$this->aiEngineUrl}/analyze-news", [
        'headline' => $headline,
        'body'     => $body,
        'source'   => $source,
    ]);

    return $response->json();
}

public function detectVolumeSpike(string $symbol, int $volume, int $avgVolume, float $price, float $prevClose): array
{
    $response = Http::timeout(30)->post("{$this->aiEngineUrl}/detect-volume-spike", [
        'symbol'           => $symbol,
        'current_volume'   => $volume,
        'avg_30d_volume'   => $avgVolume,
        'current_price'    => $price,
        'prev_close'       => $prevClose,
    ]);

    return $response->json();
}

public function generateMarketBriefing(array $gainers, array $losers, array $sectors, array $news): array
{
    $response = Http::timeout(120)->post("{$this->aiEngineUrl}/generate-market-briefing", [
        'top_gainers'         => $gainers,
        'top_losers'          => $losers,
        'sector_performance'  => $sectors,
        'news_headlines'      => $news,
    ]);

    return $response->json();
}
```

---

## Next Steps

1. **Add Gradient Token:**
   ```bash
   echo "GRADIENT_ACCESS_TOKEN=your_token_here" >> ai-engine/.env
   # Restart AI engine
   ```

2. **Test News Analysis:**
   - Find real PSX news article
   - Call `/analyze-news` endpoint
   - Verify sentiment detection

3. **Integrate with Phase 1 (Daily Prices):**
   - Once daily price scraper is built
   - Use `/detect-volume-spike` to flag unusual activity
   - Use `/explain-movement` for AI explanations

4. **Build Daily Briefing Feature:**
   - Aggregate today's market data
   - Call `/generate-market-briefing`
   - Display on dashboard

---

## Error Handling

All endpoints return standard HTTP error codes:

- **400** - Bad request (invalid parameters)
- **500** - Server error (AI model error, parsing error)
- **502** - PDF download failed (for `/analyze` endpoint)

Example error response:
```json
{
  "detail": "No JSON found in AI response"
}
```
