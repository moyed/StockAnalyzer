<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class ScanController extends Controller
{
    public function run(Request $request)
    {
        $data = $request->validate([
            'month' => 'required|date_format:Y-m',
        ]);

        $job = \App\Jobs\ScanMonthJob::dispatch($data['month']);

        return response()->json([
            'message' => 'Scan started for ' . $data['month'],
            'month'   => $data['month'],
        ], 202);
    }

    public function status(Request $request, string $job)
    {
        return response()->json(['status' => 'queued']);
    }
}
