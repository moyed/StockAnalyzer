#!/bin/bash

# StockAnalyzer Service Starter
# This script starts all services in the correct dependency order

set -e

PROJECT_ROOT="/Users/ansari/Projects/AI Projects/StockAnalyzer"
cd "$PROJECT_ROOT"

# Create directories
mkdir -p .services logs

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "=== Starting StockAnalyzer Services ==="
echo ""

# Function to wait for health check
wait_for_health() {
    local service=$1
    local url=$2
    local max_attempts=60
    local attempt=0

    echo -n "Waiting for $service to be healthy..."
    while [ $attempt -lt $max_attempts ]; do
        if curl -sf "$url" >/dev/null 2>&1; then
            echo -e " ${GREEN}✓${NC}"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 2
        echo -n "."
    done
    echo -e " ${RED}✗ Failed${NC}"
    return 1
}

# Function to check if PID is alive
check_pid() {
    local pid=$1
    kill -0 "$pid" 2>/dev/null
}

# 1. Start AI Engine
echo -e "${YELLOW}Starting AI Engine...${NC}"
cd ai-engine
nohup venv/bin/uvicorn main:app --host 0.0.0.0 --port 8003 > ../logs/ai-engine.log 2>&1 &
AI_PID=$!
echo $AI_PID > ../.services/ai-engine.pid
cd ..

# Verify AI Engine PID is alive
sleep 2
if ! check_pid $AI_PID; then
    echo -e "${RED}✗ AI Engine failed to start${NC}"
    echo "Last 30 lines of log:"
    tail -n 30 logs/ai-engine.log
    exit 1
fi

echo -e "${GREEN}✓${NC} AI Engine started (PID: $AI_PID)"
wait_for_health "AI Engine" "http://localhost:8003/health"

# 2. Start Laravel API
echo -e "${YELLOW}Starting Laravel API...${NC}"
nohup php api/artisan serve --host=127.0.0.1 --port=8000 > logs/api.log 2>&1 &
API_PID=$!
echo $API_PID > .services/api.pid

sleep 2
if ! check_pid $API_PID; then
    echo -e "${RED}✗ API failed to start${NC}"
    echo "Last 30 lines of log:"
    tail -n 30 logs/api.log
    exit 1
fi

echo -e "${GREEN}✓${NC} Laravel API started (PID: $API_PID)"
wait_for_health "Laravel API" "http://localhost:8000/up"

# 3. Start Frontend
echo -e "${YELLOW}Starting Next.js Frontend...${NC}"
cd frontend
nohup npm run dev > ../logs/frontend.log 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > ../.services/frontend.pid
cd ..

sleep 2
if ! check_pid $FRONTEND_PID; then
    echo -e "${RED}✗ Frontend failed to start${NC}"
    echo "Last 30 lines of log:"
    tail -n 30 logs/frontend.log
    exit 1
fi

echo -e "${GREEN}✓${NC} Frontend started (PID: $FRONTEND_PID)"

# 4. Start Queue Worker
echo -e "${YELLOW}Starting Queue Worker...${NC}"
nohup php api/artisan queue:work --queue=rescan,default --sleep=3 --tries=3 --timeout=300 > logs/queue-worker.log 2>&1 &
QUEUE_PID=$!
echo $QUEUE_PID > .services/queue-worker.pid

sleep 2
if ! check_pid $QUEUE_PID; then
    echo -e "${RED}✗ Queue Worker failed to start${NC}"
    echo "Last 30 lines of log:"
    tail -n 30 logs/queue-worker.log
    exit 1
fi

echo -e "${GREEN}✓${NC} Queue Worker started (PID: $QUEUE_PID)"

# 5. Start Scheduler
echo -e "${YELLOW}Starting Scheduler...${NC}"
nohup php api/artisan schedule:work > logs/scheduler.log 2>&1 &
SCHEDULER_PID=$!
echo $SCHEDULER_PID > .services/scheduler.pid

sleep 2
if ! check_pid $SCHEDULER_PID; then
    echo -e "${RED}✗ Scheduler failed to start${NC}"
    echo "Last 30 lines of log:"
    tail -n 30 logs/scheduler.log
    exit 1
fi

echo -e "${GREEN}✓${NC} Scheduler started (PID: $SCHEDULER_PID)"

# Wait for Frontend health check
wait_for_health "Frontend" "http://localhost:3000/"

echo ""
echo -e "${GREEN}=== All Services Started Successfully ===${NC}"
echo ""
echo "Service Status:"
echo "  AI Engine    - PID: $AI_PID   - http://localhost:8003"
echo "  Laravel API  - PID: $API_PID   - http://localhost:8000"
echo "  Frontend     - PID: $FRONTEND_PID - http://localhost:3000"
echo "  Queue Worker - PID: $QUEUE_PID"
echo "  Scheduler    - PID: $SCHEDULER_PID"
echo ""
echo "Access your application at: http://localhost:3000"
echo ""
echo "To view logs:"
echo "  tail -f logs/ai-engine.log"
echo "  tail -f logs/api.log"
echo "  tail -f logs/frontend.log"
echo "  tail -f logs/queue-worker.log"
echo "  tail -f logs/scheduler.log"
