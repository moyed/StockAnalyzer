<?php

namespace App\Services;

use App\Models\NewsArticle;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class NewsScraperService
{
    private string $aiEngineUrl;

    public function __construct()
    {
        $this->aiEngineUrl = config('services.ai_engine.url', 'http://localhost:8003');
    }

    // ─── Public API ──────────────────────────────────────────────────────────

    /**
     * Scrape all sources (triggered by global scan).
     * Returns number of new articles saved.
     */
    public function scrapeAll(): int
    {
        $count = 0;
        $count += $this->processBatch($this->scrapeDawn());
        $count += $this->processBatch($this->scrapeExpressTribune());
        $count += $this->processBatch($this->scrapeBusinessRecorder());
        $count += $this->processBatch($this->scrapeMettisGlobal());
        $count += $this->processBatch($this->scrapePsxAnnouncements('', 1));
        return $count;
    }

    /**
     * Scrape news specifically related to one company (triggered by rescan).
     * Searches by both ticker symbol AND company name keywords so that articles
     * written as "Al-Ghazi Tractors" (not "AGTL") are found.
     * Returns number of new articles saved.
     */
    public function scrapeForSymbol(string $symbol): int
    {
        $symbol  = strtoupper(trim($symbol));
        $company = \App\Models\Company::where('symbol', $symbol)->first();

        // Build search terms: ticker + meaningful words from the company name
        $terms = $this->buildSearchTerms($symbol, $company?->name);

        $count = 0;
        $count += $this->processBatch($this->scrapeDawn($terms, $symbol));
        $count += $this->processBatch($this->scrapeExpressTribune($terms, $symbol));
        $count += $this->processBatch($this->scrapeBusinessRecorder($terms, $symbol));
        $count += $this->processBatch($this->scrapeMettisGlobal($terms, $symbol));

        // PSX: query directly by symbol, go back 3 quarters (9 months) for full history
        $count += $this->processBatch($this->scrapePsxAnnouncements($symbol, 9));

        return $count;
    }

    // ─── Scrapers ─────────────────────────────────────────────────────────────

    /**
     * Dawn Business RSS feed.
     * URL: https://www.dawn.com/feeds/business
     *
     * @param array  $filterTerms  When non-empty, only keep articles matching ANY term
     * @param string $knownSymbol  Symbol to force-tag matched articles with
     */
    private function scrapeDawn(array $filterTerms = [], string $knownSymbol = ''): array
    {
        try {
            $response = Http::timeout(15)
                ->withHeaders(['User-Agent' => 'Mozilla/5.0 (compatible; StockAnalyzerBot/1.0)'])
                ->get('https://www.dawn.com/feeds/business');

            if (! $response->ok()) {
                Log::warning("Dawn RSS: HTTP {$response->status()}");
                return [];
            }

            $xml = @simplexml_load_string($response->body());
            if (! $xml) {
                Log::warning('Dawn RSS: could not parse XML');
                return [];
            }

            $articles = [];
            foreach ($xml->channel->item as $item) {
                $url      = trim((string) $item->link);
                $headline = trim((string) $item->title);
                $body     = strip_tags((string) ($item->description ?? ''));
                $pubDate  = (string) $item->pubDate;

                if (! $url || ! $headline) continue;

                if ($filterTerms && ! $this->textMentionsAny($headline . ' ' . $body, $filterTerms)) {
                    continue;
                }

                $articles[] = [
                    'headline'      => $headline,
                    'body'          => substr($body, 0, 2000),
                    'source'        => 'Dawn Business',
                    'url'           => $url,
                    'published_at'  => $pubDate ? $this->parseDate($pubDate) : null,
                    'known_symbols' => $knownSymbol ? [$knownSymbol] : [],
                ];
            }

            return $articles;

        } catch (\Throwable $e) {
            Log::warning('Dawn scraper error: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * Express Tribune Business RSS feed.
     * URL: https://tribune.com.pk/rss/business
     */
    private function scrapeExpressTribune(array $filterTerms = [], string $knownSymbol = ''): array
    {
        try {
            $response = Http::timeout(15)
                ->withHeaders(['User-Agent' => 'Mozilla/5.0 (compatible; StockAnalyzerBot/1.0)'])
                ->get('https://tribune.com.pk/rss/business');

            if (! $response->ok()) {
                Log::warning("Express Tribune RSS: HTTP {$response->status()}");
                return [];
            }

            $xml = @simplexml_load_string($response->body());
            if (! $xml) {
                Log::warning('Express Tribune RSS: could not parse XML');
                return [];
            }

            $articles = [];
            foreach ($xml->channel->item as $item) {
                $url      = trim((string) $item->link);
                $headline = trim((string) $item->title);
                $body     = strip_tags((string) ($item->description ?? ''));
                $pubDate  = (string) $item->pubDate;

                if (! $url || ! $headline) continue;

                if ($filterTerms && ! $this->textMentionsAny($headline . ' ' . $body, $filterTerms)) {
                    continue;
                }

                $articles[] = [
                    'headline'      => $headline,
                    'body'          => substr($body, 0, 2000),
                    'source'        => 'Express Tribune',
                    'url'           => $url,
                    'published_at'  => $pubDate ? $this->parseDate($pubDate) : null,
                    'known_symbols' => $knownSymbol ? [$knownSymbol] : [],
                ];
            }

            return $articles;

        } catch (\Throwable $e) {
            Log::warning('Express Tribune scraper error: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * Business Recorder RSS feed (Pakistan's leading financial newspaper — PSX stocks section).
     * URL: https://www.brecorder.com/feeds/markets/stocks
     */
    private function scrapeBusinessRecorder(array $filterTerms = [], string $knownSymbol = ''): array
    {
        try {
            $response = Http::timeout(15)
                ->withHeaders(['User-Agent' => 'Mozilla/5.0 (compatible; StockAnalyzerBot/1.0)'])
                ->get('https://www.brecorder.com/feeds/markets/stocks');

            if (! $response->ok()) {
                Log::warning("Business Recorder RSS: HTTP {$response->status()}");
                return [];
            }

            $xml = @simplexml_load_string($response->body());
            if (! $xml) {
                Log::warning('Business Recorder RSS: could not parse XML');
                return [];
            }

            $articles = [];
            foreach ($xml->channel->item as $item) {
                $url      = trim((string) $item->link);
                $headline = trim((string) $item->title);
                $body     = strip_tags((string) ($item->description ?? ''));
                $pubDate  = (string) $item->pubDate;

                if (! $url || ! $headline) continue;

                if ($filterTerms && ! $this->textMentionsAny($headline . ' ' . $body, $filterTerms)) {
                    continue;
                }

                $articles[] = [
                    'headline'      => $headline,
                    'body'          => substr($body, 0, 2000),
                    'source'        => 'Business Recorder',
                    'url'           => $url,
                    'published_at'  => $pubDate ? $this->parseDate($pubDate) : null,
                    'known_symbols' => $knownSymbol ? [$knownSymbol] : [],
                ];
            }

            return $articles;

        } catch (\Throwable $e) {
            Log::warning('Business Recorder scraper error: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * Mettis Global (mettisglobal.news) — Pakistan financial news/markets wire.
     * No RSS feed is published; the "latest" listing is server-rendered HTML.
     * Article listings don't carry a per-item timestamp, so published_at is left null.
     * URL: https://mettisglobal.news/latest
     */
    private function scrapeMettisGlobal(array $filterTerms = [], string $knownSymbol = ''): array
    {
        try {
            $response = Http::timeout(15)
                ->withHeaders(['User-Agent' => 'Mozilla/5.0 (compatible; StockAnalyzerBot/1.0)'])
                ->get('https://mettisglobal.news/latest');

            if (! $response->ok()) {
                Log::warning("Mettis Global: HTTP {$response->status()}");
                return [];
            }

            $dom = new \DOMDocument();
            @$dom->loadHTML('<meta charset="utf-8">' . $response->body());
            $xpath = new \DOMXPath($dom);

            $posts = $xpath->query('//div[contains(@class, "PostList")]');
            if (! $posts || $posts->length === 0) return [];

            $articles = [];
            foreach ($posts as $post) {
                $headlineNode = $xpath->query('.//h4[contains(@class, "HeadlineStyle")]', $post)->item(0);
                $bodyNode     = $xpath->query('.//p[contains(@class, "ListnewDes")]', $post)->item(0);
                $linkNode     = $xpath->query('.//a[@href]', $post)->item(0);

                $headline = trim($headlineNode?->textContent ?? '');
                $body     = trim($bodyNode?->textContent ?? '');
                $url      = trim($linkNode?->getAttribute('href') ?? '');

                if (! $url || ! $headline) continue;

                if ($filterTerms && ! $this->textMentionsAny($headline . ' ' . $body, $filterTerms)) {
                    continue;
                }

                $articles[] = [
                    'headline'      => $headline,
                    'body'          => substr($body, 0, 2000),
                    'source'        => 'Mettis Global',
                    'url'           => $url,
                    'published_at'  => null,
                    'known_symbols' => $knownSymbol ? [$knownSymbol] : [],
                ];
            }

            return $articles;

        } catch (\Throwable $e) {
            Log::warning('Mettis Global scraper error: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * PSX company announcements (dividends, material info, board meetings, etc.)
     * Reuses the PSX announcements endpoint but skips financial filing transmissions
     * (those are handled separately by PsxScraperService).
     *
     * @param int $months  How many months back to fetch (1 for global scan, 9 for symbol-specific)
     */
    private function scrapePsxAnnouncements(string $symbol = '', int $months = 1): array
    {
        $count = $symbol ? 100 : 30;

        try {
            $response = Http::timeout(20)
                ->withHeaders([
                    'Content-Type' => 'application/x-www-form-urlencoded',
                    'Referer'      => 'https://dps.psx.com.pk/announcements',
                    'User-Agent'   => 'Mozilla/5.0 (compatible; StockAnalyzerBot/1.0)',
                ])
                ->asForm()
                ->post('https://dps.psx.com.pk/announcements', [
                    'type'      => 'C',
                    'symbol'    => $symbol,
                    'query'     => '',
                    'count'     => $count,
                    'offset'    => 0,
                    'date_from' => now()->subMonths($months)->toDateString(),
                    'date_to'   => now()->toDateString(),
                    'page'      => 'annc',
                ]);

            if (! $response->ok()) {
                Log::warning("PSX announcements: HTTP {$response->status()}");
                return [];
            }

            return $this->parsePsxFragment($response->body());

        } catch (\Throwable $e) {
            Log::warning('PSX news scraper error: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * Parse the PSX announcements HTML table.
     */
    private function parsePsxFragment(string $html): array
    {
        $dom = new \DOMDocument();
        @$dom->loadHTML('<meta charset="utf-8">' . $html);
        $xpath = new \DOMXPath($dom);

        $rows = $xpath->query('//table[@id="announcementsTable"]//tbody/tr');
        if (! $rows || $rows->length === 0) return [];

        $articles = [];
        foreach ($rows as $row) {
            $cells = $xpath->query('td', $row);
            if ($cells->length < 5) continue;

            $date    = trim($cells->item(0)->textContent ?? '');
            $sym     = strtoupper(trim($cells->item(2)->textContent ?? ''));
            $company = trim($cells->item(3)->textContent ?? '');
            $title   = trim($cells->item(4)->textContent ?? '');

            if (! $sym || ! $title) continue;

            // Skip financial transmission filings — those are handled by the filing scraper
            if ($this->isTransmission($title)) continue;

            // Build a deterministic URL for dedup (PSX doesn't give direct links for announcements)
            $url = 'https://dps.psx.com.pk/announcements#' . md5($date . $sym . $title);

            $articles[] = [
                'headline'      => "{$sym}: {$title}",
                'body'          => "{$company} — {$title}. Filed on {$date}.",
                'source'        => 'PSX Announcements',
                'url'           => $url,
                'published_at'  => $this->parseDate($date),
                'known_symbols' => [$sym],  // symbol is always known for PSX items
            ];
        }

        return $articles;
    }

    // ─── Processing ───────────────────────────────────────────────────────────

    /**
     * For each raw article: skip duplicates, call AI, save to DB.
     * Returns count of newly saved articles.
     */
    private function processBatch(array $articles): int
    {
        $saved = 0;

        foreach ($articles as $article) {
            // Dedup by URL
            if (NewsArticle::where('url', $article['url'])->exists()) {
                continue;
            }

            // Call AI engine for structured analysis
            $aiResult = $this->analyzeWithAi($article);

            // Merge AI-discovered symbols with any pre-known symbols
            $knownSymbols = array_map('strtoupper', $article['known_symbols'] ?? []);
            $aiSymbols    = array_map('strtoupper', $aiResult['mentioned_symbols'] ?? []);
            $allSymbols   = array_values(array_unique(array_merge($knownSymbols, $aiSymbols)));

            NewsArticle::create([
                'headline'          => $article['headline'],
                'body'              => $article['body'] ?? null,
                'source'            => $article['source'],
                'url'               => $article['url'],
                'published_at'      => $article['published_at'] ?? null,
                'sentiment'         => $aiResult['sentiment'] ?? null,
                'impact'            => $aiResult['impact'] ?? null,
                'mentioned_symbols' => $allSymbols,
                'category'          => $aiResult['category'] ?? null,
                'ai_summary'        => $aiResult['summary'] ?? null,
            ]);

            $saved++;
        }

        return $saved;
    }

    /**
     * POST to the AI engine's /analyze-news endpoint.
     * Returns empty array on any failure so scraping continues.
     */
    private function analyzeWithAi(array $article): array
    {
        try {
            $response = Http::timeout(30)->post("{$this->aiEngineUrl}/analyze-news", [
                'headline' => $article['headline'],
                'body'     => $article['body'] ?? '',
                'source'   => $article['source'],
            ]);

            if ($response->ok()) {
                return $response->json() ?? [];
            }

            Log::warning("AI /analyze-news returned {$response->status()} for: {$article['headline']}");
        } catch (\Throwable $e) {
            Log::warning('AI news analysis failed: ' . $e->getMessage());
        }

        return [];
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Build a list of search terms for RSS pre-filtering.
     *
     * Strategy:
     *  1. Ticker symbol (always)
     *  2. Full cleaned company name as a phrase (e.g. "Al-Ghazi Tractors")
     *  3. Hyphenated compounds only (e.g. "Al-Ghazi") — specific enough to avoid false positives
     *
     * Individual plain words (e.g. "Tractors", "Systems", "Bank") are intentionally
     * excluded — they match too many unrelated articles in Pakistani business news.
     */
    private function buildSearchTerms(string $symbol, ?string $companyName): array
    {
        $terms = [$symbol];

        if (! $companyName) {
            return $terms;
        }

        // Strip trailing legal suffixes to get the trading name
        $name = preg_replace(
            '/\b(Limited|Ltd\.?|Private|Pvt\.?|Corporation|Corp\.?|Company|Co\.?|Incorporated|Inc\.?)\b\.?/i',
            '',
            $companyName
        );
        $name = trim(preg_replace('/\s{2,}/', ' ', $name));

        // Add the full cleaned name as a phrase (e.g. "Al-Ghazi Tractors")
        if (strlen($name) > 3) {
            $terms[] = $name;
        }

        // Also add hyphenated compounds as standalone terms (e.g. "Al-Ghazi" from "Al-Ghazi Tractors")
        // These are brand-specific and won't over-match the way generic plain words do
        preg_match_all('/\b\w+(?:-\w+)+\b/', $name, $m);
        foreach ($m[0] as $compound) {
            if (! in_array($compound, $terms)) {
                $terms[] = $compound;
            }
        }

        return array_values(array_filter($terms));
    }

    /**
     * Returns true if $text contains ANY of the given $terms (case-insensitive).
     */
    private function textMentionsAny(string $text, array $terms): bool
    {
        foreach ($terms as $term) {
            if (stripos($text, $term) !== false) {
                return true;
            }
        }
        return false;
    }

    private function isTransmission(string $title): bool
    {
        $lower = strtolower($title);
        return str_contains($lower, 'transmission')
            || str_contains($lower, 'financial statement')
            || str_contains($lower, 'financial report')
            || str_contains($lower, 'quarterly report')
            || str_contains($lower, 'annual report');
    }

    private function parseDate(string $raw): ?string
    {
        try {
            return \Carbon\Carbon::parse($raw)->toDateTimeString();
        } catch (\Throwable) {
            return null;
        }
    }
}
