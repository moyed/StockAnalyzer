#!/bin/bash
# Self-healing queue worker fleet for StockAnalyzer.
# Restarts any worker that exits (crash, OOM, --max-time recycle).
cd "/Users/ansari/Projects/AI Projects/StockAnalyzer/api" || exit 1

run() {
  local name="$1"; shift
  while true; do
    echo "[$(date '+%F %T')] starting $name ($*)" >> "/tmp/worker-$name.log"
    php artisan queue:work "$@" --sleep=3 --tries=3 --timeout=310 --max-time=3600 >> "/tmp/worker-$name.log" 2>&1
    echo "[$(date '+%F %T')] $name exited (code $?) — restarting in 2s" >> "/tmp/worker-$name.log"
    sleep 2
  done
}

# 3 sync drainers (fast PSX scraping), 2 analysis workers (AI engine + rescans)
run sync-1 --queue=sync,default,rescan &
run sync-2 --queue=sync,default,rescan &
run sync-3 --queue=sync,default,rescan &
run ai-1   --queue=rescan,default,sync &
run ai-2   --queue=rescan,default,sync &
wait
