"use client";
import React, { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Area, AreaChart,
} from "recharts";

// ─── Helpers ────────────────────────────────────────────────────────────────

const FLAG_META: Record<string, { label: string; color: string; bg: string }> = {
  HIGH_PROFIT_GROWTH:  { label: "High Profit Growth",  color: "text-green-700",  bg: "bg-green-50 border-green-200" },
  HIGH_REVENUE_GROWTH: { label: "High Revenue Growth", color: "text-blue-700",   bg: "bg-blue-50 border-blue-200" },
  EXPORT_EXPANSION:    { label: "Export Expansion",    color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
  NEW_PROJECT:         { label: "New Project",         color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" },
  MARGIN_IMPROVEMENT:  { label: "Margin Improvement",  color: "text-teal-700",   bg: "bg-teal-50 border-teal-200" },
  DEFAULTER_RISK:      { label: "Defaulter Risk",      color: "text-red-700",    bg: "bg-red-50 border-red-200" },
  EXCHANGE_HEADWIND:   { label: "Exchange Headwind",   color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
  EXCHANGE_TAILWIND:   { label: "Exchange Tailwind",   color: "text-cyan-700",   bg: "bg-cyan-50 border-cyan-200" },
};

const RECOMMENDATION_STYLE: Record<string, string> = {
  "Strong Buy":  "bg-green-800 text-white",
  "Buy":         "bg-green-500 text-white",
  "Hold":        "bg-yellow-400 text-yellow-900",
  "Sell":        "bg-orange-500 text-white",
  "Strong Sell": "bg-red-600 text-white",
};

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ScoreGauge({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 70 ? "#16a34a" : pct >= 40 ? "#eab308" : "#9ca3af";
  const radius = 52;
  const circumference = Math.PI * radius;
  const dash = (pct / 100) * circumference;
  return (
    <div className="flex flex-col items-center">
      <svg width="140" height="80" viewBox="0 0 140 80">
        <path d="M 14 76 A 56 56 0 0 1 126 76" fill="none" stroke="#e5e7eb" strokeWidth="12" strokeLinecap="round" />
        <path d="M 14 76 A 56 56 0 0 1 126 76" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`} style={{ transition: "stroke-dasharray 0.6s ease" }} />
        <text x="70" y="68" textAnchor="middle" fontSize="26" fontWeight="700" fill={color}>{score}</text>
      </svg>
      <span className="text-xs text-gray-400 -mt-1">out of 100</span>
    </div>
  );
}

function StatCard({ label, value, suffix = "", positive }: {
  label: string; value: string | number | null | undefined; suffix?: string; positive?: boolean;
}) {
  if (value == null) return null;
  const num = typeof value === "number" ? value : parseFloat(String(value));
  const isPositive = positive ?? (!isNaN(num) ? num >= 0 : true);
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 flex flex-col gap-1 shadow-sm">
      <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
      <span className={`text-2xl font-bold ${isPositive ? "text-green-600" : "text-red-500"}`}>
        {typeof value === "number" && value > 0 ? "+" : ""}{value}{suffix}
      </span>
    </div>
  );
}

function ToneChip({ tone }: { tone: string }) {
  const map: Record<string, string> = {
    positive: "bg-green-100 text-green-700", optimistic: "bg-green-100 text-green-700",
    neutral: "bg-gray-100 text-gray-600", cautious: "bg-yellow-100 text-yellow-700",
    negative: "bg-red-100 text-red-700",
  };
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${map[tone?.toLowerCase()] ?? "bg-gray-100 text-gray-600"}`}>
      {tone}
    </span>
  );
}

// ─── Section: Company Header ──────────────────────────────────────────────────

function CompanyHeader({ id, polling, setPolling, filings }: {
  id: string;
  polling: boolean;
  setPolling: (v: boolean) => void;
  filings: any[];
}) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["company", id],
    queryFn: () => api.get(`/companies/${id}`).then((r) => r.data),
  });

  const watchMutation = useMutation({
    mutationFn: (add: boolean) =>
      add ? api.post("/watchlist", { company_id: Number(id) }) : api.delete(`/watchlist/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company", id] }),
  });

  const rescanMutation = useMutation({
    mutationFn: () => api.post(`/companies/${id}/rescan`),
    onSuccess: () => {
      setPolling(true);
      qc.invalidateQueries({ queryKey: ["company-filings", id] });
    },
  });

  const scanMutation = useMutation({
    mutationFn: () => api.post(`/companies/${id}/scan`),
    onSuccess: () => {
      setPolling(true);
      qc.invalidateQueries({ queryKey: ["company-filings", id] });
    },
  });

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
        <div className="flex gap-4 mt-4">
          <Skeleton className="h-12 w-32" />
          <Skeleton className="h-12 w-32" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { company, is_watched } = data;
  const latestFiling = filings[0] ?? null;
  const score = latestFiling?.score?.score ?? 0;
  const currentPrice = company.last_price ? parseFloat(company.last_price) : null;
  const priceAtFiling = latestFiling?.score?.price_at_filing ? parseFloat(latestFiling.score.price_at_filing) : null;
  const priceChangePct = priceAtFiling && currentPrice
    ? (((currentPrice - priceAtFiling) / priceAtFiling) * 100).toFixed(1) : null;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold text-gray-900">{company.name}</h1>
            <span className="font-mono text-lg text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{company.symbol}</span>
            {company.is_defaulter && <Badge variant="destructive">Defaulter</Badge>}
          </div>
          <p className="text-gray-500 text-sm">{company.sector ?? "Unknown sector"} · {company.exchange_type} year</p>

          <div className="flex flex-wrap items-center gap-4 mt-4">
            {currentPrice && (
              <div className="flex flex-col">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Current Price</span>
                <span className="text-2xl font-bold text-gray-800">PKR {currentPrice.toLocaleString()}</span>
              </div>
            )}
            {priceAtFiling && (
              <div className="flex flex-col">
                <span className="text-xs text-gray-400 uppercase tracking-wide">At Filing</span>
                <span className="text-lg font-semibold text-gray-600">PKR {priceAtFiling.toLocaleString()}</span>
              </div>
            )}
            {priceChangePct && (
              <div className={`flex flex-col items-center px-4 py-2 rounded-xl ${parseFloat(priceChangePct) >= 0 ? "bg-green-50" : "bg-red-50"}`}>
                <span className="text-xs text-gray-400 uppercase tracking-wide">Since Filing</span>
                <span className={`text-xl font-bold ${parseFloat(priceChangePct) >= 0 ? "text-green-600" : "text-red-500"}`}>
                  {parseFloat(priceChangePct) >= 0 ? "▲" : "▼"} {Math.abs(parseFloat(priceChangePct))}%
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          {latestFiling && <ScoreGauge score={score} />}
          <Button
            variant={is_watched ? "outline" : "default"}
            className={is_watched ? "" : "bg-green-700 hover:bg-green-800"}
            onClick={() => watchMutation.mutate(!is_watched)}
            disabled={watchMutation.isPending}
          >
            {is_watched ? "★ Watching" : "☆ Add to Watchlist"}
          </Button>
          <div className="flex flex-col items-center gap-1 w-full">
            {polling && (
              <div className="flex items-center gap-2 w-full justify-center bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                <span className="text-xs text-yellow-700 font-medium">
                  {filings[0]?.status === "processing" ? "Analyzing filing…" : "Scanning & analyzing…"}
                </span>
              </div>
            )}
            {filings.length > 0 ? (
              <>
                <Button
                  variant="outline" size="sm"
                  onClick={() => rescanMutation.mutate()}
                  disabled={rescanMutation.isPending || polling}
                  className={`w-full ${rescanMutation.isError ? "text-red-600 border-red-300 hover:bg-red-50" : "text-blue-600 border-blue-200 hover:bg-blue-50"}`}
                >
                  {rescanMutation.isPending ? "⟳ Starting…" : polling ? "⟳ Scanning…"
                    : rescanMutation.isSuccess ? "✓ Done — Rescan again"
                    : rescanMutation.isError ? "✕ Failed — Retry" : "⟳ Rescan"}
                </Button>
                {rescanMutation.isError && (
                  <p className="text-xs text-red-500 text-center">
                    {(rescanMutation.error as any)?.response?.data?.error ?? "Could not start rescan"}
                  </p>
                )}
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  onClick={() => scanMutation.mutate()}
                  disabled={scanMutation.isPending || polling}
                  className="w-full bg-green-700 hover:bg-green-800"
                >
                  {scanMutation.isPending ? "⟳ Scanning PSX…" : polling ? "⟳ Analyzing…"
                    : scanMutation.isSuccess ? "✓ Queued"
                    : scanMutation.isError ? "✕ Retry Scan" : "Scan Company"}
                </Button>
                {scanMutation.isSuccess && !polling && (
                  <p className="text-xs text-green-600 text-center">
                    {(scanMutation.data as any)?.data?.message}
                  </p>
                )}
                {scanMutation.isError && (
                  <p className="text-xs text-red-500 text-center">
                    {(scanMutation.error as any)?.response?.data?.message ?? "No filings found on PSX"}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section: Filings & Analysis ─────────────────────────────────────────────

function FilingsSection({ id, polling, setPolling }: {
  id: string; polling: boolean; setPolling: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [activeFilingId, setActiveFilingId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["company-filings", id],
    queryFn: () => api.get(`/companies/${id}/filings`).then((r) => r.data),
    refetchInterval: polling ? 3000 : false,
  });

  const scanMutation = useMutation({
    mutationFn: () => api.post(`/companies/${id}/scan`),
    onSuccess: () => {
      setPolling(true);
      qc.invalidateQueries({ queryKey: ["company-filings", id] });
    },
  });

  // Stop polling once latest filing is done/failed (outside of render via useEffect)
  const latestStatus = data?.filings?.[0]?.status;
  React.useEffect(() => {
    if (polling && (latestStatus === "done" || latestStatus === "failed")) {
      setPolling(false);
      qc.invalidateQueries({ queryKey: ["projection", id] });
    }
  }, [polling, latestStatus, id, setPolling, qc]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  const filings: any[] = data?.filings ?? [];

  if (filings.length === 0) {
    return (
      <Card className="p-8 text-center space-y-3">
        <p className="text-gray-500">No filings available for this company yet.</p>
        <p className="text-gray-400 text-sm">Scan PSX to fetch and analyze the latest quarterly filings.</p>
        <button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          className="inline-block mt-2 px-5 py-2.5 bg-green-700 hover:bg-green-800 disabled:bg-green-400 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {scanMutation.isPending ? "⟳ Scanning PSX…" : "Scan This Company"}
        </button>
        {scanMutation.isSuccess && (
          <p className="text-sm text-green-600">
            {(scanMutation.data as any)?.data?.message ?? "Scan complete — filings will appear shortly."}
          </p>
        )}
        {scanMutation.isError && (
          <p className="text-sm text-red-500">
            {(scanMutation.error as any)?.response?.data?.message ?? "Scan failed. Try again."}
          </p>
        )}
      </Card>
    );
  }

  const activeFiling = filings.find((f) => f.id === activeFilingId) ?? filings[0];
  const analysis = activeFiling?.ai_analysis ?? {};
  const signals = analysis.signals ?? {};
  const rawFlags = activeFiling?.score?.flags ?? [];
  const flags: string[] = Array.isArray(rawFlags) ? rawFlags : [];

  // Price chart data
  const sortedForChart = [...filings]
    .filter((f) => f.score?.price_at_filing != null)
    .sort((a, b) => new Date(a.filing_date).getTime() - new Date(b.filing_date).getTime());
  const chartData = sortedForChart.map((f) => ({ label: f.quarter, price: parseFloat(f.score.price_at_filing) }));
  const firstPrice = chartData[0]?.price;
  const lastPrice = chartData[chartData.length - 1]?.price;
  const isUp = (lastPrice ?? 0) >= (firstPrice ?? 0);
  const strokeColor = isUp ? "#16a34a" : "#ef4444";

  // Score trend
  const scoreTrend = [...filings].reverse()
    .filter((f) => f.score?.score != null)
    .map((f) => ({ quarter: f.quarter, score: f.score.score }));

  return (
    <div className="space-y-4">
      {/* Filing selector */}
      {filings.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {filings.map((f: any) => (
            <button key={f.id} onClick={() => setActiveFilingId(f.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                activeFiling?.id === f.id
                  ? "bg-green-700 text-white border-green-700"
                  : "bg-white text-gray-600 border-gray-300 hover:border-green-500 hover:text-green-700"
              }`}>
              {f.quarter}
            </button>
          ))}
        </div>
      )}

      {/* Signal stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {signals.revenue_growth_pct != null && <StatCard label="Revenue Growth" value={signals.revenue_growth_pct} suffix="%" />}
        {signals.profit_growth_pct != null && <StatCard label="Profit Growth" value={signals.profit_growth_pct} suffix="%" />}
        {signals.exchange_gain_loss_pkr_million != null && (
          <StatCard label="Exchange P&L" value={signals.exchange_gain_loss_pkr_million} suffix="M PKR"
            positive={signals.exchange_gain_loss_pkr_million >= 0} />
        )}
        {signals.gross_margin_direction && (
          <div className="bg-white border border-gray-100 rounded-xl p-4 flex flex-col gap-1 shadow-sm">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Gross Margin</span>
            <span className={`text-lg font-bold capitalize ${signals.gross_margin_direction === "improving" ? "text-green-600" : signals.gross_margin_direction === "declining" ? "text-red-500" : "text-gray-600"}`}>
              {signals.gross_margin_direction === "improving" ? "▲ " : signals.gross_margin_direction === "declining" ? "▼ " : ""}
              {signals.gross_margin_direction}
            </span>
            {signals.gross_margin_reason && <span className="text-xs text-gray-400">{signals.gross_margin_reason}</span>}
          </div>
        )}
      </div>

      {/* Flags */}
      {flags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {flags.map((flag) => {
            const meta = FLAG_META[flag];
            return (
              <span key={flag} className={`px-3 py-1.5 rounded-full text-sm font-medium border ${meta?.bg ?? "bg-gray-50 border-gray-200"} ${meta?.color ?? "text-gray-700"}`}>
                {meta?.label ?? flag.replace(/_/g, " ")}
              </span>
            );
          })}
        </div>
      )}

      {/* Charts */}
      <div className={`grid gap-4 ${filings.length > 1 ? "md:grid-cols-2" : "grid-cols-1"}`}>
        {chartData.length >= 2 && (
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold text-gray-800 text-base mb-4">Stock Price History</h3>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={strokeColor} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v.toLocaleString()} width={60} />
                <Tooltip formatter={(v: number) => [`PKR ${v.toLocaleString()}`, "Price"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Area type="monotone" dataKey="price" stroke={strokeColor} strokeWidth={2.5} fill="url(#priceGrad)" dot={{ fill: strokeColor, r: 3.5, stroke: "#fff", strokeWidth: 1.5 }} activeDot={{ r: 6 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        {scoreTrend.length >= 2 && (
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold text-gray-800 text-base mb-4">Score Trend</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={scoreTrend} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="quarter" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="#16a34a" strokeWidth={2} dot={{ fill: "#16a34a", r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* AI Analysis */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-gray-800 text-base">AI Analysis Summary</h3>
            {activeFiling?.updated_at && (
              <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">
                {new Date(activeFiling.updated_at).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            {analysis.summary ?? "Analysis not yet available for this filing."}
          </p>
          {signals.management_tone && (
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
              <span className="text-xs text-gray-400">Management tone:</span>
              <ToneChip tone={signals.management_tone} />
            </div>
          )}
        </Card>

        <Card className="p-5 space-y-3">
          <h3 className="font-semibold text-gray-800 text-base">Additional Signals</h3>
          {(() => {
            const items: { icon: string; iconBg: string; iconColor: string; label: string; value: string }[] = [];

            if (signals.management_tone) items.push({
              icon: "🎯", iconBg: "bg-blue-100", iconColor: "text-blue-700",
              label: "Management Tone", value: signals.management_tone,
            });
            if (signals.gross_margin_direction) items.push({
              icon: signals.gross_margin_direction === "improving" || signals.gross_margin_direction === "up" ? "▲" : signals.gross_margin_direction === "declining" || signals.gross_margin_direction === "down" ? "▼" : "—",
              iconBg: signals.gross_margin_direction === "improving" || signals.gross_margin_direction === "up" ? "bg-green-100" : signals.gross_margin_direction === "declining" || signals.gross_margin_direction === "down" ? "bg-red-100" : "bg-gray-100",
              iconColor: signals.gross_margin_direction === "improving" || signals.gross_margin_direction === "up" ? "text-green-700" : signals.gross_margin_direction === "declining" || signals.gross_margin_direction === "down" ? "text-red-600" : "text-gray-600",
              label: "Gross Margin", value: `${signals.gross_margin_direction}${signals.gross_margin_reason ? ` — ${signals.gross_margin_reason}` : ""}`,
            });
            if (signals.exports_milestone) items.push({
              icon: "↗", iconBg: "bg-purple-100", iconColor: "text-purple-700",
              label: "Exports", value: signals.exports_milestone,
            });
            if (signals.new_projects) items.push({
              icon: "★", iconBg: "bg-yellow-100", iconColor: "text-yellow-700",
              label: "New Projects", value: signals.new_projects,
            });
            if (signals.exchange_gain_loss_pkr_million != null) items.push({
              icon: signals.exchange_gain_loss_pkr_million >= 0 ? "+" : "−",
              iconBg: signals.exchange_gain_loss_pkr_million >= 0 ? "bg-cyan-100" : "bg-orange-100",
              iconColor: signals.exchange_gain_loss_pkr_million >= 0 ? "text-cyan-700" : "text-orange-700",
              label: "Exchange Impact", value: `${signals.exchange_gain_loss_pkr_million >= 0 ? "+" : ""}${signals.exchange_gain_loss_pkr_million}M PKR`,
            });

            if (items.length === 0) {
              return <p className="text-sm text-gray-400">No additional signals for this quarter.</p>;
            }

            return (
              <dl className="space-y-3 text-sm">
                {items.map((item) => (
                  <div key={item.label} className="flex gap-3">
                    <div className={`mt-0.5 w-6 h-6 rounded-full ${item.iconBg} flex items-center justify-center shrink-0`}>
                      <span className={`${item.iconColor} text-xs`}>{item.icon}</span>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{item.label}</dt>
                      <dd className="text-gray-800 font-medium capitalize">{item.value}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            );
          })()}
        </Card>
      </div>

      {/* Filing footer */}
      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400 pb-2">
        {activeFiling?.filing_date && <span>Filed: <span className="text-gray-600">{activeFiling.filing_date}</span></span>}
        {activeFiling?.pdf_url && (
          <a href={activeFiling.pdf_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
            View Filing PDF ↗
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Section: AI Projection ──────────────────────────────────────────────────

function ProjectionSection({ id, polling }: { id: string; polling: boolean }) {
  const { data: projection, isLoading, isError } = useQuery({
    queryKey: ["projection", id],
    queryFn: () => api.get(`/companies/${id}/projection`).then((r) => r.data),
    retry: 1,
    enabled: !polling,
    refetchInterval: (query) => {
      const status = (query.state.data as any)?.status;
      // Poll every 3s while pending/processing, stop once done/failed
      if (status === "pending" || status === "processing") return 3000;
      return false;
    },
  });

  const status = projection?.status;

  if (polling) {
    return (
      <div className="bg-gradient-to-br from-green-50 to-blue-50 border border-green-200 rounded-2xl p-6">
        <div className="flex items-center gap-3 text-green-700">
          <span className="inline-block w-3 h-3 rounded-full bg-green-400 animate-pulse" />
          <span className="font-medium">Waiting for analysis to complete before generating projection…</span>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-gradient-to-br from-green-50 to-blue-50 border border-green-200 rounded-2xl p-6 space-y-4 animate-pulse">
        <Skeleton className="h-6 w-48 bg-green-100" />
        <div className="grid grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 bg-green-100" />)}
        </div>
        <Skeleton className="h-24 bg-green-100" />
        <p className="text-xs text-green-500">Loading projection…</p>
      </div>
    );
  }

  if (status === "pending" || status === "processing") {
    return (
      <div className="bg-gradient-to-br from-green-50 to-blue-50 border border-green-200 rounded-2xl p-6">
        <div className="flex items-center gap-3 text-green-700">
          <span className="inline-block w-3 h-3 rounded-full bg-green-400 animate-pulse" />
          <span className="font-medium">
            {status === "processing" ? "AI is generating projection…" : "Projection queued — starting shortly…"}
          </span>
        </div>
      </div>
    );
  }

  if (isError || !projection || status === "unavailable" || status === "failed") {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 text-center text-gray-400 text-sm">
        AI projection unavailable — run a rescan to generate one.
      </div>
    );
  }

  const recStyle = RECOMMENDATION_STYLE[projection.recommendation] ?? "bg-gray-200 text-gray-700";

  return (
    <div className="bg-gradient-to-br from-green-50 to-blue-50 border border-green-200 rounded-2xl p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h3 className="font-semibold text-gray-800 text-lg">AI Projection</h3>
          <span className="text-xs text-gray-400 uppercase tracking-wide">Next Quarter</span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`px-4 py-1.5 rounded-full text-sm font-bold ${recStyle}`}>{projection.recommendation}</span>
          {projection.confidence && (
            <span className="text-xs text-gray-400 capitalize">Confidence: {projection.confidence}</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
        {projection.projected_revenue_growth_min != null && (
          <div className="bg-white bg-opacity-70 rounded-xl p-3">
            <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Revenue Growth</span>
            <span className="text-lg font-bold text-green-700">{projection.projected_revenue_growth_min}% – {projection.projected_revenue_growth_max}%</span>
          </div>
        )}
        {projection.projected_profit_growth_min != null && (
          <div className="bg-white bg-opacity-70 rounded-xl p-3">
            <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Profit Growth</span>
            <span className="text-lg font-bold text-blue-700">{projection.projected_profit_growth_min}% – {projection.projected_profit_growth_max}%</span>
          </div>
        )}
        {projection.target_upside_pct != null && (
          <div className="bg-white bg-opacity-70 rounded-xl p-3">
            <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Target Upside</span>
            <span className="text-lg font-bold text-purple-700">+{projection.target_upside_pct}%</span>
          </div>
        )}
      </div>

      {projection.next_quarter_outlook && (
        <p className="text-sm text-gray-700 leading-relaxed mb-5 bg-white bg-opacity-60 rounded-xl p-4">
          {projection.next_quarter_outlook}
        </p>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {projection.key_catalysts?.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-green-700 mb-2">Key Catalysts</h4>
            <ul className="space-y-1">
              {projection.key_catalysts.map((c: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-green-500 mt-0.5">●</span>{c}
                </li>
              ))}
            </ul>
          </div>
        )}
        {projection.key_risks?.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-red-600 mb-2">Key Risks</h4>
            <ul className="space-y-1">
              {projection.key_risks.map((r: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-red-400 mt-0.5">●</span>{r}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [polling, setPolling] = useState(false);

  // Load filings eagerly so header can use them for price context
  const { data: filingsData } = useQuery({
    queryKey: ["company-filings", id],
    queryFn: () => api.get(`/companies/${id}/filings`).then((r) => r.data),
  });
  const filings: any[] = filingsData?.filings ?? [];

  return (
    <div className="space-y-6">
      <CompanyHeader id={id} polling={polling} setPolling={setPolling} filings={filings} />
      <FilingsSection id={id} polling={polling} setPolling={setPolling} />
      {filings.length > 0 && <ProjectionSection id={id} polling={polling} />}
    </div>
  );
}
