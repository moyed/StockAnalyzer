"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default function WatchlistPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["watchlist"],
    queryFn: () => api.get("/watchlist").then((r) => r.data),
  });

  const removeMutation = useMutation({
    mutationFn: (companyId: number) => api.delete(`/watchlist/${companyId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  const items = data ?? [];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Watchlist</h1>
      <p className="text-gray-500 text-sm mb-6">Companies you are tracking across quarters</p>

      {isLoading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-gray-500">
          Your watchlist is empty. Browse{" "}
          <Link href="/companies" className="text-green-700 underline">companies</Link>{" "}
          and add interesting ones here.
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item: any) => {
            const c = item.company;
            const latest = c?.latest_filing;
            const score = latest?.score?.score;
            const flags: string[] = latest?.score?.flags ?? [];

            return (
              <Card key={item.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Link href={`/companies/${c.id}`} className="font-semibold text-gray-900 hover:text-green-700">
                        {c.name}
                      </Link>
                      <span className="text-xs text-gray-400">{c.symbol}</span>
                      {c.is_defaulter && <Badge variant="destructive" className="text-xs">Defaulter</Badge>}
                    </div>

                    {latest && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {latest.quarter} · {new Date(latest.filing_date).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    )}

                    {latest?.ai_analysis?.summary && (
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                        {latest.ai_analysis.summary}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-1 mt-2">
                      {flags.slice(0, 3).map((flag) => (
                        <span key={flag} className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                          {flag.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>

                    {item.notes && (
                      <p className="text-xs text-gray-400 mt-2 italic">{item.notes}</p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2 ml-4">
                    {score != null && (
                      <span className={`text-xs font-bold px-2 py-1 rounded-full text-white ${score >= 70 ? "bg-green-600" : score >= 40 ? "bg-yellow-500" : "bg-gray-400"}`}>
                        {score}
                      </span>
                    )}
                    {c.last_price && (
                      <span className="text-xs text-gray-500">PKR {c.last_price}</span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700 text-xs h-6 px-2"
                      onClick={() => removeMutation.mutate(c.id)}
                      disabled={removeMutation.isPending}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
