#!/bin/bash

# Run agentic projections for all companies in batches
# This script processes all companies with analyzed filings

cd /Users/ansari/Projects/AI\ Projects/StockAnalyzer/api

LOG_FILE="/tmp/agentic_all_companies.log"
echo "🚀 Starting Agentic Projection Scan - $(date)" | tee $LOG_FILE
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a $LOG_FILE

# Run the projections
php artisan projections:agentic --force 2>&1 | tee -a $LOG_FILE

echo "" | tee -a $LOG_FILE
echo "✓ Scan complete - $(date)" | tee -a $LOG_FILE
echo "View stats with: php artisan projections:stats" | tee -a $LOG_FILE
