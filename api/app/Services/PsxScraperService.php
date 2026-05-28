<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class PsxScraperService
{
    private string $baseUrl = 'https://dps.psx.com.pk';

    /**
     * Fetch all "Transmission" announcements for a given month (Y-m).
     * Returns array of filing data ready for DB upsert.
     */
    public function fetchTransmissions(string $month): array
    {
        [$year, $mon] = explode('-', $month);

        $page = 1;
        $results = [];

        do {
            $response = Http::timeout(30)->get("{$this->baseUrl}/announcements", [
                'month'    => $month,
                'category' => 'Transmission',
                'page'     => $page,
            ]);

            if (! $response->ok()) {
                Log::warning("PSX scraper: non-200 on page {$page}", ['status' => $response->status()]);
                break;
            }

            $items = $this->parsePage($response->body());
            $results = array_merge($results, $items);

            $page++;
        } while (count($items) > 0);

        return $results;
    }

    /**
     * Parse HTML page and extract filing entries.
     * PSX returns a table/list of announcements — we extract symbol, name, pdf url, date.
     */
    private function parsePage(string $html): array
    {
        $dom = new \DOMDocument();
        @$dom->loadHTML($html);
        $xpath = new \DOMXPath($dom);

        $rows = $xpath->query('//table[@id="announcementTable"]//tr[position()>1]');
        if ($rows === false || $rows->length === 0) {
            return [];
        }

        $items = [];
        foreach ($rows as $row) {
            $cells = $xpath->query('td', $row);
            if ($cells->length < 4) {
                continue;
            }

            $date   = trim($cells->item(0)->textContent ?? '');
            $symbol = trim($cells->item(1)->textContent ?? '');
            $name   = trim($cells->item(2)->textContent ?? '');
            $link   = $xpath->query('.//a', $cells->item(3))->item(0);
            $pdfUrl = $link ? ($link->getAttribute('href') ?? '') : '';

            if (! $symbol || ! $pdfUrl) {
                continue;
            }

            if (! str_starts_with($pdfUrl, 'http')) {
                $pdfUrl = $this->baseUrl . '/' . ltrim($pdfUrl, '/');
            }

            $items[] = [
                'symbol'      => $symbol,
                'name'        => $name,
                'filing_date' => $this->parseDate($date),
                'pdf_url'     => $pdfUrl,
                'quarter'     => $this->inferQuarter($date),
                'sector'      => null,
            ];
        }

        return $items;
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
            $date  = \Carbon\Carbon::parse($dateStr);
            $q     = (int) ceil($date->month / 3);
            return "Q{$q}-FY{$date->year}";
        } catch (\Throwable) {
            return 'Q?-FY?';
        }
    }
}
