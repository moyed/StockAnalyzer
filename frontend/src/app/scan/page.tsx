"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import Link from "next/link";

const STATUS_META: Record<string, { label: string; dot: string; text: string }> = {
  done:       { label: "Done",       dot: "bg-green-500",  text: "text-green-700"  },
  processing: { label: "Analyzing",  dot: "bg-yellow-400 animate-pulse", text: "text-yellow-700" },
  pending:    { label: "Queued",     dot: "bg-blue-400 animate-pulse",   text: "text-blue-600"   },
  failed:     { label: "Failed",     dot: "bg-red-500",    text: "text-red-600"    },
};

function StatusDot({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block w-2 h-2 rounded-full ${meta.dot}`} />
      <span className={`text-xs font-medium ${meta.text}`}>{meta.label}</span>
    </span>
  );
}

export default function ScanPage() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [active, setActive] = useState(false);
  const [scanMonth, setScanMonth] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const itemsPerPage = 10;

  const priceMutation = useMutation({
    mutationFn: () => api.post("/scan/sync-prices").then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["companies"] }),
  });

  const peRatioMutation = useMutation({
    mutationFn: () => api.post("/system/update-pe-ratios").then((r) => r.data),
  });

  const filingsSyncMutation = useMutation({
    mutationFn: () => api.post("/scan/sync-all-filings").then((r) => r.data),
  });

  const rescanAllMutation = useMutation({
    mutationFn: () => api.post("/companies/rescan-all").then((r) => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["scan-progress"] });
      alert(`✓ Bulk rescan started for ${data.queued} companies`);
    },
    onError: () => {
      alert("✕ Failed to start bulk rescan");
    },
  });

  const mutation = useMutation({
    mutationFn: (m: string | null) =>
      api.post("/scan", m ? { month: m } : {}),
    onSuccess: (_, m) => {
      setScanMonth(m);
      setActive(true);
    },
  });

  const progressUrl = scanMonth
    ? `/scan/progress?month=${scanMonth}`
    : "/scan/progress";

  const { data: progress } = useQuery({
    queryKey: ["scan-progress", scanMonth],
    queryFn: () => api.get(progressUrl).then((r) => r.data),
    refetchInterval: (query) => {
      const d = query.state.data as any;
      if (!d) return active ? 2000 : false;
      if (d.complete) return false;
      if (d.scraping || (d.total > 0 && (d.pending > 0 || d.processing > 0))) return 2000;
      if (active && d.total === 0) return 2000; // waiting for ScanMonthJob to create filings
      return false;
    },
    // Always enabled: re-hydrates in-progress state after a page refresh
    enabled: true,
    staleTime: 0,
  });


  const filings: any[] = progress?.filings ?? [];
  const total      = progress?.total ?? 0;
  const done       = progress?.done ?? 0;
  const processing = progress?.processing ?? 0;
  const failed     = progress?.failed ?? 0;
  const pending    = progress?.pending ?? 0;
  const percent    = progress?.percent ?? 0;
  const complete   = progress?.complete ?? false;
  const scraping   = progress?.scraping ?? false;   // ScanMonthJob still running
  const scraped    = progress?.scraped ?? null;     // scrape finished, has {count, at}

  // Filter by status
  const filteredFilings = statusFilter === "all"
    ? filings
    : filings.filter((f) => f.status === statusFilter);

  // Pagination
  const totalPages = Math.ceil(filteredFilings.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedFilings = filteredFilings.slice(startIndex, endIndex);

  // Reset to page 1 when filings or filter changes significantly
  if (currentPage > totalPages && totalPages > 0) {
    setCurrentPage(1);
  }


  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Scan & Analyze</h1>
        <p className="text-gray-500 text-sm">
          Re-analyze all existing company filings, or scrape a new month from PSX and analyze those too.
        </p>
      </div>

      {/* ── Sync All Filings ── */}
      <Card className="p-5">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700 mb-1">Sync All Financial Results</p>
            <p className="text-xs text-gray-400">
              Fetches every available quarterly & annual financial results PDF for all companies
              from PSX (using the "transmission" keyword). Dispatches to the background queue —
              results appear as each company finishes.
            </p>
            {filingsSyncMutation.isSuccess && (
              <p className="text-xs text-green-600 mt-1">
                ✓ {(filingsSyncMutation.data as any)?.message}
              </p>
            )}
            {filingsSyncMutation.isError && (
              <p className="text-xs text-red-500 mt-1">Failed to start sync. Try again.</p>
            )}
          </div>
          <Button
            variant="outline"
            onClick={() => filingsSyncMutation.mutate()}
            disabled={filingsSyncMutation.isPending || filingsSyncMutation.isSuccess}
            className="shrink-0 border-purple-200 text-purple-600 hover:bg-purple-50"
          >
            {filingsSyncMutation.isPending ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                Queuing…
              </span>
            ) : filingsSyncMutation.isSuccess ? "✓ Queued" : "↻ Sync All Filings"}
          </Button>
        </div>
      </Card>

      {/* ── Sync Prices ── */}
      <Card className="p-5">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700 mb-1">Sync Current Prices</p>
            <p className="text-xs text-gray-400">
              Fetches the latest market prices for all companies from PSX (KSE All Shares index).
              Run this once a day after market close to keep prices current.
            </p>
            {priceMutation.isSuccess && (
              <p className="text-xs text-green-600 mt-1">
                ✓ {(priceMutation.data as any)?.message}
              </p>
            )}
            {priceMutation.isError && (
              <p className="text-xs text-red-500 mt-1">Failed to sync prices. Try again.</p>
            )}
          </div>
          <Button
            variant="outline"
            onClick={() => priceMutation.mutate()}
            disabled={priceMutation.isPending}
            className="shrink-0 border-blue-200 text-blue-600 hover:bg-blue-50"
          >
            {priceMutation.isPending ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                Syncing…
              </span>
            ) : "↻ Sync Prices"}
          </Button>
        </div>
      </Card>

      {/* ── Update P/E Ratios ── */}
      <Card className="p-5">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700 mb-1">Update P/E Ratios</p>
            <p className="text-xs text-gray-400">
              Calculates Price-to-Earnings ratios for all companies using current stock prices and latest EPS from filings.
              Run after syncing prices or analyzing new filings.
            </p>
            {peRatioMutation.isSuccess && (
              <p className="text-xs text-green-600 mt-1">
                ✓ {(peRatioMutation.data as any)?.message}
              </p>
            )}
            {peRatioMutation.isError && (
              <p className="text-xs text-red-500 mt-1">Failed to update P/E ratios. Try again.</p>
            )}
          </div>
          <Button
            variant="outline"
            onClick={() => peRatioMutation.mutate()}
            disabled={peRatioMutation.isPending}
            className="shrink-0 border-indigo-200 text-indigo-600 hover:bg-indigo-50"
          >
            {peRatioMutation.isPending ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                Updating…
              </span>
            ) : "📊 Update P/E Ratios"}
          </Button>
        </div>
      </Card>

      {/* ── Rescan All Companies ── */}
      <Card className="p-5 bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700 mb-1">⟳ Rescan All Companies</p>
            <p className="text-xs text-gray-500">
              Re-analyze the latest filing for every company (718 companies). Includes fresh AI analysis and macro risk reassessment.
              This runs automatically every night at 11 PM PKT via scheduler.
            </p>
            {rescanAllMutation.isSuccess && (
              <p className="text-xs text-green-600 mt-1">
                ✓ Bulk rescan queued successfully
              </p>
            )}
            {rescanAllMutation.isError && (
              <p className="text-xs text-red-500 mt-1">Failed to start bulk rescan. Try again.</p>
            )}
          </div>
          <Button
            onClick={() => rescanAllMutation.mutate()}
            disabled={rescanAllMutation.isPending}
            className="shrink-0 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white"
          >
            {rescanAllMutation.isPending ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Rescanning…
              </span>
            ) : "⟳ Rescan All"}
          </Button>
        </div>
      </Card>

      {/* ── Controls ── */}
      <Card className="p-5">
        <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
            <p className="text-sm font-medium text-gray-700 mb-1">Re-analyze all existing companies</p>
            <p className="text-xs text-gray-400">
              Re-queues every filing already in the database. Only covers companies that have been scraped before —
              use "Scrape + Analyze" below to fetch filings for companies not yet in the system.
            </p>
          </div>
          <Button
            onClick={() => mutation.mutate(null)}
            disabled={mutation.isPending || active}
            className="bg-green-700 hover:bg-green-800 shrink-0"
          >
            {mutation.isPending ? "Starting…" : active && !complete ? "Scanning…" : "⟳ Scan All Companies"}
          </Button>
        </div>

        <div className="border-t border-gray-100 mt-4 pt-4 flex flex-col sm:flex-row gap-4 items-start sm:items-end">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700 mb-1">Also scrape new filings from PSX</p>
            <p className="text-xs text-gray-400 mb-2">Fetches new quarterly filings from PSX for the selected month, then analyzes them.</p>
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-48"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => mutation.mutate(month)}
            disabled={mutation.isPending || active}
            className="shrink-0"
          >
            {mutation.isPending ? "Starting…" : `Scrape ${month} + Analyze`}
          </Button>
        </div>
      </Card>

      {complete && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-4 py-2 flex-1">
            ✓ Scan complete{scanMonth ? ` for ${scanMonth}` : ""}
          </p>
          <Button variant="outline" size="sm" onClick={() => { setActive(false); setScanMonth(null); mutation.reset(); }}>
            New Scan
          </Button>
        </div>
      )}

      {mutation.isError && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-4 py-2">
          Failed to start scan. Make sure you are logged in.
        </div>
      )}

      {/* ── Progress overview ── */}
      {(active || total > 0 || scraping) && (
        <div className="space-y-3">
          {/* Summary bar */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <span className="font-medium text-gray-800 text-sm">
                {complete && total === 0
                  ? `No filings found for ${scanMonth}`
                  : complete
                  ? `✓ Done — ${done} of ${total} filings analyzed`
                  : scraping
                  ? `Scraping PSX for ${scanMonth}…`
                  : processing > 0
                  ? `Analyzing ${processing} filing${processing > 1 ? "s" : ""}…`
                  : pending > 0
                  ? `${pending} filing${pending > 1 ? "s" : ""} queued`
                  : "Starting scan…"}
              </span>
              <span className="text-xs text-gray-400 flex gap-3">
                <span className="text-green-600 font-medium">{done} done</span>
                {processing > 0 && <span className="text-yellow-600 font-medium">{processing} analyzing</span>}
                {pending > 0 && <span className="text-blue-600 font-medium">{pending} queued</span>}
                {failed > 0 && <span className="text-red-600 font-medium">{failed} failed</span>}
                <span className="text-gray-400">of {total}</span>
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
              <div className="h-3 flex rounded-full overflow-hidden transition-all duration-500">
                <div
                  className="bg-green-500 transition-all duration-500"
                  style={{ width: `${(done / Math.max(total, 1)) * 100}%` }}
                />
                <div
                  className="bg-yellow-400 transition-all duration-500"
                  style={{ width: `${(processing / Math.max(total, 1)) * 100}%` }}
                />
                <div
                  className="bg-blue-400 transition-all duration-500"
                  style={{ width: `${(pending / Math.max(total, 1)) * 100}%` }}
                />
              </div>
            </div>
            <div className="flex text-xs text-gray-400 justify-between mt-1">
              <span>0%</span>
              <span className={`font-semibold ${complete ? "text-green-600" : "text-gray-600"}`}>
                {percent}%
              </span>
              <span>100%</span>
            </div>
          </div>

          {/* Status filter */}
          {filings.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium text-gray-700">Filter by status:</span>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => {
                      setStatusFilter("all");
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
                      statusFilter === "all"
                        ? "bg-gray-700 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    All ({filings.length})
                  </button>
                  <button
                    onClick={() => {
                      setStatusFilter("done");
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
                      statusFilter === "done"
                        ? "bg-green-600 text-white"
                        : "bg-green-50 text-green-700 hover:bg-green-100"
                    }`}
                  >
                    Done ({done})
                  </button>
                  <button
                    onClick={() => {
                      setStatusFilter("processing");
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
                      statusFilter === "processing"
                        ? "bg-yellow-500 text-white"
                        : "bg-yellow-50 text-yellow-700 hover:bg-yellow-100"
                    }`}
                  >
                    Analyzing ({processing})
                  </button>
                  <button
                    onClick={() => {
                      setStatusFilter("pending");
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
                      statusFilter === "pending"
                        ? "bg-blue-500 text-white"
                        : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                    }`}
                  >
                    Queued ({pending})
                  </button>
                  <button
                    onClick={() => {
                      setStatusFilter("failed");
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
                      statusFilter === "failed"
                        ? "bg-red-600 text-white"
                        : "bg-red-50 text-red-600 hover:bg-red-100"
                    }`}
                  >
                    Failed ({failed})
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Per-company cards */}
          {filteredFilings.length > 0 && (
            <>
              <div className="grid gap-2">
                {paginatedFilings.map((f: any) => (
                  <div
                    key={f.id}
                    className={`bg-white border rounded-xl px-4 py-3 flex items-center justify-between transition-all ${
                      f.status === "processing"
                        ? "border-yellow-300 shadow-sm shadow-yellow-100"
                        : f.status === "done"
                        ? "border-green-200"
                        : f.status === "failed"
                        ? "border-red-200"
                        : "border-gray-100"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/companies/${f.company_id}`}
                          className="font-medium text-gray-900 hover:text-green-700 text-sm"
                        >
                          {f.company?.name ?? `Company #${f.company_id}`}
                        </Link>
                        <span className="text-xs text-gray-400 font-mono">{f.company?.symbol}</span>
                        <span className="text-xs text-gray-400">{f.quarter}</span>
                        {f.updated_at && (
                          <span className="text-xs text-gray-400">
                            • {new Date(f.updated_at).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        )}
                      </div>
                      {f.status === "done" && f.ai_analysis?.summary && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{f.ai_analysis.summary}</p>
                      )}
                      {f.status === "processing" && (
                        <p className="text-xs text-yellow-600 mt-0.5 animate-pulse">Reading filing and running AI analysis…</p>
                      )}
                      {f.status === "failed" && (
                        <p className="text-xs text-red-500 mt-0.5">Analysis failed — will retry on next scan</p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 ml-4 shrink-0">
                      <StatusDot status={f.status} />
                      {f.score != null && f.status === "done" && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full text-white ${
                          f.score.score >= 70 ? "bg-green-600" : f.score.score >= 40 ? "bg-yellow-500" : "bg-gray-400"
                        }`}>
                          {f.score.score}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-xl">
                  <div className="text-sm text-gray-600">
                    Showing {startIndex + 1}–{Math.min(endIndex, filteredFilings.length)} of {filteredFilings.length} filings
                    {statusFilter !== "all" && <span className="text-gray-400 ml-1">({filings.length} total)</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="h-8 px-3"
                    >
                      Previous
                    </Button>
                    <div className="text-sm text-gray-600 px-3">
                      Page {currentPage} of {totalPages}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="h-8 px-3"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Empty state when filter has no results */}
          {filings.length > 0 && filteredFilings.length === 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-8 text-center">
              <p className="text-sm text-gray-500">
                No filings with status "{statusFilter}"
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStatusFilter("all");
                  setCurrentPage(1);
                }}
                className="mt-3"
              >
                Clear filter
              </Button>
            </div>
          )}

          {active && total === 0 && !complete && (
            <div className="flex items-center gap-3 text-sm text-gray-500 py-4 justify-center">
              <span className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
              {scraping
                ? `Scraping PSX for ${scanMonth} filings…`
                : "Waiting for scrape job to start…"}
            </div>
          )}

          {complete && total === 0 && scraped && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-4 text-sm text-yellow-800">
              <p className="font-medium">No filings found for {scanMonth}</p>
              <p className="text-xs mt-1 text-yellow-600">
                PSX returned 0 transmission announcements for this month. Try an earlier month — quarterly results
                are typically published 1–2 months after the quarter ends.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
