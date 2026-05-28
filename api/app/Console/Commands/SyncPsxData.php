<?php

namespace App\Console\Commands;

use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('psx:sync {--month= : Year-month to sync, e.g. 2024-04 (defaults to current month)}')]
#[Description('Sync PSX transmission filings and queue AI analysis jobs')]
class SyncPsxData extends Command
{
    public function handle(\App\Services\PsxScraperService $scraper): int
    {
        $month = $this->option('month') ?? now()->format('Y-m');
        $this->info("Syncing PSX transmissions for {$month}...");

        \App\Jobs\ScanMonthJob::dispatch($month);

        $this->info("Scan job dispatched. Queue workers will process filings.");
        return 0;
    }
}
