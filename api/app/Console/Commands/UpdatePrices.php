<?php

namespace App\Console\Commands;

use App\Models\Company;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

class UpdatePrices extends Command
{
    protected $signature   = 'psx:update-prices';
    protected $description = 'Fetch latest stock prices from PSX market-watch and update all companies';

    private const MARKET_WATCH_URL = 'https://dps.psx.com.pk/market-watch';

    public function handle(): int
    {
        $this->info('Fetching live prices from PSX market-watch...');

        $response = Http::withHeaders([
            'User-Agent' => 'Mozilla/5.0 (compatible; StockAnalyzer/1.0)',
            'Referer'    => 'https://dps.psx.com.pk/',
        ])->timeout(30)->get(self::MARKET_WATCH_URL);

        if (!$response->ok()) {
            $this->error("PSX request failed: HTTP {$response->status()}");
            return self::FAILURE;
        }

        // Parse the HTML table (PSX returns HTML, not JSON)
        $stocks = $this->parseMarketWatch($response->body());

        if (empty($stocks)) {
            $this->error('No data parsed from PSX market-watch');
            return self::FAILURE;
        }

        $this->info('Parsed ' . count($stocks) . ' stocks from PSX');

        $updated = 0;
        $notFound = 0;
        $now = now();

        foreach ($stocks as $stock) {
            $symbol = $stock['symbol'];
            $price  = $stock['current'] ?? $stock['ldcp'] ?? null;

            if ($price === null || $price <= 0) continue;

            $affected = Company::where('symbol', $symbol)->update([
                'last_price'       => $price,
                'price_updated_at' => $now,
            ]);

            $affected > 0 ? $updated++ : $notFound++;
        }

        $this->info("Done. Updated: {$updated}, Not matched: {$notFound}");
        $this->info("Price data as of: {$now->toDateTimeString()}");

        return self::SUCCESS;
    }

    /**
     * Parse the PSX market-watch HTML table.
     * Columns: Symbol | Sector | ListedIn | LDCP | Open | High | Low | Current | Change | Change% | Volume
     */
    private function parseMarketWatch(string $html): array
    {
        $dom = new \DOMDocument();
        @$dom->loadHTML('<meta charset="utf-8">' . $html);
        $xpath = new \DOMXPath($dom);

        $rows = $xpath->query('//table//tbody/tr');
        $stocks = [];

        foreach ($rows as $row) {
            $cells = $xpath->query('td', $row);
            if ($cells->length < 8) continue;

            $symbol  = strtoupper(trim($cells->item(0)->textContent));
            $ldcp    = (float) str_replace(',', '', trim($cells->item(3)->textContent));
            $current = (float) str_replace(',', '', trim($cells->item(7)->textContent));

            if (empty($symbol)) continue;

            $stocks[] = [
                'symbol'  => $symbol,
                'ldcp'    => $ldcp,
                'current' => $current > 0 ? $current : $ldcp,
            ];
        }

        return $stocks;
    }
}
