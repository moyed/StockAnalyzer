<?php

namespace App\Jobs;

use App\Models\Company;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class DetectVolumeSpikeJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 60;

    public function __construct(private readonly int $companyId) {}

    public function handle(): void
    {
        $company = Company::find($this->companyId);
        if (! $company) return;

        // ── 1. Fetch last 31 trading days from PSX ──────────────────────────
        $from = now()->subDays(45)->toDateString();  // extra buffer for weekends/holidays
        $to   = now()->toDateString();

        try {
            $response = Http::timeout(20)
                ->withHeaders(['Referer' => 'https://dps.psx.com.pk/historical'])
                ->asForm()
                ->post('https://dps.psx.com.pk/historical', [
                    'symbol' => $company->symbol,
                    'start'  => $from,
                    'end'    => $to,
                ]);

            if (! $response->ok()) {
                Log::warning("DetectVolumeSpikeJob: PSX historical {$response->status()} for {$company->symbol}");
                return;
            }

            $rows = $this->parsePriceHistory($response->body());
        } catch (\Throwable $e) {
            Log::warning("DetectVolumeSpikeJob: fetch failed for {$company->symbol}: {$e->getMessage()}");
            return;
        }

        if (count($rows) < 2) return;

        // Most recent day is last in the array
        $latest   = end($rows);
        $previous = $rows[count($rows) - 2];

        // Average volume over the 30 days before the latest
        $history  = array_slice($rows, 0, -1);
        $last30   = array_slice($history, -30);
        $avgVolume = count($last30) > 0
            ? (int) (array_sum(array_column($last30, 'volume')) / count($last30))
            : 0;

        if ($avgVolume === 0) return;

        // ── 2. Call AI engine /detect-volume-spike ───────────────────────────
        $aiUrl = config('services.ai_engine.url', 'http://localhost:8003');

        try {
            $result = Http::timeout(30)->post("{$aiUrl}/detect-volume-spike", [
                'symbol'          => $company->symbol,
                'current_volume'  => (int) $latest['volume'],
                'avg_30d_volume'  => $avgVolume,
                'current_price'   => (float) $latest['close'],
                'prev_close'      => (float) $previous['close'],
            ]);

            if (! $result->ok()) {
                Log::warning("DetectVolumeSpikeJob: AI engine {$result->status()} for {$company->symbol}");
                return;
            }

            $analysis = $result->json();
            $analysis['analyzed_at'] = now()->toIso8601String();
            $analysis['date']        = $latest['date'];

            $company->update(['volume_analysis' => $analysis]);
            Log::info("DetectVolumeSpikeJob: {$company->symbol} spike={$analysis['spike_detected']} ratio={$analysis['volume_ratio']}");

        } catch (\Throwable $e) {
            Log::warning("DetectVolumeSpikeJob: AI call failed for {$company->symbol}: {$e->getMessage()}");
        }
    }

    private function parsePriceHistory(string $html): array
    {
        $dom = new \DOMDocument();
        @$dom->loadHTML('<meta charset="utf-8">' . $html);
        $xpath = new \DOMXPath($dom);
        $rows  = $xpath->query('//table[@id="historicalTable"]//tbody/tr');

        if (! $rows || $rows->length === 0) return [];

        $data = [];
        foreach ($rows as $row) {
            $cells = $xpath->query('td', $row);
            if ($cells->length < 6) continue;

            try {
                $date = \Carbon\Carbon::parse(trim($cells->item(0)->textContent))->toDateString();
            } catch (\Throwable) { continue; }

            $clean = fn(string $v) => (float) str_replace(',', '', trim($v));

            $data[] = [
                'date'   => $date,
                'close'  => $clean($cells->item(4)->textContent),
                'volume' => (int) str_replace(',', '', trim($cells->item(5)->textContent)),
            ];
        }

        // PSX returns newest first — reverse so oldest is index 0
        return array_reverse($data);
    }
}
