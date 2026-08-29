<?php

namespace App\Services;

use App\Models\Filing;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class AiAnalysisService
{
    private string $aiEngineUrl;

    public function __construct()
    {
        $this->aiEngineUrl = config('services.ai_engine.url', 'http://localhost:8003');
    }

    /**
     * Send filing PDF to the Python AI engine and get structured analysis back.
     */
    public function analyze(Filing $filing): array
    {
        // Must stay below the queue worker --timeout so a slow AI engine fails
        // this attempt cleanly instead of the worker being force-killed (which
        // re-queues the job as a crashed attempt and multiplies duplicates).
        $response = Http::timeout(240)->connectTimeout(10)->post("{$this->aiEngineUrl}/analyze", [
            'filing_id' => $filing->id,
            'pdf_url'   => $filing->pdf_url,
            'company'   => $filing->company->name,
            'symbol'    => $filing->company->symbol,
            'quarter'   => $filing->quarter,
        ]);

        if (! $response->ok()) {
            throw new \RuntimeException("AI engine error: " . $response->status());
        }

        return $response->json();
    }
}
