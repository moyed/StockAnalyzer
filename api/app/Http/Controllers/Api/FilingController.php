<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class FilingController extends Controller
{
    public function index(Request $request)
    {
        $query = \App\Models\Filing::with(['company', 'score'])
            ->when($request->month, function ($q) use ($request) {
                $q->whereYear('filing_date', substr($request->month, 0, 4))
                  ->whereMonth('filing_date', substr($request->month, 5, 2));
            })
            ->when($request->status, fn($q) => $q->where('status', $request->status))
            ->when($request->min_score, fn($q) => $q->whereHas('score', fn($sq) =>
                $sq->where('score', '>=', $request->min_score)
            ));

        $filings = $query->leftJoin('scores', 'filings.id', '=', 'scores.filing_id')
            ->orderByDesc('scores.score')
            ->orderByDesc('filings.filing_date')
            ->select('filings.*')
            ->paginate(500);

        return response()->json($filings);
    }

    public function show(\App\Models\Filing $filing)
    {
        $filing->load(['company', 'score']);

        return response()->json($filing);
    }
}
