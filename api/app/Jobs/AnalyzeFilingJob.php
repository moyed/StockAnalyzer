<?php

namespace App\Jobs;

use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class AnalyzeFilingJob implements ShouldQueue, ShouldBeUnique
{
    use Queueable;

    public int $timeout = 600;

    // Only one queued/processing job per filing at a time — repeated "Retry
    // Failed" / "Rescan All" clicks must not pile up duplicate jobs.
    // The lock normally releases as soon as the job finishes; this TTL is only a
    // safety net for locks orphaned by a crashed worker. It must therefore exceed
    // the time a job can sit in a full backlog (a 500-company rescan takes well
    // over an hour to drain) — otherwise the lock expires while the job is still
    // queued and the next dispatch enqueues a duplicate.
    public int $uniqueFor = 7200;

    public function __construct(public readonly int $filingId) {}

    public function uniqueId(): string
    {
        return (string) $this->filingId;
    }

    public function handle(\App\Services\AiAnalysisService $ai): void
    {
        $filing = \App\Models\Filing::findOrFail($this->filingId);

        // Skip if already analyzed or actively being processed by another worker
        if (in_array($filing->status, ['done', 'processing'])) return;

        // Placeholder records (pdf_url = 'no-filing') and other non-URLs can never
        // be analyzed — restore them to their terminal state instead of letting
        // them fail and churn through the retry loop forever.
        if (!str_starts_with((string) $filing->pdf_url, 'http')) {
            $filing->update([
                'status'      => 'done',
                'ai_analysis' => ['note' => 'No filings on PSX'],
            ]);
            return;
        }

        // Skip analysis for filings > 12 months old; just set score to 0
        $filingAgeMonths = \Carbon\Carbon::parse($filing->filing_date)->diffInMonths(now());
        if ($filingAgeMonths >= 12) {
            \App\Models\Score::updateOrCreate(
                ['filing_id' => $filing->id],
                [
                    'score'           => 0,
                    'flags'           => [],
                    'price_at_filing' => $filing->company->last_price,
                ]
            );
            $filing->update(['status' => 'done', 'ai_analysis' => ['note' => 'Filing too old (>12 months); analysis skipped']]);
            return;
        }

        $filing->update(['status' => 'processing']);

        try {
            $result = $ai->analyze($filing);

            // Extract financial metrics
            $financials = $result['financials'] ?? [];

            $filing->update([
                'ai_analysis'        => $result,
                'status'             => 'done',
                'eps'                => $financials['eps'] ?? null,
                'revenue'            => $financials['revenue'] ?? null,
                'net_profit'         => $financials['net_profit'] ?? null,
                'shares_outstanding' => $financials['shares_outstanding'] ?? null,
            ]);

            \App\Models\Score::updateOrCreate(
                ['filing_id' => $filing->id],
                [
                    'score'           => (int) ($result['score'] ?? 0),
                    'flags'           => is_array($result['flags'] ?? []) ? ($result['flags'] ?? []) : [],
                    'price_at_filing' => $filing->company->last_price,
                ],
            );

            $filing->company->update(['last_scanned_at' => now()]);

            // Auto-generate projection if this is the latest analyzed filing for the company
            $latestFilingId = \App\Models\Filing::where('company_id', $filing->company_id)
                ->whereNotNull('ai_analysis')
                ->orderByDesc('filing_date')
                ->value('id');

            if ($latestFilingId === $filing->id) {
                $projection = \App\Models\Projection::updateOrCreate(
                    ['company_id' => $filing->company_id, 'filing_id' => $filing->id],
                    ['status' => 'pending'],
                );
                \App\Jobs\GenerateProjectionJob::dispatch($projection->id)
                    ->onQueue($this->queue ?? 'default');
            }
        } catch (\Throwable $e) {
            $filing->update(['status' => 'failed']);
            throw $e;
        }
    }
}
