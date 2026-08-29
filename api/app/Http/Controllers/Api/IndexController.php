<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\IndexMembership;

class IndexController extends Controller
{
    /**
     * Rating + ranking stats per PSX index (KSE-100, KMI-30, etc.),
     * mirroring CompanyController::sectorStats() but grouped by index
     * membership instead of sector.
     */
    public function stats()
    {
        $companies = Company::with(['latestFiling.score', 'indexMemberships'])->get();

        $result = [];

        foreach (IndexMembership::NAMES as $code => $name) {
            $inIndex = $companies->filter(
                fn ($c) => $c->indexMemberships->contains('index_code', $code)
            );

            if ($inIndex->isEmpty()) {
                continue;
            }

            $scored = $inIndex->filter(fn ($c) => $c->latestFiling && $c->latestFiling->score);
            $scores = $scored->map(fn ($c) => (int) $c->latestFiling->score->score);

            $top = $scored->sortByDesc(fn ($c) => (int) $c->latestFiling->score->score)->first();

            $withPE = $inIndex->filter(function ($c) {
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

            $avgScore = $scores->count() > 0 ? round($scores->avg(), 1) : null;

            $trend = null;
            if ($avgScore !== null) {
                if ($avgScore >= 55) $trend = 'growing';
                elseif ($avgScore <= 40) $trend = 'declining';
                else $trend = 'stable';
            }

            $result[] = [
                'index_code'         => $code,
                'index_name'         => $name,
                'company_count'      => $inIndex->count(),
                'scored_count'       => $scored->count(),
                'avg_score'          => $avgScore,
                'top_score'          => $scores->count() > 0 ? $scores->max() : null,
                'top_company_id'     => $top?->id,
                'top_company_symbol' => $top?->symbol,
                'top_company_name'   => $top?->name,
                'avg_pe'             => $peRatios->count() > 0 ? round($peRatios->avg(), 2) : null,
                'trend'              => $trend,
            ];
        }

        usort($result, fn ($a, $b) => ($b['avg_score'] ?? -1) <=> ($a['avg_score'] ?? -1));

        return response()->json(array_values($result));
    }
}
