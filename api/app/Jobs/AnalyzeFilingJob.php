<?php

namespace App\Jobs;

use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class AnalyzeFilingJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 300;

    public function __construct(public readonly int $filingId) {}

    public function handle(\App\Services\AiAnalysisService $ai): void
    {
        $filing = \App\Models\Filing::findOrFail($this->filingId);
        $filing->update(['status' => 'processing']);

        try {
            $result = $ai->analyze($filing);

            $filing->update([
                'ai_analysis' => $result,
                'status'      => 'done',
            ]);

            \App\Models\Score::updateOrCreate(
                ['filing_id' => $filing->id],
                [
                    'score'           => (int) ($result['score'] ?? 0),
                    'flags'           => is_array($result['flags'] ?? []) ? ($result['flags'] ?? []) : [],
                    'price_at_filing' => $filing->company->last_price,
                ],
            );
        } catch (\Throwable $e) {
            $filing->update(['status' => 'failed']);
            throw $e;
        }
    }
}
