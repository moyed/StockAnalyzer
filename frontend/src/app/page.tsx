"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const KSE100Chart = dynamic(() => import("@/components/KSE100Chart"), {
  loading: () => (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6 shadow-sm">
      <div className="h-8 w-48 bg-gray-100 animate-pulse rounded mb-4" />
      <div className="h-48 bg-gray-50 rounded-xl animate-pulse" />
    </div>
  ),
  ssr: false,
});

function MarketBriefingCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["market-briefing"],
    queryFn: () => api.get("/market/briefing").then((r) => r.data),
    staleTime: 30 * 60 * 1000, // 30 min — refreshed by global scan
  });

  // Don't render if no briefing exists yet
  if (!isLoading && !data?.briefing) return null;

  return (
    <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-2xl p-5 mb-6 shadow-lg text-white">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">📰</span>
          <h2 className="font-semibold text-sm uppercase tracking-wide text-slate-300">
            AI Market Briefing
          </h2>
        </div>
        {data?.date && (
          <span className="text-xs text-slate-400 shrink-0">{data.date}</span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-3 bg-slate-600 rounded w-full" />
          <div className="h-3 bg-slate-600 rounded w-5/6" />
          <div className="h-3 bg-slate-600 rounded w-4/6" />
        </div>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-slate-100">{data.briefing}</p>
          {data.top_themes?.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {data.top_themes.map((theme: string) => (
                <span
                  key={theme}
                  className="text-xs bg-slate-600 text-slate-200 px-2.5 py-1 rounded-full capitalize"
                >
                  {theme}
                </span>
              ))}
            </div>
          )}
          {data.generated_at && (
            <p className="text-xs text-slate-500 mt-3">
              Generated {new Date(data.generated_at).toLocaleTimeString("en-PK", {
                hour: "2-digit", minute: "2-digit",
              })}
            </p>
          )}
        </>
      )}
    </div>
  );
}

const FLAG_COLORS: Record<string, string> = {
  HIGH_PROFIT_GROWTH: "bg-green-100 text-green-800",
  HIGH_REVENUE_GROWTH: "bg-blue-100 text-blue-800",
  EXPORT_EXPANSION: "bg-purple-100 text-purple-800",
  NEW_PROJECT: "bg-yellow-100 text-yellow-800",
  MARGIN_IMPROVEMENT: "bg-teal-100 text-teal-800",
  DEFAULTER_RISK: "bg-red-100 text-red-800",
  EXCHANGE_HEADWIND: "bg-orange-100 text-orange-800",
  EXCHANGE_TAILWIND: "bg-cyan-100 text-cyan-800",
};

const SORT_OPTIONS = [
  { value: "score",       label: "AI Score" },
  { value: "filing_date", label: "Filing Date" },
  { value: "name",        label: "Name A–Z" },
  { value: "sector",      label: "Sector" },
];

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "bg-green-600" : score >= 40 ? "bg-yellow-500" : "bg-gray-400";
  return (
    <span className={`${color} text-white text-xs font-bold px-2 py-1 rounded-full`}>
      {score}
    </span>
  );
}

