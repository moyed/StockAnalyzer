#!/bin/bash

# Real-time Queue Monitoring Script
echo "📊 StockAnalyzer Queue Monitor"
echo "================================"
echo ""

while true; do
    clear
    echo "📊 StockAnalyzer Queue Monitor - $(date '+%Y-%m-%d %H:%M:%S')"
    echo "================================"
    echo ""

    # Queue status
    echo "🔄 Queue Status:"
    QUEUE_STATUS=$(curl -s http://localhost:8000/api/health | jq '.checks.queue')
    echo "$QUEUE_STATUS" | jq '.'
    echo ""

    # PM2 process status
    echo "⚙️  Process Status:"
    pm2 jlist | jq -r '.[] | select(.name == "queue-worker") | "\(.pm_id) | \(.name) | PID: \(.pid) | CPU: \(.monit.cpu)% | Mem: \(.monit.memory / 1024 / 1024 | floor)MB | Restarts: \(.pm2_env.restart_time)"' | while read line; do
        echo "  Worker $line"
    done
    echo ""

    # Recent queue worker activity
    echo "📝 Recent Queue Activity (last 5 lines):"
    pm2 logs queue-worker --lines 5 --nostream 2>/dev/null | grep -E "Processing|Processed|Failed" | tail -5 || echo "  No recent activity"
    echo ""

    # System health
    echo "🏥 System Health:"
    echo -n "  API: "
    curl -s http://localhost:8000/api/health | jq -r '.status'
    echo -n "  AI Engine: "
    curl -s http://localhost:8003/health | jq -r '.status'
    echo ""

    echo "Press Ctrl+C to exit | Refreshing every 3 seconds..."
    sleep 3
done
