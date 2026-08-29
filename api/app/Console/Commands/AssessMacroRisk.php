<?php

namespace App\Console\Commands;

use App\Jobs\AssessMacroRiskJob;
use App\Models\Company;
use Illuminate\Console\Command;

class AssessMacroRisk extends Command
{
    protected $signature   = 'psx:assess-macro {--delay=5 : Seconds between dispatches}';
    protected $description = 'Reassess macro/geopolitical risk for all companies using live news, staggered to respect AI engine + search rate limits';

    public function handle(): int
    {
        $companies = Company::orderBy('symbol')->get();
        $delay     = (int) $this->option('delay');
        $i         = 0;

        foreach ($companies as $company) {
            // default queue: lower priority than `rescan`, so the daily batch never
            // blocks user-triggered rescans. Staggered so the AI engine's web search
            // + LLM calls aren't slammed all at once.
            AssessMacroRiskJob::dispatch($company->id)
                ->onQueue('default')
                ->delay(now()->addSeconds($i * $delay));
            $i++;
        }

        $minutes = $delay > 0 ? round($companies->count() * $delay / 60, 1) : 0;
        $this->info("Dispatched macro risk reassessment for {$companies->count()} companies (~{$minutes} min spread).");

        return self::SUCCESS;
    }
}
