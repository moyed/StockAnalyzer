<?php

namespace App\Console\Commands;

use App\Models\Company;
use App\Models\Score;
use Illuminate\Console\Command;

class MarkStaleCompanies extends Command
{
    protected $signature = 'companies:mark-stale {--months=12 : Age threshold in months}';
    protected $description = 'Mark companies with no recent filings (>12 months) with score = 0';

    public function handle()
    {
        $months = (int) $this->option('months');
        $this->info("Finding companies with no filing in last {$months} months...");

        $staleCompanies = Company::where('id', '>', 0)
            ->with(['filings' => function ($q) {
                $q->orderByDesc('filing_date')->limit(1);
            }])
            ->get()
            ->filter(function ($c) use ($months) {
                if ($c->filings->isEmpty()) return true;
                $latestFiling = $c->filings->first();
                return \Carbon\Carbon::parse($latestFiling->filing_date)->diffInMonths(now()) >= $months;
            });

        $this->info("Found {$staleCompanies->count()} stale companies");

        $updated = 0;
        foreach ($staleCompanies as $company) {
            $latestFiling = $company->filings->first();
            if ($latestFiling) {
                Score::updateOrCreate(
                    ['filing_id' => $latestFiling->id],
                    [
                        'score'           => 0,
                        'flags'           => [],
                        'price_at_filing' => $company->last_price,
                    ]
                );
            } else {
                // For companies with NO filings, create a dummy filing record and score
                $filingRecord = \App\Models\Filing::create([
                    'company_id' => $company->id,
                    'filing_date' => now(),
                    'quarter' => 'N/A',
                    'pdf_url' => 'no-filing',
                    'status' => 'done',
                    'ai_analysis' => ['note' => 'No filings on PSX'],
                ]);
                Score::create([
                    'filing_id' => $filingRecord->id,
                    'score' => 0,
                    'flags' => [],
                    'price_at_filing' => $company->last_price,
                ]);
            }
            $updated++;
        }

        $this->info("✓ Updated {$updated} stale companies with score = 0");
    }
}
