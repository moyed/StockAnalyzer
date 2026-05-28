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

        $companies = $query->orderByDesc('updated_at')->paginate(50);

        return response()->json($companies);
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
}
