"use client";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import Link from "next/link";

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

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "bg-green-600" : score >= 40 ? "bg-yellow-500" : "bg-gray-400";
  return (
    <span className={`${color} text-white text-xs font-bold px-2 py-1 rounded-full`}>
      {score}
    </span>
  );
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["top-companies"],
    queryFn: () => api.get("/filings?min_score=60&status=done").then((r) => r.data),
  });

  const filings = data?.data ?? [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Top Opportunities</h1>
        <p className="text-gray-500 text-sm mt-1">
          Companies with strong signals from latest quarterly filings — ranked by AI score
        </p>
      </div>

      {isLoading ? (
        <div className="text-gray-400 text-sm">Loading...</div>
      ) : filings.length === 0 ? (
        <Card className="p-8 text-center text-gray-500">
          No analyzed filings yet.{" "}
          <Link href="/scan" className="text-green-700 underline">
            Run a scan
          </Link>{" "}
          to get started.
        </Card>
      ) : (
        <div className="grid gap-4">
          {filings.map((f: any) => {
            const analysis = f.ai_analysis ?? {};
            const signals = analysis.signals ?? {};
            const flags: string[] = f.score?.flags ?? [];

            return (
              <Card key={f.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/companies/${f.company_id}`}
                        className="font-semibold text-gray-900 hover:text-green-700"
                      >
                        {f.company?.name ?? "—"}
                      </Link>
                      <span className="text-xs text-gray-400">{f.company?.symbol}</span>
                      <span className="text-xs text-gray-400">{f.quarter}</span>
                      {f.company?.is_defaulter && (
                        <Badge variant="destructive" className="text-xs">Defaulter</Badge>
                      )}
                    </div>

                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                      {analysis.summary ?? "Analysis pending"}
                    </p>

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

                    <div className="flex gap-4 mt-2 text-xs text-gray-500">
                      {signals.revenue_growth_pct != null && (
                        <span>Revenue: <strong className="text-gray-800">+{signals.revenue_growth_pct}%</strong></span>
                      )}
                      {signals.profit_growth_pct != null && (
                        <span>Profit: <strong className="text-gray-800">+{signals.profit_growth_pct}%</strong></span>
                      )}
                      {signals.exports_milestone && (
                        <span>Exports: <strong className="text-gray-800">{signals.exports_milestone}</strong></span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 ml-4">
                    <ScoreBadge score={f.score?.score ?? 0} />
                    {f.company?.last_price && (
                      <span className="text-xs text-gray-500">PKR {f.company.last_price}</span>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
