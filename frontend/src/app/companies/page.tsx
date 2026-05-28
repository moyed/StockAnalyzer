"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function CompaniesPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["companies", search, page],
    queryFn: () =>
      api.get(`/companies?search=${search}&page=${page}&per_page=50`).then((r) => r.data),
    staleTime: 30_000,
  });

  const companies = data?.data ?? [];
  const lastPage = data?.last_page ?? 1;
  const total = data?.total ?? 0;
  const from = data?.from ?? 0;
  const to = data?.to ?? 0;

  function handleSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">All Companies</h1>
      <p className="text-gray-500 text-sm mb-6">Browse all tracked PSX companies</p>

      <Input
        placeholder="Search by name or symbol..."
        value={search}
        onChange={(e) => handleSearch(e.target.value)}
        className="max-w-sm mb-6"
      />

      {isLoading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : (
        <>
          {total > 0 && (
            <p className="text-xs text-gray-400 mb-4">
              Showing {from}–{to} of {total} companies
            </p>
          )}

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {companies.map((c: any) => {
              const latest = c.latest_filing;
              const score = latest?.score?.score;

              return (
                <Card key={c.id} className="p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div>
                      <Link href={`/companies/${c.id}`} className="font-semibold text-gray-900 hover:text-green-700">
                        {c.name}
                      </Link>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-500">{c.symbol}</span>
                        {c.sector && <span className="text-xs text-gray-400">· {c.sector}</span>}
                        {c.is_defaulter && <Badge variant="destructive" className="text-xs py-0">Defaulter</Badge>}
                      </div>
                      {latest && (
                        <p className="text-xs text-gray-500 mt-1">
                          Latest: {latest.quarter} · {latest.filing_date}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {score != null && (
                        <span className={`text-xs font-bold px-2 py-1 rounded-full text-white ${score >= 70 ? "bg-green-600" : score >= 40 ? "bg-yellow-500" : "bg-gray-400"}`}>
                          {score}
                        </span>
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
