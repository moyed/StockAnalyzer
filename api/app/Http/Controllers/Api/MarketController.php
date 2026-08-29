<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class MarketController extends Controller
{
    public function kse100(Request $request)
    {
        $period = $request->query('period', '3M');

        $from = match ($period) {
            '1W' => now()->subWeek(),
            '1M' => now()->subMonth(),
            '3M' => now()->subMonths(3),
            '6M' => now()->subMonths(6),
            '1Y' => now()->subYear(),
            '5Y' => now()->subYears(5),
            default => now()->subMonths(3),
        };

        $fromDate = $from->toDateString();

        // Cache the full parse once; slice per-period from it
        $allPoints = Cache::remember('kse100:all', 30 * 60, function () {
            $response = Http::timeout(20)
                ->withHeaders([
                    'Referer'          => 'https://dps.psx.com.pk/historical',
                    'X-Requested-With' => 'XMLHttpRequest',
                    'User-Agent'       => 'Mozilla/5.0 (compatible; PSXBot/1.0)',
                ])
                ->asForm()
                ->post('https://dps.psx.com.pk/historical', [
                    'type'   => 'index',
                    'symbol' => 'KSE100',
                    'from'   => '2020-01-01',
                    'to'     => now()->toDateString(),
                ]);

            if (! $response->ok()) {
                return null;
            }

            return $this->parseHistoricalHtml($response->body());
        });

        if ($allPoints === null) {
            return response()->json(['error' => 'Failed to fetch KSE-100 data from PSX'], 502);
        }

        $sliced = array_values(array_filter($allPoints, fn($p) => $p['date'] >= $fromDate));

        $latest   = end($sliced) ?: null;
        $previous = count($sliced) >= 2 ? $sliced[count($sliced) - 2] : null;

        $change    = $latest && $previous ? round($latest['close'] - $previous['close'], 2) : null;
        $changePct = $latest && $previous && $previous['close']
            ? round(($change / $previous['close']) * 100, 2)
            : null;

        return response()->json([
            'current'    => $latest['close'] ?? null,
            'change'     => $change,
            'change_pct' => $changePct,
            'data'       => $sliced,
        ]);
    }

    private function parseHistoricalHtml(string $html): array
    {
        $dom = new \DOMDocument();
        @$dom->loadHTML('<meta charset="utf-8">' . $html);
        $xpath = new \DOMXPath($dom);

        $rows   = $xpath->query('//table[@id="historicalTable"]//tbody/tr');
        $points = [];

        if ($rows) {
            foreach ($rows as $row) {
                $cells = $xpath->query('td', $row);
                if ($cells->length < 5) continue;

                $ts    = (int) $cells->item(0)->getAttribute('data-order');
                $open  = $this->parseNum($cells->item(1)->textContent);
                $high  = $this->parseNum($cells->item(2)->textContent);
                $low   = $this->parseNum($cells->item(3)->textContent);
                $close = $this->parseNum($cells->item(4)->textContent);

                $volume = $cells->length >= 6 ? $this->parseNum($cells->item(5)->textContent) : null;

                if ($ts && $close) {
                    $points[] = [
                        'date'   => date('Y-m-d', $ts),
                        'open'   => $open,
                        'high'   => $high,
                        'low'    => $low,
                        'close'  => $close,
                        'volume' => $volume,
                    ];
                }
            }
        }

        // PSX returns newest-first; reverse to oldest-first for charts
        return array_reverse($points);
    }

    private function parseNum(string $raw): float
    {
        return (float) str_replace([',', ' '], '', trim($raw));
    }
}
