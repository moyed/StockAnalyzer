<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;

/**
 * Tiny job dispatched every minute by the scheduler.
 * When a worker picks it up it writes a cache timestamp,
 * which the /api/health endpoint reads to confirm workers are alive.
 */
class WorkerHeartbeatJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(): void
    {
        // TTL = 3 minutes — if no worker processes a job within 3 min, health degrades
        Cache::put('queue_worker_heartbeat', now()->toIso8601String(), 180);
    }
}
