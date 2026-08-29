<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class MonitorSystem extends Command
{
    protected $signature = 'system:monitor {--refresh=5 : Refresh interval in seconds}';
    protected $description = 'Monitor StockAnalyzer system health and progress';

    public function handle()
    {
        $refresh = (int) $this->option('refresh');

        while (true) {
            $this->clearScreen();
            $this->displayHeader();
            $this->displayFilingStats();
            $this->displayQueueStats();
            $this->displayWorkers();
            $this->displayAiEngine();
            $this->displayFooter($refresh);

            sleep($refresh);
        }
    }

    private function clearScreen()
    {
        $this->output->write("\033[2J\033[H");
    }

    private function displayHeader()
    {
        $this->line('');
        $this->info('╔════════════════════════════════════════════════════════════╗');
        $this->info('║         StockAnalyzer System Monitor                      ║');
        $this->info('║         ' . now()->format('Y-m-d H:i:s') . '                                 ║');
        $this->info('╚════════════════════════════════════════════════════════════╝');
        $this->line('');
    }

    private function displayFilingStats()
    {
        $processing = \App\Models\Filing::where('status', 'processing')->count();
        $pending = \App\Models\Filing::where('status', 'pending')->count();
        $done = \App\Models\Filing::where('status', 'done')->count();
        $failed = \App\Models\Filing::where('status', 'failed')->count();
        $total = \App\Models\Filing::count();

        $recentDone = \App\Models\Filing::where('status', 'done')
            ->where('updated_at', '>=', now()->subMinutes(5))
            ->count();
        $rate = round($recentDone / 5, 1);

        $this->line('<fg=cyan>📊 FILING STATUS</>');
        $this->line("  Processing: <fg=yellow>$processing</> | Pending: <fg=blue>$pending</> | Done: <fg=green>$done</> | Failed: <fg=red>$failed</>");
        $this->line("  Total: $total | Rate: <fg=green>~{$rate} filings/min</>");

        if ($pending > 0 && $rate > 0) {
            $eta = round($pending / $rate);
            $this->line("  ETA: <fg=yellow>~{$eta} minutes</> for pending filings");
        }
        $this->line('');
    }

    private function displayQueueStats()
    {
        $jobs = DB::table('jobs')->count();
        $defaultJobs = DB::table('jobs')->where('queue', 'default')->count();
        $rescanJobs = DB::table('jobs')->where('queue', 'rescan')->count();
        $failedJobs = DB::table('failed_jobs')->count();

        $this->line('<fg=cyan>📋 QUEUE STATUS</>');
        $this->line("  Jobs queued: <fg=yellow>$jobs</> (default: $defaultJobs, rescan: $rescanJobs)");
        $this->line("  Failed jobs: <fg=red>$failedJobs</>");
        $this->line('');
    }

    private function displayWorkers()
    {
        $count = (int) shell_exec("ps aux | grep 'queue:work' | grep -v grep | wc -l | xargs");

        $this->line('<fg=cyan>👷 QUEUE WORKERS</>');
        if ($count > 0) {
            $this->line("  Active workers: <fg=green>$count</>");
        } else {
            $this->line("  Active workers: <fg=red>$count (NOT RUNNING!)</>");
        }
        $this->line('');
    }

    private function displayAiEngine()
    {
        $unicornCount = (int) shell_exec("ps aux | grep -E 'uvicorn|gunicorn' | grep '8003\\|main:app' | grep -v grep | wc -l | xargs");

        $this->line('<fg=cyan>🤖 AI ENGINE</>');

        if ($unicornCount > 0) {
            $this->line("  Processes: <fg=green>$unicornCount</>");
        } else {
            $this->line("  Processes: <fg=red>$unicornCount (NOT RUNNING!)</>");
        }

        // Check health endpoint
        try {
            $response = Http::timeout(3)->get('http://localhost:8003/health');
            if ($response->successful()) {
                $data = $response->json();
                $status = $data['status'] ?? 'unknown';
                $model = $data['model'] ?? 'unknown';
                $this->line("  Status: <fg=green>$status</>");
                $this->line("  Model: $model");
            } else {
                $this->line("  Status: <fg=red>ERROR (HTTP {$response->status()})</>");
            }
        } catch (\Exception $e) {
            $this->line("  Status: <fg=red>UNREACHABLE</>");
        }
        $this->line('');
    }

    private function displayFooter($refresh)
    {
        $this->line('<fg=gray>Press Ctrl+C to exit | Refreshing every ' . $refresh . ' seconds...</>');
    }
}
