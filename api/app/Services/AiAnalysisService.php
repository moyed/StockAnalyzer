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
        $this->aiEngineUrl = config('services.ai_engine.url', 'http://localhost:8001');
    }

    /**
     * Send filing PDF to the Python AI engine and get structured analysis back.
     */
    public function analyze(Filing $filing): array
    {
        $response = Http::timeout(120)->post("{$this->aiEngineUrl}/analyze", [
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
