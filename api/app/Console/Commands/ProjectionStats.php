<?php

namespace App\Console\Commands;

use App\Models\Company;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class ProjectionStats extends Command
{
    protected $signature = 'projections:stats';
    protected $description = 'Show projection statistics';

    public function handle()
    {
        $this->info('📊 PROJECTION STATISTICS');
        $this->info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // Total companies
        $total = Company::count();
        $withFilings = Company::whereHas('filings', function ($q) {
            $q->whereNotNull('ai_analysis')->whereNotNull('score');
        })->count();

        $withProjections = Company::whereNotNull('projection')->count();

        // Count agentic vs standard manually (SQLite JSON querying issues)
        $allProjections = Company::whereNotNull('projection')
            ->select('id', 'projection_metadata')
            ->get();

        $agentic = $allProjections->filter(fn($c) =>
            $c->projection_metadata &&
            isset($c->projection_metadata['type']) &&
            $c->projection_metadata['type'] === 'agentic'
        )->count();

        $standard = $withProjections - $agentic;

        $this->table(
            ['Category', 'Count', '%'],
            [
                ['Total Companies', $total, '100%'],
                ['With Analyzed Filings', $withFilings, round($withFilings/$total*100, 1).'%'],
                ['With Projections', $withProjections, round($withProjections/$withFilings*100, 1).'%'],
                ['  - Agentic', $agentic, round($agentic/$withProjections*100, 1).'%'],
                ['  - Standard', $standard, round($standard/$withProjections*100, 1).'%'],
            ]
        );

        // Agentic recommendations
        if ($agentic > 0) {
            $this->newLine();
            $this->info('🤖 AGENTIC PROJECTIONS BY RECOMMENDATION');
            $this->info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

            $recommendations = Company::whereNotNull('projection')
                ->select('id', 'projection', 'projection_metadata')
                ->get()
                ->filter(fn($c) =>
                    $c->projection_metadata &&
                    isset($c->projection_metadata['type']) &&
                    $c->projection_metadata['type'] === 'agentic'
                )
                ->groupBy(fn($c) => $c->projection['recommendation'] ?? 'Unknown')
                ->map(fn($g) => $g->count())
                ->sortDesc();

            $data = [];
            foreach ($recommendations as $rec => $count) {
                $pct = round($count / $agentic * 100, 1);
                $data[] = [$rec, $count, $pct.'%'];
            }

            $this->table(['Recommendation', 'Count', '%'], $data);
        }

        // Performance stats
        if ($agentic > 0) {
            $this->newLine();
            $this->info('⚡ AGENTIC PERFORMANCE');
            $this->info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

            $agenticCompanies = Company::whereNotNull('projection_metadata')
                ->select('projection_metadata')
                ->get()
                ->filter(fn($c) =>
                    $c->projection_metadata &&
                    isset($c->projection_metadata['type']) &&
                    $c->projection_metadata['type'] === 'agentic'
                );

            $avgRounds = $agenticCompanies->avg(fn($c) => $c->projection_metadata['rounds'] ?? 0);
            $avgTools = $agenticCompanies->avg(fn($c) => $c->projection_metadata['tool_calls'] ?? 0);
            $avgTime = $agenticCompanies->avg(fn($c) => $c->projection_metadata['time'] ?? 0);

            $this->table(
                ['Metric', 'Average'],
                [
                    ['Rounds per projection', round($avgRounds, 1)],
                    ['Tool calls per projection', round($avgTools, 1)],
                    ['Time per projection', round($avgTime, 1).'s'],
                ]
            );
        }

        // Top companies by score
        $this->newLine();
        $this->info('⭐ TOP 10 AGENTIC PROJECTIONS (BY UPSIDE)');
        $this->info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        $top = Company::whereNotNull('projection')
            ->select('id', 'symbol', 'name', 'projection', 'projection_metadata')
            ->get()
            ->filter(fn($c) =>
                $c->projection_metadata &&
                isset($c->projection_metadata['type']) &&
                $c->projection_metadata['type'] === 'agentic'
            )
            ->sortByDesc(fn($c) => (($c->projection['target_upside_min_pct'] ?? 0) + ($c->projection['target_upside_max_pct'] ?? 0)) / 2)
            ->take(10);

        $data = [];
        foreach ($top as $company) {
            $proj = $company->projection;
            $upside = (($proj['target_upside_min_pct'] ?? 0) + ($proj['target_upside_max_pct'] ?? 0)) / 2;
            $data[] = [
                $company->symbol,
                $company->name,
                $proj['recommendation'] ?? 'N/A',
                $proj['confidence'] ?? 'N/A',
                round($upside, 1).'%',
            ];
        }

        if (!empty($data)) {
            $this->table(['Symbol', 'Name', 'Rec', 'Conf', 'Upside'], $data);
        } else {
            $this->warn('No agentic projections yet');
        }

        $this->newLine();
        return 0;
    }
}
