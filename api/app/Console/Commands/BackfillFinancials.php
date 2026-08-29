<?php

namespace App\Console\Commands;

use App\Models\Filing;
use Illuminate\Console\Command;

class BackfillFinancials extends Command
{
    protected $signature = 'psx:backfill-financials';
    protected $description = 'Extract EPS and financials from existing AI analysis for all filings';

    public function handle(): int
    {
        $this->info('Starting financial data backfill...');

        $filings = Filing::whereNotNull('ai_analysis')
            ->where('status', 'done')
            ->get();

        $updated = 0;
        $skipped = 0;

        foreach ($filings as $filing) {
            $analysis = $filing->ai_analysis;

            if (!isset($analysis['financials'])) {
                $skipped++;
                continue;
            }

            $financials = $analysis['financials'];

            $filing->update([
                'eps'                => $financials['eps'] ?? null,
                'revenue'            => $financials['revenue'] ?? null,
                'net_profit'         => $financials['net_profit'] ?? null,
                'shares_outstanding' => $financials['shares_outstanding'] ?? null,
            ]);

            $updated++;

            if ($filing->eps && $filing->company->last_price) {
                $pe = round($filing->company->last_price / $filing->eps, 2);
                $this->line("  {$filing->company->symbol} ({$filing->quarter}): EPS {$filing->eps}, P/E {$pe}");
            }
        }

        $this->newLine();
        $this->info("✅ Updated {$updated} filings");
        $this->info("⏭️  Skipped {$skipped} filings (no financials in AI analysis)");

        return self::SUCCESS;
    }
}
