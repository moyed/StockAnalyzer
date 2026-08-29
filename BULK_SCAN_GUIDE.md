# Bulk Company Scan - User Guide

## 🚀 Quick Start

### 1. Start a Bulk Scan

```bash
# Test batch (10 companies)
./bulk-scan.sh 10

# Small batch (50 companies)
./bulk-scan.sh 50

# Medium batch (100 companies)
./bulk-scan.sh 100

# Full database (718 companies)
./bulk-scan.sh 718
```

### 2. Monitor Progress

```bash
# Real-time monitoring dashboard (auto-refresh every 3s)
./monitor-scan.sh

# Or check queue status manually
./manage.sh queue-status

# Or watch PM2 logs
pm2 logs queue-worker
```

---

## 📊 Current Scan Status

**Initiated**: 2026-06-21  
**Companies Queued**: 20  
**Queue Status**: ✅ Processing  
**Pending Jobs**: 98  
**Workers Active**: 4

### Queue Processing

Each company rescan triggers **6 background jobs**:
1. AnalyzeFilingJob - Main analysis (~30s)
2. GenerateProjectionJob - Financial projection (~15s)
3. AssessMacroRiskJob - Macro risk assessment (~10s)
4. DetectVolumeSpikeJob - Volume analysis (~5s)
5. ExplainMovementJob - Price movement explanation (~5s)
6. ScrapeNewsJob - News scraping and analysis (~10s)

**Total**: ~75 seconds per company with 4 parallel workers

---

## 🎯 Monitoring Tools

### 1. Real-time Dashboard
```bash
./monitor-scan.sh
```

**Features**:
- ✅ Live status updates every 3s
- ✅ Color-coded company status
- ✅ Progress bar with percentage
- ✅ Queue statistics
- ✅ Auto-completion detection

**Status Colors**:
- 🟢 Green (✓) - Done
- 🔵 Blue (⟳) - Processing
- 🟡 Yellow (⋯) - Pending
- 🔴 Red (✗) - Failed

### 2. Queue Status
```bash
./manage.sh queue-status
```

Shows:
- Pending jobs count
- Failed jobs count
- Active workers
- Last heartbeat

### 3. PM2 Logs
```bash
# All queue workers
pm2 logs queue-worker

# Specific worker
pm2 logs queue-worker --lines 50

# AI engine
pm2 logs ai-engine
```

### 4. API Health Check
```bash
curl http://localhost:8000/api/health | jq '.'
```

---

## ⏱️ Estimated Times

### With Async Optimization (Current)

| Companies | Estimated Time | Jobs Created |
|-----------|---------------|--------------|
| 10        | 5-10 min      | ~60         |
| 20        | 10-20 min     | ~120        |
| 50        | 25-40 min     | ~300        |
| 100       | 50-90 min     | ~600        |
| 718       | 6-12 hours    | ~4,300      |

**Note**: Times assume 4 queue workers processing in parallel with async-optimized AI Engine.

### Factors Affecting Speed

**Faster**:
- ✅ Companies with recent filings (cached)
- ✅ Smaller PDF files
- ✅ Good internet connection
- ✅ All 4 workers active

**Slower**:
- ❌ Large PDF files (200+ pages)
- ❌ Slow PSX website response
- ❌ AI Engine under load
- ❌ Failed jobs requiring retries

---

## 📈 Progress Tracking

### Check Individual Company

```bash
# Get auth token
TOKEN=$(curl -s -X POST http://localhost:8000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@stockanalyzer.com","password":"password"}' | jq -r '.token')

# Check company status
curl -s "http://localhost:8000/api/companies/1" \
  -H "Authorization: Bearer $TOKEN" | \
  jq '{symbol: .company.symbol, status: .company.filings[0].status, score: .company.filings[0].score.score}'
```

### Check Multiple Companies

```bash
# Sample of first 10 companies
for ID in {1..10}; do
  STATUS=$(curl -s "http://localhost:8000/api/companies/$ID" \
    -H "Authorization: Bearer $TOKEN" | \
    jq -r '{id: .company.id, symbol: .company.symbol, status: .company.filings[0].status}')
  echo "$STATUS"
done
```

---

## 🔧 Troubleshooting

### Queue Not Processing

```bash
# Check queue workers
pm2 status | grep queue-worker

# Restart queue workers if stuck
pm2 restart queue-worker

# Check for errors
pm2 logs queue-worker --err
```

### AI Engine Issues

```bash
# Check AI Engine status
curl http://localhost:8003/health

# Restart AI Engine
pm2 restart ai-engine

# Check logs
pm2 logs ai-engine
```

