<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CompanyController;
use App\Http\Controllers\Api\FilingController;
use App\Http\Controllers\Api\WatchlistController;
use App\Http\Controllers\Api\ScanController;

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);

    Route::get('/companies', [CompanyController::class, 'index']);
    Route::get('/companies/{company}', [CompanyController::class, 'show']);
    Route::get('/companies/{company}/filings', [CompanyController::class, 'filings']);
    Route::get('/companies/{company}/projection', [CompanyController::class, 'projection']);
    Route::post('/companies/{company}/scan', [CompanyController::class, 'scan']);
    Route::post('/companies/{company}/rescan', [CompanyController::class, 'rescan']);

    Route::get('/filings', [FilingController::class, 'index']);
    Route::get('/filings/{filing}', [FilingController::class, 'show']);

    Route::get('/watchlist', [WatchlistController::class, 'index']);
    Route::post('/watchlist', [WatchlistController::class, 'store']);
    Route::delete('/watchlist/{company}', [WatchlistController::class, 'destroy']);
    Route::patch('/watchlist/{company}', [WatchlistController::class, 'update']);

    Route::post('/scan', [ScanController::class, 'run']);
    Route::get('/scan/progress', [ScanController::class, 'progress']);
    Route::get('/scan/status/{job}', [ScanController::class, 'status']);
});
