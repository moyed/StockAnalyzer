"use client";
import { use } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const FLAG_COLORS: Record<string, string> = {
  HIGH_PROFIT_GROWTH: "bg-green-100 text-green-800",
  HIGH_REVENUE_GROWTH: "bg-blue-100 text-blue-800",
  EXPORT_EXPANSION: "bg-purple-100 text-purple-800",
  NEW_PROJECT: "bg-yellow-100 text-yellow-800",
  MARGIN_IMPROVEMENT: "bg-teal-100 text-teal-800",
  DEFAULTER_RISK: "bg-red-100 text-red-800",
};

export default function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["company", id],
    queryFn: () => api.get(`/companies/${id}`).then((r) => r.data),
  });

  const watchMutation = useMutation({
    mutationFn: (add: boolean) =>
      add
        ? api.post("/watchlist", { company_id: Number(id) })
        : api.delete(`/watchlist/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company", id] }),
  });

  if (isLoading) return <p className="text-gray-400 text-sm">Loading...</p>;
  if (!data) return <p className="text-gray-500">Company not found</p>;

  const { company, is_watched } = data;
  const filings = company.filings ?? [];

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{company.name}</h1>
            <span className="text-gray-400 font-mono">{company.symbol}</span>
            {company.is_defaulter && <Badge variant="destructive">Defaulter</Badge>}
          </div>
          <p className="text-gray-500 text-sm mt-1">
            {company.sector ?? "Sector unknown"} · {company.exchange_type} year
            {company.last_price && ` · PKR ${company.last_price}`}
          </p>
        </div>
        <Button
          variant={is_watched ? "outline" : "default"}
          className={is_watched ? "" : "bg-green-700 hover:bg-green-800"}
          onClick={() => watchMutation.mutate(!is_watched)}
          disabled={watchMutation.isPending}
        >
          {is_watched ? "Remove from Watchlist" : "Add to Watchlist"}
        </Button>
      </div>

      <Tabs defaultValue={filings[0]?.id?.toString() ?? ""}>
        <TabsList className="mb-4 flex-wrap h-auto gap-1">
          {filings.map((f: any) => (
            <TabsTrigger key={f.id} value={f.id.toString()} className="text-xs">
              {f.quarter}
            </TabsTrigger>
          ))}
        </TabsList>

        {filings.map((f: any) => {
          const analysis = f.ai_analysis ?? {};
          const signals = analysis.signals ?? {};
          const flags: string[] = f.score?.flags ?? [];

          return (
            <TabsContent key={f.id} value={f.id.toString()}>
              <div className="grid md:grid-cols-2 gap-4">
                <Card className="p-4">
                  <h3 className="font-semibold text-gray-800 mb-3">AI Summary</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {analysis.summary ?? "Analysis not available"}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-3">
                    {flags.map((flag) => (
                      <span
                        key={flag}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${FLAG_COLORS[flag] ?? "bg-gray-100 text-gray-700"}`}
                      >
                        {flag.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                  {f.score && (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-sm text-gray-500">Score:</span>
                      <span className={`text-sm font-bold px-2 py-0.5 rounded-full text-white ${f.score.score >= 70 ? "bg-green-600" : f.score.score >= 40 ? "bg-yellow-500" : "bg-gray-400"}`}>
                        {f.score.score} / 100
                      </span>
                    </div>
                  )}
                </Card>

                <Card className="p-4">
                  <h3 className="font-semibold text-gray-800 mb-3">Key Signals</h3>
                  <dl className="space-y-2 text-sm">
                    {[
                      ["Revenue Growth", signals.revenue_growth_pct != null ? `${signals.revenue_growth_pct}%` : null],
                      ["Profit Growth", signals.profit_growth_pct != null ? `${signals.profit_growth_pct}%` : null],
                      ["Gross Margin", signals.gross_margin_direction ? `${signals.gross_margin_direction}${signals.gross_margin_reason ? ` — ${signals.gross_margin_reason}` : ""}` : null],
                      ["Exports", signals.exports_milestone],
                      ["New Projects", signals.new_projects],
                      ["Exchange P&L", signals.exchange_gain_loss_pkr_million != null ? `PKR ${signals.exchange_gain_loss_pkr_million}M` : null],
                      ["Management Tone", signals.management_tone],
                    ]
                      .filter(([, v]) => v)
                      .map(([label, value]) => (
                        <div key={label as string} className="flex gap-2">
                          <dt className="text-gray-400 w-28 shrink-0">{label}</dt>
                          <dd className="text-gray-800 font-medium">{value as string}</dd>
                        </div>
                      ))}
                  </dl>
                </Card>
              </div>

              <div className="mt-4 flex items-center gap-4 text-sm text-gray-500">
                <span>Filed: {f.filing_date}</span>
                {f.score?.price_at_filing && <span>Price at filing: PKR {f.score.price_at_filing}</span>}
                {company.last_price && f.score?.price_at_filing && (
                  <span className={Number(company.last_price) > Number(f.score.price_at_filing) ? "text-green-600 font-medium" : "text-red-500 font-medium"}>
                    Current: PKR {company.last_price}
                    {` (${((Number(company.last_price) / Number(f.score.price_at_filing) - 1) * 100).toFixed(1)}%)`}
                  </span>
                )}
                <a href={f.pdf_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  View Filing PDF
                </a>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
