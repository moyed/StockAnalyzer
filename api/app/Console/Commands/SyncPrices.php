<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use App\Models\Company;

class SyncPrices extends Command
{
    protected $signature   = 'psx:sync-prices';
    protected $description = 'Sync current prices for all companies from PSX';

    // Indices to fetch — ordered by coverage breadth
    private const INDICES = ['ALLSHR', 'KMIALLSHR', 'KSE100'];

    public function handle(): int
    {
        $this->info('Fetching prices from PSX indices…');

        $prices = [];

        foreach (self::INDICES as $index) {
            $response = Http::timeout(30)
                ->withHeaders(['Referer' => 'https://dps.psx.com.pk/indices'])
                ->get("https://dps.psx.com.pk/indices/{$index}");

            if (! $response->ok()) {
                $this->warn("Index {$index}: HTTP {$response->status()}, skipping.");
                continue;
            }

            // Columns: symbol | name | LDCP | CURRENT | change | ...
            // Skip name cell and LDCP cell to capture the CURRENT price
            preg_match_all(
                '/<td data-order="([A-Z0-9]+)">.*?<\/td>\s*<td>.*?<\/td>\s*<td[^>]*>[\d.,\s]*<\/td>\s*<td[^>]*data-order="([\d.]+)"/s',
                $response->body(),
                $matches,
                PREG_SET_ORDER
            );

            foreach ($matches as $m) {
                $prices[$m[1]] = $prices[$m[1]] ?? $m[2]; // first index wins
            }

            $this->info(sprintf('  %s: %d prices', $index, count($matches)));
        }

        if (empty($prices)) {
            $this->error('No prices fetched — all index requests failed.');
            return 1;
        }

        $this->info(sprintf('Total unique prices: %d. Updating DB…', count($prices)));

        $updated  = 0;
        $notFound = 0;
        $now      = now();

        foreach (array_chunk(array_keys($prices), 200) as $chunk) {
            $rows = Company::whereIn('symbol', $chunk)->get(['id', 'symbol']);
            foreach ($rows as $company) {
                $company->last_price       = $prices[$company->symbol];
                $company->price_updated_at = $now;
                $company->save();
                $updated++;
            }
        }

        $notFound = count($prices) - $updated;

        $this->info("Updated {$updated} companies.");
        if ($notFound > 0) {
            $this->line("  ({$notFound} PSX symbols not in local DB — not imported yet)");
        }

        return 0;
    }
}
