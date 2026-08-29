<?php

namespace App\Console\Commands;

use App\Models\Company;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class GenerateAgenticProjections extends Command
{
    protected $signature = 'projections:agentic
                          {--company= : Specific company symbol}
                          {--sector= : Specific sector}
                          {--score= : Minimum score threshold}
                          {--limit= : Limit number of companies}
                          {--force : Regenerate even if projection exists}';

    protected $description = 'Generate agentic projections with research for companies';

    public function handle()
    {
        $this->info('🤖 Agentic Projection Generator - Using Gradient AI');
        $this->info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // Build query
        $query = Company::query()
            ->whereHas('filings', function ($q) {
                $q->whereNotNull('ai_analysis')
                  ->whereNotNull('score');
            });

        // Apply filters
        if ($symbol = $this->option('company')) {
            $query->where('symbol', $symbol);
        }

        if ($sector = $this->option('sector')) {
            $query->where('sector', $sector);
        }

        if ($minScore = $this->option('score')) {
            $query->whereHas('filings.score', function ($q) use ($minScore) {
                $q->where('score', '>=', $minScore);
            });
        }

        if (!$this->option('force')) {
            $query->whereNull('projection');
        }

        if ($limit = $this->option('limit')) {
            $query->limit((int)$limit);
        }

        $companies = $query->with(['filings' => function ($q) {
            $q->whereNotNull('ai_analysis')
              ->whereNotNull('score')
              ->latest('filing_date')
              ->limit(1);
        }])->get();

        if ($companies->isEmpty()) {
            $this->warn('No companies found matching criteria');
            return 0;
        }

        $this->info("Found {$companies->count()} companies");
        $this->newLine();

        $bar = $this->output->createProgressBar($companies->count());
        $bar->setFormat(' %current%/%max% [%bar%] %percent:3s%% %message%');

        $results = [
            'success' => 0,
            'failed' => 0,
            'skipped' => 0,
            'total_time' => 0,
            'recommendations' => []
        ];

        foreach ($companies as $company) {
            $bar->setMessage("Processing {$company->symbol}...");

            $filing = $company->filings->first();
            if (!$filing) {
                $results['skipped']++;
                $bar->advance();
                continue;
            }

            try {
                $startTime = microtime(true);

                $projection = $this->generateAgenticProjection($company, $filing);

                $elapsed = microtime(true) - $startTime;
                $results['total_time'] += $elapsed;

                // Store projection
                $company->update([
                    'projection' => $projection,
                    'projection_date' => now(),
                    'projection_metadata' => [
                        'type' => 'agentic',
                        'engine' => 'gradient',
                        'rounds' => $projection['metadata']['rounds_completed'] ?? null,
                        'tool_calls' => $projection['metadata']['tool_calls_made'] ?? null,
                        'time' => round($elapsed, 1),
                    ]
                ]);

                $results['success']++;
                $results['recommendations'][$projection['recommendation'] ?? 'Unknown'][] = $company->symbol;

                $bar->setMessage("✓ {$company->symbol} - {$projection['recommendation']} ({$projection['confidence']})");

            } catch (\Exception $e) {
                $results['failed']++;
                Log::error("Agentic projection failed for {$company->symbol}: {$e->getMessage()}");
                $bar->setMessage("✗ {$company->symbol} - Failed");
            }

            $bar->advance();
        }

        $bar->finish();
        $this->newLine(2);

        // Summary
        $this->info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        $this->info('📊 SUMMARY');
        $this->info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        $this->table(
            ['Metric', 'Value'],
            [
                ['Total Companies', $companies->count()],
                ['✓ Successful', $results['success']],
                ['✗ Failed', $results['failed']],
                ['⊘ Skipped', $results['skipped']],
                ['Avg Time', $results['success'] > 0 ? round($results['total_time'] / $results['success'], 1) . 's' : 'N/A'],
                ['Total Time', round($results['total_time'], 1) . 's'],
            ]
        );

        if (!empty($results['recommendations'])) {
            $this->newLine();
            $this->info('📈 RECOMMENDATIONS');
            $this->info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            foreach ($results['recommendations'] as $rec => $symbols) {
                $this->line(sprintf('  %-15s : %d companies (%s)', $rec, count($symbols), implode(', ', array_slice($symbols, 0, 5))));
            }
        }

        $this->newLine();
        $this->info('✓ Agentic projections complete!');

        return 0;
    }

    private function generateAgenticProjection(Company $company, $filing): array
    {
        $targetQuarter = $this->getNextQuarter($filing->quarter);

        $payload = [
            'company' => $company->name,
            'symbol' => $company->symbol,
            'quarter' => $filing->quarter,
            'target_quarter' => $targetQuarter,
            'signals' => $filing->ai_analysis['signals'] ?? [],
            'score' => $filing->score->score ?? 50,
            'flags' => $filing->score->flags ?? [],
            'summary' => $filing->ai_analysis['summary'] ?? '',
            'current_price' => $company->last_price,
            'macro_context' => $company->macro_risk?->summary,
        ];

        $response = Http::timeout(120)
            ->retry(2, 1000)
            ->post(config('services.ai_engine.url') . '/project-agentic', $payload);

        if (!$response->successful()) {
            throw new \Exception("API error: {$response->status()} - " . $response->body());
        }

        return $response->json();
    }

    private function getNextQuarter(string $currentQuarter): string
    {
        // Parse quarter like "Q1-2026"
        if (preg_match('/Q(\d)-(\d{4})/', $currentQuarter, $matches)) {
            $q = (int)$matches[1];
            $year = (int)$matches[2];

            $nextQ = $q + 1;
            if ($nextQ > 4) {
                $nextQ = 1;
                $year++;
            }

            return "Q{$nextQ}-{$year}";
        }

        return "next quarter after {$currentQuarter}";
    }
}
