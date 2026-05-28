<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/login', fn() => response()->json(['message' => 'Use /api/login instead']))->name('login');
