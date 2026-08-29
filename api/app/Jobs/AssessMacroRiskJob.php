<?php

namespace App\Jobs;

use App\Models\Company;
use App\Models\MacroRisk;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class AssessMacroRiskJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 120;
    public int $tries   = 2;

    public function __construct(public readonly int $companyId) {}

    public function handle(): void
    {
        $company = Company::find($this->companyId);
        if (! $company) return;

        $aiEngineUrl = config('services.ai_engine.url', 'http://localhost:8003');

        try {
            $response = Http::timeout(90)->post("{$aiEngineUrl}/assess-macro-risk", [
                'company'       => $company->name,
                'symbol'        => $company->symbol,
                'sector'        => $company->sector ?? 'Unknown',
                'force_refresh' => true,
            ]);

            if (! $response->ok()) {
                Log::warning("AssessMacroRiskJob: HTTP {$response->status()} for {$company->symbol}");
                return;
            }

            $data = $response->json();

            // Clamp adjustment to [-20, +10]
            $adjustment = max(-20, min(10, (int) ($data['adjustment'] ?? 0)));

            MacroRisk::updateOrCreate(
                ['company_id' => $company->id],
                [
                    'adjustment'  => $adjustment,
                    'factors'     => $data['factors']  ?? [],
                    'severity'    => $data['severity']  ?? 'moderate',
                    'outlook'     => $data['outlook']   ?? 'neutral',
                    'summary'     => $data['summary']   ?? null,
                    'assessed_at' => now(),
                ]
            );
        } catch (\Throwable $e) {
            // Non-fatal — macro risk is supplemental; do not fail the overall pipeline
            Log::warning("AssessMacroRiskJob failed for {$company->symbol}: {$e->getMessage()}");
        }
    }
}
