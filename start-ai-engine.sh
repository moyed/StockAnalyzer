#!/bin/bash

# Start AI Engine with multiple workers for better concurrency
cd "$(dirname "$0")/ai-engine"

# Activate virtual environment if it exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Kill existing AI engine process
pkill -f "uvicorn main:app"

# Start with 10 workers to handle concurrent queue workers + chat requests
echo "Starting AI Engine with 10 workers..."
uvicorn main:app --host 0.0.0.0 --port 8003 --workers 10

