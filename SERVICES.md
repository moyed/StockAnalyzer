# StockAnalyzer Services

## 🚀 Quick Start

All services are now managed by PM2 (Process Manager 2) for automatic restarts and monitoring.

### Service Management

```bash
# Quick status check
./manage.sh status

# Start all services
./manage.sh start

# Stop all services
./manage.sh stop

# Restart all services
./manage.sh restart

# View logs
./manage.sh logs              # All services
./manage.sh logs frontend     # Specific service

# Monitor real-time
./manage.sh monitor           # Interactive dashboard

# Show URLs
./manage.sh urls
```

## 📦 Services

All services are defined in `ecosystem.config.js` and managed by PM2:

### 1. Frontend (Next.js)
- **Port:** 3000
- **URL:** http://localhost:3000
- **Status:** Auto-restart enabled
- **Memory Limit:** 500MB

### 2. API (Laravel)
- **Port:** 8000
- **URL:** http://localhost:8000
- **Health Check:** http://localhost:8000/api/health
- **Status:** Auto-restart enabled
- **Memory Limit:** 500MB

### 3. AI Engine (FastAPI)
- **Port:** 8003
- **URL:** http://localhost:8003
- **Health Check:** http://localhost:8003/health
- **Status:** Auto-restart enabled
- **Memory Limit:** 1GB
- **Model:** deepseek-4-flash (via Gradient SDK)

### 4. Queue Workers (Laravel)
- **Instances:** 4 parallel workers
- **Queues:** rescan, default
- **Timeout:** 300 seconds
- **Retries:** 3 attempts
- **Status:** Auto-restart enabled
- **Memory Limit:** 300MB per worker

### 5. Scheduler (Laravel)
- **Purpose:** Runs scheduled tasks (cron jobs)
- **Status:** Auto-restart enabled
- **Memory Limit:** 200MB

## 🔧 Manual PM2 Commands

If you prefer using PM2 directly:

```bash
# View all processes
pm2 status

# View logs
pm2 logs
pm2 logs frontend --lines 100

# Restart a specific service
pm2 restart frontend
pm2 restart queue-worker

# Stop a specific service
pm2 stop api

# Monitor in real-time
pm2 monit

# Save current configuration
pm2 save

# Delete all processes
pm2 delete all
```

## 🔄 Auto-Startup on System Boot

To make services start automatically when your Mac boots:

1. Run this command (requires sudo password):
```bash
sudo env PATH=$PATH:/opt/homebrew/Cellar/node/26.3.0/bin /opt/homebrew/lib/node_modules/pm2/bin/pm2 startup launchd -u ansari --hp /Users/ansari
```

2. Save the PM2 process list:
```bash
pm2 save
```

## 📊 Monitoring & Health Checks

### Check Service Health
```bash
# Using the management script
./manage.sh status

# Manual health checks
curl http://localhost:8000/api/health | jq '.'
curl http://localhost:8003/health | jq '.'
```

### View Metrics
```bash
# Real-time monitoring
pm2 monit

# Process information
pm2 show frontend
pm2 show api
pm2 show ai-engine
```

## 🐛 Troubleshooting

### Service Won't Start
```bash
# Check logs for errors
pm2 logs [service-name] --err

# Check if port is in use
lsof -i :3000  # Frontend
lsof -i :8000  # API
lsof -i :8003  # AI Engine

# Kill process on port if needed
lsof -ti :3000 | xargs kill -9
```

### High Memory Usage
```bash
# Check memory usage
pm2 status

# Restart memory-hungry service
pm2 restart [service-name]

# Adjust memory limit in ecosystem.config.js
```

### Queue Jobs Not Processing
```bash
# Check queue worker logs
pm2 logs queue-worker

# Restart queue workers
pm2 restart queue-worker

# Check queue status via API
curl http://localhost:8000/api/health | jq '.checks.queue'
```

### AI Engine Not Responding
```bash
# Check AI engine logs
pm2 logs ai-engine

# Verify Gradient SDK configuration
cat ai-engine/.env | grep GRADIENT

# Restart AI engine
pm2 restart ai-engine
```

## 📝 Configuration Files

- `ecosystem.config.js` - PM2 process configuration
- `manage.sh` - Service management script
- `frontend/.env.local` - Frontend environment variables
- `api/.env` - Laravel environment variables
- `ai-engine/.env` - AI Engine environment variables

## 🔐 Environment Variables

### Required for AI Engine
```bash
GRADIENT_ACCESS_TOKEN=your_token_here
GRADIENT_MODEL_ID=deepseek-4-flash
```

### Required for Laravel API
Check `api/.env` for database, queue, and service configurations.

## 📈 Performance Tips

1. **Queue Workers**: Adjust the number of instances in `ecosystem.config.js` based on workload
2. **Memory Limits**: Increase limits if services restart frequently due to memory
3. **Monitoring**: Use `pm2 monit` to track resource usage in real-time
4. **Logs**: Rotate logs regularly to prevent disk space issues:
   ```bash
   pm2 install pm2-logrotate
   ```

## 🎯 Next Steps

1. ✅ All services are running
2. ✅ PM2 configuration saved
3. ⏳ Set up auto-startup (run `./manage.sh setup-startup`)
4. ⏳ Configure log rotation if needed
5. ⏳ Set up monitoring alerts (optional)

## 📞 Quick Reference

```bash
# Emergency stop all
pm2 stop all

# Emergency restart all
pm2 restart all

# View all URLs
./manage.sh urls

# Full system status
./manage.sh status
```
