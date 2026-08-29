<?php

namespace App\Jobs;

use App\Services\NewsScraperService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class ScrapeNewsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * Allow up to 10 minutes — scraping 4 sources + AI calls per article.
     * Symbol-specific scrapes fetch up to 100 PSX announcements going back 9 months.
     */
    public int $timeout = 600;

    /**
     * @param string|null $symbol  If provided, only scrape news for this symbol.
     *                             If null, scrape all sources globally.
     */
    public function __construct(private readonly ?string $symbol = null) {}

    public function handle(NewsScraperService $service): void
    {
        try {
            if ($this->symbol) {
                $count = $service->scrapeForSymbol($this->symbol);
                Log::info("ScrapeNewsJob: saved {$count} new articles for {$this->symbol}");
            } else {
                $count = $service->scrapeAll();
                Log::info("ScrapeNewsJob: saved {$count} new articles (global)");
            }
        } catch (\Throwable $e) {
            Log::error('ScrapeNewsJob failed: ' . $e->getMessage());
            throw $e;  // let the queue mark it as failed
        }
    }
}
