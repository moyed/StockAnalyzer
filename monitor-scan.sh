#!/bin/bash

# StockAnalyzer - Real-time Scan Monitor
# Monitors the progress of bulk scans with live updates

API_URL="http://localhost:8000/api"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# Get auth token
TOKEN=$(curl -s -X POST "$API_URL/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@stockanalyzer.com","password":"password"}' | jq -r '.token')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ Authentication failed"
  exit 1
fi

# Function to get company status
get_company_status() {
  local ID=$1
  curl -s "$API_URL/companies/$ID" \
    -H "Authorization: Bearer $TOKEN" | \
    jq -r '.company.filings[0] | "\(.status)|\(.quarter)|\(.score.score // "N/A")|\(.updated_at)"'
}

# Function to get queue status
get_queue_status() {
  curl -s "$API_URL/health" -H "Authorization: Bearer $TOKEN" | \
    jq -r '.checks.queue | "\(.pending_jobs)|\(.failed_jobs)"'
}

# Clear screen and show header
clear
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║          StockAnalyzer - Real-time Scan Monitor                  ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# Check if we have a progress file
PROGRESS_FILE="/tmp/bulk-scan-progress.txt"
if [ ! -f "$PROGRESS_FILE" ]; then
  echo "⚠️  No active bulk scan found."
  echo ""
  echo "Start a bulk scan with:"
  echo "   ./bulk-scan.sh <number_of_companies>"
  echo ""
  exit 0
fi

# Main monitoring loop
REFRESH_INTERVAL=3
ITERATION=0

while true; do
  ITERATION=$((ITERATION + 1))
  clear

  echo "╔══════════════════════════════════════════════════════════════════╗"
  echo "║          StockAnalyzer - Real-time Scan Monitor                  ║"
  echo "╚══════════════════════════════════════════════════════════════════╝"
  echo ""
  echo "$(date '+%Y-%m-%d %H:%M:%S') | Refresh: ${REFRESH_INTERVAL}s | Iteration: $ITERATION"
  echo ""

  # Get queue status
  QUEUE_STATUS=$(get_queue_status)
  PENDING=$(echo "$QUEUE_STATUS" | cut -d'|' -f1)
  FAILED=$(echo "$QUEUE_STATUS" | cut -d'|' -f2)

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📊 Queue Status"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Pending jobs:  $PENDING"
  echo "  Failed jobs:   $FAILED"
  echo ""

  # Count status from progress file
  TOTAL=$(wc -l < "$PROGRESS_FILE" | xargs)
  DONE_COUNT=0
  PROCESSING_COUNT=0
  PENDING_COUNT=0
  FAILED_COUNT=0

  # Sample recent companies (last 20)
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📋 Recent Companies (last 20)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  printf "%-8s %-10s %-12s %-8s %s\n" "ID" "Symbol" "Status" "Score" "Quarter"
  echo "────────────────────────────────────────────────────────────────"

  tail -20 "$PROGRESS_FILE" | while IFS='|' read -r ID SYMBOL SCAN_STATUS TIMESTAMP; do
    # Get current status
    STATUS_DATA=$(get_company_status "$ID")
    STATUS=$(echo "$STATUS_DATA" | cut -d'|' -f1)
    QUARTER=$(echo "$STATUS_DATA" | cut -d'|' -f2)
    SCORE=$(echo "$STATUS_DATA" | cut -d'|' -f3)

    # Color code by status
    case "$STATUS" in
      "done")
        COLOR=$GREEN
        SYMBOL_DISPLAY="✓ $SYMBOL"
        DONE_COUNT=$((DONE_COUNT + 1))
        ;;
      "processing")
        COLOR=$BLUE
        SYMBOL_DISPLAY="⟳ $SYMBOL"
        PROCESSING_COUNT=$((PROCESSING_COUNT + 1))
        ;;
      "pending")
        COLOR=$YELLOW
        SYMBOL_DISPLAY="⋯ $SYMBOL"
        PENDING_COUNT=$((PENDING_COUNT + 1))
        ;;
      "failed")
        COLOR=$RED
        SYMBOL_DISPLAY="✗ $SYMBOL"
        FAILED_COUNT=$((FAILED_COUNT + 1))
        ;;
      *)
        COLOR=$GRAY
        SYMBOL_DISPLAY="? $SYMBOL"
        ;;
    esac

    printf "${COLOR}%-8s %-10s %-12s %-8s %s${NC}\n" \
      "$ID" "$SYMBOL_DISPLAY" "$STATUS" "$SCORE" "$QUARTER"
  done

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📊 Overall Progress"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Calculate overall stats from ALL companies in progress file
  while IFS='|' read -r ID SYMBOL SCAN_STATUS TIMESTAMP; do
    STATUS_DATA=$(get_company_status "$ID")
    STATUS=$(echo "$STATUS_DATA" | cut -d'|' -f1)

    case "$STATUS" in
      "done") DONE_COUNT=$((DONE_COUNT + 1)) ;;
      "processing") PROCESSING_COUNT=$((PROCESSING_COUNT + 1)) ;;
      "pending") PENDING_COUNT=$((PENDING_COUNT + 1)) ;;
      "failed") FAILED_COUNT=$((FAILED_COUNT + 1)) ;;
    esac
  done < "$PROGRESS_FILE"

  COMPLETE_PCT=0
  if [ "$TOTAL" -gt 0 ]; then
    COMPLETE_PCT=$((DONE_COUNT * 100 / TOTAL))
  fi

  echo "  Total scanned: $TOTAL"
  echo ""
  echo -e "  ${GREEN}✓ Done:${NC}       $DONE_COUNT"
  echo -e "  ${BLUE}⟳ Processing:${NC} $PROCESSING_COUNT"
  echo -e "  ${YELLOW}⋯ Pending:${NC}    $PENDING_COUNT"
  echo -e "  ${RED}✗ Failed:${NC}     $FAILED_COUNT"
  echo ""
  echo "  Progress: $COMPLETE_PCT% complete"

  # Progress bar
  BAR_WIDTH=50
  FILLED=$((COMPLETE_PCT * BAR_WIDTH / 100))
  EMPTY=$((BAR_WIDTH - FILLED))

  echo -n "  ["
  for i in $(seq 1 $FILLED); do echo -n "█"; done
  for i in $(seq 1 $EMPTY); do echo -n "░"; done
  echo "] $COMPLETE_PCT%"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "Press Ctrl+C to exit | Auto-refresh every ${REFRESH_INTERVAL}s"

  # Check if all done
  if [ "$DONE_COUNT" -eq "$TOTAL" ] && [ "$PROCESSING_COUNT" -eq 0 ] && [ "$PENDING_COUNT" -eq 0 ]; then
    echo ""
    echo "🎉 All scans complete!"
    echo ""
    exit 0
  fi

  sleep $REFRESH_INTERVAL
done
