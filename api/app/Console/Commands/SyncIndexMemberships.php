<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use App\Models\Company;
use App\Models\IndexMembership;

class SyncIndexMemberships extends Command
{
    protected $signature   = 'psx:sync-indices {--dry-run : Show changes without applying}';
    protected $description = 'Sync constituent membership for PSX indices (KSE-100, KSE-30, KMI-30, KMI All Share, PSX All Share)';

    public function handle(): int
    {
        foreach (IndexMembership::NAMES as $code => $name) {
            $this->syncIndex($code, $name);
        }

        return 0;
    }

    private function syncIndex(string $code, string $name): void
    {
        $this->info("Fetching {$name} ({$code}) constituents from PSX…");

        $response = Http::timeout(30)
            ->withHeaders(['Referer' => 'https://dps.psx.com.pk/indices'])
            ->get("https://dps.psx.com.pk/indices/{$code}");

        if (! $response->ok()) {
            $this->error("PSX returned HTTP {$response->status()} for {$code}");
            return;
        }

        preg_match_all('/<td data-order="([A-Z0-9]+)"><a class="tbl__symbol"/', $response->body(), $matches);
        $symbols = array_unique($matches[1]);

        if (empty($symbols)) {
            $this->error("No symbols extracted for {$code} — PSX response format may have changed.");
            return;
        }

        $this->info(sprintf('Found %d %s constituents.', count($symbols), $name));

        if ($this->option('dry-run')) {
            $this->table(['Symbol'], array_map(fn ($s) => [$s], $symbols));
            return;
        }

        $companyIds = Company::withInactive()->whereIn('symbol', $symbols)->pluck('id', 'symbol');

        IndexMembership::where('index_code', $code)->delete();

        $now = now();
        $rows = $companyIds->map(fn ($id) => [
            'company_id'  => $id,
            'index_code'  => $code,
            'created_at'  => $now,
            'updated_at'  => $now,
        ])->values()->all();

        if (! empty($rows)) {
            IndexMembership::insert($rows);
        }

        $this->info("Synced {$companyIds->count()} companies to {$code}.");

        $notFound = array_diff($symbols, $companyIds->keys()->all());
        if ($notFound) {
            $preview = implode(', ', array_slice($notFound, 0, 10)) . (count($notFound) > 10 ? '…' : '');
            $this->warn(sprintf('%d symbols not in DB (not yet imported): %s', count($notFound), $preview));
        }
    }
}
