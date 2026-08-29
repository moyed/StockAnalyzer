<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;

class SystemController extends Controller
{
    private function countQueueWorkers(): int
    {
        return (int) shell_exec("ps aux | grep 'queue:work' | grep -v grep | wc -l | xargs");
    }

    public function restartWorkers()
    {
        try {
            // Send restart signal to workers, then poll until they've actually
            // exited instead of guessing with a fixed sleep — a slow worker
            // mid-job can take longer than 2s to reach its next restart check.
            Artisan::call('queue:restart');

            $waited = 0;
            while ($this->countQueueWorkers() > 0 && $waited < 8) {
                usleep(250_000);
                $waited += 0.25;
            }

            // Start new workers
            $workerCount = 10;
            $scriptPath = base_path('../start_workers.sh');

            // Create a simple worker start script. Queue order matches the
            // rest of the app (rescan jobs take priority over default).
            $script = "#!/bin/bash\n";
            $script .= "cd " . escapeshellarg(base_path()) . "\n";
            for ($i = 1; $i <= $workerCount; $i++) {
                $script .= "nohup php artisan queue:work --queue=rescan,default --sleep=1 --tries=3 --timeout=600 < /dev/null >> storage/logs/queue-worker-{$i}.log 2>&1 &\n";
            }
            $script .= "disown -a 2>/dev/null || true\n";
            file_put_contents($scriptPath, $script);
            chmod($scriptPath, 0755);

            // Execute the script, then poll for workers to actually come up
            // rather than assuming a fixed sleep was long enough.
            // Path can contain spaces, so it must be quoted for the shell.
            shell_exec(escapeshellarg($scriptPath));

            $waited = 0;
            while ($this->countQueueWorkers() < $workerCount && $waited < 8) {
                usleep(250_000);
                $waited += 0.25;
            }

            $count = $this->countQueueWorkers();

            return response()->json([
                'success' => $count > 0,
                'message' => $count > 0
                    ? "Queue workers restarted successfully ({$count} running)"
                    : 'Restart signal sent, but no worker processes came up',
                'workers_running' => $count,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to restart workers: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function restartAiEngine()
    {
        try {
            $aiEnginePath = base_path('../ai-engine');

            // Kill existing AI engine processes
            shell_exec("pkill -f 'uvicorn main:app.*8003' 2>/dev/null");
            shell_exec("pkill -f 'gunicorn main:app' 2>/dev/null");
            sleep(2);

            // Start AI engine with 10 workers (matches start-ai-engine.sh default)
            $command = "cd " . escapeshellarg($aiEnginePath) . " && source venv/bin/activate && nohup uvicorn main:app --host 0.0.0.0 --port 8003 --workers 10 >> logs/ai_engine.log 2>&1 &";
            shell_exec($command);
            sleep(3);

            // Verify it's running
            $processCount = (int) shell_exec("ps aux | grep -E 'uvicorn|gunicorn' | grep '8003\\|main:app' | grep -v grep | wc -l | xargs");
            $health = shell_exec("curl -s -m 2 http://localhost:8003/health 2>&1");
            $healthData = json_decode($health, true);

            return response()->json([
                'success' => $processCount > 0,
                'message' => $processCount > 0 ? 'AI engine restarted successfully' : 'AI engine started but verification failed',
                'process_count' => $processCount,
                'status' => $healthData['status'] ?? 'unknown',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to restart AI engine: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function restartAll()
    {
        try {
            $results = [
                'workers' => false,
                'ai_engine' => false,
            ];

            // Restart workers
            $workersResponse = $this->restartWorkers();
            $workersData = $workersResponse->getData(true);
            $results['workers'] = $workersData['success'] ?? false;

            // Restart AI engine
            $aiResponse = $this->restartAiEngine();
            $aiData = $aiResponse->getData(true);
            $results['ai_engine'] = $aiData['success'] ?? false;

            $allSuccess = $results['workers'] && $results['ai_engine'];

            return response()->json([
                'success' => $allSuccess,
                'message' => $allSuccess
                    ? 'All services restarted successfully'
                    : 'Some services failed to restart',
                'results' => $results,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to restart services: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function resetStuckFilings()
    {
        try {
            $count = \Illuminate\Support\Facades\DB::table('filings')
                ->where('status', 'processing')
                ->update(['status' => 'pending']);

            return response()->json([
                'success' => true,
                'message' => "Reset {$count} stuck filings to pending",
                'count' => $count,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to reset stuck filings: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function clearFailedJobs()
    {
        try {
            $count = \Illuminate\Support\Facades\DB::table('failed_jobs')->count();
            \Illuminate\Support\Facades\DB::table('failed_jobs')->truncate();

            return response()->json([
                'success' => true,
                'message' => "Cleared {$count} failed jobs",
                'count' => $count,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to clear failed jobs: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function retryFailedJobs()
    {
        try {
            $count = \Illuminate\Support\Facades\DB::table('failed_jobs')->count();

            if ($count === 0) {
                return response()->json([
                    'success' => true,
                    'message' => 'No failed jobs to retry',
                    'count' => 0,
                ]);
            }

            // Retry all failed jobs
            Artisan::call('queue:retry', ['id' => 'all']);

            return response()->json([
                'success' => true,
                'message' => "Retrying {$count} failed jobs",
                'count' => $count,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to retry jobs: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function retryFailedFilings()
    {
        try {
            // Reset failed filings status to pending — placeholder records
            // (pdf_url = 'no-filing') are excluded since they can never succeed
            $count = \Illuminate\Support\Facades\DB::table('filings')
                ->where('status', 'failed')
                ->where('pdf_url', 'like', 'http%')
                ->update(['status' => 'pending']);

            // Dispatch jobs for all pending filings (including newly retried ones)
            $pending = \App\Models\Filing::where('status', 'pending')
                ->where('pdf_url', 'like', 'http%')
                ->get();
            $queued = 0;

            foreach ($pending as $filing) {
                \App\Jobs\AnalyzeFilingJob::dispatch($filing->id);
                $queued++;
            }

            // Also retry failed jobs in the queue
            Artisan::call('queue:retry', ['id' => 'all']);

            return response()->json([
                'success' => true,
                'message' => "Reset {$count} failed filings and queued {$queued} jobs for processing",
                'count' => $count,
                'queued' => $queued,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to retry failed filings: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function processPendingFilings()
    {
        try {
            // Dispatch jobs for all pending filings (placeholder records excluded)
            $pending = \App\Models\Filing::where('status', 'pending')
                ->where('pdf_url', 'like', 'http%')
                ->get();
            $queued = 0;

            foreach ($pending as $filing) {
                \App\Jobs\AnalyzeFilingJob::dispatch($filing->id);
                $queued++;
            }

            return response()->json([
                'success' => true,
                'message' => "Dispatched {$queued} jobs for pending filings",
                'queued' => $queued,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to process pending filings: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function updatePeRatios()
    {
        try {
            $companies = \App\Models\Company::with(['latestFiling' => function ($query) {
                $query->whereNotNull('eps')->where('eps', '>', 0);
            }])->get();

            $updated = 0;
            $skipped = 0;

            foreach ($companies as $company) {
                // Skip if no price or no EPS data
                if (!$company->last_price || !$company->latestFiling || !$company->latestFiling->eps) {
                    $skipped++;
                    continue;
                }

                $eps = (float) $company->latestFiling->eps;

                // Skip if EPS is zero or negative (invalid P/E)
                if ($eps <= 0) {
                    $skipped++;
                    continue;
                }

                // Calculate P/E ratio: Price / EPS
                $peRatio = round($company->last_price / $eps, 2);

                $company->update([
                    'pe_ratio' => $peRatio,
                    'pe_updated_at' => now(),
                ]);

                $updated++;
            }

            return response()->json([
                'success' => true,
                'message' => "Updated P/E ratios for {$updated} companies, skipped {$skipped}",
                'updated' => $updated,
                'skipped' => $skipped,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update P/E ratios: ' . $e->getMessage(),
            ], 500);
        }
    }
}
