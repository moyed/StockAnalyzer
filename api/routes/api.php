<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CompanyController;
use App\Http\Controllers\Api\FilingController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\WatchlistController;
use App\Http\Controllers\Api\ScanController;
use App\Http\Controllers\Api\ChatController;
use App\Http\Controllers\Api\SystemController;
use App\Http\Controllers\Api\MarketController;
use App\Http\Controllers\Api\IndexController;

// Public — no auth required
Route::get('/market/kse100', [MarketController::class, 'kse100']);
Route::get('/health', [HealthController::class, 'index']);
Route::get('/health/filings', [HealthController::class, 'filings']);
Route::get('/health/queue', [HealthController::class, 'queue']);
Route::get('/health/workers', [HealthController::class, 'workers']);
Route::get('/health/ai-engine', [HealthController::class, 'aiEngine']);
Route::get('/health/database', [HealthController::class, 'database']);
Route::get('/health/system', [HealthController::class, 'system']);

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);

    Route::get('/companies', [CompanyController::class, 'index']);
    Route::get('/companies-sectors', [CompanyController::class, 'sectors']);
    Route::get('/sectors-stats', [CompanyController::class, 'sectorStats']);
    Route::get('/sectors-trends', [CompanyController::class, 'sectorTrends']);
    Route::get('/indices', [IndexController::class, 'stats']);
    Route::get('/companies/{company}', [CompanyController::class, 'show']);
    Route::get('/companies/{company}/filings', [CompanyController::class, 'filings']);
    Route::get('/companies/{company}/price-history', [CompanyController::class, 'priceHistory']);
    Route::get('/companies/{company}/news', [CompanyController::class, 'news']);
    Route::get('/companies/{company}/projection', [CompanyController::class, 'projection']);
    Route::post('/companies/rescan-all', [CompanyController::class, 'rescanAll']);
    Route::post('/companies/{company}/scan', [CompanyController::class, 'scan']);
    Route::post('/companies/{company}/rescan', [CompanyController::class, 'rescan']);

    Route::get('/filings', [FilingController::class, 'index']);
    Route::get('/filings/{filing}', [FilingController::class, 'show']);

    Route::get('/watchlist', [WatchlistController::class, 'index']);
    Route::post('/watchlist', [WatchlistController::class, 'store']);
    Route::delete('/watchlist/{company}', [WatchlistController::class, 'destroy']);
    Route::patch('/watchlist/{company}', [WatchlistController::class, 'update']);

    Route::post('/scan', [ScanController::class, 'run']);
    Route::post('/scan/sync-all-filings', [ScanController::class, 'syncAllFilings']);
    Route::post('/scan/sync-prices', [ScanController::class, 'syncPrices']);
    Route::get('/scan/progress', [ScanController::class, 'progress']);
    Route::get('/scan/status/{job}', [ScanController::class, 'status']);

    Route::post('/chat', [ChatController::class, 'ask']);

    // System management
    Route::post('/system/restart-workers', [SystemController::class, 'restartWorkers']);
    Route::post('/system/restart-ai-engine', [SystemController::class, 'restartAiEngine']);
    Route::post('/system/restart-all', [SystemController::class, 'restartAll']);
    Route::post('/system/reset-stuck-filings', [SystemController::class, 'resetStuckFilings']);
    Route::post('/system/clear-failed-jobs', [SystemController::class, 'clearFailedJobs']);
    Route::post('/system/retry-failed-jobs', [SystemController::class, 'retryFailedJobs']);
    Route::post('/system/retry-failed-filings', [SystemController::class, 'retryFailedFilings']);
    Route::post('/system/process-pending-filings', [SystemController::class, 'processPendingFilings']);
    Route::post('/system/update-pe-ratios', [SystemController::class, 'updatePeRatios']);

    Route::get('/market/briefing', fn() =>
        response()->json(\Illuminate\Support\Facades\Cache::get('market_briefing_latest'))
    );
});
