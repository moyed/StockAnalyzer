<?php

namespace App\Console\Commands;

use App\Models\Company;
use Illuminate\Console\Command;

class DailyScan extends Command
{
    protected $signature   = 'psx:daily-scan {--chunk=20 : Companies per batch} {--delay=30 : Seconds between batches}';
    protected $description = 'Scan all companies for new filings, distributed with delays to avoid API throttling';

    public function handle(): int
    {
        $this->info('Starting daily scan...');

        // Step 1: Bulk price update (fast, single HTTP call)
        $this->info('Updating stock prices...');
        $this->call('psx:update-prices');

        // Step 2: Global news scrape (Dawn, Express Tribune, Business Recorder, PSX announcements)
        $this->info('Dispatching global news scrape...');
        \App\Jobs\ScrapeNewsJob::dispatch()->delay(now()->addSeconds(5));

        // Step 3: Dispatch SyncCompanyFilingsJob for each company, staggered
        $companies = Company::orderBy('symbol')->get();
        $chunk     = (int) $this->option('chunk');
        $delay     = (int) $this->option('delay');
        $batches   = $companies->chunk($chunk);
        $total     = $companies->count();
        $dispatched = 0;

        $this->info("Dispatching {$total} company sync jobs in batches of {$chunk} ({$delay}s apart)...");

        foreach ($batches as $batchIndex => $batch) {
            $batchDelay = $batchIndex * $delay; // seconds from now

            foreach ($batch as $company) {
                \App\Jobs\SyncCompanyFilingsJob::dispatch($company->id)
                    ->delay(now()->addSeconds($batchDelay));
                $dispatched++;
            }
        }

        $totalMinutes = round(count($batches) * $delay / 60, 1);

        $this->info("Dispatched {$dispatched} jobs across " . count($batches) . " batches.");
        $this->info("Jobs will spread over ~{$totalMinutes} minutes.");
        $this->info('Queue workers will process filings and trigger AI analysis.');

        return self::SUCCESS;
    }
}
