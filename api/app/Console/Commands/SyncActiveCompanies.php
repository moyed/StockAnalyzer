<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use App\Models\Company;

class SyncActiveCompanies extends Command
{
    protected $signature   = 'psx:sync-active {--dry-run : Show changes without applying}';
    protected $description = 'Mark companies no longer listed on PSX as inactive (is_active = false)';

    public function handle(): int
    {
        $this->info('Fetching listed companies from PSX…');

        // PSX returns all listed companies paginated; fetch until we get an empty page
        $listedSymbols = $this->fetchAllListedSymbols();

        if (empty($listedSymbols)) {
            $this->error('No symbols extracted — PSX response format may have changed.');
            return 1;
        }

        $this->info(sprintf('Found %d listed symbols on PSX.', count($listedSymbols)));

        // All companies in our DB (including already-inactive ones)
        $allDbSymbols = Company::withInactive()->pluck('symbol')->all();
        $toDeactivate = array_values(array_diff($allDbSymbols, $listedSymbols));
        $toReactivate = array_values(array_intersect($allDbSymbols, $listedSymbols));

        if ($this->option('dry-run')) {
            $this->info('--- Would DEACTIVATE (delisted / not found on PSX) ---');
            $this->table(['Symbol'], array_map(fn($s) => [$s], $toDeactivate));
            $this->info(sprintf('%d companies would be marked inactive.', count($toDeactivate)));
            return 0;
        }

        // Mark missing companies as inactive
        $deactivated = 0;
        if ($toDeactivate) {
            $deactivated = Company::withInactive()
                ->whereIn('symbol', $toDeactivate)
                ->where('is_active', true)
                ->update(['is_active' => false]);
        }

        // Re-activate any that came back (re-listed companies)
        $reactivated = 0;
        if ($toReactivate) {
            $reactivated = Company::withInactive()
                ->whereIn('symbol', $toReactivate)
                ->where('is_active', false)
                ->update(['is_active' => true]);
        }

        $this->info("Deactivated {$deactivated} delisted companies.");

        if ($reactivated > 0) {
            $this->info("Re-activated {$reactivated} re-listed companies.");
        }

        if ($deactivated > 0) {
            $preview = implode(', ', array_slice($toDeactivate, 0, 20))
                . (count($toDeactivate) > 20 ? '…' : '');
            $this->warn("Deactivated: {$preview}");
        }

        return 0;
    }

    private function fetchAllListedSymbols(): array
    {
        // PSX /symbols returns a flat JSON array of all listed instruments
        $response = Http::timeout(30)
            ->withHeaders([
                'Referer'          => 'https://dps.psx.com.pk/symbols',
                'X-Requested-With' => 'XMLHttpRequest',
            ])
            ->get('https://dps.psx.com.pk/symbols');

        if (! $response->ok()) {
            $this->warn("PSX returned HTTP {$response->status()}");
            return [];
        }

        $rows = $response->json();
        if (! is_array($rows)) {
            return [];
        }

        $symbols = [];
        foreach ($rows as $row) {
            $symbol = strtoupper(trim((string) ($row['symbol'] ?? '')));
            if ($symbol) {
                $symbols[] = $symbol;
            }
        }

        return array_values(array_unique($symbols));
    }
}
