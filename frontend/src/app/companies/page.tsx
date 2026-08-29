"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const SORT_OPTIONS = [
  { value: "score",        label: "AI Score" },
  { value: "pe_ratio",     label: "P/E Ratio" },
  { value: "filing_date",  label: "Latest Filing" },
  { value: "name",         label: "Name A–Z" },
  { value: "sector",       label: "Sector" },
];

export default function CompaniesPage() {
  const [search, setSearch]       = useState("");
  const [sector, setSector]       = useState("");
  const [sort, setSort]           = useState("score");
  const [defaulter, setDefaulter] = useState<boolean | null>(null);
  const [sharia, setSharia]       = useState<boolean | null>(null);
  const [minPe, setMinPe]         = useState("");
  const [maxPe, setMaxPe]         = useState("");
  const [page, setPage]           = useState(1);

  const { data: sectorsData } = useQuery({
    queryKey: ["sectors"],
    queryFn: () => api.get("/companies-sectors").then((r) => r.data as string[]),
    staleTime: 5 * 60_000,
  });
  const sectors: string[] = sectorsData ?? [];

  const params = new URLSearchParams({
    page: String(page),
    per_page: "50",
    sort,
    ...(search   && { search }),
    ...(sector   && { sector }),
    ...(defaulter !== null && { defaulter: defaulter ? "1" : "0" }),
    ...(sharia   !== null && { sharia:    sharia   ? "1" : "0" }),
    ...(minPe && { min_pe: minPe }),
    ...(maxPe && { max_pe: maxPe }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["companies", search, sector, sort, defaulter, sharia, minPe, maxPe, page],
    queryFn: () => api.get(`/companies?${params}`).then((r) => r.data),
    staleTime: 30_000,
  });

  const companies = data?.data ?? [];
  const lastPage  = data?.last_page ?? 1;
  const total     = data?.total ?? 0;
  const from      = data?.from ?? 0;
  const to        = data?.to ?? 0;

  function reset(partial: Partial<{ search: string; sector: string; sort: string; defaulter: boolean | null; sharia: boolean | null; minPe: string; maxPe: string }>) {
    if ("search"   in partial) setSearch(partial.search!);
    if ("sector"   in partial) setSector(partial.sector!);
    if ("sort"     in partial) setSort(partial.sort!);
    if ("defaulter"in partial) setDefaulter(partial.defaulter!);
    if ("sharia"   in partial) setSharia(partial.sharia!);
    if ("minPe"    in partial) setMinPe(partial.minPe!);
    if ("maxPe"    in partial) setMaxPe(partial.maxPe!);
    setPage(1);
  }

  const hasFilters = search || sector || defaulter !== null || sharia !== null || minPe || maxPe;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">All Companies</h1>
      <p className="text-gray-500 text-sm mb-6">Browse all tracked PSX companies</p>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Input
          placeholder="Search by name or symbol..."
          value={search}
          onChange={(e) => reset({ search: e.target.value })}
          className="w-56"
        />

        {/* Sector dropdown */}
        <select
          value={sector}
          onChange={(e) => reset({ sector: e.target.value })}
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 text-gray-700 min-w-[180px]"
        >
          <option value="">All Sectors</option>
          {sectors.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Sort dropdown */}
        <select
          value={sort}
          onChange={(e) => reset({ sort: e.target.value })}
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 text-gray-700"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Sharia toggle */}
        <button
          onClick={() => reset({ sharia: sharia === true ? null : true })}
          className={`h-10 px-4 rounded-md border text-sm font-medium transition-colors flex items-center gap-2 ${
            sharia === true
              ? "bg-emerald-700 text-white border-emerald-700"
              : "bg-background text-gray-600 border-input hover:border-emerald-500 hover:text-emerald-700"
          }`}
        >
          <span>☪</span> Sharia Compliant
        </button>

        {/* Defaulter toggle */}
        <div className="flex rounded-md border border-input overflow-hidden text-sm h-10">
          {([null, false, true] as (boolean | null)[]).map((val) => (
            <button
              key={String(val)}
              onClick={() => reset({ defaulter: val })}
              className={`px-3 h-full transition-colors ${
                defaulter === val
                  ? val === true
                    ? "bg-red-600 text-white"
                    : "bg-green-700 text-white"
                  : "bg-background text-gray-600 hover:bg-gray-50"
              }`}
            >
              {val === null ? "All" : val ? "Defaulters" : "Non-defaulters"}
            </button>
          ))}
        </div>

        {/* P/E Ratio Filters */}
        <div className="flex items-center gap-2 border border-input rounded-md px-3 h-10">
          <span className="text-xs text-gray-500 whitespace-nowrap">P/E:</span>
          <Input
            type="number"
            placeholder="Min"
            value={minPe}
            onChange={(e) => reset({ minPe: e.target.value })}
            className="w-16 h-7 text-xs px-2"
            min="0"
            step="0.1"
          />
          <span className="text-gray-400">–</span>
          <Input
            type="number"
            placeholder="Max"
            value={maxPe}
            onChange={(e) => reset({ maxPe: e.target.value })}
            className="w-16 h-7 text-xs px-2"
            min="0"
            step="0.1"
          />
        </div>

        {/* Clear filters */}
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSearch(""); setSector(""); setDefaulter(null); setSharia(null); setMinPe(""); setMaxPe(""); setPage(1); }}
            className="text-gray-400 hover:text-gray-600 h-10"
          >
            Clear filters ✕
          </Button>
        )}
      </div>

      {/* Active filter chips */}
      {hasFilters && (
        <div className="flex flex-wrap gap-2 mb-4">
          {sharia === true && (
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-3 py-0.5 text-xs font-medium">
              ☪ Sharia Compliant
              <button onClick={() => reset({ sharia: null })} className="hover:text-emerald-900 ml-0.5">✕</button>
            </span>
          )}
          {sector && (
            <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 border border-green-200 rounded-full px-3 py-0.5 text-xs font-medium">
              {sector}
              <button onClick={() => reset({ sector: "" })} className="hover:text-green-900 ml-0.5">✕</button>
            </span>
          )}
          {search && (
            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-3 py-0.5 text-xs font-medium">
              "{search}"
              <button onClick={() => reset({ search: "" })} className="hover:text-blue-900 ml-0.5">✕</button>
            </span>
          )}
          {defaulter !== null && (
            <span className={`inline-flex items-center gap-1 border rounded-full px-3 py-0.5 text-xs font-medium ${defaulter ? "bg-red-50 text-red-700 border-red-200" : "bg-gray-50 text-gray-600 border-gray-200"}`}>
              {defaulter ? "Defaulters only" : "Non-defaulters only"}
              <button onClick={() => reset({ defaulter: null })} className="hover:opacity-70 ml-0.5">✕</button>
            </span>
          )}
          {(minPe || maxPe) && (
            <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-3 py-0.5 text-xs font-medium">
              P/E: {minPe || "0"} – {maxPe || "∞"}
              <button onClick={() => { setMinPe(""); setMaxPe(""); setPage(1); }} className="hover:text-purple-900 ml-0.5">✕</button>
            </span>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : (
        <>
          {total > 0 && (
            <p className="text-xs text-gray-400 mb-4">
              Showing {from}–{to} of {total} companies
            </p>
          )}

          {companies.length === 0 && (
            <p className="text-gray-400 text-sm py-8 text-center">No companies match these filters.</p>
          )}

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {companies.map((c: any) => {
              const latest = c.latest_filing;
              const score  = latest?.score?.score;

              return (
                <Card key={c.id} className="p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/companies/${c.id}`} className="font-semibold text-gray-900 hover:text-green-700">
                          {c.name}
                        </Link>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-gray-500">{c.symbol}</span>
                        {c.sector && (
                          <button
                            onClick={() => reset({ sector: c.sector })}
                            className="text-xs text-green-600 hover:text-green-800 hover:underline"
                          >
                            {c.sector}
                          </button>
                        )}
                        {c.is_defaulter && <Badge variant="destructive" className="text-xs py-0">Defaulter</Badge>}
                      </div>
                      {latest && (
                        <p className="text-xs text-gray-500 mt-1">
                          Latest: {latest.quarter} · {new Date(latest.filing_date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 ml-2 shrink-0">
                      {score != null && (
                        <span className={`text-xs font-bold px-2 py-1 rounded-full text-white ${score >= 70 ? "bg-green-600" : score >= 40 ? "bg-yellow-500" : "bg-gray-400"}`}>
                          {score}
                        </span>
                      )}
                      {c.last_price && (
                        <span className="text-xs text-gray-500">PKR {c.last_price}</span>
                      )}
                      {(() => {
                        const price = c.last_price ? parseFloat(c.last_price) : null;
                        const eps = latest?.eps ? parseFloat(latest.eps) : null;
                        if (price && eps && eps > 0) {
                          const pe = price / eps;
                          const peColor = pe < 15 ? "text-green-600" : pe < 25 ? "text-blue-600" : pe < 40 ? "text-yellow-600" : "text-red-600";
                          return (
                            <span className={`text-xs font-semibold ${peColor}`}>
                              P/E {pe.toFixed(1)}
                            </span>
                          );
                        }
                        return null;
                      })()}
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
                      <span key={`ellipsis-${i}`} className="px-1 text-gray-400 text-sm">…</span>
                    ) : (
                      <Button
                        key={p}
                        variant={p === page ? "default" : "outline"}
                        size="sm"
                        className={`w-8 h-8 p-0 ${p === page ? "bg-green-700 hover:bg-green-800" : ""}`}
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
