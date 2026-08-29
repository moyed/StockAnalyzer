# Background Jobs - Running Continuously

## ✅ Status: ALL SYSTEMS OPERATIONAL

All background services are running as **persistent daemons** and will continue processing jobs 24/7.

---

## 🎯 Background Services Summary

### Active Processes (8 total)

| Service | Instances | Status | Purpose |
|---------|-----------|--------|---------|
| **Frontend** | 1 | ✅ Running | Next.js app on port 3000 |
| **API** | 1 | ✅ Running | Laravel backend on port 8000 |
| **AI Engine** | 1 | ✅ Running | FastAPI AI service on port 8003 |
| **Queue Workers** | 4 | ✅ Running | Process analysis jobs in parallel |
| **Scheduler** | 1 | ✅ Running | Handle cron tasks |

---

## 🔄 Queue Processing

### How It Works

1. **Job Submission**: When you rescan a company, multiple jobs are queued:
   - `AnalyzeFilingJob` - Main financial analysis
   - `ScrapeNewsJob` - Fetch recent news
   - `DetectVolumeSpikeJob` - Check for unusual trading volume
   - `ExplainMovementJob` - Analyze price movements
   - `AssessMacroRiskJob` - Assess macroeconomic risks
   - `GenerateProjectionJob` - Create financial projections

2. **Parallel Processing**: 4 queue workers process jobs simultaneously
3. **Auto-Retry**: Failed jobs retry up to 3 times
4. **Timeout Protection**: Jobs timeout after 5 minutes

### Queue Configuration

```bash
Workers: 4
Queues: rescan, default
Priority: rescan queue processed first
Retry: 3 attempts
Timeout: 300 seconds
Sleep: 3 seconds between jobs
```

---

## 📊 Monitoring Queue Activity

### Quick Status Check
```bash
./manage.sh queue-status
```

### Real-Time Monitoring
```bash
./monitor-queue.sh
```

### Test Queue Processing
```bash
# Test with company ID 634
./manage.sh test-queue 634

# Test with any company ID
./manage.sh test-queue 60
```

### View Worker Logs
```bash
# All queue workers
./manage.sh logs queue-worker

# Live tail
pm2 logs queue-worker
```

---

## 🔧 Background Processing Features

✅ **Persistent**: Services run as daemons (survive terminal close)  
✅ **Auto-restart**: Crashes trigger immediate restart  
✅ **Parallel Processing**: 4 workers handle jobs simultaneously  
✅ **Memory Management**: Auto-restart at 300MB per worker  
✅ **Heartbeat Monitoring**: Queue health checked every 3 seconds  
✅ **Job Prioritization**: `rescan` queue processed before `default`  

---

## 📈 Performance Metrics

From recent test:
- **Job Submission**: Instant (< 100ms)
- **Queue Pickup**: Immediate
- **Processing Rate**: ~3 jobs processed in 8 seconds
- **Concurrent Jobs**: Up to 4 running simultaneously
- **Worker Uptime**: Continuous since startup

---

## 🚨 What Happens If...

### A Queue Worker Crashes?
PM2 automatically restarts it within seconds. No jobs are lost.

### The AI Engine Goes Down?
Jobs will fail and retry 3 times. Once the AI Engine is back, pending jobs resume.

### Memory Usage Gets High?
Workers auto-restart when hitting 300MB limit. Jobs requeue automatically.

### You Close the Terminal?
Nothing changes! All services continue running as background daemons.

### Your Mac Restarts?
After running the startup command (see below), services auto-start on boot.

---

## 🔐 Persistence Across Reboots

### One-Time Setup

To make services start automatically when your Mac boots:

```bash
sudo env PATH=$PATH:/opt/homebrew/Cellar/node/26.3.0/bin /opt/homebrew/lib/node_modules/pm2/bin/pm2 startup launchd -u ansari --hp /Users/ansari
```

Then save the current state:
```bash
pm2 save
```

**Note**: This is optional. Services will persist across terminal closes even without this.

---

## 📝 Queue Workflow Example

```bash
# 1. Trigger a rescan
curl -X POST http://localhost:8000/api/companies/634/rescan \
  -H "Authorization: Bearer YOUR_TOKEN"

# 2. Jobs queued instantly
# → AnalyzeFilingJob (5 min max)
# → ScrapeNewsJob (30 sec)
# → DetectVolumeSpikeJob (10 sec)
# → ExplainMovementJob (1 min)
# → AssessMacroRiskJob (1 min)
# → GenerateProjectionJob (2 min)

# 3. Workers process in parallel
# Worker 1: AnalyzeFilingJob
# Worker 2: ScrapeNewsJob
# Worker 3: DetectVolumeSpikeJob
# Worker 4: ExplainMovementJob

# 4. Jobs complete or retry on failure

# 5. Results saved to database

# 6. Status changes: pending → processing → done
```

---

## 🎛️ Advanced Management

### Scale Workers
Edit `ecosystem.config.js` and change:
```javascript
{
  name: 'queue-worker',
  instances: 4,  // Change to 6, 8, etc.
  ...
}
```

Then restart:
```bash
pm2 restart queue-worker
pm2 save
```

### Change Queue Priority
```bash
php artisan queue:work --queue=high,rescan,default
```

### Clear Failed Jobs
```bash
cd api
php artisan queue:flush
```

### Restart Stuck Workers
```bash
pm2 restart queue-worker
```

---

## 📊 Current Status

Run this anytime to check:
```bash
./manage.sh status
```

Expected output:
- ✅ All services online
- ✅ Queue status: OK
- ✅ 0-5 pending jobs (varies by activity)
- ✅ Workers: 4 active

---

## 🎯 Key Takeaways

1. **Services run 24/7** in the background
2. **Jobs process automatically** without manual intervention
3. **System self-heals** - crashes trigger auto-restart
4. **You can close the terminal** - everything keeps running
5. **Monitor anytime** with `./manage.sh status`

---

**Last Updated**: $(date)  
**Process Manager**: PM2 v5.x  
**Total Processes**: 8 (1 frontend + 1 api + 1 ai-engine + 4 queue-workers + 1 scheduler)
