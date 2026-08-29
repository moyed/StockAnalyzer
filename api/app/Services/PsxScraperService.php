<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class PsxScraperService
{
    private string $baseUrl = 'https://dps.psx.com.pk';
    private int $pageSize   = 50;

    /**
     * Fetch all financial transmission announcements for a given month (Y-m).
     * PSX uses a POST endpoint returning an HTML fragment with table id="announcementsTable".
     */
    public function fetchTransmissions(string $month): array
    {
        $dateFrom = \Carbon\Carbon::parse($month . '-01')->startOfMonth()->toDateString();
        $dateTo   = \Carbon\Carbon::parse($month . '-01')->endOfMonth()->toDateString();

        $results = [];
        $offset  = 0;

        do {
            $response = Http::timeout(30)
                ->withHeaders([
                    'Content-Type' => 'application/x-www-form-urlencoded',
                    'Referer'      => $this->baseUrl . '/announcements',
                    'User-Agent'   => 'Mozilla/5.0 (compatible; PSXBot/1.0)',
                ])
                ->asForm()
                ->post("{$this->baseUrl}/announcements", [
                    'type'      => 'C',          // company announcements
                    'symbol'    => '',
                    'query'     => '',
                    'count'     => $this->pageSize,
                    'offset'    => $offset,
                    'date_from' => $dateFrom,
                    'date_to'   => $dateTo,
                    'page'      => 'annc',
                ]);

            if (! $response->ok()) {
                Log::warning("PSX scraper: HTTP {$response->status()} at offset {$offset}");
                break;
            }

            $items = $this->parseFragment($response->body());
            $results = array_merge($results, $items);

            // Check if more pages exist
            $total = $this->parseTotal($response->body());
            $offset += $this->pageSize;

        } while (count($items) === $this->pageSize && $offset < $total);

        // Filter to transmission filings only (title contains "Transmission" or "Financial Statement")
        return array_filter($results, fn($r) => $this->isTransmission($r['title'] ?? ''));
    }

    /**
     * Parse the HTML fragment returned by PSX (table id="announcementsTable").
     */
    private function parseFragment(string $html): array
    {
        $dom = new \DOMDocument();
        @$dom->loadHTML('<meta charset="utf-8">' . $html);
        $xpath = new \DOMXPath($dom);

        $rows = $xpath->query('//table[@id="announcementsTable"]//tbody/tr');
        if ($rows === false || $rows->length === 0) {
            return [];
        }

        $items = [];
        foreach ($rows as $row) {
            $cells = $xpath->query('td', $row);
            if ($cells->length < 5) continue;

            // Columns: Date | Time | Symbol | Company Name | Title | PDF
            $date  = trim($cells->item(0)->textContent ?? '');
            // Symbol is in cell 2 — text content is the ticker (e.g. "DCR")
            $symbol = trim($cells->item(2)->textContent ?? '');
            // Fallback: extract from href /company/SYMBOL
            if (! $symbol) {
                $symbolNode = $xpath->query('.//a', $cells->item(2))->item(0);
                if ($symbolNode) {
                    $symbol = basename(rtrim($symbolNode->getAttribute('href'), '/'));
                }
            }
            $name   = trim($cells->item(3)->textContent ?? '');
            $title  = trim($cells->item(4)->textContent ?? '');
            $pdfLink = $xpath->query('.//a[contains(@href,".pdf") or contains(@href,"/download/")]', $row)->item(0);
            $pdfUrl  = $pdfLink ? $pdfLink->getAttribute('href') : '';

            if (! $symbol || ! $pdfUrl) continue;

            if (! str_starts_with($pdfUrl, 'http')) {
                $pdfUrl = $this->baseUrl . '/' . ltrim($pdfUrl, '/');
            }

            $items[] = [
                'symbol'      => strtoupper($symbol),
                'name'        => $name ?: $symbol,
                'title'       => $title,
                'filing_date' => $this->parseDate($date),
                'pdf_url'     => $pdfUrl,
                'quarter'     => $this->inferQuarter($date),
                'sector'      => null,
            ];
        }

        return $items;
    }

    private function parseTotal(string $html): int
    {
        if (preg_match('/data-total="(\d+)"/', $html, $m)) {
            return (int) $m[1];
        }
        return 0;
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

    private function parseDate(string $raw): string
    {
        try {
            return \Carbon\Carbon::parse($raw)->toDateString();
        } catch (\Throwable) {
            return now()->toDateString();
        }
    }

    private function inferQuarter(string $dateStr): string
    {
        try {
            $date = \Carbon\Carbon::parse($dateStr);
            $q    = (int) ceil($date->month / 3);
            return "Q{$q}-{$date->year}";
        } catch (\Throwable) {
            return 'Q?-?';
        }
    }
}
