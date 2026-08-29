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
            ->when($request->index, fn($q) => $q->whereHas('indexMemberships', fn($iq) => $iq->where('index_code', $request->index)))
            ->when($request->search, fn($q) => $q->where('name', 'like', "%{$request->search}%")
                ->orWhere('symbol', 'like', "%{$request->search}%"))
            ->when($request->defaulter !== null, fn($q) => $q->where('is_defaulter', (bool) $request->defaulter))
            ->when($request->sharia !== null, fn($q) => $q->where('is_sharia_compliant', (bool) $request->sharia));

        // P/E ratio filtering
        if ($request->has('min_pe') || $request->has('max_pe')) {
            $latestFilings = \DB::table(function ($inner) {
                $inner->from('filings as f')
                    ->selectRaw('f.company_id, f.eps, ROW_NUMBER() OVER (PARTITION BY f.company_id ORDER BY f.filing_date DESC, f.id DESC) as rn');
            }, 'ranked')
            ->where('rn', 1)
            ->select('company_id', 'eps');

            $query->joinSub($latestFilings, 'latest_filing', 'companies.id', 'latest_filing.company_id')
                  ->whereNotNull('latest_filing.eps')
                  ->where('latest_filing.eps', '>', 0)
                  ->whereNotNull('companies.last_price')
                  ->where('companies.last_price', '>', 0);

            if ($request->has('min_pe')) {
                $minPe = (float) $request->min_pe;
                // P/E = Price / EPS, so if P/E >= minPe then Price >= minPe * EPS
                $query->whereRaw('companies.last_price / latest_filing.eps >= ?', [$minPe]);
            }

            if ($request->has('max_pe')) {
                $maxPe = (float) $request->max_pe;
                // P/E = Price / EPS, so if P/E <= maxPe then Price <= maxPe * EPS
                $query->whereRaw('companies.last_price / latest_filing.eps <= ?', [$maxPe]);
            }

            $query->select('companies.*');
        }

        $sort = $request->sort ?? 'score';

        switch ($sort) {
            case 'score':
                // ROW_NUMBER guarantees exactly one row per company_id, avoiding
                // duplicates when multiple filings share the same filing_date.
                $latestScores = \DB::table(function ($inner) {
                    $inner->from('filings as f')
                        ->join('scores as s', 's.filing_id', '=', 'f.id')
                        ->selectRaw('f.company_id, s.score, ROW_NUMBER() OVER (PARTITION BY f.company_id ORDER BY f.filing_date DESC, f.id DESC, s.id DESC) as rn');
                }, 'ranked')
                ->where('rn', 1)
                ->select('company_id', 'score');

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

            case 'pe_ratio':
                // Sort by P/E ratio (Price / EPS)
                $latestFilings = \DB::table(function ($inner) {
                    $inner->from('filings as f')
                        ->selectRaw('f.company_id, f.eps, ROW_NUMBER() OVER (PARTITION BY f.company_id ORDER BY f.filing_date DESC, f.id DESC) as rn');
                }, 'ranked')
                ->where('rn', 1)
                ->select('company_id', 'eps');

                $query->leftJoinSub($latestFilings, 'lf_pe', 'companies.id', 'lf_pe.company_id')
                      ->orderByRaw('CASE WHEN companies.last_price > 0 AND lf_pe.eps > 0 THEN companies.last_price / lf_pe.eps ELSE 999999 END ASC')
                      ->orderBy('companies.name')
                      ->select('companies.*');
                break;

            default:
                $query->orderByDesc('companies.updated_at');
        }

        $perPage = min((int) ($request->per_page ?? 10), 500);
        $companies = $query->paginate($perPage);

        return response()->json($companies);
    }

    public function sectors()
    {
        $sectors = \App\Models\Company::whereNotNull('sector')
            ->where('sector', '!=', '')
            ->distinct()
            ->orderBy('sector')
            ->pluck('sector');

        return response()->json($sectors);
    }

    public function sectorTrends(Request $request)
    {
        $days = min((int) $request->query('days', 365), 1825); // max 5 years
        $endDate = \Carbon\Carbon::today();
        $startDate = $endDate->copy()->subDays($days);

        // Get all companies grouped by sector
        $companies = \App\Models\Company::whereNotNull('sector')
            ->where('sector', '!=', '')
            ->pluck('id', 'sector')
            ->groupBy(fn($id, $sector) => $sector);

        // Get all scores with their creation dates
        $scores = \DB::table('scores')
            ->join('filings', 'filings.id', '=', 'scores.filing_id')
            ->join('companies', 'companies.id', '=', 'filings.company_id')
            ->whereNotNull('companies.sector')
            ->where('companies.sector', '!=', '')
            ->whereBetween(\DB::raw('DATE(scores.created_at)'), [$startDate, $endDate])
            ->select('companies.sector', \DB::raw('DATE(scores.created_at) as date'), 'scores.score')
            ->get()
            ->groupBy('sector')
            ->map(fn($items) => $items->groupBy('date'));

        // Get all macro risks with their creation dates
        $macroRisks = \DB::table('macro_risks')
            ->join('companies', 'companies.id', '=', 'macro_risks.company_id')
            ->whereNotNull('companies.sector')
            ->where('companies.sector', '!=', '')
            ->whereBetween(\DB::raw('DATE(macro_risks.created_at)'), [$startDate, $endDate])
            ->select('companies.sector', \DB::raw('DATE(macro_risks.created_at) as date'), 'macro_risks.adjustment')
            ->get()
            ->groupBy('sector')
            ->map(fn($items) => $items->groupBy('date'));

        // Get actual data range
        $firstScore = \DB::table('scores')
            ->join('filings', 'filings.id', '=', 'scores.filing_id')
            ->join('companies', 'companies.id', '=', 'filings.company_id')
            ->whereNotNull('companies.sector')
            ->where('companies.sector', '!=', '')
            ->orderBy('scores.created_at')
            ->value(\DB::raw('DATE(scores.created_at)'));

        $firstMacro = \DB::table('macro_risks')
            ->join('companies', 'companies.id', '=', 'macro_risks.company_id')
            ->whereNotNull('companies.sector')
            ->where('companies.sector', '!=', '')
            ->orderBy('macro_risks.created_at')
            ->value(\DB::raw('DATE(macro_risks.created_at)'));

        $actualStartDate = null;
        if ($firstScore && $firstMacro) {
            $actualStartDate = min($firstScore, $firstMacro);
        } elseif ($firstScore) {
            $actualStartDate = $firstScore;
        } elseif ($firstMacro) {
            $actualStartDate = $firstMacro;
        }

        // Build time series for each sector
        $result = [];
        foreach ($companies as $sector => $companyIds) {
            $sectorData = [];
            $cumulativeScores = [];
            $cumulativeMacro = [];

            for ($i = 0; $i < $days; $i++) {
                $date = $startDate->copy()->addDays($i)->toDateString();

                // Accumulate scores created on this date
                if (isset($scores[$sector][$date])) {
                    foreach ($scores[$sector][$date] as $item) {
                        $cumulativeScores[] = (int) $item->score;
                    }
                }

                // Accumulate macro risks created on this date
                if (isset($macroRisks[$sector][$date])) {
                    foreach ($macroRisks[$sector][$date] as $item) {
                        $cumulativeMacro[] = (float) $item->adjustment;
                    }
                }

                // Calculate metrics for this date
                $avgScore = count($cumulativeScores) > 0 ? round(array_sum($cumulativeScores) / count($cumulativeScores), 1) : null;
                $avgMacro = count($cumulativeMacro) > 0 ? round(array_sum($cumulativeMacro) / count($cumulativeMacro), 1) : null;
                $activityVolume = count($cumulativeScores) + count($cumulativeMacro);
                $combinedPerf = $avgScore !== null && $avgMacro !== null
                    ? round($avgScore + $avgMacro, 1)
                    : $avgScore;

                $sectorData[] = [
                    'date' => $date,
                    'avg_score' => $avgScore,
                    'avg_macro_risk' => $avgMacro,
                    'combined_performance' => $combinedPerf,
                    'activity_volume' => $activityVolume,
                    'score_count' => count($cumulativeScores),
                    'macro_count' => count($cumulativeMacro),
                ];
            }

            $result[] = [
                'sector' => $sector,
                'data' => $sectorData,
            ];
        }

        return response()->json([
            'sectors' => $result,
            'date_range' => [
                'requested_start' => $startDate->toDateString(),
                'requested_end' => $endDate->toDateString(),
                'actual_start' => $actualStartDate,
                'actual_end' => $endDate->toDateString(),
                'days_requested' => $days,
            ],
        ]);
    }

    public function sectorStats()
    {
        $allCompanies = \App\Models\Company::whereNotNull('sector')
            ->where('sector', '!=', '')
            ->with(['latestFiling.score', 'macroRisk'])
            ->get();

        $bySector = $allCompanies->groupBy('sector');

        $result = [];
        foreach ($bySector as $sector => $companies) {
            $scored = $companies->filter(fn($c) => $c->latestFiling && $c->latestFiling->score);
            $scores = $scored->map(fn($c) => (int) $c->latestFiling->score->score);

            $top = $scored->sortByDesc(fn($c) => (int) $c->latestFiling->score->score)->first();

            // Macro risk aggregation
            $withMacro = $companies->filter(fn($c) => $c->macroRisk);
            $macroAdjustments = $withMacro->map(fn($c) => $c->macroRisk->adjustment);
            $avgMacro = $macroAdjustments->count() > 0 ? round($macroAdjustments->avg(), 1) : null;

            // Price performance - companies with recent prices
            $withPrices = $companies->filter(fn($c) => $c->last_price && $c->last_price > 0);
            $avgPrice = $withPrices->count() > 0 ? round($withPrices->avg('last_price'), 2) : null;
            $totalMarketCap = $withPrices->sum('last_price'); // Simplified - would need shares outstanding for real market cap

            // Volume metrics
            $withVolume = $companies->filter(fn($c) => $c->volume && $c->volume > 0);
            $totalVolume = $withVolume->sum('volume');
            $avgVolume = $withVolume->count() > 0 ? round($withVolume->avg('volume'), 0) : null;

            // Activity volume (coverage metric)
            $activityVolume = $scored->count() + $withMacro->count();

            // P/E Ratio - calculate for companies with both price and EPS
            $withPE = $companies->filter(function ($c) {
                $price = (float) ($c->last_price ?? 0);
                $latestFiling = $c->latestFiling ?? $c->filings()->orderByDesc('filing_date')->first();
                $eps = (float) ($latestFiling?->eps ?? 0);
                return $price > 0 && $eps > 0;
            });

            $peRatios = $withPE->map(function ($c) {
                $price = (float) $c->last_price;
                $latestFiling = $c->latestFiling ?? $c->filings()->orderByDesc('filing_date')->first();
                $eps = (float) $latestFiling->eps;
                return $price / $eps;
            });

            $avgPE = $peRatios->count() > 0 ? round($peRatios->avg(), 2) : null;
            $minPE = $peRatios->count() > 0 ? round($peRatios->min(), 2) : null;
            $maxPE = $peRatios->count() > 0 ? round($peRatios->max(), 2) : null;

            // Performance trend - based on score + macro
            $combinedPerf = $scores->count() > 0 && $avgMacro !== null
                ? round($scores->avg() + $avgMacro, 1)
                : ($scores->count() > 0 ? round($scores->avg(), 1) : null);

            // Trend indicator: positive if avg_score + macro > 50, negative if < 50
            $trend = null;
            if ($combinedPerf !== null) {
                if ($combinedPerf >= 55) $trend = 'growing';
                elseif ($combinedPerf <= 40) $trend = 'declining';
                else $trend = 'stable';
            }

            $result[] = [
                'sector'             => $sector,
                'company_count'      => $companies->count(),
                'scored_count'       => $scored->count(),
                'avg_score'          => $scores->count() > 0 ? round($scores->avg(), 1) : null,
                'top_score'          => $scores->count() > 0 ? $scores->max() : null,
                'top_company_id'     => $top?->id,
                'top_company_symbol' => $top?->symbol,
                'top_company_name'   => $top?->name,
                'defaulter_count'    => $companies->where('is_defaulter', true)->count(),
                'sharia_count'       => $companies->where('is_sharia_compliant', true)->count(),
                // New metrics
                'avg_macro_risk'     => $avgMacro,
                'macro_count'        => $withMacro->count(),
                'avg_price'          => $avgPrice,
                'combined_performance' => $combinedPerf,
                'trend'              => $trend, // 'growing', 'declining', 'stable'
                'price_count'        => $withPrices->count(),
                // Volume metrics
                'total_volume'       => $totalVolume,
                'avg_volume'         => $avgVolume,
                'volume_count'       => $withVolume->count(),
                'activity_volume'    => $activityVolume, // scored + macro count
                // P/E Ratio metrics
                'avg_pe'             => $avgPE,
                'min_pe'             => $minPE,
                'max_pe'             => $maxPE,
                'pe_count'           => $withPE->count(),
            ];
        }

        usort($result, function ($a, $b) {
            // Sort by total_volume descending, then by avg_volume descending
            if ($a['total_volume'] === $b['total_volume']) {
                return ($b['avg_volume'] ?? 0) <=> ($a['avg_volume'] ?? 0);
            }
            return ($b['total_volume'] ?? 0) <=> ($a['total_volume'] ?? 0);
        });

        return response()->json(array_values($result));
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
                'status'       => 'done',
                'generated_at' => $projection->updated_at,
                ...$projection->result,
            ]);
        }

        // If one is in progress — treat as stale if it has been pending/processing
        // for more than 10 minutes without completing.
        if ($projection && in_array($projection->status, ['pending', 'processing'])) {
            $stale = $projection->updated_at->lt(now()->subMinutes(10));

            if (!$stale) {
                return response()->json([
                    'status'     => $projection->status,
                    'message'    => 'Projection is being generated…',
                    'started_at' => $projection->created_at,
                ]);
            }
            $projection->update(['status' => 'failed', 'error' => 'Timed out']);
        }

        // If a previous run left a valid result, return it even though status is failed —
        // stale data is better than "no projection" after a rescan failure.
        if ($projection && $projection->result) {
            return response()->json([
                'status'       => 'done',
                'generated_at' => $projection->updated_at,
                'stale'        => true,
                ...$projection->result,
            ]);
        }

        // No projection exists (or was stale/failed with no previous result) — return none.
        return response()->json([
            'status'  => 'none',
            'message' => 'No projection yet — run a rescan to generate one.',
        ], 200);
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
                    \App\Jobs\AnalyzeFilingJob::dispatch($filing->id)->onQueue('rescan');
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

        // Also scrape news, sync price, and assess macro risk for the first scan
        $this->syncCompanyPrice($company);
        \App\Jobs\ScrapeNewsJob::dispatch($company->symbol)->onQueue('rescan');
        \App\Jobs\DetectVolumeSpikeJob::dispatch($company->id)->onQueue('rescan');
        \App\Jobs\ExplainMovementJob::dispatch($company->id)->onQueue('rescan');
        \App\Jobs\AssessMacroRiskJob::dispatch($company->id)->onQueue('rescan');

        return response()->json([
            'message' => "Found {$found} filing(s) for {$symbol}. Analysis queued.",
            'queued'  => $found,
        ], 202);
    }

    public function rescanAll()
    {
        // Rescan the latest filing for every company
        $queued = 0;
        foreach (\App\Models\Company::where('id', '>', 0)->get() as $company) {
            $filing = $company->filings()->orderByDesc('filing_date')->first();
            // Skip placeholder records (pdf_url = 'no-filing') — they have no PDF to analyze
            if ($filing && str_starts_with((string) $filing->pdf_url, 'http')) {
                $filing->update(['status' => 'pending']);
                \App\Jobs\AnalyzeFilingJob::dispatch($filing->id)->onQueue('rescan');
                \App\Jobs\AssessMacroRiskJob::dispatch($company->id)->onQueue('rescan');
                $queued++;
            }
        }

        return response()->json([
            'message' => "Rescan queued for {$queued} companies.",
            'queued'  => $queued,
        ], 202);
    }

    public function rescan(\App\Models\Company $company)
    {
        $this->syncCompanyPrice($company);

        $filing = $company->filings()
            ->orderByDesc('filing_date')
            ->first();

        if (!$filing) {
            return response()->json(['error' => 'No filings found for this company'], 404);
        }

        $filing->update(['status' => 'pending']);
        \App\Jobs\AnalyzeFilingJob::dispatch($filing->id)->onQueue('rescan');

        // Scrape news, detect volume spike, explain movement, and assess macro risk — all on rescan queue
        \App\Jobs\ScrapeNewsJob::dispatch($company->symbol)->onQueue('rescan');
        \App\Jobs\DetectVolumeSpikeJob::dispatch($company->id)->onQueue('rescan');
        \App\Jobs\ExplainMovementJob::dispatch($company->id)->onQueue('rescan');
        \App\Jobs\AssessMacroRiskJob::dispatch($company->id)->onQueue('rescan');

        return response()->json([
            'message'    => 'Rescan started for ' . $company->symbol,
            'filing_id'  => $filing->id,
            'quarter'    => $filing->quarter,
            'price'      => $company->fresh()->last_price,
        ], 202);
    }

    public function news(\App\Models\Company $company)
    {
        $articles = \App\Models\NewsArticle::forSymbol($company->symbol)
            ->latest('published_at')
            ->limit(20)
            ->get(['id', 'headline', 'source', 'url', 'published_at',
                   'sentiment', 'impact', 'mentioned_symbols', 'category', 'ai_summary']);

        return response()->json(['news' => $articles]);
    }

    public function syncCompanyPrice(\App\Models\Company $company): void
    {
        try {
            $response = \Illuminate\Support\Facades\Http::timeout(10)
                ->get("https://dps.psx.com.pk/company/{$company->symbol}");

            if ($response->ok() && preg_match(
                '/<div[^>]*class="quote__close"[^>]*>\s*Rs\.([\d.,]+)\s*<\/div>/i',
                $response->body(),
                $m
            )) {
                $price = (float) str_replace(',', '', $m[1]);
                if ($price > 0) {
                    $company->update([
                        'last_price'       => $price,
                        'price_updated_at' => now(),
                    ]);
                }
            }
        } catch (\Throwable) {
            // Non-fatal — continue without price update
        }
    }

    public function show(\App\Models\Company $company)
    {
        $company->load(['filings' => function ($q) {
            $q->with('score')->orderByDesc('filing_date')->limit(8);
        }, 'macroRisk']);

        $isWatched = $company->watchlists()
            ->where('user_id', auth()->id())
            ->exists();

        // Compute adjusted score: latest filing score + macro adjustment, clamped 0–100
        $latestFiling   = $company->filings->first(fn($f) => $f->score?->score !== null);
        $latestScore    = $latestFiling?->score?->score;
        $macroAdjustment = $company->macroRisk?->adjustment ?? 0;
        $adjustedScore  = $latestScore !== null
            ? max(0, min(100, (int) $latestScore + $macroAdjustment))
            : null;

        // Flag companies with no filing in the last 12 months
        $latestFilingDate = $company->filings->first()?->filing_date;
        $dataAgeMonths    = $latestFilingDate
            ? (int) \Carbon\Carbon::parse($latestFilingDate)->diffInMonths(now())
            : null;
        $dataStale = $dataAgeMonths !== null && $dataAgeMonths >= 12;

        return response()->json([
            'company'           => $company,
            'is_watched'        => $isWatched,
            'macro_risk'        => $company->macroRisk,
            'adjusted_score'    => $adjustedScore,
            'data_age_months'   => $dataAgeMonths,
            'data_stale'        => $dataStale,
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

    public function priceHistory(\App\Models\Company $company, \Illuminate\Http\Request $request)
    {
        $from = $request->query('from', now()->subYear()->toDateString());
        $to   = $request->query('to',   now()->toDateString());

        // Cache full PSX history per symbol for 4 hours — PSX ignores date params
        // and returns all history regardless, so one cache entry covers all ranges.
        $cacheKey = "price_history_{$company->symbol}";
        $allRows  = \Illuminate\Support\Facades\Cache::get($cacheKey);

        if ($allRows === null) {
            $response = \Illuminate\Support\Facades\Http::timeout(20)
                ->withHeaders(['Referer' => 'https://dps.psx.com.pk/historical'])
                ->asForm()
                ->post('https://dps.psx.com.pk/historical', [
                    'symbol' => $company->symbol,
                    'start'  => now()->subYears(5)->toDateString(),
                    'end'    => now()->toDateString(),
                ]);

            if (! $response->ok()) {
                return response()->json(['error' => 'Failed to fetch price history'], 502);
            }

            $allRows = $this->parsePriceHistoryHtml($response->body());
            \Illuminate\Support\Facades\Cache::put($cacheKey, $allRows, now()->addHours(4));
        }

        $rows = array_values(array_filter($allRows, fn($r) => $r['date'] >= $from && $r['date'] <= $to));

        return response()->json([
            'symbol' => $company->symbol,
            'from'   => $from,
            'to'     => $to,
            'data'   => $rows,
        ]);
    }

    private function parsePriceHistoryHtml(string $html): array
    {
        $dom = new \DOMDocument();
        @$dom->loadHTML('<meta charset="utf-8">' . $html);
        $xpath = new \DOMXPath($dom);
        $rows  = $xpath->query('//table[@id="historicalTable"]//tbody/tr');

        if (! $rows || $rows->length === 0) return [];

        $data = [];
        foreach ($rows as $row) {
            $cells = $xpath->query('td', $row);
            if ($cells->length < 6) continue;

            $dateStr = trim($cells->item(0)->textContent);
            try {
                $date = \Carbon\Carbon::parse($dateStr)->toDateString();
            } catch (\Throwable) {
                continue;
            }

            $clean = fn(string $v) => (float) str_replace(',', '', trim($v));

            $data[] = [
                'date'   => $date,
                'open'   => $clean($cells->item(1)->textContent),
                'high'   => $clean($cells->item(2)->textContent),
                'low'    => $clean($cells->item(3)->textContent),
                'close'  => $clean($cells->item(4)->textContent),
                'volume' => (int) str_replace(',', '', trim($cells->item(5)->textContent)),
            ];
        }

        return array_reverse($data);
    }
}
