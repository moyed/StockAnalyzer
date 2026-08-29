<?php

namespace App\Console\Commands;

use App\Jobs\SyncCompanyFilingsJob;
use App\Models\Company;
use Illuminate\Console\Command;

class SyncAllFilings extends Command
{
    protected $signature   = 'psx:sync-all-filings {symbol? : Optional single symbol to sync}';
    protected $description = 'Sync all available financial result PDFs for all companies from PSX';

    public function handle(): int
    {
        $symbol = $this->argument('symbol');

        if ($symbol) {
            $companies = Company::where('symbol', strtoupper($symbol))->get();
        } else {
            $companies = Company::all();
        }

        if ($companies->isEmpty()) {
            $this->error('No companies found.');
            return 1;
        }

        $this->info(sprintf('Dispatching sync jobs for %d companies…', $companies->count()));

        foreach ($companies as $company) {
            SyncCompanyFilingsJob::dispatch($company->id);
        }

        $this->info('All jobs dispatched to queue. Run `php artisan queue:work` to process.');

        return 0;
    }
}
