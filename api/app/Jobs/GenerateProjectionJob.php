<?php

namespace App\Jobs;

use App\Models\Projection;
use App\Models\Filing;
use App\Models\Company;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Http;

class GenerateProjectionJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 180;

    public function __construct(
        public readonly int $projectionId,
    ) {}

    public function handle(): void
    {
        $projection = Projection::findOrFail($this->projectionId);
        $projection->update(['status' => 'processing']);

        $company = Company::findOrFail($projection->company_id);
        $filing  = Filing::with('score')->findOrFail($projection->filing_id);

        if (!$filing->ai_analysis) {
            $projection->update(['status' => 'failed', 'error' => 'No AI analysis on filing']);
            return;
        }

        $analysis    = $filing->ai_analysis;
        $aiEngineUrl = config('services.ai_engine.url', 'http://localhost:8001');

        try {
            $response = Http::timeout(150)->post("{$aiEngineUrl}/project", [
                'company'       => $company->name,
                'symbol'        => $company->symbol,
                'quarter'       => $filing->quarter,
                'signals'       => $analysis['signals'] ?? [],
                'score'         => $filing->score?->score ?? 0,
                'flags'         => $filing->score?->flags ?? [],
                'summary'       => $analysis['summary'] ?? '',
                'current_price' => $company->last_price ? (float) $company->last_price : null,
            ]);

            if (!$response->ok()) {
                $projection->update([
                    'status' => 'failed',
                    'error'  => "AI engine returned HTTP {$response->status()}: " . $response->body(),
                ]);
                return;
            }

            $projection->update([
                'status' => 'done',
                'result' => $response->json(),
            ]);
        } catch (\Throwable $e) {
            $projection->update([
                'status' => 'failed',
                'error'  => $e->getMessage(),
            ]);
        }
    }
}
