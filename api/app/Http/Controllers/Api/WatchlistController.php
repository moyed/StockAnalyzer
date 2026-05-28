<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class WatchlistController extends Controller
{
    public function index(Request $request)
    {
        $items = \App\Models\Watchlist::with(['company.latestFiling.score'])
            ->where('user_id', $request->user()->id)
            ->latest()
            ->get();

        return response()->json($items);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'company_id' => 'required|exists:companies,id',
            'notes'      => 'nullable|string|max:1000',
        ]);

        $item = \App\Models\Watchlist::firstOrCreate(
            ['user_id' => $request->user()->id, 'company_id' => $data['company_id']],
            ['notes' => $data['notes'] ?? null],
        );

        return response()->json($item->load('company'), 201);
    }

    public function update(Request $request, \App\Models\Company $company)
    {
        $data = $request->validate(['notes' => 'nullable|string|max:1000']);

        \App\Models\Watchlist::where('user_id', $request->user()->id)
            ->where('company_id', $company->id)
            ->update(['notes' => $data['notes']]);

        return response()->json(['message' => 'Updated']);
    }

    public function destroy(Request $request, \App\Models\Company $company)
    {
        \App\Models\Watchlist::where('user_id', $request->user()->id)
            ->where('company_id', $company->id)
            ->delete();

        return response()->json(['message' => 'Removed']);
    }
}
