<?php

namespace App\Jobs;

use App\Models\Projection;
use App\Models\Filing;
use App\Models\Company;
use App\Models\MacroRisk;
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
        $aiEngineUrl = config('services.ai_engine.url', 'http://localhost:8003');

        // Compute the next upcoming quarter from today, e.g. "Q3-2026"
        $now      = now();
        $q        = (int) ceil($now->month / 3);
        $nextQ    = $q === 4 ? 1 : $q + 1;
        $nextYear = $q === 4 ? $now->year + 1 : $now->year;
        $targetQuarter = "Q{$nextQ}-{$nextYear}";

        // Attach macro context if available
        $macroRisk   = MacroRisk::where('company_id', $company->id)->first();
        $macroContext = null;
        if ($macroRisk && $macroRisk->summary) {
            $adj = $macroRisk->adjustment >= 0 ? "+{$macroRisk->adjustment}" : (string) $macroRisk->adjustment;
            $macroContext = "Macro Risk ({$macroRisk->severity}, score adjustment {$adj}): {$macroRisk->summary}";
        }

        $dataAgeMonths = $filing->filing_date
            ? (int) \Carbon\Carbon::parse($filing->filing_date)->diffInMonths($now)
            : null;

        try {
            $payload = [
                'company'          => $company->name,
                'symbol'           => $company->symbol,
                'quarter'          => $filing->quarter,
                'target_quarter'   => $targetQuarter,
                'current_date'     => $now->toDateString(),
                'signals'          => $analysis['signals'] ?? [],
                'score'            => $filing->score?->score ?? 0,
                'flags'            => $filing->score?->flags ?? [],
                'summary'          => $analysis['summary'] ?? '',
                'current_price'    => $company->last_price ? (float) $company->last_price : null,
                'data_age_months'  => $dataAgeMonths,
            ];
            if ($macroContext) {
                $payload['macro_context'] = $macroContext;
            }

            $response = Http::timeout(150)->post("{$aiEngineUrl}/project", $payload);

            if (!$response->ok()) {
                $projection->update([
                    'status' => 'failed',
                    'error'  => "AI engine returned HTTP {$response->status()}: " . $response->body(),
                ]);
                return;
            }

            $result = array_merge($response->json(), ['target_quarter' => $targetQuarter]);

            $currentPrice = $company->last_price ? (float) $company->last_price : null;
            $upsideMin    = $result['target_upside_min_pct'] ?? null;
            $upsideMax    = $result['target_upside_max_pct'] ?? null;

            // Fallback: old AI prompt returned a single target_upside_pct — use as both bounds
            if ($upsideMin === null && $upsideMax === null && isset($result['target_upside_pct'])) {
                $upsideMin = (int) $result['target_upside_pct'];
                $upsideMax = (int) $result['target_upside_pct'];
                $result['target_upside_min_pct'] = $upsideMin;
                $result['target_upside_max_pct'] = $upsideMax;
            }

            if ($currentPrice !== null && $upsideMin !== null && $upsideMax !== null) {
                $result['projected_price_low']         = round($currentPrice * (1 + $upsideMin / 100), 2);
                $result['projected_price_high']        = round($currentPrice * (1 + $upsideMax / 100), 2);
                $result['current_price_at_projection'] = $currentPrice;

                // Calculate P/E ratios if EPS is available
                $eps = (float) ($filing->eps ?? 0);
                if ($eps > 0) {
                    $result['current_pe']        = round($currentPrice / $eps, 2);
                    $result['projected_pe_low']  = round($result['projected_price_low'] / $eps, 2);
                    $result['projected_pe_high'] = round($result['projected_price_high'] / $eps, 2);
                }
            }

            $projection->update([
                'status' => 'done',
                'result' => $result,
            ]);
        } catch (\Throwable $e) {
            $projection->update([
                'status' => 'failed',
                'error'  => $e->getMessage(),
            ]);
        }
    }
}
