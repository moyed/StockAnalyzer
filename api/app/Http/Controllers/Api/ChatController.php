<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Company;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class ChatController extends Controller
{
    private string $aiEngineUrl;

    public function __construct()
    {
        $this->aiEngineUrl = rtrim(config('services.ai_engine.url', 'http://localhost:8003'), '/');
    }

    public function ask(Request $request)
    {
        $request->validate(['message' => 'required|string|max:1000']);
        $question = $request->input('message');

        $context = $this->buildContext($question);

        try {
            $response = Http::timeout(90)->post("{$this->aiEngineUrl}/chat", [
                'question' => $question,
                'context'  => $context,
            ]);
        } catch (ConnectionException $e) {
            \Log::error('AI Engine connection failed', [
                'url' => $this->aiEngineUrl,
                'error' => $e->getMessage()
            ]);
            return response()->json([
                'error' => 'AI engine is busy processing requests. Please try again in a moment.'
            ], 503);
        }

        if (! $response->ok()) {
            \Log::error('AI Engine returned error', [
                'status' => $response->status(),
                'body' => $response->body()
            ]);
            return response()->json(['error' => 'AI engine returned an error. Please try again.'], 502);
        }

        return response()->json($response->json());
    }

    private function buildContext(string $question): array
    {
        $ctx = [];

        // Always include market briefing and top companies
        $ctx['market_briefing'] = Cache::get('market_briefing_latest');

        $ctx['top_companies'] = Company::with(['latestFiling.score'])
            ->leftJoinSub(
                \DB::table('filings as f')
                    ->join('scores', 'f.id', '=', 'scores.filing_id')
                    ->joinSub(
                        \DB::table('filings')
                            ->selectRaw('company_id, MAX(filing_date) as max_date')
                            ->groupBy('company_id'),
                        'latest',
                        fn($j) => $j->on('f.company_id', '=', 'latest.company_id')
                                    ->on('f.filing_date', '=', 'latest.max_date')
                    )
                    ->select('f.company_id', 'scores.score'),
                'ls',
                'companies.id',
                'ls.company_id'
            )
            ->orderByRaw('CAST(ls.score AS INTEGER) IS NULL, CAST(ls.score AS INTEGER) DESC')
            ->select('companies.*')
            ->limit(30)
            ->get()
            ->toArray();

        // Sector stats
        $ctx['sector_stats'] = Cache::remember('chat_sector_stats', 300, function () {
            $companies = Company::whereNotNull('sector')
                ->where('sector', '!=', '')
                ->with(['latestFiling.score'])
                ->get();

            $result = [];
            foreach ($companies->groupBy('sector') as $sector => $group) {
                $scored = $group->filter(fn($c) => $c->latestFiling && $c->latestFiling->score);
                $scores = $scored->map(fn($c) => (int) $c->latestFiling->score->score);
                $top    = $scored->sortByDesc(fn($c) => (int) $c->latestFiling->score->score)->first();

                $result[] = [
                    'sector'             => $sector,
                    'company_count'      => $group->count(),
                    'avg_score'          => $scores->count() ? round($scores->avg(), 1) : null,
                    'top_score'          => $scores->count() ? $scores->max() : null,
                    'top_company_symbol' => $top?->symbol,
                ];
            }

            usort($result, fn($a, $b) => ($b['avg_score'] ?? -1) <=> ($a['avg_score'] ?? -1));
            return $result;
        });

        // If a specific company symbol or name appears in the question, include its details
        $symbol = $this->detectSymbol($question);
        if ($symbol) {
            $company = Company::where('symbol', strtoupper($symbol))
                ->with(['filings' => fn($q) => $q->with('score')->orderByDesc('filing_date')->limit(3)])
                ->first();

            if ($company) {
                $ctx['company'] = ['company' => $company->toArray()];

                // Include projection if available
                $filing = $company->filings()->with('score')
                    ->whereNotNull('ai_analysis')
                    ->orderByDesc('filing_date')
                    ->first();

                if ($filing) {
                    $projection = \App\Models\Projection::where('company_id', $company->id)
                        ->where('filing_id', $filing->id)
                        ->where('status', 'done')
                        ->latest()
                        ->first();

                    if ($projection) {
                        $ctx['projection'] = array_merge(['status' => 'done'], $projection->result ?? []);
                    }

                    // Include recent news
                    $news = \App\Models\NewsArticle::forSymbol($company->symbol)
                        ->latest('published_at')
                        ->limit(5)
                        ->get(['headline', 'source', 'published_at', 'sentiment', 'impact', 'ai_summary'])
                        ->toArray();
                    if ($news) {
                        $ctx['news'] = ['news' => $news];
                    }
                }
            }
        }

        return $ctx;
    }

    private function detectSymbol(string $question): ?string
    {
        // Match explicit PSX symbols: 2–6 uppercase letters possibly followed by digits
        if (preg_match('/\b([A-Z]{2,6}\d{0,2})\b/', strtoupper($question), $m)) {
            // Confirm it's actually a known symbol
            if (Company::where('symbol', $m[1])->exists()) {
                return $m[1];
            }
        }

        // Try matching company name fragments against DB
        $words = array_filter(explode(' ', $question), fn($w) => strlen($w) >= 4);
        foreach ($words as $word) {
            $company = Company::where('name', 'like', "%{$word}%")
                ->orWhere('symbol', 'like', "%{$word}%")
                ->first();
            if ($company) {
                return $company->symbol;
            }
        }

        return null;
    }
}
