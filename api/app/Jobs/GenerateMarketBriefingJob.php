<?php

namespace App\Jobs;

use App\Models\Company;
use App\Models\NewsArticle;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Generates an AI market briefing from current DB data.
 *
 * Because we don't yet have daily price tracking (Phase 1), we proxy "movers"
 * with companies that have recently-updated AI scores — sorted high/low.
 * Result is cached for 24 hours under 'market_briefing_latest'.
 */
class GenerateMarketBriefingJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 60;

    public function handle(): void
    {
        // ── Build top gainers/losers from AI scores ──────────────────────────
        $scored = DB::table('companies as c')
            ->join('filings as f', 'c.id', '=', 'f.company_id')
            ->join('scores as s', 'f.id', '=', 's.filing_id')
            ->joinSub(
                DB::table('filings')
                    ->selectRaw('company_id, MAX(filing_date) as max_date')
                    ->groupBy('company_id'),
                'lf',
                fn($j) => $j->on('f.company_id', '=', 'lf.company_id')->on('f.filing_date', '=', 'lf.max_date')
            )
            ->select('c.symbol', 'c.sector', 's.score', 'c.last_price')
            ->whereNotNull('s.score')
            ->orderByDesc('s.score')
            ->limit(20)
            ->get();

        if ($scored->isEmpty()) {
            Log::info('GenerateMarketBriefingJob: no scored companies, skipping');
            return;
        }

        // Top 5 by score = "gainers proxy", bottom 5 = "losers proxy"
        $topGainers = $scored->take(5)->map(fn($c) => [
            'symbol'     => $c->symbol,
            'change_pct' => round(($c->score - 50) / 5, 1), // score → implied sentiment %
            'price'      => $c->last_price,
        ])->values()->toArray();

        $topLosers = $scored->sortBy('score')->take(5)->map(fn($c) => [
            'symbol'     => $c->symbol,
            'change_pct' => round(($c->score - 50) / 5, 1),
            'price'      => $c->last_price,
        ])->values()->toArray();

        // Sector aggregates (avg score by sector)
        $sectorPerf = $scored->groupBy('sector')->map(function ($group) {
            $avg = $group->avg('score');
            return round(($avg - 50) / 5, 1);
        })->filter(fn($v, $k) => $k)->toArray();

        // Recent news headlines
        $headlines = NewsArticle::latest('published_at')
            ->limit(5)
            ->pluck('headline')
            ->toArray();

        // ── Call AI engine /generate-market-briefing ─────────────────────────
        $aiUrl = config('services.ai_engine.url', 'http://localhost:8003');

        try {
            $response = Http::timeout(30)->post("{$aiUrl}/generate-market-briefing", [
                'top_gainers'        => $topGainers,
                'top_losers'         => $topLosers,
                'sector_performance' => $sectorPerf,
                'news_headlines'     => $headlines,
            ]);

            if (! $response->ok()) {
                Log::warning("GenerateMarketBriefingJob: AI engine {$response->status()}");
                return;
            }

            $result = $response->json();
            $result['generated_at'] = now()->toIso8601String();
            $result['date']         = now()->toDateString();

            // Cache for 24 hours — refreshed on every global scan
            Cache::put('market_briefing_latest', $result, 86400);
            Log::info('GenerateMarketBriefingJob: briefing generated and cached');

        } catch (\Throwable $e) {
            Log::warning('GenerateMarketBriefingJob: failed: ' . $e->getMessage());
        }
    }
}