### High Failure Rate

```bash
# Check failed jobs count
./manage.sh queue-status

# View specific failures
pm2 logs queue-worker --err | grep "Failed"

# Common causes:
# - PDF download timeout
# - AI Engine overload
# - Invalid PDF URLs
# - Network issues
```

### Slow Processing

```bash
# Check if all workers active
pm2 status

# Check AI Engine load
pm2 monit

# Check queue backlog
./manage.sh queue-status

# Verify async optimization active
pm2 logs ai-engine | grep "INFO"
```

---

## 🎚️ Controlling the Scan

### Pause Scanning

```bash
# Stop queue workers (jobs remain queued)
pm2 stop queue-worker
```

### Resume Scanning

```bash
# Restart queue workers
pm2 restart queue-worker
```

### Cancel Pending Jobs

```bash
# Clear all pending jobs (⚠️ Use with caution)
cd api
php artisan queue:flush
```

### Speed Up Processing

```bash
# Add more queue workers (in ecosystem.config.js)
# Change instances from 4 to 8
pm2 restart queue-worker --instances 8
pm2 save
```

---

## 📊 Post-Scan Analysis

### Get Scan Statistics

```bash
# Total companies with scores
curl -s "$API_URL/companies?per_page=1000" \
  -H "Authorization: Bearer $TOKEN" | \
  jq '[.data[] | select(.latest_filing.score != null)] | length'

# Average score
curl -s "$API_URL/companies?per_page=1000" \
  -H "Authorization: Bearer $TOKEN" | \
  jq '[.data[] | .latest_filing.score.score // 0] | add / length'

# Top performers
curl -s "$API_URL/companies?sort=score&per_page=10" \
  -H "Authorization: Bearer $TOKEN" | \
  jq '.data[] | {symbol: .symbol, score: .latest_filing.score.score}'
```

### Export Results

```bash
# Export to CSV
curl -s "$API_URL/companies?per_page=1000&sort=score" \
  -H "Authorization: Bearer $TOKEN" | \
  jq -r '.data[] | [.symbol, .name, .latest_filing.score.score // "N/A"] | @csv' \
  > scan_results.csv
```

---

## 🔄 Recommended Workflow

### 1. Test Run (10-20 companies)
```bash
./bulk-scan.sh 20
./monitor-scan.sh
# Wait 10-15 minutes
# Verify results look good
```

### 2. Medium Run (50-100 companies)
```bash
./bulk-scan.sh 100
# Run monitor in background or check periodically
./manage.sh queue-status
# Wait 1-2 hours
```

### 3. Full Database Run (overnight)
```bash
# Start in evening
./bulk-scan.sh 718

# Optional: Monitor in separate terminal
./monitor-scan.sh

# Check in morning
./manage.sh queue-status
```

---

## ⚡ Performance Tips

### Maximize Throughput

1. **Ensure all services running**:
   ```bash
   pm2 status
   ```

2. **Verify async optimization**:
   ```bash
   pm2 logs ai-engine | grep "INFO.*HTTP.*200"
   ```

3. **Monitor resource usage**:
   ```bash
   pm2 monit
   ```

4. **Keep queue workers healthy**:
   ```bash
   # Restart if memory high
   pm2 restart queue-worker
   ```

### Avoid Bottlenecks

- ❌ Don't run multiple bulk scans simultaneously
- ❌ Don't restart services during active scan
- ✅ Do ensure good internet connection
- ✅ Do monitor disk space (logs can grow)

---

## 📁 Generated Files

During scan, these files are created:

- `/tmp/bulk-scan-progress.txt` - Progress tracking
- `~/.pm2/logs/queue-worker-*.log` - Worker logs
- `~/.pm2/logs/ai-engine-*.log` - AI Engine logs

**Cleanup** (optional):
```bash
rm /tmp/bulk-scan-progress.txt
pm2 flush  # Clear PM2 logs
```

---

## 🎯 Success Criteria

Scan is complete when:
- ✅ Pending jobs = 0
- ✅ Processing count = 0
- ✅ All companies show status "done"
- ✅ Monitor shows "All scans complete!"

---

## 📞 Quick Reference

```bash
# Start scan
./bulk-scan.sh <number>

# Monitor progress
./monitor-scan.sh

# Check queue
./manage.sh queue-status

# View logs
pm2 logs queue-worker

# Restart workers
pm2 restart queue-worker

# Check services
pm2 status

# Clear progress
rm /tmp/bulk-scan-progress.txt
```

---

**Last Updated**: 2026-06-21  
**Scan System**: Active and Optimized ✅  
**Async Performance**: 3-4x faster than baseline  
