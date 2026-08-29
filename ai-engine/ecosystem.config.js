module.exports = {
  apps: [{
    name: 'ai-engine',
    script: 'venv/bin/python3.14',
    args: '-m uvicorn main:app --host 0.0.0.0 --port 8003 --workers 10',
    cwd: '/Users/ansari/Projects/AI Projects/StockAnalyzer/ai-engine',
    interpreter: 'none',
    max_memory_restart: '1G',
    error_file: '~/.pm2/logs/ai-engine-error.log',
    out_file: '~/.pm2/logs/ai-engine-out.log',
    time: true
  }]
};
