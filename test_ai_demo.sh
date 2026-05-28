#!/bin/bash

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🤖 AI Engine Endpoint Testing Demo"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if AI engine is running
echo "1️⃣  Checking AI Engine health..."
HEALTH=$(curl -s http://localhost:8001/health)
if [[ $HEALTH == *"ok"* ]]; then
    echo "✅ AI Engine is running"
else
    echo "❌ AI Engine is not running. Start it with:"
    echo "   cd ai-engine && source venv/bin/activate && uvicorn main:app --port 8001"
    exit 1
fi
echo ""

# Test Volume Spike Detection
echo "2️⃣  Testing Volume Spike Detection..."
echo "   Scenario: OGDC trading at 3x normal volume with +3% price gain"
echo ""
curl -s -X POST http://localhost:8001/detect-volume-spike \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "OGDC",
    "current_volume": 15000000,
    "avg_30d_volume": 5000000,
    "current_price": 185.50,
    "prev_close": 180.00
  }' | jq '.'
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test with low volume (no spike)
echo "3️⃣  Testing Normal Volume (No Spike)..."
echo "   Scenario: PSO trading at normal volume"
echo ""
curl -s -X POST http://localhost:8001/detect-volume-spike \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "PSO",
    "current_volume": 5200000,
    "avg_30d_volume": 5000000,
    "current_price": 280.00,
    "prev_close": 278.50
  }' | jq '.'
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test Market Briefing
echo "4️⃣  Testing Market Briefing Generation..."
echo "   (Requires GRADIENT_ACCESS_TOKEN - will fail if not set)"
echo ""
curl -s -X POST http://localhost:8001/generate-market-briefing \
  -H "Content-Type: application/json" \
  -d '{
    "top_gainers": [
      {"symbol": "MARI", "change_pct": 8.2, "price": 1850},
      {"symbol": "PSO", "change_pct": 5.3, "price": 280},
      {"symbol": "OGDC", "change_pct": 4.1, "price": 185}
    ],
    "top_losers": [
      {"symbol": "LUCK", "change_pct": -3.2, "price": 950}
    ],
    "sector_performance": {
      "E&P": 3.5,
      "Oil & Gas": 2.8,
      "Cement": -2.1
    },
    "news_headlines": [
      "Oil prices surge 4% on OPEC production cuts",
      "Cement sector faces demand slowdown"
    ]
  }' 2>&1 | head -20
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test News Analysis
echo "5️⃣  Testing News Sentiment Analysis..."
echo "   (Requires GRADIENT_ACCESS_TOKEN - will fail if not set)"
echo ""
curl -s -X POST http://localhost:8001/analyze-news \
  -H "Content-Type: application/json" \
  -d '{
    "headline": "MARI announces record quarterly profits, up 45%",
    "body": "Mari Petroleum Company Ltd reported record profits for Q3-FY2024.",
    "source": "Dawn Business"
  }' 2>&1 | head -20
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "✅ Testing Complete!"
echo ""
echo "📚 Documentation:"
echo "   - Full API docs: http://localhost:8001/docs"
echo "   - Testing guide: TEST_AI_ENDPOINTS.md"
echo ""
echo "⚠️  Note: Endpoints requiring AI (news, briefing, movement explanation)"
echo "   will fail without GRADIENT_ACCESS_TOKEN in ai-engine/.env"
echo ""
echo "🔧 To enable AI features:"
echo "   1. Get token from DigitalOcean Gradient"
echo "   2. Add to ai-engine/.env:"
echo "      GRADIENT_ACCESS_TOKEN=your_token_here"
echo "   3. Restart AI engine"
echo ""
