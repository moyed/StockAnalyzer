<?php

namespace App\Jobs;

use App\Models\Company;
use App\Models\NewsArticle;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ExplainMovementJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 60;

    public function __construct(private readonly int $companyId) {}

    public function handle(): void
    {
        $company = Company::with(['latestFiling.score'])->find($this->companyId);
        if (! $company) return;

        $currentPrice  = $company->last_price ? (float) $company->last_price : null;
        $filing        = $company->latestFiling;
        $priceAtFiling = $filing?->score?->price_at_filing
            ? (float) $filing->score->price_at_filing
            : null;

        // Need at least current price to explain movement
        if (! $currentPrice) return;

        // ── Price change % since last filing ───────────────────────────────
        $priceChangePct = ($priceAtFiling && $priceAtFiling > 0)
            ? round((($currentPrice - $priceAtFiling) / $priceAtFiling) * 100, 2)
            : 0.0;

        // ── Volume ratio from earlier spike analysis (if available) ─────────
        $volumeAnalysis = $company->volume_analysis;
        $volumeRatio    = is_array($volumeAnalysis)
            ? (float) ($volumeAnalysis['volume_ratio'] ?? 1.0)
            : 1.0;

        // ── Recent news summary for this symbol ─────────────────────────────
        $recentNews = NewsArticle::forSymbol($company->symbol)
            ->latest('published_at')
            ->limit(3)
            ->pluck('ai_summary')
            ->filter()
            ->implode(' | ');

        // ── Call AI engine /explain-movement ────────────────────────────────
        $aiUrl = config('services.ai_engine.url', 'http://localhost:8003');

        try {
            $response = Http::timeout(30)->post("{$aiUrl}/explain-movement", [
                'symbol'            => $company->symbol,
                'price_change_pct'  => $priceChangePct,
                'volume_ratio'      => $volumeRatio,
                'recent_news'       => $recentNews ?: '',
                'sector_change_pct' => 0,
            ]);

            if (! $response->ok()) {
                Log::warning("ExplainMovementJob: AI engine {$response->status()} for {$company->symbol}");
                return;
            }

            $result = $response->json();
            $result['price_change_pct'] = $priceChangePct;
            $result['volume_ratio']     = $volumeRatio;
            $result['explained_at']     = now()->toIso8601String();

            $company->update(['movement_explanation' => $result]);
            Log::info("ExplainMovementJob: explained movement for {$company->symbol}");

        } catch (\Throwable $e) {
            Log::warning("ExplainMovementJob: failed for {$company->symbol}: {$e->getMessage()}");
        }
    }
}
