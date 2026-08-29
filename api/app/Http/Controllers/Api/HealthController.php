<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class HealthController extends Controller
{
    public function index()
    {
        return response()->json([
            'timestamp' => now()->toIso8601String(),
            'filings' => $this->getFilingStats(),
            'queue' => $this->getQueueStats(),
            'workers' => $this->getWorkerStats(),
            'ai_engine' => $this->getAiEngineStats(),
            'database' => $this->getDatabaseStats(),
            'system' => $this->getSystemStats(),
        ]);
    }

    // Individual async endpoints for lazy loading
    public function filings()
    {
        return response()->json($this->getFilingStats());
    }

    public function queue()
    {
        return response()->json($this->getQueueStats());
    }

    public function workers()
    {
        return response()->json($this->getWorkerStats());
    }

    public function aiEngine()
    {
        return response()->json($this->getAiEngineStats());
    }

    public function database()
    {
        return response()->json($this->getDatabaseStats());
    }

    public function system()
    {
        return response()->json($this->getSystemStats());
    }

    private function getFilingStats()
    {
        $processing = \App\Models\Filing::where('status', 'processing')->count();
        $pending = \App\Models\Filing::where('status', 'pending')->count();
        $done = \App\Models\Filing::where('status', 'done')->count();
        $failed = \App\Models\Filing::where('status', 'failed')->count();
        $total = \App\Models\Filing::count();

        $recentDone = \App\Models\Filing::where('status', 'done')
            ->where('updated_at', '>=', now()->subMinutes(5))
            ->count();
        $rate = round($recentDone / 5, 2);

        $eta = null;
        if ($pending > 0 && $rate > 0) {
            $eta = round($pending / $rate);
        }

        $totalCompanies = \App\Models\Company::count();
        $scannedToday = \App\Models\Company::whereDate('last_scanned_at', today())->count();

        return [
            'processing' => $processing,
            'pending' => $pending,
            'done' => $done,
            'failed' => $failed,
            'total' => $total,
            'rate_per_minute' => $rate,
            'eta_minutes' => $eta,
            'percent_complete' => $total > 0 ? round(($done / $total) * 100, 1) : 0,
            'companies_scanned_today' => $scannedToday,
            'total_companies' => $totalCompanies,
        ];
    }

    private function getQueueStats()
    {
        $total = DB::table('jobs')->count();
        $default = DB::table('jobs')->where('queue', 'default')->count();
        $rescan = DB::table('jobs')->where('queue', 'rescan')->count();
        $failed = DB::table('failed_jobs')->count();

        // Get job type breakdown
        $jobTypes = [];
        if ($total > 0) {
            $jobs = DB::table('jobs')->get(['payload', 'created_at']);
            foreach ($jobs as $job) {
                $payload = json_decode($job->payload, true);
                $className = $payload['displayName'] ?? 'Unknown';
                $shortName = class_basename($className);

                if (!isset($jobTypes[$shortName])) {
                    $jobTypes[$shortName] = [
                        'count' => 0,
                        'oldest' => $job->created_at,
                        'newest' => $job->created_at,
                    ];
                }
                $jobTypes[$shortName]['count']++;

                if ($job->created_at < $jobTypes[$shortName]['oldest']) {
                    $jobTypes[$shortName]['oldest'] = $job->created_at;
                }
                if ($job->created_at > $jobTypes[$shortName]['newest']) {
                    $jobTypes[$shortName]['newest'] = $job->created_at;
                }
            }

            // Convert Unix timestamps to ISO strings for each job type
            foreach ($jobTypes as $shortName => &$info) {
                $info['oldest'] = Carbon::createFromTimestamp($info['oldest'])->toIso8601String();
                $info['newest'] = Carbon::createFromTimestamp($info['newest'])->toIso8601String();
            }
        }

        // Get oldest and newest job timestamps
        $oldestJob = DB::table('jobs')->orderBy('created_at', 'asc')->first();
        $newestJob = DB::table('jobs')->orderBy('created_at', 'desc')->first();

        return [
            'total_jobs' => $total,
            'default_queue' => $default,
            'rescan_queue' => $rescan,
            'failed_jobs' => $failed,
            'status' => $total > 0 ? 'active' : 'idle',
            'job_types' => $jobTypes,
            'oldest_job_at' => $oldestJob ? Carbon::createFromTimestamp($oldestJob->created_at)->toIso8601String() : null,
            'newest_job_at' => $newestJob ? Carbon::createFromTimestamp($newestJob->created_at)->toIso8601String() : null,
        ];
    }

    private function getWorkerStats()
    {
        $count = (int) shell_exec("ps aux | grep 'queue:work' | grep -v grep | wc -l | xargs");

        return [
            'count' => $count,
            'status' => $count > 0 ? 'running' : 'stopped',
            'healthy' => $count >= 1,
        ];
    }

    private function getAiEngineStats()
    {
        $processCount = (int) shell_exec("ps aux | grep -E 'uvicorn|gunicorn' | grep '8003\\|main:app' | grep -v grep | wc -l | xargs");

        // Count worker child processes (multiprocessing workers spawned by uvicorn --workers)
        $workerCount = (int) shell_exec("ps aux | grep 'multiprocessing' | grep -E 'spawn_main|Python' | grep -v grep | wc -l | xargs");

        $health = [
            'process_count' => $processCount,
            'worker_count' => $workerCount,
            'status' => 'unknown',
            'healthy' => false,
            'model' => null,
            'features' => [],
            'response_time_ms' => null,
        ];

        // If process is running, try direct shell test first
        if ($processCount > 0) {
            $curlTest = shell_exec("curl -s -m 2 http://localhost:8003/health 2>&1");
            if ($curlTest && str_contains($curlTest, '"status"')) {
                $data = json_decode($curlTest, true);
                if ($data) {
                    $health['status'] = $data['status'] ?? 'ok';
                    $health['healthy'] = $health['status'] === 'ok';
                    $health['model'] = $data['model'] ?? null;
                    $health['features'] = $data['features'] ?? [];
                    $health['response_time_ms'] = 50; // Approximate
                    return $health;
                }
            }
        }

        // Fallback to HTTP client with longer timeout
        try {
            $start = microtime(true);
            $response = Http::timeout(10)
                ->withOptions(['verify' => false])
                ->get('http://localhost:8003/health');
            $responseTime = round((microtime(true) - $start) * 1000, 2);

            if ($response->successful()) {
                $data = $response->json();
                $health['status'] = $data['status'] ?? 'unknown';
                $health['healthy'] = $health['status'] === 'ok';
                $health['model'] = $data['model'] ?? null;
                $health['features'] = $data['features'] ?? [];
                $health['response_time_ms'] = $responseTime;
            } else {
                $health['status'] = 'error';
                $health['error'] = 'HTTP ' . $response->status();
            }
        } catch (\Exception $e) {
            // If process is running but HTTP fails, mark as degraded not unreachable
            if ($processCount > 0) {
                $health['status'] = 'degraded';
                $health['healthy'] = false;
                $health['error'] = 'Process running but HTTP unreachable: ' . $e->getMessage();
            } else {
                $health['status'] = 'stopped';
                $health['error'] = 'No process running';
            }
        }

        return $health;
    }

    private function getDatabaseStats()
    {
        try {
            $start = microtime(true);
            DB::connection()->getPdo();
            $responseTime = round((microtime(true) - $start) * 1000, 2);

            return [
                'status' => 'connected',
                'healthy' => true,
                'response_time_ms' => $responseTime,
                'driver' => DB::connection()->getDriverName(),
            ];
        } catch (\Exception $e) {
            return [
                'status' => 'error',
                'healthy' => false,
                'error' => $e->getMessage(),
            ];
        }
    }

    private function getSystemStats()
    {
        $loadAvg = function_exists('sys_getloadavg') ? sys_getloadavg() : null;

        return [
            'php_version' => PHP_VERSION,
            'laravel_version' => app()->version(),
            'environment' => app()->environment(),
            'load_average' => $loadAvg ? round($loadAvg[0], 2) : null,
            'timezone' => config('app.timezone'),
        ];
    }
}