export default function DashboardPage() {
  const [page, setPage]   = useState(1);
  const [sort, setSort]   = useState("score");

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-companies", page, sort],
    queryFn: () =>
      api.get(`/companies?per_page=10&sort=${sort}&page=${page}`).then((r) => r.data),
    staleTime: 30_000,
  });

  const companies = data?.data ?? [];
  const total     = data?.total ?? 0;
  const lastPage  = data?.last_page ?? 1;
  const from      = data?.from ?? 0;
  const to        = data?.to ?? 0;

  function handleSort(value: string) {
    setSort(value);
    setPage(1);
  }

  return (
    <div>
      <KSE100Chart />
      <MarketBriefingCard />

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Companies</h1>
          <p className="text-gray-500 text-sm mt-1">
            {total > 0 ? `Showing ${from}–${to} of ${total} companies` : "No companies yet"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Sort by</span>
          <div className="flex gap-1">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleSort(opt.value)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  sort === opt.value
                    ? "bg-green-700 text-white border-green-700"
                    : "bg-white text-gray-600 border-gray-200 hover:border-green-400"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-gray-400 text-sm">Loading...</div>
      ) : companies.length === 0 ? (
        <Card className="p-8 text-center text-gray-500">
          No companies yet.{" "}
          <Link href="/scan" className="text-green-700 underline">
            Run a scan
          </Link>{" "}
          to get started.
        </Card>
      ) : (
        <>
          <div className="grid gap-4">
            {companies.map((c: any) => {
              const filing   = c.latest_filing;
              const analysis = filing?.ai_analysis ?? {};
              const signals  = analysis.signals ?? {};
              const score    = filing?.score?.score;
              const flags: string[] = Array.isArray(filing?.score?.flags)
                ? filing.score.flags
                : [];

              return (
                <Card key={c.id} className="p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/companies/${c.id}`}
                          className="font-semibold text-gray-900 hover:text-green-700"
                        >
                          {c.name}
                        </Link>
                        <span className="text-xs text-gray-400">{c.symbol}</span>
                        {filing && (
                          <span className="text-xs text-gray-400">{filing.quarter}</span>
                        )}
                        {c.sector && (
                          <span className="text-xs text-gray-400">· {c.sector}</span>
                        )}
                        {c.is_defaulter && (
                          <Badge variant="destructive" className="text-xs">Defaulter</Badge>
                        )}
                      </div>

                      {analysis.summary ? (
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                          {analysis.summary}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400 mt-1 italic">
                          {filing ? "Analysis pending" : "No filings yet"}
                        </p>
                      )}

                      {flags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {flags.map((flag) => (
                            <span
                              key={flag}
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${FLAG_COLORS[flag] ?? "bg-gray-100 text-gray-700"}`}
                            >
                              {flag.replace(/_/g, " ")}
                            </span>
                          ))}
                        </div>
                      )}

                      {(signals.revenue_growth_pct != null ||
                        signals.profit_growth_pct != null ||
                        signals.exports_milestone) && (
                        <div className="flex gap-4 mt-2 text-xs text-gray-500">
                          {signals.revenue_growth_pct != null && (
                            <span>
                              Revenue:{" "}
                              <strong className="text-gray-800">
                                +{signals.revenue_growth_pct}%
                              </strong>
                            </span>
                          )}
                          {signals.profit_growth_pct != null && (
                            <span>
                              Profit:{" "}
                              <strong className="text-gray-800">
                                +{signals.profit_growth_pct}%
                              </strong>
                            </span>
                          )}
                          {signals.exports_milestone && (
                            <span>
                              Exports:{" "}
                              <strong className="text-gray-800">
                                {signals.exports_milestone}
                              </strong>
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-1 ml-4 shrink-0">
                      {score != null ? (
                        <ScoreBadge score={score} />
                      ) : (
                        <span className="text-xs text-gray-300 px-2 py-1">—</span>
                      )}
                      {c.last_price && (
                        <span className="text-xs text-gray-500">PKR {c.last_price}</span>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {lastPage > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>

              <div className="flex items-center gap-1">
                {Array.from({ length: lastPage }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === lastPage || Math.abs(p - page) <= 2)
                  .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === "..." ? (
                      <span key={`ellipsis-${i}`} className="px-1 text-gray-400 text-sm">
                        …
                      </span>
                    ) : (
                      <Button
                        key={p}
                        variant={p === page ? "default" : "outline"}
                        size="sm"
                        className={`w-8 h-8 p-0 ${
                          p === page ? "bg-green-700 hover:bg-green-800" : ""
                        }`}
                        onClick={() => setPage(p as number)}
                      >
                        {p}
                      </Button>
                    )
                  )}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                disabled={page === lastPage}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
