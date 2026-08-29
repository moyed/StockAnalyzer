<?php

namespace App\Jobs;

use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class ScanMonthJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 3600;

    public function __construct(public readonly string $month) {}

    public function handle(\App\Services\PsxScraperService $scraper): void
    {
        \Illuminate\Support\Facades\Cache::put("scan_scraping:{$this->month}", true, now()->addMinutes(30));

        $filings = $scraper->fetchTransmissions($this->month);

        foreach ($filings as $filingData) {
            $company = \App\Models\Company::firstOrCreate(
                ['symbol' => $filingData['symbol']],
                ['name' => $filingData['name'], 'sector' => $filingData['sector'] ?? null],
            );

            $existing = \App\Models\Filing::where('company_id', $company->id)
                ->where('quarter', $filingData['quarter'])
                ->first();

            if ($existing && $existing->status === 'done') {
                continue; // Already analyzed — skip
            }

            $filing = \App\Models\Filing::updateOrCreate(
                ['company_id' => $company->id, 'quarter' => $filingData['quarter']],
                [
                    'filing_date' => $filingData['filing_date'],
                    'pdf_url'     => $filingData['pdf_url'],
                    'status'      => 'pending',
                ],
            );

            \App\Jobs\AnalyzeFilingJob::dispatch($filing->id);
        }

        // Mark scrape as finished — even if 0 filings were found
        \Illuminate\Support\Facades\Cache::put(
            "scan_scraped:{$this->month}",
            ['count' => count($filings), 'at' => now()->toISOString()],
            now()->addHours(1)
        );
        \Illuminate\Support\Facades\Cache::forget("scan_scraping:{$this->month}");
    }
}
