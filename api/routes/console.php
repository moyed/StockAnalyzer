<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Daily scan at 2 PM IST (8:30 AM UTC) on weekdays
// Fetches prices, discovers new filings, queues AI analysis — all staggered
Schedule::command('psx:daily-scan')->weekdays()->dailyAt('14:00')->timezone('Asia/Kolkata');

// Daily bulk rescan of all companies at 11 PM PKT (just before midnight)
// Rescans latest filing for every company + reassesses macro risk
Schedule::command('psx:daily-rescan-all')->dailyAt('23:00')->timezone('Asia/Karachi');

// Daily macro/geopolitical risk reassessment for all companies at 8 AM PKT.
// Each job re-runs the live-news macro assessment (see AssessMacroRiskJob → AI engine).
Schedule::command('psx:assess-macro')->dailyAt('08:00')->timezone('Asia/Karachi');

// Daily price sync after PSX market close (3:30 PM PKT)
// Updates all company prices, which automatically updates P/E ratios
Schedule::command('psx:sync-prices')->weekdays()->dailyAt('15:45')->timezone('Asia/Karachi');

// Auto-flush failed jobs older than 24 hours (daily at midnight)
// Prevents failed jobs from blocking the queue
Schedule::command('queue:flush')->dailyAt('00:00')->timezone('Asia/Karachi');

// Weekly delisting check — marks companies no longer on PSX as inactive
Schedule::command('psx:sync-active')->weekly()->sundays()->at('06:00')->timezone('Asia/Karachi');

// Daily index constituent sync (KSE-100, KSE-30, KMI-30, KMI All Share, PSX All Share)
Schedule::command('psx:sync-indices')->dailyAt('16:15')->timezone('Asia/Karachi');

// Queue worker liveness probe — processed by workers every minute
Schedule::job(new \App\Jobs\WorkerHeartbeatJob)->everyMinute();
