"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import api from "@/lib/api";

const PERIODS = ["1W", "1M", "3M", "6M", "1Y", "5Y"] as const;
type Period = (typeof PERIODS)[number];

function fmt(n: number) {
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toFixed(0);
}

function fmtVol(n: number) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toFixed(0);
}

function fmtDate(dateStr: string, period: Period) {
  const d = new Date(dateStr);
  if (period === "1W") return d.toLocaleDateString("en-PK", { weekday: "short", day: "numeric" });
  if (period === "1M") return d.toLocaleDateString("en-PK", { day: "numeric", month: "short" });
  return d.toLocaleDateString("en-PK", { month: "short", day: "numeric" });
}

interface DataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface KSEData {
  current: number;
  change: number;
  change_pct: number;
  data: DataPoint[];
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d: DataPoint = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-900 mb-1">
        {new Date(d.date).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}
      </p>
      <div className="space-y-0.5 text-gray-600">
        <p>Close: <span className="font-bold text-gray-900">{d.close.toLocaleString("en-PK", { maximumFractionDigits: 0 })}</span></p>
        <p>Open: {d.open.toLocaleString("en-PK", { maximumFractionDigits: 0 })}</p>
        <p>High: <span className="text-green-600">{d.high.toLocaleString("en-PK", { maximumFractionDigits: 0 })}</span></p>
        <p>Low: <span className="text-red-500">{d.low.toLocaleString("en-PK", { maximumFractionDigits: 0 })}</span></p>
        {d.volume != null && (
          <p className="mt-1 border-t border-gray-100 pt-1">
            Vol: <span className="font-semibold text-blue-600">{fmtVol(d.volume)}</span>
          </p>
        )}
      </div>
    </div>
  );
}

export default function KSE100Chart() {
  const [period, setPeriod] = useState<Period>("3M");

  const { data, isLoading, isError } = useQuery<KSEData>({
    queryKey: ["kse100", period],
    queryFn: () => api.get(`/market/kse100?period=${period}`).then((r) => r.data),
    staleTime: 30 * 60 * 1000,
  });

  const isUp = (data?.change ?? 0) >= 0;

  // Tick reduction: show ~6 labels regardless of data density
  const ticks = (() => {
    if (!data?.data.length) return [];
    const pts = data.data;
    const step = Math.max(1, Math.floor(pts.length / 6));
    return pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map((p) => p.date);
  })();

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-gray-900">KSE-100</h2>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Pakistan Stock Exchange</span>
          </div>
          {isLoading ? (
            <div className="mt-1 h-8 w-48 bg-gray-100 animate-pulse rounded" />
          ) : data ? (
            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-3xl font-bold text-gray-900 tabular-nums">
                {data.current.toLocaleString("en-PK", { maximumFractionDigits: 0 })}
              </span>
              <span className={`text-sm font-semibold ${isUp ? "text-green-600" : "text-red-500"}`}>
                {isUp ? "▲" : "▼"}{" "}
                {Math.abs(data.change).toLocaleString("en-PK", { maximumFractionDigits: 0 })}
                {" "}({isUp ? "+" : ""}{data.change_pct}%)
              </span>
            </div>
          ) : null}
        </div>

        {/* Period selector */}
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                period === p
                  ? "bg-green-700 text-white"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {isLoading ? (
        <div className="h-48 bg-gray-50 rounded-xl animate-pulse" />
      ) : isError ? (
        <div className="h-48 flex items-center justify-center text-sm text-gray-400">
          Unable to load KSE-100 data
        </div>
      ) : data?.data.length ? (
        <>
          {/* Price chart */}
          <ResponsiveContainer width="100%" height={168}>
            <ComposedChart data={data.data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="kseGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={isUp ? "#16a34a" : "#ef4444"} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={isUp ? "#16a34a" : "#ef4444"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis
                dataKey="date"
                ticks={ticks}
                tickFormatter={(v) => fmtDate(v, period)}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => fmt(v)}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                width={48}
                domain={["auto", "auto"]}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="close"
                stroke={isUp ? "#16a34a" : "#ef4444"}
                strokeWidth={2}
                fill="url(#kseGrad)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Volume chart */}
          {data.data.some((d) => d.volume != null) && (
            <div className="mt-1">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Volume</span>
              </div>
              <ResponsiveContainer width="100%" height={56}>
                <ComposedChart data={data.data} margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
                  <XAxis dataKey="date" hide />
                  <YAxis
                    tickFormatter={(v) => fmtVol(v)}
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                    tickCount={3}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const vol = payload[0]?.value as number | null;
                      if (vol == null) return null;
                      return (
                        <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-2.5 py-1.5 text-xs">
                          <span className="text-gray-500">Vol: </span>
                          <span className="font-semibold text-blue-600">{fmtVol(vol)}</span>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="volume" fill="#3b82f6" opacity={0.45} radius={[1, 1, 0, 0]} maxBarSize={8} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
