#!/bin/bash

# StockAnalyzer Analysis System Startup Script
# Starts AI engine and queue workers with proper concurrency

set -e

PROJECT_ROOT="/Users/ansari/Projects/AI Projects/StockAnalyzer"
AI_ENGINE_DIR="$PROJECT_ROOT/ai-engine"
API_DIR="$PROJECT_ROOT/api"

echo "=== Starting StockAnalyzer Analysis System ==="

# Kill existing processes
echo "→ Stopping existing processes..."
pkill -f "uvicorn main:app.*8003" 2>/dev/null || true
pkill -f "gunicorn main:app" 2>/dev/null || true
sleep 2

# Start AI Engine with gunicorn (10 workers)
echo "→ Starting AI engine with 10 workers..."
cd "$AI_ENGINE_DIR"
source venv/bin/activate
nohup gunicorn main:app \
  --workers 10 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8003 \
  --timeout 600 \
  --access-logfile logs/access.log \
  --error-logfile logs/error.log \
  --log-level info \
  >> logs/gunicorn.log 2>&1 &

GUNICORN_PID=$!
echo "  ✓ AI engine started (PID: $GUNICORN_PID)"

# Wait for AI engine to be ready
echo "→ Waiting for AI engine to be ready..."
for i in {1..10}; do
  if curl -s http://localhost:8003/health > /dev/null 2>&1; then
    echo "  ✓ AI engine is healthy"
    break
  fi
  sleep 1
done

# Restart queue workers
echo "→ Restarting queue workers..."
cd "$API_DIR"
php artisan queue:restart
sleep 2

# Start 10 queue workers
echo "→ Starting 10 queue workers..."
for i in {1..10}; do
  nohup php artisan queue:work \
    --queue=default,rescan \
    --sleep=1 \
    --tries=3 \
    --timeout=600 \
    >> storage/logs/queue-worker-$i.log 2>&1 &
  echo "  Started worker $i (PID: $!)"
done

echo ""
echo "=== System Status ==="
echo "AI Engine workers: $(ps aux | grep 'gunicorn\|uvicorn.*8003' | grep -v grep | wc -l | xargs)"
echo "Queue workers: $(ps aux | grep 'queue:work' | grep -v grep | wc -l | xargs)"
echo ""
echo "✓ System started successfully!"
echo ""
echo "Monitor with:"
echo "  tail -f $AI_ENGINE_DIR/logs/error.log"
echo "  tail -f $API_DIR/storage/logs/queue-worker-1.log"
