"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
  ScatterChart, Scatter, ZAxis, LineChart, Line,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  Brush, ReferenceLine,
} from "recharts";

type SectorStat = {
  sector: string;
  company_count: number;
  scored_count: number;
  avg_score: number | null;
  top_score: number | null;
  top_company_symbol: string | null;
  top_company_name: string | null;
  defaulter_count: number;
  sharia_count: number;
  avg_macro_risk: number | null;
  macro_count: number;
  avg_price: number | null;
  combined_performance: number | null;
  trend: 'growing' | 'declining' | 'stable' | null;
  price_count: number;
  total_volume: number;
  avg_volume: number | null;
  volume_count: number;
  activity_volume: number;
  avg_pe: number | null;
  min_pe: number | null;
  max_pe: number | null;
  pe_count: number;
};

type TrendDataPoint = {
  date: string;
  avg_score: number | null;
  avg_macro_risk: number | null;
  combined_performance: number | null;
  activity_volume: number;
  score_count: number;
  macro_count: number;
};

type SectorTrend = {
  sector: string;
  data: TrendDataPoint[];
};

type TrendsResponse = {
  sectors: SectorTrend[];
  date_range: {
    requested_start: string;
    requested_end: string;
    actual_start: string | null;
    actual_end: string;
    days_requested: number;
  };
};

function getRecommendation(avg: number | null) {
  if (avg === null) return { label: "No Data", cls: "bg-gray-300 text-gray-700", rationale: "Insufficient scored filings." };
  if (avg >= 70) return { label: "Strong Buy", cls: "bg-green-700 text-white", rationale: "Exceptional sector performance with strong growth signals across companies." };
  if (avg >= 55) return { label: "Buy", cls: "bg-green-500 text-white", rationale: "Solid fundamentals — above-average risk-reward for investors." };
  if (avg >= 40) return { label: "Hold", cls: "bg-yellow-400 text-yellow-900", rationale: "Mixed signals. Selective stock-picking advised." };
  if (avg >= 25) return { label: "Underweight", cls: "bg-orange-500 text-white", rationale: "Sector underperforming. Reduce exposure cautiously." };
  return { label: "Avoid", cls: "bg-red-600 text-white", rationale: "Significant weakness across sector. Avoid new positions." };
}

function scoreBarColor(score: number | null): string {
  if (score === null) return "#d1d5db";
  if (score >= 70) return "#15803d";
  if (score >= 55) return "#22c55e";
  if (score >= 40) return "#eab308";
  if (score >= 25) return "#f97316";
  return "#dc2626";
}

function scoreTextColor(score: number | null): string {
  if (score === null) return "text-gray-400";
  if (score >= 70) return "text-green-700";
  if (score >= 55) return "text-green-500";
  if (score >= 40) return "text-yellow-600";
  if (score >= 25) return "text-orange-500";
  return "text-red-600";
}

