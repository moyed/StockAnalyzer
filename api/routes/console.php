<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Daily sync at 6AM PKT (UTC+5 = 1AM UTC)
Schedule::command('psx:sync')->dailyAt('01:00');
