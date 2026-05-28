<?php

namespace App\Jobs;

use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class ScanMonthJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 3600;

    public function __construct(public readonly string $month) {}

    public function handle(\App\Services\PsxScraperService $scraper, \App\Services\AiAnalysisService $ai): void
    {
        $filings = $scraper->fetchTransmissions($this->month);

        foreach ($filings as $filingData) {
            $company = \App\Models\Company::firstOrCreate(
                ['symbol' => $filingData['symbol']],
                ['name' => $filingData['name'], 'sector' => $filingData['sector'] ?? null],
            );

            $filing = \App\Models\Filing::updateOrCreate(
                ['company_id' => $company->id, 'quarter' => $filingData['quarter']],
                [
                    'filing_date' => $filingData['filing_date'],
                    'pdf_url'     => $filingData['pdf_url'],
                    'status'      => 'pending',
                ],
            );

            if ($filing->status !== 'done') {
                \App\Jobs\AnalyzeFilingJob::dispatch($filing->id);
            }
        }
    }
}
