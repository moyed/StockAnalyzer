"use client";
import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

// Mirrors App\Models\IndexMembership::NAMES on the backend.
const INDEX_NAMES: Record<string, string> = {
  KSE100: "KSE-100",
  KSE30: "KSE-30",
  KMI30: "KMI-30",
  KMIALLSHR: "KMI All Share",
  ALLSHR: "PSX All Share",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getRecommendation(avg: number | null) {
  if (avg === null)
    return {
      label: "No Data",
      cls: "bg-gray-300 text-gray-700",
      rationale:
        "This index lacks sufficient AI-analysed filings to make a recommendation.",
    };
  if (avg >= 70)
    return {
      label: "Strong Buy",
      cls: "bg-green-700 text-white",
      rationale: `With an average score of ${avg}, this index shows exceptional financial performance. Companies demonstrate strong revenue growth, profit expansion, and positive business momentum. Consider increasing allocation.`,
    };
  if (avg >= 55)
    return {
      label: "Buy",
      cls: "bg-green-500 text-white",
      rationale: `An average score of ${avg} indicates solid fundamentals across this index. Above-average performance suggests a favourable risk-reward profile — suitable for medium-to-long-term investors.`,
    };
  if (avg >= 40)
    return {
      label: "Hold",
      cls: "bg-yellow-400 text-yellow-900",
      rationale: `This index averages ${avg} — mixed signals. Some companies show strength while others face headwinds. Selective stock-picking is advised; avoid broad index bets.`,
    };
  if (avg >= 25)
    return {
      label: "Underweight",
      cls: "bg-orange-500 text-white",
      rationale: `With an average score of ${avg}, this index is underperforming. Caution is warranted. Consider reducing exposure or waiting for clear recovery signals before adding positions.`,
    };
  return {
    label: "Avoid",
    cls: "bg-red-600 text-white",
    rationale: `A score of ${avg} signals significant weakness across this index. Multiple negative indicators present. Avoid new positions until fundamentals show clear improvement.`,
  };
}

function scoreColor(score: number | null): string {
  if (score === null) return "text-gray-400";
  if (score >= 70) return "text-green-700";
  if (score >= 55) return "text-green-500";
  if (score >= 40) return "text-yellow-600";
  if (score >= 25) return "text-orange-500";
  return "text-red-600";
}

function barColor(score: number | null): string {
  if (score === null) return "#d1d5db";
  if (score >= 70) return "#15803d";
  if (score >= 55) return "#22c55e";
  if (score >= 40) return "#eab308";
  if (score >= 25) return "#f97316";
  return "#dc2626";
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function IndexDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const indexCode = decodeURIComponent(code).toUpperCase();
  const indexName = INDEX_NAMES[indexCode] ?? indexCode;

  const { data, isLoading } = useQuery({
    queryKey: ["index-companies", indexCode],
    queryFn: () =>
      api
        .get(`/companies?index=${encodeURIComponent(indexCode)}&sort=score&per_page=500`)
        .then((r) => r.data),
    staleTime: 5 * 60_000,
  });

  const companies: any[] = data?.data ?? [];

  // ── Computed stats ──────────────────────────────────────────────────────────
  const scored = companies.filter(
    (c) => c.latest_filing?.score?.score != null
  );
  const scores: number[] = scored.map((c) =>
    Number(c.latest_filing.score.score)
  );
  const avgScore =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;
  const topScore = scores.length > 0 ? Math.max(...scores) : null;
  const defaulterCount = companies.filter((c) => c.is_defaulter).length;
  const shariaCount = companies.filter((c) => c.is_sharia_compliant).length;
  const shariaPercent =
    companies.length > 0
      ? Math.round((shariaCount / companies.length) * 100)
      : 0;

  // P/E calculation
  const withPE = companies.filter((c) => {
    const price = c.last_price ? parseFloat(c.last_price) : 0;
    const eps = c.latest_filing?.eps ? parseFloat(c.latest_filing.eps) : 0;
    return price > 0 && eps > 0;
  });
  const peRatios = withPE.map((c) => {
    const price = parseFloat(c.last_price);
    const eps = parseFloat(c.latest_filing.eps);
    return price / eps;
  });
  const avgPE = peRatios.length > 0
    ? peRatios.reduce((a, b) => a + b, 0) / peRatios.length
    : null;

  // ── Score distribution ─────────────────────────────────────────────────────
  const buckets = [
    { range: "0–19", count: scores.filter((s) => s < 20).length, color: "#dc2626" },
    { range: "20–39", count: scores.filter((s) => s >= 20 && s < 40).length, color: "#f97316" },
    { range: "40–59", count: scores.filter((s) => s >= 40 && s < 60).length, color: "#eab308" },
    { range: "60–79", count: scores.filter((s) => s >= 60 && s < 80).length, color: "#22c55e" },
    { range: "80–100", count: scores.filter((s) => s >= 80).length, color: "#15803d" },
  ];

  // ── Top companies for chart ─────────────────────────────────────────────────
  const top15 = scored
    .sort((a: any, b: any) => b.latest_filing.score.score - a.latest_filing.score.score)
    .slice(0, 15)
    .map((c: any) => ({
      symbol: c.symbol,
      name: c.name,
      id: c.id,
      score: Number(c.latest_filing.score.score),
    }));

  const rec = getRecommendation(avgScore);

  return (
    <div>
      {/* Back */}
      <div className="mb-2">
        <Link
          href="/index"
          className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          ← All Indices
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{indexName}</h1>
          <p className="text-gray-500 text-sm">
            Index analysis · {companies.length} companies
          </p>
        </div>
        <span
          className={`text-sm px-4 py-1.5 rounded-full font-semibold shrink-0 ${rec.cls}`}
        >
          {rec.label}
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse bg-gray-100 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <Card className="p-4 text-center">
              <div className="text-3xl font-bold text-gray-900">
                {companies.length}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">Companies</div>
            </Card>
            <Card className="p-4 text-center">
              <div className={`text-3xl font-bold ${scoreColor(avgScore)}`}>
                {avgScore ?? "—"}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">Avg Score</div>
            </Card>
            <Card className="p-4 text-center">
              <div className={`text-3xl font-bold ${scoreColor(topScore)}`}>
                {topScore ?? "—"}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">Top Score</div>
            </Card>
            <Card className="p-4 text-center">
              <div className={`text-3xl font-bold ${
                avgPE === null ? 'text-gray-400' :
                avgPE < 15 ? 'text-green-600' :
                avgPE < 25 ? 'text-blue-600' :
                avgPE < 40 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {avgPE !== null ? avgPE.toFixed(1) : "—"}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">Avg P/E</div>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-3xl font-bold text-emerald-600">
                {shariaPercent}%
              </div>
              <div className="text-xs text-gray-500 mt-0.5">Sharia Compliant</div>
            </Card>
          </div>

          {/* Investment recommendation card */}
          <Card className="p-5 mb-6">
            <div className="flex items-start gap-4">
              <div
                className={`text-base font-bold px-4 py-2 rounded-xl shrink-0 ${rec.cls}`}
              >
                {rec.label}
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1 text-sm">
                  Investment Recommendation
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {rec.rationale}
                </p>
                {defaulterCount > 0 && (
                  <p className="text-xs text-red-600 mt-2">
                    ⚠ {defaulterCount} defaulter{defaulterCount > 1 ? "s" : ""}{" "}
                    in this index — screen individual companies carefully.
                  </p>
                )}
              </div>
            </div>
          </Card>

          {/* Charts */}
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            {/* Score distribution */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Score Distribution
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={buckets} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="range"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    allowDecimals={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(v) => [v ?? 0, "Companies"]}
                    cursor={{ fill: "#f3f4f6" }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {buckets.map((b) => (
                      <Cell key={b.range} fill={b.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Top companies by score */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Top Companies by Score
              </h3>
              {top15.length === 0 ? (
                <p className="text-xs text-gray-400 mt-8 text-center">
                  No scored companies yet
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={top15}
                    layout="vertical"
                    margin={{ left: 8, right: 32, top: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="symbol"
                      tick={{ fontSize: 10 }}
                      width={52}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(v) => [v ?? 0, "Score"]}
                      cursor={{ fill: "#f3f4f6" }}
                    />
                    <Bar dataKey="score" radius={[0, 4, 4, 0]} maxBarSize={14}>
                      {top15.map((c) => (
                        <Cell key={c.symbol} fill={barColor(c.score)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          {/* Companies table */}
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              All Companies ({companies.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-gray-100">
                    <th className="text-left pb-2 pr-4 font-medium">#</th>
                    <th className="text-left pb-2 pr-4 font-medium">Company</th>
                    <th className="text-left pb-2 pr-4 font-medium">Symbol</th>
                    <th className="text-right pb-2 pr-4 font-medium">Score</th>
                    <th className="text-right pb-2 pr-4 font-medium">Price</th>
                    <th className="text-right pb-2 pr-4 font-medium">P/E</th>
                    <th className="text-left pb-2 font-medium">Signals</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((c: any, i: number) => {
                    const score = c.latest_filing?.score?.score != null
                      ? Number(c.latest_filing.score.score)
                      : null;
                    const flags: string[] =
                      c.latest_filing?.score?.flags ?? [];

                    const price = c.last_price ? parseFloat(c.last_price) : 0;
                    const eps = c.latest_filing?.eps ? parseFloat(c.latest_filing.eps) : 0;
                    const pe = price > 0 && eps > 0 ? price / eps : null;

                    return (
                      <tr
                        key={c.id}
                        className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                      >
                        <td className="py-2.5 pr-4 text-gray-400 text-xs">
                          {i + 1}
                        </td>
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-1.5">
                            <Link
                              href={`/companies/${c.id}`}
                              className="font-medium text-gray-900 hover:text-green-700 transition-colors"
                            >
                              {c.name}
                            </Link>
                            {c.is_defaulter && (
                              <Badge
                                variant="destructive"
                                className="text-[10px] h-4 px-1"
                              >
                                D
                              </Badge>
                            )}
                            {c.is_sharia_compliant && (
                              <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full">
                                S
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 text-gray-500 font-mono text-xs">
                          {c.symbol}
                        </td>
                        <td className="py-2.5 pr-4 text-right">
                          {score != null ? (
                            <span className={`font-bold ${scoreColor(score)}`}>
                              {score}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-gray-500 text-xs">
                          {c.last_price ? `PKR ${c.last_price}` : "—"}
                        </td>
                        <td className="py-2.5 pr-4 text-right">
                          {pe !== null ? (
                            <span className={`font-semibold text-xs ${
                              pe < 15 ? 'text-green-600' :
                              pe < 25 ? 'text-blue-600' :
                              pe < 40 ? 'text-yellow-600' : 'text-red-600'
                            }`}>
                              {pe.toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {flags.slice(0, 2).map((f: string) => (
                              <span
                                key={f}
                                className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded-full whitespace-nowrap"
                              >
                                {f.replace(/_/g, " ")}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
