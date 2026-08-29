"use client";
import React, { use, useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Area, AreaChart, ComposedChart, Bar,
  ReferenceLine,
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

function LazySection({
  children,
  placeholderHeight = "h-48",
  rootMargin = "200px 0px",
}: {
  children: React.ReactNode;
  placeholderHeight?: string;
  rootMargin?: string;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return (
    <div ref={ref}>
      {isVisible ? children : (
        <div className={`${placeholderHeight} animate-pulse bg-gray-100 rounded-2xl`} />
      )}
    </div>
  );
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

// ─── Section: Price History Chart ────────────────────────────────────────────

const RANGES = [
  { label: "1M",  days: 30   },
  { label: "3M",  days: 90   },
  { label: "6M",  days: 180  },
  { label: "1Y",  days: 365  },
  { label: "2Y",  days: 730  },
  { label: "5Y",  days: 1825 },
];

function PriceHistorySection({ id, symbol }: { id: string; symbol?: string }) {
  const [rangeDays, setRangeDays] = useState(365);

  const from = new Date(Date.now() - rangeDays * 86400000).toISOString().slice(0, 10);
  const to   = new Date().toISOString().slice(0, 10);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["price-history", id, rangeDays],
    queryFn: () => api.get(`/companies/${id}/price-history?from=${from}&to=${to}`).then((r) => r.data),
    staleTime: 4 * 60 * 60 * 1000, // 4 hours — matches backend PSX cache TTL
  });

  const raw: { date: string; open: number; high: number; low: number; close: number; volume: number }[] = data?.data ?? [];

  // Downsample for visual clarity if > 300 points
  const step = raw.length > 300 ? Math.ceil(raw.length / 300) : 1;
  const rows = raw.filter((_, i) => i % step === 0);

  const closes = rows.map((r) => r.close);
  const firstClose = closes[0];
  const lastClose  = closes[closes.length - 1];
  const isUp = (lastClose ?? 0) >= (firstClose ?? 0);
  const strokeColor = isUp ? "#16a34a" : "#ef4444";
  const changePct = firstClose ? (((lastClose - firstClose) / firstClose) * 100).toFixed(2) : null;

  const volumeMax = Math.max(...rows.map((r) => r.volume), 1);
  // Normalize volume to overlay on price axis (30% of price range)
  const priceMin = Math.min(...rows.map((r) => r.low));
  const priceMax = Math.max(...rows.map((r) => r.high));
  const priceRange = priceMax - priceMin || 1;
  const chartRows = rows.map((r) => ({
    ...r,
    // High-low band for area range
    range: [r.low, r.high] as [number, number],
    // Volume normalized to 25% of price axis at bottom
    volScaled: priceMin + (r.volume / volumeMax) * priceRange * 0.25,
    volBase: priceMin,
    dateLabel: r.date.slice(5), // MM-DD
  }));

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-baseline gap-3 flex-wrap">
          {symbol && (
            <span className="font-mono font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded text-sm tracking-wide">
              {symbol}
            </span>
          )}
          <h3 className="font-semibold text-gray-800 text-base">Stock Price</h3>
          {changePct && (
            <span className={`text-sm font-semibold ${isUp ? "text-green-600" : "text-red-500"}`}>
              {isUp ? "▲" : "▼"} {Math.abs(parseFloat(changePct))}%
            </span>
          )}
          {lastClose && (
            <span className="text-sm text-gray-500">PKR {lastClose.toLocaleString()}</span>
          )}
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setRangeDays(r.days)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                rangeDays === r.days
                  ? "bg-green-700 text-white border-green-700"
                  : "bg-white text-gray-500 border-gray-200 hover:border-green-400 hover:text-green-700"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-64 text-gray-400 text-sm gap-2">
          <span className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
          Loading price data…
        </div>
      )}
      {isError && (
        <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
          Price data unavailable for this symbol.
        </div>
      )}
      {!isLoading && !isError && rows.length === 0 && (
        <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
          No price data found for this period.
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-1">
          {/* Main price chart */}
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
              <defs>
                <linearGradient id="closeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={strokeColor} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={strokeColor} stopOpacity={0}    />
                </linearGradient>
                <linearGradient id="rangeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={strokeColor} stopOpacity={0.07} />
                  <stop offset="95%" stopColor={strokeColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="dateLabel"
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                interval={Math.ceil(chartRows.length / 6)}
                tickLine={false}
              />
              <YAxis
                domain={[priceMin * 0.98, priceMax * 1.01]}
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}
                width={52}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload;
                  return (
                    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs space-y-0.5">
                      <div className="font-semibold text-gray-700 mb-1">{d?.date}</div>
                      <div className="text-gray-500">Open <span className="text-gray-800 font-medium">PKR {d?.open?.toLocaleString()}</span></div>
                      <div className="text-green-600">High <span className="font-medium">PKR {d?.high?.toLocaleString()}</span></div>
                      <div className="text-red-500">Low <span className="font-medium">PKR {d?.low?.toLocaleString()}</span></div>
                      <div className="text-blue-600 font-bold">Close PKR {d?.close?.toLocaleString()}</div>
                      <div className="text-gray-400 pt-0.5">Vol {d?.volume?.toLocaleString()}</div>
                    </div>
                  );
                }}
              />
              {/* High-Low band */}
              <Area
                type="monotone"
                dataKey="range"
                stroke="none"
                fill="url(#rangeGrad)"
                isAnimationActive={false}
              />
              {/* Volume bars at bottom */}
              <Bar
                dataKey="volScaled"
                fill={strokeColor}
                opacity={0.15}
                isAnimationActive={false}
                minPointSize={0}
              />
              {/* Close price area */}
              <Area
                type="monotone"
                dataKey="close"
                stroke={strokeColor}
                strokeWidth={2}
                fill="url(#closeGrad)"
                dot={false}
                activeDot={{ r: 4, fill: strokeColor, stroke: "#fff", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-2 pt-2 border-t border-gray-100">
            {[
              { label: "High", value: `PKR ${Math.max(...rows.map((r) => r.high)).toLocaleString()}`, color: "text-green-600" },
              { label: "Low",  value: `PKR ${Math.min(...rows.map((r) => r.low)).toLocaleString()}`,  color: "text-red-500"   },
              { label: "Avg",  value: `PKR ${Math.round(closes.reduce((s, v) => s + v, 0) / closes.length).toLocaleString()}`, color: "text-gray-700" },
              { label: "Data Points", value: raw.length.toLocaleString(), color: "text-gray-400" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-xs text-gray-400">{s.label}</div>
                <div className={`text-xs font-semibold ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
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
      qc.invalidateQueries({ queryKey: ["company", id] });  // price updated synchronously
    },
  });

  const scanMutation = useMutation({
    mutationFn: () => api.post(`/companies/${id}/scan`),
    onSuccess: () => {
      setPolling(true);
      qc.invalidateQueries({ queryKey: ["company-filings", id] });
      qc.invalidateQueries({ queryKey: ["company", id] });  // price updated synchronously
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

  const { company, is_watched, macro_risk, adjusted_score, data_stale, data_age_months } = data;

  // Find latest filing by quarter period (not filing_date) that has a score
  const qSortKey = (q: string) => {
    const m = q.match(/^(?:FY|Q(\d))-(\d{4})$/);
    if (!m) return 0;
    return parseInt(m[2]) + (m[1] ? parseInt(m[1]) : 4) * 0.1;
  };
  const latestScoredFiling = [...filings]
    .filter((f) => f.score?.score != null)
    .sort((a, b) => qSortKey(b.quarter) - qSortKey(a.quarter))[0] ?? null;
  const latestFiling = latestScoredFiling ?? filings[0] ?? null;
  const rawScore = latestScoredFiling?.score?.score ?? 0;
  const macroAdj = macro_risk?.adjustment ?? 0;
  // adjusted_score = rawScore + macroAdj, clamped 0-100 (computed by backend)
  const adjustedScore = adjusted_score ?? (macroAdj !== 0 ? Math.max(0, Math.min(100, rawScore + macroAdj)) : null);
  const currentPrice = company.last_price ? parseFloat(company.last_price) : null;
  const priceAtFiling = latestFiling?.score?.price_at_filing ? parseFloat(latestFiling.score.price_at_filing) : null;
  const priceChangePct = priceAtFiling && currentPrice
    ? (((currentPrice - priceAtFiling) / priceAtFiling) * 100).toFixed(1) : null;

  return (
    <>
    {data_stale && (
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 text-amber-800 text-sm">
        <span className="text-lg leading-none">⚠️</span>
        <span>
          <strong>Stale data — last filing {data_age_months} months ago.</strong> This company has not submitted financial statements to PSX in over a year. Analysis, scores, and projections are based on outdated information and should be treated with low confidence.
        </span>
      </div>
    )}
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold text-gray-900">{company.name}</h1>
            <span className="font-mono text-lg text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{company.symbol}</span>
            {company.is_sharia_compliant && (
              <span
                title="Sharia Compliant"
                aria-label="Sharia Compliant"
                className="inline-flex items-center justify-center bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full w-7 h-7 text-base font-medium"
              >
                ☪
              </span>
            )}
            {company.is_defaulter && <Badge variant="destructive">Defaulter</Badge>}
          </div>
          <p className="text-gray-500 text-sm">
            {company.sector ?? "Unknown sector"} · {company.exchange_type === "CY" ? "Calendar Year" : "Fiscal Year (Jul–Jun)"}
            {" · "}
            <a
              href={`https://dps.psx.com.pk/company/${company.symbol}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
            >
              PSX Profile <span className="text-xs">↗</span>
            </a>
          </p>

          <div className="flex flex-wrap items-stretch gap-2 mt-4">
            {currentPrice && (
              <div className="flex flex-col rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5">
                <span className="text-xs text-gray-400 uppercase tracking-wide">
                  Current Price
                  {company.price_updated_at && (
                    <span className="ml-1 normal-case font-normal text-gray-300">
                      · {new Date(company.price_updated_at).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}
                    </span>
                  )}
                </span>
                <span className="text-2xl font-bold text-gray-800 leading-tight">PKR {currentPrice.toLocaleString()}</span>
                {(() => {
                  const eps = latestFiling?.eps ? parseFloat(latestFiling.eps) : null;
                  if (eps && eps > 0) {
                    const pe = currentPrice / eps;
                    const peColor = pe < 15 ? "text-green-600" : pe < 25 ? "text-blue-600" : pe < 40 ? "text-yellow-600" : "text-red-600";
                    return (
                      <span className="text-xs text-gray-400 mt-0.5">
                        P/E <span className={`font-semibold ${peColor}`}>{pe.toFixed(2)}</span>
                      </span>
                    );
                  }
                  return null;
                })()}
              </div>
            )}
            {priceAtFiling && (
              <div className="flex flex-col justify-center rounded-xl border border-gray-100 px-4 py-2.5">
                <span className="text-xs text-gray-400 uppercase tracking-wide">At Filing</span>
                <span className="text-lg font-semibold text-gray-600">PKR {priceAtFiling.toLocaleString()}</span>
              </div>
            )}
            {priceChangePct && (
              <div className={`flex flex-col items-center justify-center px-4 py-2.5 rounded-xl border ${parseFloat(priceChangePct) >= 0 ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"}`}>
                <span className="text-xs text-gray-400 uppercase tracking-wide">Since Filing</span>
                <span className={`text-xl font-bold ${parseFloat(priceChangePct) >= 0 ? "text-green-600" : "text-red-500"}`}>
                  {parseFloat(priceChangePct) >= 0 ? "▲" : "▼"} {Math.abs(parseFloat(priceChangePct))}%
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          {latestFiling && (
            <div className="flex flex-col items-center gap-1">
              {/* Gauge always shows the raw AI score — same number as the companies list */}
              <ScoreGauge score={rawScore} />
              {macroAdj !== 0 && adjustedScore !== null && (
                <div className="flex flex-col items-center gap-0.5">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${macroAdj > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    Macro {macroAdj > 0 ? `+${macroAdj}` : macroAdj}
                  </span>
                  <span className="text-xs text-gray-400">
                    Adjusted: <span className="font-semibold text-gray-700">{adjustedScore}</span>
                  </span>
                </div>
              )}
            </div>
          )}
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
                {(() => {
                  const latestFilingFailed = !polling && filings[0]?.status === "failed";
                  const isErr = rescanMutation.isError || latestFilingFailed;
                  return (
                    <>
                      <Button
                        variant="outline" size="sm"
                        onClick={() => rescanMutation.mutate()}
                        disabled={rescanMutation.isPending || polling}
                        className={`w-full ${isErr ? "text-red-600 border-red-300 hover:bg-red-50" : "text-blue-600 border-blue-200 hover:bg-blue-50"}`}
                      >
                        {rescanMutation.isPending ? "⟳ Starting…"
                          : polling ? "⟳ Scanning…"
                          : latestFilingFailed ? "✕ Analysis failed — Retry"
                          : rescanMutation.isSuccess ? "✓ Done — Rescan again"
                          : rescanMutation.isError ? "✕ Failed — Retry"
                          : "⟳ Rescan"}
                      </Button>
                      {latestFilingFailed && (
                        <p className="text-xs text-red-500 text-center">AI analysis failed. Click to retry.</p>
                      )}
                      {rescanMutation.isError && !latestFilingFailed && (
                        <p className="text-xs text-red-500 text-center">
                          {(rescanMutation.error as any)?.response?.data?.error ?? "Could not start rescan"}
                        </p>
                      )}
                    </>
                  );
                })()}
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
    </>
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
      qc.invalidateQueries({ queryKey: ["company", id] });
    },
  });

  // Stop polling once latest filing is done/failed — refresh all related data
  const latestStatus = data?.filings?.[0]?.status;
  React.useEffect(() => {
    if (polling && (latestStatus === "done" || latestStatus === "failed")) {
      setPolling(false);
      qc.invalidateQueries({ queryKey: ["projection", id] });
      qc.invalidateQueries({ queryKey: ["company", id] });       // price, volume, movement
      qc.invalidateQueries({ queryKey: ["company-news", id] });   // news
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

  // Sort key for quarter chronological ordering
  const quarterSortKey = (q: string) => {
    // FY-2025 → 2025.4, Q1-2025 → 2025.1, Q3-2024 → 2024.3
    const m = q.match(/^(?:FY|Q(\d))-(\d{4})$/);
    if (!m) return 0;
    const year = parseInt(m[2]);
    const qtr = m[1] ? parseInt(m[1]) : 4; // FY = treat as Q4
    return year + qtr * 0.1;
  };

  // Filings sorted by quarter: newest first (for selector buttons)
  const sortedFilings = [...filings].sort((a, b) => quarterSortKey(b.quarter) - quarterSortKey(a.quarter));

  const activeFiling = filings.find((f) => f.id === activeFilingId) ?? sortedFilings[0];
  const analysis = activeFiling?.ai_analysis ?? {};
  const signals = analysis.signals ?? {};
  const rawFlags = activeFiling?.score?.flags ?? [];
  const flags: string[] = Array.isArray(rawFlags) ? rawFlags : [];

  // Score trend — only done filings, oldest left → newest right
  const scoreTrend = [...filings]
    .filter((f) => f.status === "done" && f.score?.score != null)
    .sort((a, b) => quarterSortKey(a.quarter) - quarterSortKey(b.quarter))
    .map((f) => ({ quarter: f.quarter, score: f.score.score }));

  return (
    <div className="space-y-4">
      {/* Filing selector */}
      {sortedFilings.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {sortedFilings.map((f: any) => (
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

      {/* Score trend chart */}
      {scoreTrend.length >= 2 && (
        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
          <h3 className="font-semibold text-gray-800 text-base mb-4">AI Score Trend</h3>
          <ResponsiveContainer width="100%" height={220}>
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
            const signalDate = activeFiling?.filing_date
              ? new Date(activeFiling.filing_date).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })
              : null;

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
                      <dt className="flex items-center gap-2 text-xs text-gray-400 uppercase tracking-wide mb-0.5">
                        {item.label}
                        {signalDate && <span className="normal-case text-gray-300 font-normal">· {signalDate}</span>}
                      </dt>
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
        {activeFiling?.filing_date && (
          <span>Filed: <span className="text-gray-600">
            {new Date(activeFiling.filing_date).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}
          </span></span>
        )}
        {activeFiling?.pdf_url && (
          <a href={activeFiling.pdf_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
            View Filing PDF ↗
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Section: Macro Risk Card ────────────────────────────────────────────────

function getMacroOutlookLabel(severity: string, adj: number): { label: string; color: string } {
  if (adj > 5)   return { label: "↑ Strong Tailwinds",       color: "text-green-600" };
  if (adj > 0)   return { label: "↑ Mild Tailwinds",         color: "text-green-600" };
  if (adj === 0) return { label: "→ Neutral",                 color: "text-gray-500"  };
  if (severity === "critical") return { label: "↓ Severe Headwinds",      color: "text-red-600"    };
  if (severity === "high")     return { label: "↓ Significant Headwinds", color: "text-orange-600" };
  return                              { label: "↓ Mild Headwinds",        color: "text-amber-600"  };
}

function MacroRiskCard({ macroRisk }: { macroRisk: any }) {
  if (!macroRisk) return null;

  const severityStyle: Record<string, { bg: string; border: string; badge: string; text: string }> = {
    low:      { bg: "bg-green-50",  border: "border-green-200",  badge: "bg-green-100 text-green-800",   text: "text-green-800"  },
    moderate: { bg: "bg-blue-50",   border: "border-blue-200",   badge: "bg-blue-100 text-blue-800",     text: "text-blue-800"   },
    high:     { bg: "bg-orange-50", border: "border-orange-200", badge: "bg-orange-100 text-orange-800", text: "text-orange-800" },
    critical: { bg: "bg-red-50",    border: "border-red-200",    badge: "bg-red-100 text-red-900",       text: "text-red-900"    },
  };

  const directionIcon: Record<string, string> = {
    positive: "↑",
    neutral:  "→",
    negative: "↓",
  };
  const directionColor: Record<string, string> = {
    positive: "text-green-600 bg-green-50",
    neutral:  "text-gray-500 bg-gray-50",
    negative: "text-red-600 bg-red-50",
  };

  const style   = severityStyle[macroRisk.severity] ?? severityStyle.moderate;
  const adj     = macroRisk.adjustment ?? 0;
  const adjStr  = adj > 0 ? `+${adj}` : String(adj);
  const adjColor = adj > 0 ? "text-green-700 bg-green-100" : adj < 0 ? "text-orange-700 bg-orange-100" : "text-gray-600 bg-gray-100";
  const { label: outlookLabel, color: outlookColor } = getMacroOutlookLabel(macroRisk.severity ?? "moderate", adj);

  return (
    <div className={`rounded-2xl border p-5 space-y-4 ${style.bg} ${style.border}`}>
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xl shrink-0">🌍</span>
        <h3 className={`font-semibold text-base ${style.text}`}>Macro Risk Assessment</h3>
        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize ${style.badge}`}>
          {macroRisk.severity}
        </span>
        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full font-mono ${adjColor}`}>
          Score adjustment: {adjStr}
        </span>
        <span className={`text-xs font-medium ml-auto ${outlookColor}`}>
          {outlookLabel}
        </span>
      </div>

      {/* Summary */}
      {macroRisk.summary && (
        <p className={`text-sm leading-relaxed ${style.text} opacity-90`}>{macroRisk.summary}</p>
      )}

      {/* Factors */}
      {Array.isArray(macroRisk.factors) && macroRisk.factors.length > 0 && (
        <div className="space-y-2">
          {macroRisk.factors.map((f: any, i: number) => {
            const dir = f.direction ?? "neutral";
            const dc  = directionColor[dir] ?? directionColor.neutral;
            const di  = directionIcon[dir] ?? "→";
            return (
              <div key={i} className="flex items-start gap-2.5 text-sm">
                <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${dc}`}>
                  {di}
                </span>
                <div className="flex-1 min-w-0">
                  <span className={`font-semibold ${style.text} mr-1.5`}>{f.label}:</span>
                  <span className="text-gray-600">{f.note}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      {macroRisk.assessed_at && (
        <p className="text-xs text-gray-400 pt-1 border-t border-current border-opacity-10">
          Assessed: {new Date(macroRisk.assessed_at).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}
        </p>
      )}
    </div>
  );
}

// ─── Section: Volume Spike Alert ─────────────────────────────────────────────

function VolumeAlertBanner({ analysis }: { analysis: any }) {
  if (!analysis?.spike_detected) return null;

  const severityStyle: Record<string, string> = {
    high:   "bg-red-50 border-red-300 text-red-800",
    medium: "bg-orange-50 border-orange-300 text-orange-800",
    low:    "bg-yellow-50 border-yellow-300 text-yellow-800",
  };
  const style = severityStyle[analysis.severity] ?? severityStyle.medium;

  return (
    <div className={`rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-start gap-3 ${style}`}>
      <div className="text-2xl shrink-0">📊</div>
      <div className="flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-sm">Volume Spike Detected</span>
          <span className="text-xs font-bold bg-white bg-opacity-60 px-2 py-0.5 rounded-full border border-current">
            {analysis.volume_ratio}× normal
          </span>
          {analysis.price_change_pct !== 0 && (
            <span className={`text-xs font-medium ${analysis.price_change_pct > 0 ? "text-green-700" : "text-red-700"}`}>
              {analysis.price_change_pct > 0 ? "▲" : "▼"} {Math.abs(analysis.price_change_pct)}% price
            </span>
          )}
          <span className="text-xs opacity-60 ml-auto">
            {analysis.date ?? ""}
          </span>
        </div>
        {analysis.explanation && (
          <p className="text-sm leading-relaxed">{analysis.explanation}</p>
        )}
      </div>
    </div>
  );
}

// ─── Section: Movement Explanation ───────────────────────────────────────────

function MovementExplanationSection({ data }: { data: any }) {
  if (!data?.explanation) return null;

  const driverColor: Record<string, string> = {
    "news or announcement":        "bg-blue-100 text-blue-700",
    "sector momentum":             "bg-purple-100 text-purple-700",
    "technical or passive movement": "bg-gray-100 text-gray-600",
    "mixed factors":               "bg-yellow-100 text-yellow-700",
  };
  const confidenceColor: Record<string, string> = {
    high:   "text-green-600",
    medium: "text-yellow-600",
    low:    "text-gray-400",
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-gray-800 text-base">Movement Explanation</h3>
        {data.primary_driver && (
          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium capitalize ${driverColor[data.primary_driver] ?? "bg-gray-100 text-gray-600"}`}>
            {data.primary_driver}
          </span>
        )}
        {data.confidence && (
          <span className={`text-xs font-medium capitalize ml-auto ${confidenceColor[data.confidence] ?? "text-gray-400"}`}>
            {data.confidence} confidence
          </span>
        )}
      </div>

      <p className="text-sm text-gray-700 leading-relaxed">{data.explanation}</p>

      <div className="flex flex-wrap gap-4 pt-1 border-t border-gray-100 text-xs text-gray-400">
        {data.price_change_pct !== undefined && (
          <span>Price Δ since filing: <span className={`font-semibold ${data.price_change_pct >= 0 ? "text-green-600" : "text-red-500"}`}>
            {data.price_change_pct >= 0 ? "+" : ""}{data.price_change_pct}%
          </span></span>
        )}
        {data.volume_ratio !== undefined && (
          <span>Volume: <span className="font-semibold text-gray-600">{data.volume_ratio}× avg</span></span>
        )}
        {data.explained_at && (
          <span className="ml-auto">
            {new Date(data.explained_at).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Section: News ───────────────────────────────────────────────────────────

const SENTIMENT_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  positive: { bg: "bg-green-50 border-green-200",  text: "text-green-700",  dot: "bg-green-400" },
  neutral:  { bg: "bg-gray-50 border-gray-200",    text: "text-gray-500",   dot: "bg-gray-400"  },
  negative: { bg: "bg-red-50 border-red-200",      text: "text-red-700",    dot: "bg-red-400"   },
};

const IMPACT_STYLE: Record<string, string> = {
  high:   "bg-red-100 text-red-700",
  medium: "bg-yellow-100 text-yellow-700",
  low:    "bg-gray-100 text-gray-500",
};

const SOURCE_STYLE: Record<string, string> = {
  "Dawn Business":       "bg-blue-100 text-blue-700",
  "Express Tribune":     "bg-purple-100 text-purple-700",
  "Business Recorder":   "bg-amber-100 text-amber-700",
  "PSX Announcements":   "bg-green-100 text-green-700",
};

function NewsSection({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["company-news", id],
    queryFn: () => api.get(`/companies/${id}/news`).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const articles: any[] = data?.news ?? [];

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800 text-base">Latest News</h3>
        {articles.length > 0 && (
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
            {articles.length} articles
          </span>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && articles.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm space-y-1">
          <p>No news articles yet.</p>
          <p className="text-xs">News will appear here after the next rescan.</p>
        </div>
      )}

      {!isLoading && articles.length > 0 && (
        <div className="space-y-3">
          {articles.map((article: any) => {
            const sentimentKey = article.sentiment?.toLowerCase() ?? "neutral";
            const sentStyle = SENTIMENT_STYLE[sentimentKey] ?? SENTIMENT_STYLE.neutral;
            const sourceStyle = SOURCE_STYLE[article.source] ?? "bg-gray-100 text-gray-600";
            const impactStyle = IMPACT_STYLE[article.impact?.toLowerCase()] ?? "";

            return (
              <div
                key={article.id}
                className={`rounded-xl border p-4 space-y-2 ${sentStyle.bg}`}
              >
                {/* Badges row */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {/* Sentiment dot + label */}
                  <span className={`inline-flex items-center gap-1 text-xs font-medium ${sentStyle.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full inline-block ${sentStyle.dot}`} />
                    {article.sentiment ?? "neutral"}
                  </span>

                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sourceStyle}`}>
                    {article.source}
                  </span>

                  {article.impact && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${impactStyle}`}>
                      {article.impact} impact
                    </span>
                  )}

                  {article.category && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500 capitalize">
                      {article.category}
                    </span>
                  )}

                  {article.published_at && (
                    <span className="text-xs text-gray-400 ml-auto shrink-0">
                      {new Date(article.published_at).toLocaleDateString("en-PK", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </span>
                  )}
                </div>

                {/* Headline */}
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm font-semibold text-gray-800 hover:underline leading-snug"
                >
                  {article.headline} ↗
                </a>

                {/* AI summary */}
                {article.ai_summary && (
                  <p className="text-xs text-gray-600 leading-relaxed">{article.ai_summary}</p>
                )}

                {/* Other symbols mentioned */}
                {article.mentioned_symbols?.length > 1 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {article.mentioned_symbols.map((s: string) => (
                      <span key={s} className="text-xs font-mono bg-white bg-opacity-70 border border-gray-200 text-gray-500 px-1.5 py-0.5 rounded">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
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

  if (isError || !projection || status === "unavailable" || status === "failed" || status === "none") {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 text-center text-gray-400 text-sm">
        No projection yet — run a rescan to generate one.
      </div>
    );
  }

  const recStyle = RECOMMENDATION_STYLE[projection.recommendation] ?? "bg-gray-200 text-gray-700";

  return (
    <div className="bg-gradient-to-br from-green-50 to-blue-50 border border-green-200 rounded-2xl p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h3 className="font-semibold text-gray-800 text-lg">AI Projection</h3>
          <span className="text-xs text-gray-400 uppercase tracking-wide">
            {projection.target_quarter ? `Outlook: ${projection.target_quarter}` : "Next Quarter"}
          </span>
          {projection.generated_at && (
            <span className="text-xs text-gray-400">
              Generated: {new Date(projection.generated_at).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          )}
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
        {projection.projected_price_low != null ? (
          <div className="bg-white bg-opacity-70 rounded-xl p-3">
            <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Price Target</span>
            <span className="text-lg font-bold text-purple-700">
              PKR {Number(projection.projected_price_low).toFixed(2)} – {Number(projection.projected_price_high).toFixed(2)}
            </span>
            {projection.target_upside_min_pct != null && (
              <span className="text-xs text-gray-400 block mt-0.5">
                {projection.target_upside_min_pct > 0 ? "+" : ""}{projection.target_upside_min_pct}% to {projection.target_upside_max_pct > 0 ? "+" : ""}{projection.target_upside_max_pct}% upside
              </span>
            )}
            {projection.current_price_at_projection != null && (
              <span className="text-xs text-gray-400 block">vs PKR {Number(projection.current_price_at_projection).toFixed(2)} today</span>
            )}
          </div>
        ) : (projection.target_upside_min_pct != null || projection.target_upside_pct != null) ? (
          <div className="bg-white bg-opacity-70 rounded-xl p-3">
            <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Target Upside</span>
            <span className="text-lg font-bold text-purple-700">
              {projection.target_upside_min_pct != null
                ? `${projection.target_upside_min_pct > 0 ? "+" : ""}${projection.target_upside_min_pct}% – ${projection.target_upside_max_pct > 0 ? "+" : ""}${projection.target_upside_max_pct}%`
                : `${projection.target_upside_pct > 0 ? "+" : ""}${projection.target_upside_pct}%`
              }
            </span>
          </div>
        ) : (
          <div className="bg-white bg-opacity-70 rounded-xl p-3">
            <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Target Upside</span>
            <span className="text-lg font-bold text-gray-400">—</span>
            <span className="text-xs text-gray-400 block mt-0.5">Run rescan to generate</span>
          </div>
        )}
        {projection.projected_pe_low != null && (
          <div className="bg-white bg-opacity-70 rounded-xl p-3">
            <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Projected P/E</span>
            <span className={`text-lg font-bold ${
              projection.projected_pe_high < 15 ? 'text-green-600' :
              projection.projected_pe_high < 25 ? 'text-blue-600' :
              projection.projected_pe_high < 40 ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {Number(projection.projected_pe_low).toFixed(1)} – {Number(projection.projected_pe_high).toFixed(1)}
            </span>
            {projection.current_pe != null && (
              <span className="text-xs text-gray-400 block mt-0.5">
                vs {Number(projection.current_pe).toFixed(1)} today
              </span>
            )}
          </div>
        )}
      </div>

      {projection.next_quarter_outlook && (
        <p className="text-sm text-gray-700 leading-relaxed mb-5 bg-white bg-opacity-60 rounded-xl p-4">
          {projection.next_quarter_outlook}
        </p>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {Array.isArray(projection.key_catalysts) && projection.key_catalysts.length > 0 && (
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
        {Array.isArray(projection.key_risks) && projection.key_risks.length > 0 && (
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

  // After a rescan completes, supplementary jobs (macro risk, news, volume spike,
  // movement explanation) keep running in the queue after the filing is "done".
  // Poll company data for a 90-second window so those updates appear automatically.
  const [postScanPoll, setPostScanPoll] = useState(false);
  const prevPolling = useRef(false);
  useEffect(() => {
    if (prevPolling.current && !polling) {
      setPostScanPoll(true);
      const t = setTimeout(() => setPostScanPoll(false), 90_000);
      return () => clearTimeout(t);
    }
    prevPolling.current = polling;
  }, [polling]);

  // Load filings eagerly so header can use them for price context
  const { data: filingsData } = useQuery({
    queryKey: ["company-filings", id],
    queryFn: () => api.get(`/companies/${id}/filings`).then((r) => r.data),
  });
  const filings: any[] = filingsData?.filings ?? [];

  // Get symbol for price chart; poll briefly after a rescan to catch macro risk etc.
  const { data: companyData } = useQuery({
    queryKey: ["company", id],
    queryFn: () => api.get(`/companies/${id}`).then((r) => r.data),
    refetchInterval: postScanPoll ? 8_000 : false,
  });
  const symbol    = companyData?.company?.symbol;
  const company   = companyData?.company;
  const macroRisk = companyData?.macro_risk;

  return (
    <div className="space-y-6">
      <CompanyHeader id={id} polling={polling} setPolling={setPolling} filings={filings} />
      {company?.volume_analysis?.spike_detected && (
        <VolumeAlertBanner analysis={company.volume_analysis} />
      )}
      {macroRisk && <MacroRiskCard macroRisk={macroRisk} />}
      <LazySection placeholderHeight="h-80">
        <PriceHistorySection id={id} symbol={symbol} />
      </LazySection>
      <LazySection placeholderHeight="h-96">
        <FilingsSection id={id} polling={polling} setPolling={setPolling} />
      </LazySection>
      {filings.length > 0 && (
        <ProjectionSection id={id} polling={polling} />
      )}
      {company?.movement_explanation && (
        <MovementExplanationSection data={company.movement_explanation} />
      )}
      <LazySection placeholderHeight="h-64">
        <NewsSection id={id} />
      </LazySection>
    </div>
  );
}