export default function SectorsPage() {
  const { data: stats, isLoading } = useQuery<SectorStat[]>({
    queryKey: ["sectors-stats"],
    queryFn: () => api.get("/sectors-stats").then((r) => r.data),
    staleTime: 5 * 60_000,
  });

  // Lazy-load trends: only fetch when the section scrolls into view
  const trendsSectionRef = useRef<HTMLDivElement>(null);
  const [trendsEnabled, setTrendsEnabled] = useState(false);

  useEffect(() => {
    const el = trendsSectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTrendsEnabled(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { data: trendsData, isLoading: trendsLoading } = useQuery<TrendsResponse>({
    queryKey: ["sectors-trends", 30],
    queryFn: () => api.get("/sectors-trends?days=30").then((r) => r.data),
    staleTime: 5 * 60_000,
    enabled: trendsEnabled,
  });

  const { data: kse100Data } = useQuery<{ current: number; change: number; change_pct: number; data: { date: string; close: number }[] }>({
    queryKey: ["kse100", "1M"],
    queryFn: () => api.get("/market/kse100?period=1M").then((r) => r.data),
    staleTime: 30 * 60_000,
    enabled: trendsEnabled,
  });

  const trends = trendsData?.sectors;
  const dateRange = trendsData?.date_range;

  const chartData = (stats ?? [])
    .filter((s) => s.avg_score !== null)
    .slice(0, 20);

  // Scatter plot data: company count vs average score
  const scatterData = (stats ?? [])
    .filter((s) => s.avg_score !== null)
    .map((s) => ({
      sector: s.sector,
      companyCount: s.company_count,
      avgScore: s.avg_score,
      z: s.scored_count, // bubble size
    }));

  // Pie chart: top 10 sectors by company count
  const pieData = (stats ?? [])
    .sort((a, b) => b.company_count - a.company_count)
    .slice(0, 10)
    .map((s) => ({
      name: s.sector.length > 25 ? s.sector.slice(0, 25) + "..." : s.sector,
      value: s.company_count,
    }));

  // Coverage data: scored vs unscored
  const coverageData = (stats ?? [])
    .filter((s) => s.company_count > 0)
    .slice(0, 15)
    .map((s) => ({
      sector: s.sector.length > 20 ? s.sector.slice(0, 20) + "..." : s.sector,
      scored: s.scored_count,
      unscored: s.company_count - s.scored_count,
    }));

  // Defaulters vs Sharia
  const complianceData = (stats ?? [])
    .filter((s) => s.defaulter_count > 0 || s.sharia_count > 0)
    .slice(0, 12)
    .map((s) => ({
      sector: s.sector.length > 20 ? s.sector.slice(0, 20) + "..." : s.sector,
      defaulters: s.defaulter_count,
      sharia: s.sharia_count,
    }));

  // Performance distribution
  const perfDistribution = [
    { category: "Strong Buy (70+)", count: (stats ?? []).filter(s => s.avg_score && s.avg_score >= 70).length },
    { category: "Buy (55-69)", count: (stats ?? []).filter(s => s.avg_score && s.avg_score >= 55 && s.avg_score < 70).length },
    { category: "Hold (40-54)", count: (stats ?? []).filter(s => s.avg_score && s.avg_score >= 40 && s.avg_score < 55).length },
    { category: "Underweight (25-39)", count: (stats ?? []).filter(s => s.avg_score && s.avg_score >= 25 && s.avg_score < 40).length },
    { category: "Avoid (<25)", count: (stats ?? []).filter(s => s.avg_score && s.avg_score < 25).length },
  ].filter(d => d.count > 0);

  // Radar chart: top 5 sectors
  const radarData = (stats ?? [])
    .filter((s) => s.avg_score !== null)
    .slice(0, 5)
    .map((s) => ({
      sector: s.sector.length > 15 ? s.sector.slice(0, 15) + "..." : s.sector,
      score: s.avg_score,
      coverage: s.company_count > 0 ? (s.scored_count / s.company_count) * 100 : 0,
      sharia: s.company_count > 0 ? (s.sharia_count / s.company_count) * 100 : 0,
    }));

  const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8", "#82CA9D", "#FFC658", "#8DD1E1", "#A4DE6C", "#D0ED57"];

  // Performance highlights
  const growingSectors = (stats ?? [])
    .filter((s) => s.trend === 'growing' && s.combined_performance !== null)
    .sort((a, b) => (b.combined_performance || 0) - (a.combined_performance || 0));

  const decliningSectors = (stats ?? [])
    .filter((s) => s.trend === 'declining' && s.combined_performance !== null)
    .sort((a, b) => (a.combined_performance || 0) - (b.combined_performance || 0));

  const stableSectors = (stats ?? [])
    .filter((s) => s.trend === 'stable' && s.combined_performance !== null);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Sectors</h1>
      <p className="text-gray-500 text-sm mb-6">
        PSX sector performance overview — ranked by total trading volume
      </p>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse bg-gray-100 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {/* Performance Highlights */}
          <div className="grid gap-6 md:grid-cols-3 mb-6">
            {/* Growing Sectors */}
            <Card className="p-5 bg-gradient-to-br from-green-50 to-white border-green-200">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-green-900">Growing Sectors</h3>
                  <p className="text-xs text-green-600">{growingSectors.length} sectors trending up</p>
                </div>
              </div>
              <div className="space-y-2">
                {growingSectors.map((s) => (
                  <Link key={s.sector} href={`/sectors/${encodeURIComponent(s.sector)}`}>
                    <div className="flex justify-between items-center p-2 rounded hover:bg-green-100 transition-colors cursor-pointer">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{s.sector}</p>
                        <p className="text-xs text-gray-500">
                          {s.company_count} companies • Macro: {s.avg_macro_risk ?? 'N/A'}
                          {s.avg_pe !== null && (
                            <> • <span className={`font-semibold ${
                              s.avg_pe < 15 ? 'text-green-600' :
                              s.avg_pe < 25 ? 'text-blue-600' :
                              s.avg_pe < 40 ? 'text-yellow-600' : 'text-red-600'
                            }`}>P/E {s.avg_pe.toFixed(1)}</span></>
                          )}
                        </p>
                      </div>
                      <div className="ml-2 text-right shrink-0">
                        <p className="text-lg font-bold text-green-700">{s.combined_performance}</p>
                        <p className="text-xs text-green-600">↑ Growing</p>
                      </div>
                    </div>
                  </Link>
                ))}
                {growingSectors.length === 0 && (
                  <p className="text-sm text-gray-500 py-4 text-center">No growing sectors</p>
                )}
              </div>
            </Card>

            {/* Declining Sectors */}
            <Card className="p-5 bg-gradient-to-br from-red-50 to-white border-red-200">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-red-900">Declining Sectors</h3>
                  <p className="text-xs text-red-600">{decliningSectors.length} sectors trending down</p>
                </div>
              </div>
              <div className="space-y-2">
                {decliningSectors.map((s) => (
                  <Link key={s.sector} href={`/sectors/${encodeURIComponent(s.sector)}`}>
                    <div className="flex justify-between items-center p-2 rounded hover:bg-red-100 transition-colors cursor-pointer">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{s.sector}</p>
                        <p className="text-xs text-gray-500">
                          {s.company_count} companies • Macro: {s.avg_macro_risk ?? 'N/A'}
                          {s.avg_pe !== null && (
                            <> • <span className={`font-semibold ${
                              s.avg_pe < 15 ? 'text-green-600' :
                              s.avg_pe < 25 ? 'text-blue-600' :
                              s.avg_pe < 40 ? 'text-yellow-600' : 'text-red-600'
                            }`}>P/E {s.avg_pe.toFixed(1)}</span></>
                          )}
                        </p>
                      </div>
                      <div className="ml-2 text-right shrink-0">
                        <p className="text-lg font-bold text-red-700">{s.combined_performance}</p>
                        <p className="text-xs text-red-600">↓ Declining</p>
                      </div>
                    </div>
                  </Link>
                ))}
                {decliningSectors.length === 0 && (
                  <p className="text-sm text-gray-500 py-4 text-center">No declining sectors</p>
                )}
              </div>
            </Card>

            {/* Stable Sectors */}
            <Card className="p-5 bg-gradient-to-br from-blue-50 to-white border-blue-200">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-blue-900">Stable Sectors</h3>
                  <p className="text-xs text-blue-600">{stableSectors.length} sectors holding steady</p>
                </div>
              </div>
              <div className="space-y-2">
                {stableSectors.map((s) => (
                  <Link key={s.sector} href={`/sectors/${encodeURIComponent(s.sector)}`}>
                    <div className="flex justify-between items-center p-2 rounded hover:bg-blue-100 transition-colors cursor-pointer">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{s.sector}</p>
                        <p className="text-xs text-gray-500">
                          {s.company_count} companies • Macro: {s.avg_macro_risk ?? 'N/A'}
                          {s.avg_pe !== null && (
                            <> • <span className={`font-semibold ${
                              s.avg_pe < 15 ? 'text-green-600' :
                              s.avg_pe < 25 ? 'text-blue-600' :
                              s.avg_pe < 40 ? 'text-yellow-600' : 'text-red-600'
                            }`}>P/E {s.avg_pe.toFixed(1)}</span></>
                          )}
                        </p>
                      </div>
                      <div className="ml-2 text-right shrink-0">
                        <p className="text-lg font-bold text-blue-700">{s.combined_performance}</p>
                        <p className="text-xs text-blue-600">→ Stable</p>
                      </div>
                    </div>
                  </Link>
                ))}
                {stableSectors.length === 0 && (
                  <p className="text-sm text-gray-500 py-4 text-center">No stable sectors</p>
                )}
              </div>
            </Card>
          </div>

          {/* Time Series Charts — lazy loaded when scrolled into view */}
          <div ref={trendsSectionRef}>
          {trendsEnabled && trendsLoading && (
            <div className="grid gap-6 md:grid-cols-2 mb-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-96 animate-pulse bg-gray-100 rounded-2xl" />
              ))}
            </div>
          )}
          {!trendsLoading && trends && trends.length > 0 && (
            <>
              {dateRange && dateRange.actual_start && (
                <Card className="p-4 mb-6 bg-blue-50 border-blue-200">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-sm">
                      <span className="font-semibold text-blue-900">Available Data Range:</span>
                      <span className="ml-2 text-blue-700">
                        {new Date(dateRange.actual_start).toLocaleDateString()} - {new Date(dateRange.actual_end).toLocaleDateString()}
                      </span>
                      <span className="ml-2 text-blue-600">
                        ({Math.ceil((new Date(dateRange.actual_end).getTime() - new Date(dateRange.actual_start).getTime()) / (1000 * 60 * 60 * 24))} days of data)
                      </span>
                    </div>
                  </div>
                </Card>
              )}
              <div className="grid gap-6 md:grid-cols-2 mb-6">
              {/* Combined Performance Trends - All Sectors */}
              {(() => {
                const allSectors = (stats ?? [])
                  .filter((s) => s.combined_performance !== null)
                  .map((s) => s.sector);

                const perfTrendData = trends
                  .filter((t) => allSectors.includes(t.sector))
                  .flatMap((t) =>
                    t.data.map((d) => ({
                      date: d.date,
                      sector: t.sector,
                      value: d.combined_performance,
                    }))
                  )
                  .reduce((acc, curr) => {
                    const existing = acc.find((item) => item.date === curr.date);
                    if (existing) {
                      existing[curr.sector] = curr.value;
                    } else {
                      acc.push({ date: curr.date, [curr.sector]: curr.value });
                    }
                    return acc;
                  }, [] as any[]);

                const generateColor = (index: number) => {
                  const hue = (index * 137.508) % 360;
                  return `hsl(${hue}, 70%, 50%)`;
                };

                return perfTrendData.length > 0 && (
                  <Card className="p-5">
                    <h2 className="text-sm font-semibold text-gray-700 mb-4">
                      Combined Performance Trends (1 Month) - All Sectors
                      <span className="ml-2 text-xs text-gray-500">(Drag slider to zoom)</span>
                    </h2>
                    <ResponsiveContainer width="100%" height={450}>
                      <LineChart data={perfTrendData} margin={{ left: 8, right: 20, top: 10, bottom: 60 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10 }}
                          angle={-45}
                          textAnchor="end"
                          height={60}
                          tickFormatter={(value) => {
                            const d = new Date(value);
                            return `${d.getMonth() + 1}/${d.getDate()}`;
                          }}
                        />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip
                          labelFormatter={(value) => new Date(value).toLocaleDateString()}
                          contentStyle={{ fontSize: "11px" }}
                        />
                        <Legend wrapperStyle={{ fontSize: "10px", maxHeight: "100px", overflowY: "auto" }} />
                        <Brush
                          dataKey="date"
                          height={30}
                          stroke="#8884d8"
                          tickFormatter={(value) => {
                            const d = new Date(value);
                            return `${d.getMonth() + 1}/${d.getDate()}`;
                          }}
                        />
                        {allSectors.map((sector, idx) => (
                          <Line
                            key={sector}
                            type="monotone"
                            dataKey={sector}
                            stroke={generateColor(idx)}
                            strokeWidth={1.5}
                            dot={false}
                            name={sector.length > 25 ? sector.slice(0, 25) + "..." : sector}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </Card>
                );
              })()}

              {/* Activity Volume Trends - All Sectors */}
              {(() => {
                const allActivity = (stats ?? [])
                  .filter((s) => s.activity_volume > 0)
                  .map((s) => s.sector);

                const activityTrendData = trends
                  .filter((t) => allActivity.includes(t.sector))
                  .flatMap((t) =>
                    t.data.map((d) => ({
                      date: d.date,
                      sector: t.sector,
                      value: d.activity_volume,
                    }))
                  )
                  .reduce((acc, curr) => {
                    const existing = acc.find((item) => item.date === curr.date);
                    if (existing) {
                      existing[curr.sector] = curr.value;
                    } else {
                      acc.push({ date: curr.date, [curr.sector]: curr.value });
                    }
                    return acc;
                  }, [] as any[]);

                const generateColor = (index: number) => {
                  const hue = (index * 137.508) % 360;
                  return `hsl(${hue}, 70%, 50%)`;
                };

                return activityTrendData.length > 0 && (
                  <Card className="p-5">
                    <h2 className="text-sm font-semibold text-gray-700 mb-4">
                      Activity Volume Trends (1 Month) - All Sectors
                      <span className="ml-2 text-xs text-gray-500">(Drag slider to zoom)</span>
                    </h2>
                    <ResponsiveContainer width="100%" height={450}>
                      <LineChart data={activityTrendData} margin={{ left: 8, right: 20, top: 10, bottom: 60 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10 }}
                          angle={-45}
                          textAnchor="end"
                          height={60}
                          tickFormatter={(value) => {
                            const d = new Date(value);
                            return `${d.getMonth() + 1}/${d.getDate()}`;
                          }}
                        />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip
                          labelFormatter={(value) => new Date(value).toLocaleDateString()}
                          contentStyle={{ fontSize: "11px" }}
                        />
                        <Legend wrapperStyle={{ fontSize: "10px", maxHeight: "100px", overflowY: "auto" }} />
                        <Brush
                          dataKey="date"
                          height={30}
                          stroke="#8884d8"
                          tickFormatter={(value) => {
                            const d = new Date(value);
                            return `${d.getMonth() + 1}/${d.getDate()}`;
                          }}
                        />
                        {allActivity.map((sector, idx) => (
                          <Line
                            key={sector}
                            type="monotone"
                            dataKey={sector}
                            stroke={generateColor(idx)}
                            strokeWidth={1.5}
                            dot={false}
                            name={sector.length > 25 ? sector.slice(0, 25) + "..." : sector}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </Card>
                );
              })()}

              {/* Macro Risk Trends - All Sectors */}
              {(() => {
                const allMacro = (stats ?? [])
                  .filter((s) => s.avg_macro_risk !== null)
                  .map((s) => s.sector);

                const macroTrendData = trends
                  .filter((t) => allMacro.includes(t.sector))
                  .flatMap((t) =>
                    t.data.map((d) => ({
                      date: d.date,
                      sector: t.sector,
                      value: d.avg_macro_risk,
                    }))
                  )
                  .reduce((acc, curr) => {
                    const existing = acc.find((item) => item.date === curr.date);
                    if (existing) {
                      existing[curr.sector] = curr.value;
                    } else {
                      acc.push({ date: curr.date, [curr.sector]: curr.value });
                    }
                    return acc;
                  }, [] as any[]);

                const generateColor = (index: number) => {
                  const hue = (index * 137.508) % 360;
                  return `hsl(${hue}, 70%, 50%)`;
                };

                return macroTrendData.length > 0 && (
                  <Card className="p-5">
                    <h2 className="text-sm font-semibold text-gray-700 mb-4">
                      Macro Risk Trends (1 Month) - All Sectors
                      <span className="ml-2 text-xs text-gray-500">(Drag slider to zoom)</span>
                    </h2>
                    <ResponsiveContainer width="100%" height={450}>
                      <LineChart data={macroTrendData} margin={{ left: 8, right: 20, top: 10, bottom: 60 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10 }}
                          angle={-45}
                          textAnchor="end"
                          height={60}
                          tickFormatter={(value) => {
                            const d = new Date(value);
                            return `${d.getMonth() + 1}/${d.getDate()}`;
                          }}
                        />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip
                          labelFormatter={(value) => new Date(value).toLocaleDateString()}
                          contentStyle={{ fontSize: "11px" }}
                        />
                        <Legend wrapperStyle={{ fontSize: "10px", maxHeight: "100px", overflowY: "auto" }} />
                        <Brush
                          dataKey="date"
                          height={30}
                          stroke="#8884d8"
                          tickFormatter={(value) => {
                            const d = new Date(value);
                            return `${d.getMonth() + 1}/${d.getDate()}`;
                          }}
                        />
                        {allMacro.map((sector, idx) => (
                          <Line
                            key={sector}
                            type="monotone"
                            dataKey={sector}
                            stroke={generateColor(idx)}
                            strokeWidth={1.5}
                            dot={false}
                            name={sector.length > 25 ? sector.slice(0, 25) + "..." : sector}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </Card>
                );
              })()}

              {/* AI Score Trends - All Sectors */}
              {(() => {
                const allScores = (stats ?? [])
                  .filter((s) => s.avg_score !== null)
                  .map((s) => s.sector);

                const scoreTrendData = trends
                  .filter((t) => allScores.includes(t.sector))
                  .flatMap((t) =>
                    t.data.map((d) => ({
                      date: d.date,
                      sector: t.sector,
                      value: d.avg_score,
                    }))
                  )
                  .reduce((acc, curr) => {
                    const existing = acc.find((item) => item.date === curr.date);
                    if (existing) {
                      existing[curr.sector] = curr.value;
                    } else {
                      acc.push({ date: curr.date, [curr.sector]: curr.value });
                    }
                    return acc;
                  }, [] as any[]);

                const generateColor = (index: number) => {
                  const hue = (index * 137.508) % 360;
                  return `hsl(${hue}, 70%, 50%)`;
                };

                return scoreTrendData.length > 0 && (
                  <Card className="p-5">
                    <h2 className="text-sm font-semibold text-gray-700 mb-4">
                      AI Score Trends (1 Month) - All Sectors
                      <span className="ml-2 text-xs text-gray-500">(Drag slider to zoom)</span>
                    </h2>
                    <ResponsiveContainer width="100%" height={450}>
                      <LineChart data={scoreTrendData} margin={{ left: 8, right: 20, top: 10, bottom: 60 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10 }}
                          angle={-45}
                          textAnchor="end"
                          height={60}
                          tickFormatter={(value) => {
                            const d = new Date(value);
                            return `${d.getMonth() + 1}/${d.getDate()}`;
                          }}
                        />
                        <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                        <Tooltip
                          labelFormatter={(value) => new Date(value).toLocaleDateString()}
                          contentStyle={{ fontSize: "11px" }}
                        />
                        <Legend wrapperStyle={{ fontSize: "10px", maxHeight: "100px", overflowY: "auto" }} />
                        <Brush
                          dataKey="date"
                          height={30}
                          stroke="#8884d8"
                          tickFormatter={(value) => {
                            const d = new Date(value);
                            return `${d.getMonth() + 1}/${d.getDate()}`;
                          }}
                        />
                        {allScores.map((sector, idx) => (
                          <Line
                            key={sector}
                            type="monotone"
                            dataKey={sector}
                            stroke={generateColor(idx)}
                            strokeWidth={1.5}
                            dot={false}
                            name={sector.length > 25 ? sector.slice(0, 25) + "..." : sector}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </Card>
                );
              })()}
              </div>
            </>
          )}
          </div>

          {/* Sector AI Score vs KSE-100 Index */}
          {trendsEnabled && !trendsLoading && trends && trends.length > 0 && kse100Data && (() => {
            const ksePoints = kse100Data.data;
            if (ksePoints.length === 0) return null;
            const kseFirstClose = ksePoints[0].close;

            const topSectors = (stats ?? [])
              .filter((s) => s.combined_performance !== null && s.combined_performance > 0)
              .sort((a, b) => (b.combined_performance ?? 0) - (a.combined_performance ?? 0))
              .slice(0, 8)
              .map((s) => s.sector);

            const sectorDataMap: Record<string, Record<string, number>> = {};
            trends
              .filter((t) => topSectors.includes(t.sector))
              .forEach((t) => {
                const first = t.data.find((d) => d.combined_performance !== null && d.combined_performance > 0);
                if (!first) return;
                const base = first.combined_performance!;
                sectorDataMap[t.sector] = {};
                t.data.forEach((d) => {
                  if (d.combined_performance !== null) {
                    sectorDataMap[t.sector][d.date] = (d.combined_performance / base) * 100;
                  }
                });
              });

            const sectorLast: Record<string, number | undefined> = {};
            const chartData = ksePoints.map((kp) => {
              const row: Record<string, any> = {
                date: kp.date,
                "KSE-100": Math.round((kp.close / kseFirstClose) * 10000) / 100,
              };
              topSectors.forEach((sector) => {
                if (sectorDataMap[sector]?.[kp.date] !== undefined) {
                  sectorLast[sector] = sectorDataMap[sector][kp.date];
                }
                if (sectorLast[sector] !== undefined) {
                  row[sector] = Math.round(sectorLast[sector]! * 100) / 100;
                }
              });
              return row;
            });

            const lastRow = chartData[chartData.length - 1] ?? {};
            const kseEnd = lastRow["KSE-100"] as number;
            const perf = topSectors
              .map((sector) => ({
                sector,
                value: lastRow[sector] as number | undefined,
                diff: lastRow[sector] != null ? (lastRow[sector] as number) - kseEnd : null,
              }))
              .filter((p) => p.value != null && p.diff != null)
              .sort((a, b) => (b.diff ?? 0) - (a.diff ?? 0));

            const outperforming = perf.filter((p) => (p.diff ?? 0) > 0);
            const underperforming = perf.filter((p) => (p.diff ?? 0) <= 0);
            const genColor = (i: number) => `hsl(${(i * 137.508) % 360}, 70%, 50%)`;

            return (
              <Card className="p-5 mb-6">
                <div className="mb-4">
                  <h2 className="text-sm font-semibold text-gray-700">
                    Sector AI Score vs KSE-100 Index — Last 30 Days
                  </h2>
                  <p className="text-xs text-gray-400 mt-1">
                    Both normalized to 100 at period start. Sector lines <span className="font-medium text-gray-600">above</span> KSE-100 (black) show AI fundamentals improving faster than the market index.
                  </p>
                </div>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={chartData} margin={{ left: 8, right: 16, top: 8, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      angle={-40}
                      textAnchor="end"
                      height={60}
                      tickFormatter={(v) => {
                        const d = new Date(v);
                        return `${d.getMonth() + 1}/${d.getDate()}`;
                      }}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      width={50}
                      tickFormatter={(v) => `${Number(v).toFixed(0)}`}
                    />
                    <ReferenceLine
                      y={100}
                      stroke="#9ca3af"
                      strokeDasharray="4 3"
                      label={{ value: "base", position: "insideTopLeft", fontSize: 10, fill: "#9ca3af" }}
                    />
                    <Tooltip
                      labelFormatter={(v) =>
                        new Date(v).toLocaleDateString("en-PK", { day: "numeric", month: "short" })
                      }
                      formatter={(val: any, name: any) => [
                        `${Number(val).toFixed(1)}`,
                        name === "KSE-100" ? "📈 KSE-100 Index" : name,
                      ]}
                      contentStyle={{ fontSize: "11px" }}
                    />
                    <Legend wrapperStyle={{ fontSize: "10px", maxHeight: "80px", overflowY: "auto" }} />
                    <Line
                      type="monotone"
                      dataKey="KSE-100"
                      stroke="#111827"
                      strokeWidth={2.5}
                      dot={false}
                      name="KSE-100 Index"
                    />
                    {topSectors.map((sector, idx) => (
                      <Line
                        key={sector}
                        type="monotone"
                        dataKey={sector}
                        stroke={genColor(idx)}
                        strokeWidth={1.5}
                        dot={false}
                        connectNulls
                        name={sector.length > 28 ? sector.slice(0, 28) + "…" : sector}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
                {perf.length > 0 && (
                  <div className="grid grid-cols-2 gap-6 mt-4 pt-4 border-t border-gray-100">
                    <div>
                      <p className="text-xs font-semibold text-green-700 mb-2">↑ Outperforming KSE-100</p>
                      {outperforming.length === 0 ? (
                        <p className="text-xs text-gray-400">None this period</p>
                      ) : (
                        <div className="space-y-1">
                          {outperforming.map((p) => (
                            <div key={p.sector} className="flex justify-between items-center text-xs">
                              <span className="text-gray-700 truncate max-w-[200px]">{p.sector}</span>
                              <span className="text-green-600 font-semibold ml-2 shrink-0">+{p.diff!.toFixed(1)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-red-600 mb-2">↓ Underperforming KSE-100</p>
                      {underperforming.length === 0 ? (
                        <p className="text-xs text-gray-400">None this period</p>
                      ) : (
                        <div className="space-y-1">
                          {underperforming.map((p) => (
                            <div key={p.sector} className="flex justify-between items-center text-xs">
                              <span className="text-gray-700 truncate max-w-[200px]">{p.sector}</span>
                              <span className="text-red-500 font-semibold ml-2 shrink-0">{p.diff!.toFixed(1)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })()}

          {/* Trading Volume by Sector */}
          {(() => {
            const tradingVolumeData = (stats ?? [])
              .filter((s) => s.total_volume > 0)
              .map((s) => ({
                sector: s.sector.length > 20 ? s.sector.slice(0, 20) + "..." : s.sector,
                volume: s.total_volume,
                companies: s.volume_count,
              }))
              .sort((a, b) => b.volume - a.volume)
              .slice(0, 15);

            return tradingVolumeData.length > 0 && (
              <Card className="p-5 mb-6">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">
                  Trading Volume by Sector (PSX Data)
                </h2>
                <ResponsiveContainer width="100%" height={Math.max(300, tradingVolumeData.length * 25)}>
                  <BarChart
                    data={tradingVolumeData}
                    layout="vertical"
                    margin={{ left: 8, right: 32, top: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`}
                    />
                    <YAxis
                      type="category"
                      dataKey="sector"
                      tick={{ fontSize: 11 }}
                      width={160}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(v, name) => {
                        if (name === "volume") return [(v as number).toLocaleString(), "Volume"];
                        return [v, name];
                      }}
                      cursor={{ fill: "#f3f4f6" }}
                    />
                    <Bar dataKey="volume" fill="#10b981" radius={[0, 4, 4, 0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            );
          })()}

          {/* Sector Score Over Time — line chart by date */}
          {(() => {
            if (!trendsEnabled) return null;
            if (trendsLoading) return (
              <div className="h-80 animate-pulse bg-gray-100 rounded-2xl mb-6" />
            );
            if (!trends || trends.length === 0) return null;

            // Top 10 sectors by avg_score
            const topSectors = (stats ?? [])
              .filter((s) => s.avg_score !== null)
              .sort((a, b) => (b.avg_score ?? 0) - (a.avg_score ?? 0))
              .slice(0, 10)
              .map((s) => s.sector);

            const lineData = trends
              .filter((t) => topSectors.includes(t.sector))
              .flatMap((t) =>
                t.data.map((d) => ({
                  date: d.date,
                  sector: t.sector,
                  value: d.avg_score,
                }))
              )
              .reduce((acc, curr) => {
                const existing = acc.find((item) => item.date === curr.date);
                if (existing) {
                  existing[curr.sector] = curr.value;
                } else {
                  acc.push({ date: curr.date, [curr.sector]: curr.value });
                }
                return acc;
              }, [] as any[])
              .sort((a: any, b: any) => a.date.localeCompare(b.date));

            const generateColor = (index: number) => {
              const hue = (index * 137.508) % 360;
              return `hsl(${hue}, 65%, 48%)`;
            };

            if (lineData.length === 0) return null;

            return (
              <Card className="p-5 mb-6">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <h2 className="text-sm font-semibold text-gray-700">
                    Sector Score Over Time — Top 10 Sectors (1 Year)
                  </h2>
                  <span className="text-xs text-gray-400">Drag slider to zoom</span>
                </div>
                <ResponsiveContainer width="100%" height={380}>
                  <LineChart data={lineData} margin={{ left: 8, right: 16, top: 8, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      angle={-40}
                      textAnchor="end"
                      height={60}
                      tickFormatter={(v) => {
                        const d = new Date(v);
                        return `${d.getMonth() + 1}/${d.getDate()}`;
                      }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      width={32}
                    />
                    <Tooltip
                      labelFormatter={(v) => new Date(v).toLocaleDateString()}
                      formatter={(val, name) => [
                        val !== null && val !== undefined ? `${Number(val).toFixed(1)} / 100` : "—",
                        (name as string).length > 30 ? (name as string).slice(0, 30) + "…" : name,
                      ]}
                      contentStyle={{ fontSize: "11px" }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: "10px", maxHeight: "80px", overflowY: "auto" }}
                      formatter={(value) =>
                        (value as string).length > 28 ? (value as string).slice(0, 28) + "…" : value
                      }
                    />
                    <Brush
                      dataKey="date"
                      height={24}
                      stroke="#8884d8"
                      tickFormatter={(v) => {
                        const d = new Date(v);
                        return `${d.getMonth() + 1}/${d.getDate()}`;
                      }}
                    />
                    {topSectors.map((sector, idx) => (
                      <Line
                        key={sector}
                        type="monotone"
                        dataKey={sector}
                        stroke={generateColor(idx)}
                        strokeWidth={1.8}
                        dot={false}
                        connectNulls
                        name={sector}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            );
          })()}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {(stats ?? []).map((s) => {
              const rec = getRecommendation(s.avg_score);
              return (
                <Link
                  key={s.sector}
                  href={`/sectors/${encodeURIComponent(s.sector)}`}
                >
                  <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer h-full flex flex-col">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-semibold text-gray-900 text-sm leading-snug flex-1 pr-2">
                        {s.sector}
                      </h3>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap shrink-0 ${rec.cls}`}
                      >
                        {rec.label}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-1.5 mb-2">
                      <span
                        className={`text-3xl font-bold ${scoreTextColor(s.avg_score)}`}
                      >
                        {s.avg_score !== null ? s.avg_score : "—"}
                      </span>
                      <span className="text-xs text-gray-400">avg score</span>
                    </div>

                    <div className="flex gap-4 text-xs text-gray-500 mb-2">
                      <span>{s.company_count} co.</span>
                      {s.scored_count > 0 && (
                        <span>{s.scored_count} scored</span>
                      )}
                      {s.top_score && <span>Top: {s.top_score}</span>}
                      {s.avg_pe !== null && (
                        <span className={`font-semibold ${
                          s.avg_pe < 15 ? 'text-green-600' :
                          s.avg_pe < 25 ? 'text-blue-600' :
                          s.avg_pe < 40 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          P/E {s.avg_pe.toFixed(1)}
                        </span>
                      )}
                    </div>

                    {s.top_company_symbol && (
                      <div className="text-xs text-gray-600 mb-2">
                        <span className="text-gray-400">Best: </span>
                        <span className="font-semibold">{s.top_company_symbol}</span>
                        {s.top_score && (
                          <span className="text-gray-400"> ({s.top_score})</span>
                        )}
                      </div>
                    )}

                    <div className="mt-auto flex gap-2 text-xs flex-wrap pt-2">
                      {s.defaulter_count > 0 && (
                        <span className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded-full">
                          {s.defaulter_count} defaulter{s.defaulter_count > 1 ? "s" : ""}
                        </span>
                      )}
                      {s.sharia_count > 0 && (
                        <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full">
                          {s.sharia_count} sharia
                        </span>
                      )}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
