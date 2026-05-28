"use client";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import Link from "next/link";

const STATUS_META: Record<string, { label: string; dot: string; text: string }> = {
  done:       { label: "Done",       dot: "bg-green-500",  text: "text-green-700"  },
  processing: { label: "Analyzing",  dot: "bg-yellow-400 animate-pulse", text: "text-yellow-700" },
  pending:    { label: "Queued",     dot: "bg-blue-400 animate-pulse",   text: "text-blue-600"   },
  pending:    { label: "Pending",    dot: "bg-gray-300",   text: "text-gray-500"   },
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
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [active, setActive] = useState(false);
  const [scanMonth, setScanMonth] = useState<string | null>(null);

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
      // Keep polling if: still active AND (no filings yet OR scan not complete)
      if (!active) return false;
      if (!d || d.total === 0) return 2000; // waiting for ScanMonthJob to create filings
      if (d.complete) return false;
      return 2000;
    },
    enabled: active,
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


  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Scan & Analyze</h1>
        <p className="text-gray-500 text-sm">
          Re-analyze all existing company filings, or scrape a new month from PSX and analyze those too.
        </p>
      </div>

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
      {(active || total > 0) && (
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

          {/* Per-company cards */}
          {filings.length > 0 && (
            <div className="grid gap-2">
              {filings.map((f: any) => (
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
