#!/bin/bash

# StockAnalyzer - Bulk Rescan Script
# Rescans all companies (or a subset) and shows real-time progress

PROJECT_DIR="/Users/ansari/Projects/AI Projects/StockAnalyzer"
API_URL="http://localhost:8000/api"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get auth token
echo "🔐 Authenticating..."
TOKEN=$(curl -s -X POST "$API_URL/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@stockanalyzer.com","password":"password"}' | jq -r '.token')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ Authentication failed"
  exit 1
fi

echo "✅ Authenticated"

# Get total companies
TOTAL=$(curl -s "$API_URL/companies?per_page=1" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.total')

echo ""
echo "📊 Total companies in database: $TOTAL"
echo ""

# Ask user how many to scan
if [ -z "$1" ]; then
  echo "Usage: $0 <number_of_companies_to_scan>"
  echo ""
  echo "Examples:"
  echo "  $0 10      # Scan first 10 companies"
  echo "  $0 50      # Scan first 50 companies"
  echo "  $0 $TOTAL  # Scan ALL companies"
  echo ""
  read -p "How many companies to scan? (1-$TOTAL): " LIMIT
else
  LIMIT=$1
fi

# Validate limit
if ! [[ "$LIMIT" =~ ^[0-9]+$ ]] || [ "$LIMIT" -lt 1 ] || [ "$LIMIT" -gt "$TOTAL" ]; then
  echo "❌ Invalid number. Must be between 1 and $TOTAL"
  exit 1
fi

echo ""
echo "🚀 Starting bulk rescan for $LIMIT companies..."
echo ""

# Fetch companies to scan
COMPANIES=$(curl -s "$API_URL/companies?per_page=$LIMIT" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[] | "\(.id)|\(.symbol)|\(.name)"')

# Count
COMPANY_COUNT=$(echo "$COMPANIES" | wc -l | xargs)

echo "📋 Found $COMPANY_COUNT companies to scan"
echo ""

# Create progress file
PROGRESS_FILE="/tmp/bulk-scan-progress.txt"
> "$PROGRESS_FILE"

# Trigger rescans
COUNTER=0
QUEUED=0
FAILED=0

echo "$COMPANIES" | while IFS='|' read -r ID SYMBOL NAME; do
  COUNTER=$((COUNTER + 1))

  echo -n "[$COUNTER/$COMPANY_COUNT] Scanning $SYMBOL ($NAME)... "

  RESULT=$(curl -s -X POST "$API_URL/companies/$ID/rescan" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json")

  if echo "$RESULT" | jq -e '.message' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Queued${NC}"
    QUEUED=$((QUEUED + 1))
    echo "$ID|$SYMBOL|queued|$(date '+%Y-%m-%d %H:%M:%S')" >> "$PROGRESS_FILE"
  else
    echo -e "${RED}✗ Failed${NC}"
    FAILED=$((FAILED + 1))
    echo "$ID|$SYMBOL|failed|$(date '+%Y-%m-%d %H:%M:%S')" >> "$PROGRESS_FILE"
  fi

  # Small delay to avoid overwhelming the server
  sleep 0.1
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Bulk Scan Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Total companies: $COMPANY_COUNT"
echo "  Queued:          $QUEUED"
echo "  Failed:          $FAILED"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🔍 Monitor progress with:"
echo "   ./monitor-scan.sh"
echo ""
echo "📊 View queue status:"
echo "   ./manage.sh queue-status"
echo ""
