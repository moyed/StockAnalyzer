<?php

namespace App\Console\Commands;

use App\Models\Company;
use App\Models\Filing;
use Illuminate\Console\Command;

class DailyRescanAll extends Command
{
    protected $signature   = 'psx:daily-rescan-all';
    protected $description = 'Rescan all companies\' latest filings and reassess macro risk daily';

    public function handle(): int
    {
        $this->info('Starting daily rescan of all companies...');

        $queued = 0;
        $now    = now();

        foreach (Company::where('id', '>', 0)->get() as $company) {
            $filing = $company->filings()->orderByDesc('filing_date')->first();
            if (!$filing) continue;

            // Skip placeholder records (pdf_url = 'no-filing') — nothing to analyze
            if (!str_starts_with((string) $filing->pdf_url, 'http')) continue;

            // Reset filing to pending so it gets analyzed
            $filing->update(['status' => 'pending']);

            // Queue analysis
            \App\Jobs\AnalyzeFilingJob::dispatch($filing->id)->onQueue('rescan');

            // Reassess macro risk
            \App\Jobs\AssessMacroRiskJob::dispatch($company->id)->onQueue('rescan');

            $queued++;
        }

        $this->info("✓ Queued rescan for {$queued} companies");
        $this->info("Jobs will be processed by queue workers over the next few hours");

        return self::SUCCESS;
    }
}
