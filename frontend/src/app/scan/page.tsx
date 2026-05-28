"use client";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default function ScanPage() {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [scanned, setScanned] = useState(false);

  const mutation = useMutation({
    mutationFn: (m: string) => api.post("/scan", { month: m }),
    onSuccess: () => setScanned(true),
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["filings", month],
    queryFn: () => api.get(`/filings?month=${month}`).then((r) => r.data),
    enabled: scanned,
  });

  const filings = data?.data ?? [];

  const statusColor: Record<string, string> = {
    done: "bg-green-100 text-green-800",
    processing: "bg-yellow-100 text-yellow-800",
    pending: "bg-gray-100 text-gray-600",
    failed: "bg-red-100 text-red-800",
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Scan Filings</h1>
      <p className="text-gray-500 text-sm mb-6">
        Pick a month to scan all PSX transmission filings. The AI will analyze each one and score it.
      </p>

      <div className="flex gap-3 mb-8">
        <Input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="w-48"
        />
        <Button
          onClick={() => mutation.mutate(month)}
          disabled={mutation.isPending}
          className="bg-green-700 hover:bg-green-800"
        >
          {mutation.isPending ? "Starting..." : "Run Scan"}
        </Button>
        {scanned && (
          <Button variant="outline" onClick={() => refetch()}>
            Refresh Results
          </Button>
        )}
      </div>

      {mutation.isSuccess && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-4 py-2 mb-4">
          Scan started for {month}. Results will appear as filings are analyzed. Click "Refresh Results" to update.
        </div>
      )}

      {mutation.isError && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-4 py-2 mb-4">
          Scan failed. Make sure you are logged in.
        </div>
      )}

      {scanned && isLoading && <p className="text-gray-400 text-sm">Loading filings...</p>}

      {filings.length > 0 && (
        <div className="grid gap-3">
          {filings.map((f: any) => (
            <Card key={f.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Link href={`/companies/${f.company_id}`} className="font-medium text-gray-900 hover:text-green-700">
                      {f.company?.name}
                    </Link>
                    <span className="text-xs text-gray-400">{f.company?.symbol}</span>
                    <span className="text-xs text-gray-400">{f.quarter}</span>
                  </div>
                  {f.ai_analysis?.summary && (
                    <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{f.ai_analysis.summary}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[f.status] ?? ""}`}>
                    {f.status}
                  </span>
                  {f.score && (
                    <span className={`text-xs font-bold px-2 py-1 rounded-full text-white ${f.score.score >= 70 ? "bg-green-600" : f.score.score >= 40 ? "bg-yellow-500" : "bg-gray-400"}`}>
                      {f.score.score}
                    </span>
                  )}
                  <a href={f.pdf_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                    PDF
                  </a>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
