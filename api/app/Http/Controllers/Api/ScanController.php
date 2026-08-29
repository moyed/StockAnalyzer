<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class ScanController extends Controller
{
    /**
     * Start a scan:
     * - Optionally scrape PSX for a given month to discover new filings.
     * - Always re-queue every existing filing that is not yet done.
     */
    public function run(Request $request)
    {
        $data = $request->validate([
            'month' => 'nullable|date_format:Y-m',
        ]);

        $month = $data['month'] ?? null;
        $queued = 0;

        // Scrape new filings from PSX if a month was provided
        if ($month) {
            \App\Jobs\ScanMonthJob::dispatch($month);
        }

        // Re-queue all existing filings that are not done
        $pending = \App\Models\Filing::whereIn('status', ['pending', 'failed'])
            ->get();

        foreach ($pending as $filing) {
            $filing->update(['status' => 'pending']);
            \App\Jobs\AnalyzeFilingJob::dispatch($filing->id);
            $queued++;
        }

        // Trigger news scrape + market briefing in the background
        \App\Jobs\ScrapeNewsJob::dispatch();
        \App\Jobs\GenerateMarketBriefingJob::dispatch();

        return response()->json([
            'message' => $month
                ? "Scan started for {$month}. Re-queued {$queued} existing filings."
                : "Re-queued {$queued} existing filings.",
            'queued' => $queued,
            'month'  => $month,
        ], 202);
    }

    /**
     * Return progress for all filings in the system (or filtered by month).
     */
    public function progress(Request $request)
    {
        $month = $request->query('month');

        $query = \App\Models\Filing::with(['company', 'score']);

        if ($month) {
            $query->whereYear('filing_date', substr($month, 0, 4))
                  ->whereMonth('filing_date', substr($month, 5, 2));
        }

        $filings    = $query->get();
        $total      = $filings->count();
        $done       = $filings->whereIn('status', ['done'])->count();
        $processing = $filings->whereIn('status', ['processing'])->count();
        $failed     = $filings->whereIn('status', ['failed'])->count();
        $pending    = $filings->where('status', 'pending')->count();

        // Scrape state for month-based scans
        $scraping  = $month ? (bool) \Illuminate\Support\Facades\Cache::get("scan_scraping:{$month}") : false;
        $scraped   = $month ? \Illuminate\Support\Facades\Cache::get("scan_scraped:{$month}") : null;

        // Complete when: filings exist and all settled, OR scrape finished with 0 results
        $complete = ($total > 0 && $pending === 0 && $processing === 0)
                 || ($scraped && $total === 0);

        return response()->json([
            'total'      => $total,
            'done'       => $done,
            'processing' => $processing,
            'failed'     => $failed,
            'pending'    => $pending,
            'percent'    => $total > 0 ? round(($done / $total) * 100) : 0,
            'complete'   => $complete,
            'scraping'   => $scraping,
            'scraped'    => $scraped,
            'filings'    => $filings->sortByDesc(fn($f) => match($f->status) {
                'processing' => 3,
                'queued', 'pending' => 2,
                'failed' => 1,
                default => 0,
            })->values(),
        ]);
    }

    public function syncAllFilings(Request $request)
    {
        $symbol = $request->input('symbol');

        if ($symbol) {
            $companies = \App\Models\Company::where('symbol', strtoupper($symbol))->get();
        } else {
            $companies = \App\Models\Company::all();
        }

        if ($companies->isEmpty()) {
            return response()->json(['error' => 'No companies found.'], 404);
        }

        foreach ($companies as $company) {
            \App\Jobs\SyncCompanyFilingsJob::dispatch($company->id);
        }

        return response()->json([
            'message'    => "Queued filing sync for {$companies->count()} companies.",
            'dispatched' => $companies->count(),
        ], 202);
    }

    public function syncPrices()
    {
        $result = \Artisan::call('psx:sync-prices');
        $output = \Artisan::output();

        preg_match('/Updated (\d+) companies/', $output, $m);
        $updated = isset($m[1]) ? (int) $m[1] : 0;

        return response()->json([
            'message' => "Synced prices for {$updated} companies.",
            'updated' => $updated,
        ]);
    }

    public function status(Request $request, string $job)
    {
        return response()->json(['status' => 'queued']);
    }
}
