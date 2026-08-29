"use client";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import Link from "next/link";

type IndexStat = {
  index_code: string;
  index_name: string;
  company_count: number;
  scored_count: number;
  avg_score: number | null;
  top_score: number | null;
  top_company_id: number | null;
  top_company_symbol: string | null;
  top_company_name: string | null;
  avg_pe: number | null;
  trend: "growing" | "stable" | "declining" | null;
};

type SortKey = "index_name" | "avg_score" | "company_count" | "top_score" | "avg_pe";

function scoreColor(score: number | null): string {
  if (score === null) return "text-gray-400";
  if (score >= 70) return "text-green-700";
  if (score >= 55) return "text-green-500";
  if (score >= 40) return "text-yellow-600";
  if (score >= 25) return "text-orange-500";
  return "text-red-600";
}

function trendBadge(trend: IndexStat["trend"]) {
  if (trend === "growing") return <span className="text-xs font-semibold text-green-700">▲ Growing</span>;
  if (trend === "declining") return <span className="text-xs font-semibold text-red-600">▼ Declining</span>;
  if (trend === "stable") return <span className="text-xs font-semibold text-gray-500">▬ Stable</span>;
  return <span className="text-xs text-gray-300">—</span>;
}

export default function IndexPage() {
  const [sortKey, setSortKey] = useState<SortKey>("avg_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["indices-stats"],
    queryFn: () => api.get("/indices").then((r) => r.data as IndexStat[]),
    staleTime: 60_000,
  });

  const rows = useMemo(() => {
    const list = data ?? [];
    const sorted = [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "string" || typeof bv === "string") {
        return String(av).localeCompare(String(bv));
      }
      return (av as number) - (bv as number);
    });
    if (sortDir === "desc") sorted.reverse();
    return sorted;
  }, [data, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function SortHeader({ label, sortField, align = "left" }: { label: string; sortField: SortKey; align?: "left" | "right" }) {
    const active = sortKey === sortField;
    return (
      <th
        onClick={() => toggleSort(sortField)}
        className={`pb-2 font-medium cursor-pointer select-none hover:text-gray-700 ${
          align === "right" ? "text-right pr-4" : "text-left pr-4"
        } ${active ? "text-gray-900" : "text-gray-400"}`}
      >
        {label}
        {active && <span className="ml-1">{sortDir === "desc" ? "↓" : "↑"}</span>}
      </th>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Index</h1>
      <p className="text-gray-500 text-sm mb-6">
        PSX indices (KSE-100, KMI-30, and more) ranked by rating — click a column to sort
      </p>

      <Card className="p-4">
        {isLoading ? (
          <div className="text-center text-gray-400 py-12 text-sm">Loading index…</div>
        ) : isError ? (
          <div className="text-center text-red-500 py-12 text-sm">Failed to load index data</div>
        ) : rows.length === 0 ? (
          <div className="text-center text-gray-400 py-12 text-sm">No index data available yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="text-left pb-2 pr-4 font-medium">#</th>
                  <SortHeader label="Index" sortField="index_name" />
                  <SortHeader label="Rating" sortField="avg_score" align="right" />
                  <SortHeader label="Companies" sortField="company_count" align="right" />
                  <SortHeader label="Top Score" sortField="top_score" align="right" />
                  <th className="text-left pb-2 pr-4 font-medium">Top Company</th>
                  <SortHeader label="Avg P/E" sortField="avg_pe" align="right" />
                  <th className="text-left pb-2 font-medium">Trend</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s, i) => (
                  <tr key={s.index_code} className="border-b border-gray-50 last:border-0">
                    <td className="py-2.5 pr-4 text-gray-400 text-xs">{i + 1}</td>
                    <td className="py-2.5 pr-4">
                      <Link
                        href={`/index/${s.index_code}`}
                        className="font-medium text-gray-900 hover:text-green-700"
                      >
                        {s.index_name}
                      </Link>
                      <div className="text-xs text-gray-400">{s.scored_count} scored</div>
                    </td>
                    <td className="py-2.5 pr-4 text-right">
                      <span className={`font-bold text-base ${scoreColor(s.avg_score)}`}>
                        {s.avg_score ?? "—"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-right text-gray-600">{s.company_count}</td>
                    <td className="py-2.5 pr-4 text-right">
                      <span className={`font-semibold ${scoreColor(s.top_score)}`}>
                        {s.top_score ?? "—"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-gray-500">
                      {s.top_company_id ? (
                        <Link href={`/companies/${s.top_company_id}`} className="hover:text-green-700">
                          {s.top_company_name} ({s.top_company_symbol})
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-gray-600">
                      {s.avg_pe !== null ? s.avg_pe.toFixed(1) : "—"}
                    </td>
                    <td className="py-2.5">{trendBadge(s.trend)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
