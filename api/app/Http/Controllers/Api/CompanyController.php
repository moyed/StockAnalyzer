<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class CompanyController extends Controller
{
    public function index(Request $request)
    {
        $query = \App\Models\Company::with(['latestFiling.score'])
            ->when($request->sector, fn($q) => $q->where('sector', $request->sector))
            ->when($request->search, fn($q) => $q->where('name', 'like', "%{$request->search}%")
                ->orWhere('symbol', 'like', "%{$request->search}%"))
            ->when($request->defaulter !== null, fn($q) => $q->where('is_defaulter', (bool) $request->defaulter));

        $sort = $request->sort ?? 'score';

        switch ($sort) {
            case 'score':
                $latestScores = \DB::table('filings as f')
                    ->join('scores', 'f.id', '=', 'scores.filing_id')
                    ->joinSub(
                        \DB::table('filings')
                            ->selectRaw('company_id, MAX(filing_date) as max_date')
                            ->groupBy('company_id'),
                        'latest',
                        fn($join) => $join->on('f.company_id', '=', 'latest.company_id')
                                          ->on('f.filing_date', '=', 'latest.max_date')
                    )
                    ->select('f.company_id', 'scores.score');
                $query->leftJoinSub($latestScores, 'ls', 'companies.id', 'ls.company_id')
                      ->orderByRaw('CAST(ls.score AS INTEGER) IS NULL, CAST(ls.score AS INTEGER) DESC')
                      ->orderBy('companies.name')
                      ->select('companies.*');
                break;

            case 'filing_date':
                $query->leftJoinSub(
                    \DB::table('filings')
                        ->selectRaw('company_id, MAX(filing_date) as max_date')
                        ->groupBy('company_id'),
                    'lf',
                    'companies.id',
                    'lf.company_id'
                )
                ->orderByDesc('lf.max_date')
                ->orderBy('companies.name')
                ->select('companies.*');
                break;

            case 'name':
                $query->orderBy('companies.name');
                break;

            case 'sector':
                $query->orderBy('companies.sector')->orderBy('companies.name');
                break;

            default:
                $query->orderByDesc('companies.updated_at');
        }

        $perPage = min((int) ($request->per_page ?? 10), 500);
        $companies = $query->paginate($perPage);

        return response()->json($companies);
    }

    public function projection(\App\Models\Company $company)
    {
        // Find the latest filing that has AI analysis, regardless of status
        $filing = $company->filings()->with('score')
            ->whereNotNull('ai_analysis')
            ->orderByDesc('filing_date')
            ->first();

        if (!$filing) {
            return response()->json(['error' => 'No analysis available', 'status' => 'unavailable'], 404);
        }

        // Check for existing projection for this filing
        $projection = \App\Models\Projection::where('company_id', $company->id)
            ->where('filing_id', $filing->id)
            ->latest()
            ->first();

        // If we have a completed projection, return it
        if ($projection && $projection->status === 'done') {
            return response()->json([
                'status' => 'done',
                ...$projection->result,
            ]);
        }

        // If one is already in progress, return its status
        if ($projection && in_array($projection->status, ['pending', 'processing'])) {
            return response()->json([
                'status'     => $projection->status,
                'message'    => 'Projection is being generated…',
                'started_at' => $projection->created_at,
            ]);
        }

        // If failed or no projection exists, create a new one and dispatch the job
        $projection = \App\Models\Projection::create([
            'company_id' => $company->id,
            'filing_id'  => $filing->id,
            'status'     => 'pending',
        ]);

        \App\Jobs\GenerateProjectionJob::dispatch($projection->id);

        return response()->json([
            'status'  => 'pending',
            'message' => 'Projection queued — check back shortly.',
        ], 202);
    }

    public function scan(\App\Models\Company $company, \App\Services\PsxScraperService $scraper)
    {
        // Rights issues, warrants, preference shares etc. never have filings
        $symbol = $company->symbol;
        if (preg_match('/\d+$/', $symbol) && preg_match('/R\d*$|W\d*$|P\d*$/', $symbol)) {
            return response()->json([
                'message' => "{$symbol} appears to be a rights issue / warrant and does not have quarterly filings.",
                'reason'  => 'not_equity',
            ], 200);
        }

        // Scrape recent months for this company's filings
        $found = 0;
        $now = \Carbon\Carbon::now();
        $symbolUpper = strtoupper($symbol);

        // Also match the base symbol without trailing digits (e.g. MEBL for MEBL)
        $baseSymbol = preg_replace('/\d+$/', '', $symbolUpper);

        for ($i = 0; $i < 12; $i++) {
            $month = $now->copy()->subMonths($i)->format('Y-m');
            $filings = $scraper->fetchTransmissions($month);

            foreach ($filings as $fd) {
                $fdSymbol = strtoupper($fd['symbol']);
                if ($fdSymbol !== $symbolUpper && $fdSymbol !== $baseSymbol) continue;

                $filing = \App\Models\Filing::updateOrCreate(
                    ['company_id' => $company->id, 'quarter' => $fd['quarter']],
                    [
                        'filing_date' => $fd['filing_date'],
                        'pdf_url'     => $fd['pdf_url'],
                        'status'      => 'pending',
                    ],
                );

                if ($filing->status !== 'done') {
                    \App\Jobs\AnalyzeFilingJob::dispatch($filing->id);
                    $found++;
                }
            }

            // Stop early if we found filings (no need to keep scraping older months)
            if ($found > 0) break;
        }

        if ($found === 0) {
            return response()->json([
                'message' => "No quarterly filings found for {$symbol} in the last 12 months on PSX.",
                'reason'  => 'not_found',
            ], 200);
        }

        return response()->json([
            'message' => "Found {$found} filing(s) for {$symbol}. Analysis queued.",
            'queued'  => $found,
        ], 202);
    }

    public function rescan(\App\Models\Company $company)
    {
        $filing = $company->filings()
            ->orderByDesc('filing_date')
            ->first();

        if (!$filing) {
            return response()->json(['error' => 'No filings found for this company'], 404);
        }

        $filing->update(['status' => 'pending']);
        \App\Jobs\AnalyzeFilingJob::dispatch($filing->id);

        return response()->json([
            'message'    => 'Rescan started for ' . $company->symbol,
            'filing_id'  => $filing->id,
            'quarter'    => $filing->quarter,
        ], 202);
    }

    public function show(\App\Models\Company $company)
    {
        $company->load(['filings' => function ($q) {
            $q->with('score')->orderByDesc('filing_date')->limit(8);
        }]);

        $isWatched = $company->watchlists()
            ->where('user_id', auth()->id())
            ->exists();

        return response()->json([
            'company'    => $company,
            'is_watched' => $isWatched,
        ]);
    }

    public function filings(\App\Models\Company $company)
    {
        $filings = $company->filings()
            ->with('score')
            ->orderByDesc('filing_date')
            ->limit(8)
            ->get();

        return response()->json(['filings' => $filings]);
    }
}
