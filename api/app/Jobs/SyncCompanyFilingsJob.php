<?php

namespace App\Jobs;

use App\Models\Company;
use App\Models\Filing;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SyncCompanyFilingsJob implements ShouldQueue, ShouldBeUnique
{
    use Queueable;

    public int $timeout = 120;
    public int $tries   = 2;

    // One sync per company at a time. Re-running psx:sync-all-filings (or a
    // "Scan" click) while a previous sweep is still queued would otherwise
    // enqueue a second copy per company and starve the analysis work.
    // TTL must exceed how long a job can sit in a full 603-company backlog.
    public int $uniqueFor = 7200;

    public function __construct(public readonly int $companyId) {}

    public function uniqueId(): string
    {
        return (string) $this->companyId;
    }

    public function handle(): void
    {
        $company = Company::find($this->companyId);
        if (! $company) return;

        $symbol = $company->symbol;

        $response = Http::timeout(30)
            ->withHeaders([
                'Referer'             => "https://dps.psx.com.pk/company/{$symbol}",
                'X-Requested-With'    => 'XMLHttpRequest',
            ])
            ->get("https://dps.psx.com.pk/company/reports/{$symbol}");

        if (! $response->ok()) {
            Log::warning("SyncCompanyFilingsJob: HTTP {$response->status()} for {$symbol}");
            return;
        }

        $reports = $this->parseReports($response->body());
        $cutoff  = now()->subYears(2)->toDateString();

        foreach ($reports as $report) {
            // Skip filings older than 2 years
            if ($report['posting_date'] < $cutoff) continue;

            $quarter = $this->periodToQuarter($report['type'], $report['period']);
            if (! $quarter) continue;

            $existing = Filing::where('company_id', $company->id)
                ->where('quarter', $quarter)
                ->first();

            // Skip if already successfully analyzed
            if ($existing && $existing->status === 'done') continue;

            if ($existing) {
                // Update metadata only — never overwrite status of an existing filing
                $existing->update([
                    'filing_date' => $report['posting_date'],
                    'pdf_url'     => $report['pdf_url'],
                ]);
                $filing = $existing;
            } else {
                $filing = Filing::create([
                    'company_id'  => $company->id,
                    'quarter'     => $quarter,
                    'filing_date' => $report['posting_date'],
                    'pdf_url'     => $report['pdf_url'],
                    'status'      => 'pending',
                ]);
            }

            // Analysis goes on the priority queue: workers drain `rescan` before
            // `default`, so a newly discovered filing is analyzed promptly instead
            // of queueing behind a 600-company bulk sync sweep.
            AnalyzeFilingJob::dispatch($filing->id)->onQueue('rescan');
        }

        $this->syncCompanyPrice($company);
    }

    private function syncCompanyPrice(Company $company): void
    {
        try {
            $page = Http::timeout(10)->get("https://dps.psx.com.pk/company/{$company->symbol}");
            if ($page->ok() && preg_match(
                '/<div[^>]*class="quote__close"[^>]*>\s*Rs\.([\d.,]+)\s*<\/div>/i',
                $page->body(),
                $m
            )) {
                $price = (float) str_replace(',', '', $m[1]);
                if ($price > 0) {
                    $company->update([
                        'last_price'       => $price,
                        'price_updated_at' => now(),
                    ]);
                }
            }
        } catch (\Throwable) {
            // Non-fatal
        }
    }

    private function parseReports(string $html): array
    {
        $dom = new \DOMDocument();
        @$dom->loadHTML('<meta charset="utf-8">' . $html);
        $xpath = new \DOMXPath($dom);
        $rows  = $xpath->query('//table//tbody/tr');

        $results = [];
        foreach ($rows as $row) {
            $cells = $xpath->query('td', $row);
            if ($cells->length < 3) continue;

            // Cell 0: link with type text (Annual/Quarterly)
            $link    = $xpath->query('.//a', $cells->item(0))->item(0);
            if (! $link) continue;

            $pdfUrl  = $link->getAttribute('href');
            $type    = trim($link->textContent);
            $period  = trim($cells->item(1)->textContent);
            $posting = trim($cells->item(2)->textContent);

            if (! $pdfUrl || ! $period) continue;

            $results[] = [
                'type'         => $type,
                'period'       => $period,
                'posting_date' => $this->parseDate($posting),
                'pdf_url'      => $pdfUrl,
            ];
        }

        return $results;
    }

    /** Map period end to a stable quarter key: Q1-2024, Q2-2024, Q3-2024, FY-2024 */
    private function periodToQuarter(string $type, string $period): ?string
    {
        // Annual with just a year: "2024"
        if (preg_match('/^\d{4}$/', $period)) {
            return "FY-{$period}";
        }

        // Full date: "2024-03-31"
        try {
            $date  = \Carbon\Carbon::parse($period);
            $month = $date->month;
            $year  = $date->year;

            // Map month to calendar quarter of the period end
            $q = (int) ceil($month / 3);

            if ($type === 'Annual' || $month === 12) {
                return "FY-{$year}";
            }

            return "Q{$q}-{$year}";
        } catch (\Throwable) {
            return null;
        }
    }

    private function parseDate(string $raw): string
    {
        try {
            return \Carbon\Carbon::parse($raw)->toDateString();
        } catch (\Throwable) {
            return now()->toDateString();
        }
    }
}
