<?php

namespace App\Console\Commands;

use App\Models\Company;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

class ImportPsxCompanies extends Command
{
    protected $signature   = 'psx:import-companies {--dry-run : Preview without saving}';
    protected $description = 'Import all equity companies listed on PSX';

    private const PSX_SYMBOLS_URL = 'https://dps.psx.com.pk/symbols';

    // Symbols that are rights issues, warrants, or other non-company instruments
    private const SKIP_SUFFIXES = ['R', 'W', 'P', 'N', 'RT'];

    public function handle(): int
    {
        $this->info('Fetching equity list from PSX...');

        $response = Http::withHeaders([
            'Accept'     => 'application/json',
            'User-Agent' => 'Mozilla/5.0 (compatible; StockAnalyzer/1.0)',
        ])->timeout(30)->get(self::PSX_SYMBOLS_URL);

        if (!$response->ok()) {
            $this->error("PSX request failed: HTTP {$response->status()}");
            return self::FAILURE;
        }

        $all = $response->json();

        // Filter to equities only (exclude debt instruments and ETFs)
        $equities = array_filter($all, fn($item) =>
            !($item['isDebt'] ?? false) && !($item['isETF'] ?? false)
        );

        $this->info('Total equities found: ' . count($equities));

        $created = 0;
        $updated = 0;
        $skipped = 0;

        foreach ($equities as $item) {
            $symbol = trim($item['symbol'] ?? '');
            $name   = trim($item['name'] ?? $symbol);
            $sector = trim($item['sectorName'] ?? '');

            if (empty($symbol)) { $skipped++; continue; }

            // Skip rights issues, warrants, preference shares etc.
            foreach (self::SKIP_SUFFIXES as $suffix) {
                if (str_ends_with($symbol, $suffix) && strlen($symbol) > 3) {
                    $skipped++;
                    continue 2;
                }
            }

            if ($this->option('dry-run')) {
                $this->line("  {$symbol} | {$name} | {$sector}");
                continue;
            }

            $exists = Company::where('symbol', $symbol)->exists();

            Company::updateOrCreate(
                ['symbol' => $symbol],
                [
                    'name'   => $name ?: $symbol,
                    'sector' => $sector ?: null,
                ]
            );

            $exists ? $updated++ : $created++;
        }

        if ($this->option('dry-run')) {
            $this->info("Dry run complete. Skipped (rights/warrants): {$skipped}");
            return self::SUCCESS;
        }

        $this->info("Done. Created: {$created}, Updated: {$updated}, Skipped: {$skipped}");
        $this->info("Total companies in DB: " . Company::count());

        return self::SUCCESS;
    }
}
