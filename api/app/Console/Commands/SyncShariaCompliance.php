<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use App\Models\Company;

class SyncShariaCompliance extends Command
{
    protected $signature   = 'psx:sync-sharia {--dry-run : Show changes without applying}';
    protected $description = 'Sync Sharia-compliant status from PSX KMI All Shares index';

    public function handle(): int
    {
        $this->info('Fetching KMI All Shares constituents from PSX…');

        $response = Http::timeout(30)
            ->withHeaders(['Referer' => 'https://dps.psx.com.pk/indices'])
            ->get('https://dps.psx.com.pk/indices/KMIALLSHR');

        if (! $response->ok()) {
            $this->error("PSX returned HTTP {$response->status()}");
            return 1;
        }

        preg_match_all('/<td data-order="([A-Z0-9]+)"><a class="tbl__symbol"/', $response->body(), $matches);
        $compliantSymbols = array_unique($matches[1]);

        if (empty($compliantSymbols)) {
            $this->error('No symbols extracted — PSX response format may have changed.');
            return 1;
        }

        $this->info(sprintf('Found %d KMI-compliant symbols.', count($compliantSymbols)));

        if ($this->option('dry-run')) {
            $this->table(['Symbol'], array_map(fn($s) => [$s], $compliantSymbols));
            return 0;
        }

        // Reset all, then mark the compliant ones (include inactive so delisted companies get cleared too)
        $resetCount = Company::withInactive()->where('is_sharia_compliant', true)->count();
        Company::withInactive()->update(['is_sharia_compliant' => false]);

        $marked = Company::withInactive()->whereIn('symbol', $compliantSymbols)
            ->update(['is_sharia_compliant' => true]);

        $this->info("Cleared {$resetCount} previous flags.");
        $this->info("Marked {$marked} companies as Sharia-compliant.");

        $dbSymbols  = Company::withInactive()->whereIn('symbol', $compliantSymbols)->pluck('symbol')->toArray();
        $notFound   = array_diff($compliantSymbols, $dbSymbols);
        if ($notFound) {
            $preview = implode(', ', array_slice($notFound, 0, 10)) . (count($notFound) > 10 ? '…' : '');
            $this->warn(sprintf('%d symbols not in DB (not yet imported): %s', count($notFound), $preview));
        }

        return 0;
    }
}
