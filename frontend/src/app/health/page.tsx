"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface HealthData {
  timestamp: string;
  filings: {
    processing: number;
    pending: number;
    done: number;
    failed: number;
    total: number;
    rate_per_minute: number;
    eta_minutes: number | null;
    percent_complete: number;
    companies_scanned_today: number;
    total_companies: number;
  };
  queue: {
    total_jobs: number;
    default_queue: number;
    rescan_queue: number;
    failed_jobs: number;
    status: string;
    job_types?: Record<string, { count: number; oldest: string; newest: string }>;
    oldest_job_at?: string | null;
    newest_job_at?: string | null;
  };
  workers: {
    count: number;
    status: string;
    healthy: boolean;
  };
  ai_engine: {
    process_count: number;
    worker_count: number;
    status: string;
    healthy: boolean;
    model: string | null;
    features: any;
    response_time_ms: number | null;
    error?: string;
  };
  database: {
    status: string;
    healthy: boolean;
    response_time_ms: number;
    driver: string;
    error?: string;
  };
  system: {
    php_version: string;
    laravel_version: string;
    environment: string;
    load_average: number | null;
    timezone: string;
  };
}

function StatusBadge({ healthy, label }: { healthy: boolean; label?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
        healthy
          ? "bg-green-100 text-green-700"
          : "bg-red-100 text-red-700"
      }`}
    >
      <span className={`w-2 h-2 rounded-full ${healthy ? "bg-green-500" : "bg-red-500"}`} />
      {label || (healthy ? "Healthy" : "Unhealthy")}
    </span>
  );
}

function LoadingCard({ title }: { title: string }) {
  return (
    <Card className="p-5 border-gray-200 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <div className="w-16 h-5 bg-gray-200 rounded-full" />
      </div>
      <div className="space-y-2">
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="h-4 bg-gray-200 rounded w-1/2" />
        <div className="h-4 bg-gray-200 rounded w-2/3" />
      </div>
    </Card>
  );
}

export default function HealthPage() {
  const queryClient = useQueryClient();
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Lazy load each section independently for better UX
  const filingsQuery = useQuery({
    queryKey: ["health", "filings"],
    queryFn: () => api.get("/health/filings").then((r) => r.data),
    refetchInterval: 60000,
  });

  const queueQuery = useQuery({
    queryKey: ["health", "queue"],
    queryFn: () => api.get("/health/queue").then((r) => r.data),
    refetchInterval: 60000,
  });

  const workersQuery = useQuery({
    queryKey: ["health", "workers"],
    queryFn: () => api.get("/health/workers").then((r) => r.data),
    refetchInterval: 60000,
  });

  const aiEngineQuery = useQuery({
    queryKey: ["health", "ai-engine"],
    queryFn: () => api.get("/health/ai-engine").then((r) => r.data),
    refetchInterval: 60000,
  });

  const databaseQuery = useQuery({
    queryKey: ["health", "database"],
    queryFn: () => api.get("/health/database").then((r) => r.data),
    refetchInterval: 60000,
  });

  const systemQuery = useQuery({
    queryKey: ["health", "system"],
    queryFn: () => api.get("/health/system").then((r) => r.data),
    refetchInterval: 60000,
  });

  // Combine data for convenience
  const data = {
    filings: filingsQuery.data,
    queue: queueQuery.data,
    workers: workersQuery.data,
    ai_engine: aiEngineQuery.data,
    database: databaseQuery.data,
    system: systemQuery.data,
  };

  const isLoading = filingsQuery.isLoading || queueQuery.isLoading || workersQuery.isLoading ||
                    aiEngineQuery.isLoading || databaseQuery.isLoading || systemQuery.isLoading;

  const isFetching = filingsQuery.isFetching || queueQuery.isFetching || workersQuery.isFetching ||
                     aiEngineQuery.isFetching || databaseQuery.isFetching || systemQuery.isFetching;

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ["health"] });
  }

  const restartWorkersMutation = useMutation({
    mutationFn: () => api.post("/system/restart-workers"),
    onSuccess: (response) => {
      setActionMessage({ type: 'success', text: response.data.message });
      queryClient.invalidateQueries({ queryKey: ["health"] });
      setTimeout(() => setActionMessage(null), 5000);
    },
    onError: (error: any) => {
      setActionMessage({ type: 'error', text: error.response?.data?.message || 'Failed to restart workers' });
      setTimeout(() => setActionMessage(null), 5000);
    },
  });

  const restartAiEngineMutation = useMutation({
    mutationFn: () => api.post("/system/restart-ai-engine"),
    onSuccess: (response) => {
      setActionMessage({ type: 'success', text: response.data.message });
      queryClient.invalidateQueries({ queryKey: ["health"] });
      setTimeout(() => setActionMessage(null), 5000);
    },
    onError: (error: any) => {
      setActionMessage({ type: 'error', text: error.response?.data?.message || 'Failed to restart AI engine' });
      setTimeout(() => setActionMessage(null), 5000);
    },
  });

  const restartAllMutation = useMutation({
    mutationFn: () => api.post("/system/restart-all"),
    onSuccess: (response) => {
      setActionMessage({ type: 'success', text: response.data.message });
      queryClient.invalidateQueries({ queryKey: ["health"] });
      setTimeout(() => setActionMessage(null), 5000);
    },
    onError: (error: any) => {
      setActionMessage({ type: 'error', text: error.response?.data?.message || 'Failed to restart all services' });
      setTimeout(() => setActionMessage(null), 5000);
    },
  });

  const resetStuckFilingsMutation = useMutation({
    mutationFn: () => api.post("/system/reset-stuck-filings"),
    onSuccess: (response) => {
      setActionMessage({ type: 'success', text: response.data.message });
      queryClient.invalidateQueries({ queryKey: ["health"] });
      setTimeout(() => setActionMessage(null), 5000);
    },
    onError: (error: any) => {
      setActionMessage({ type: 'error', text: error.response?.data?.message || 'Failed to reset stuck filings' });
      setTimeout(() => setActionMessage(null), 5000);
    },
  });

  const clearFailedJobsMutation = useMutation({
    mutationFn: () => api.post("/system/clear-failed-jobs"),
    onSuccess: (response) => {
      setActionMessage({ type: 'success', text: response.data.message });
      queryClient.invalidateQueries({ queryKey: ["health"] });
      setTimeout(() => setActionMessage(null), 5000);
    },
    onError: (error: any) => {
      setActionMessage({ type: 'error', text: error.response?.data?.message || 'Failed to clear failed jobs' });
      setTimeout(() => setActionMessage(null), 5000);
    },
  });

  const retryFailedJobsMutation = useMutation({
    mutationFn: () => api.post("/system/retry-failed-jobs"),
    onSuccess: (response) => {
      setActionMessage({ type: 'success', text: response.data.message });
      queryClient.invalidateQueries({ queryKey: ["health"] });
      setTimeout(() => setActionMessage(null), 5000);
    },
    onError: (error: any) => {
      setActionMessage({ type: 'error', text: error.response?.data?.message || 'Failed to retry failed jobs' });
      setTimeout(() => setActionMessage(null), 5000);
    },
  });

  const retryFailedFilingsMutation = useMutation({
    mutationFn: () => api.post("/system/retry-failed-filings"),
    onSuccess: (response) => {
      setActionMessage({ type: 'success', text: response.data.message });
      queryClient.invalidateQueries({ queryKey: ["health"] });
      setTimeout(() => setActionMessage(null), 5000);
    },
    onError: (error: any) => {
      setActionMessage({ type: 'error', text: error.response?.data?.message || 'Failed to retry failed filings' });
      setTimeout(() => setActionMessage(null), 5000);
    },
  });

  const processPendingFilingsMutation = useMutation({
    mutationFn: () => api.post("/system/process-pending-filings"),
    onSuccess: (response) => {
      setActionMessage({ type: 'success', text: response.data.message });
      queryClient.invalidateQueries({ queryKey: ["health"] });
      setTimeout(() => setActionMessage(null), 5000);
    },
    onError: (error: any) => {
      setActionMessage({ type: 'error', text: error.response?.data?.message || 'Failed to process pending filings' });
      setTimeout(() => setActionMessage(null), 5000);
    },
  });

  const overallHealthy =
    data.workers?.healthy && data.ai_engine?.healthy && data.database?.healthy;

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System Health Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Auto-refresh: Every 1 minute
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isFetching}
            className="border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            {isFetching ? "Refreshing..." : "↻ Refresh"}
          </Button>
          <Button
            onClick={() => restartAllMutation.mutate()}
            disabled={restartAllMutation.isPending}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {restartAllMutation.isPending ? "Restarting..." : "🔄 Restart All Services"}
          </Button>
          {!isLoading && (
            <StatusBadge healthy={overallHealthy} label={overallHealthy ? "All Systems Operational" : "System Degraded"} />
          )}
        </div>
      </div>

      {/* Action Message */}
      {actionMessage && (
        <div className={`p-4 rounded-lg border ${
          actionMessage.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <p className="text-sm font-medium">{actionMessage.text}</p>
        </div>
      )}

      {/* Overall Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Database */}
        {databaseQuery.isLoading ? (
          <LoadingCard title="Database" />
        ) : data.database ? (
          <Card className={`p-5 ${data.database.healthy ? "border-green-200" : "border-red-200"}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Database</h3>
              <StatusBadge healthy={data.database.healthy} />
            </div>
            <div className="space-y-1 text-sm">
              <p className="text-gray-600">Driver: <span className="font-medium text-gray-900">{data.database.driver}</span></p>
              <p className="text-gray-600">Response: <span className="font-medium text-gray-900">{data.database.response_time_ms}ms</span></p>
              {data.database.error && (
                <p className="text-red-600 text-xs mt-2">{data.database.error}</p>
              )}
            </div>
          </Card>
        ) : null}

        {/* Queue Workers */}
        {workersQuery.isLoading ? (
          <LoadingCard title="Queue Workers" />
        ) : data.workers ? (
          <Card className={`p-5 ${data.workers.healthy ? "border-green-200" : "border-red-200"}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Queue Workers</h3>
              <StatusBadge healthy={data.workers.healthy} />
            </div>
            <div className="space-y-1 text-sm mb-3">
              <p className="text-gray-600">Active: <span className="font-bold text-2xl text-gray-900">{data.workers.count}</span></p>
              <p className="text-gray-600">Status: <span className={`font-medium ${data.workers.status === "running" ? "text-green-600" : "text-red-600"}`}>{data.workers.status}</span></p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => restartWorkersMutation.mutate()}
              disabled={restartWorkersMutation.isPending}
              className="w-full text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
            >
              {restartWorkersMutation.isPending ? "Restarting..." : "🔄 Restart"}
            </Button>
          </Card>
        ) : null}

        {/* AI Engine */}
        {aiEngineQuery.isLoading ? (
          <LoadingCard title="AI Engine" />
        ) : data.ai_engine ? (
          <Card className={`p-5 ${data.ai_engine.healthy ? "border-green-200" : "border-red-200"}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">AI Engine</h3>
              <StatusBadge healthy={data.ai_engine.healthy} />
            </div>
            <div className="space-y-1 text-sm mb-3">
              <p className="text-gray-600">Processes: <span className="font-medium text-gray-900">{data.ai_engine.process_count}</span></p>
              <p className="text-gray-600">Workers: <span className="font-bold text-2xl text-purple-600">{data.ai_engine.worker_count}</span></p>
              <p className="text-gray-600">Model: <span className="font-medium text-gray-900">{data.ai_engine.model || "N/A"}</span></p>
              {data.ai_engine.response_time_ms && (
                <p className="text-gray-600">Response: <span className="font-medium text-gray-900">{data.ai_engine.response_time_ms}ms</span></p>
              )}
              {data.ai_engine.error && (
                <p className="text-red-600 text-xs mt-2">{data.ai_engine.error}</p>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => restartAiEngineMutation.mutate()}
              disabled={restartAiEngineMutation.isPending}
              className="w-full text-xs border-purple-300 text-purple-700 hover:bg-purple-50"
            >
              {restartAiEngineMutation.isPending ? "Restarting..." : "🔄 Restart"}
            </Button>
          </Card>
        ) : null}

        {/* System */}
        {systemQuery.isLoading ? (
          <LoadingCard title="System" />
        ) : data.system ? (
          <Card className="p-5 border-blue-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">System</h3>
              <span className="text-xs text-gray-500">{data.system.environment}</span>
            </div>
            <div className="space-y-1 text-sm">
              <p className="text-gray-600">PHP: <span className="font-medium text-gray-900">{data.system.php_version}</span></p>
              <p className="text-gray-600">Laravel: <span className="font-medium text-gray-900">{data.system.laravel_version}</span></p>
              {data.system.load_average && (
                <p className="text-gray-600">Load: <span className="font-medium text-gray-900">{data.system.load_average}</span></p>
              )}
            </div>
          </Card>
        ) : null}
      </div>

      {/* Filing Processing Status */}
      {filingsQuery.isLoading ? (
        <Card className="p-6 animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/4 mb-4" />
          <div className="grid grid-cols-5 gap-4 mb-6">
            {[...Array(5)].map((_, i) => (
              <div key={i}>
                <div className="h-4 bg-gray-200 rounded w-16 mb-2" />
                <div className="h-8 bg-gray-200 rounded w-12" />
              </div>
            ))}
          </div>
          <div className="h-3 bg-gray-200 rounded w-full mb-4" />
        </Card>
      ) : data.filings ? (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Filing Processing</h2>
            <div className="flex items-center gap-2">
              {data.filings.pending > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => processPendingFilingsMutation.mutate()}
                  disabled={processPendingFilingsMutation.isPending}
                  className="text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                >
                  {processPendingFilingsMutation.isPending ? "Queueing..." : `▶ Process ${data.filings.pending} Pending`}
                </Button>
              )}
              {data.filings.processing > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resetStuckFilingsMutation.mutate()}
                  disabled={resetStuckFilingsMutation.isPending}
                  className="text-xs border-yellow-300 text-yellow-700 hover:bg-yellow-50"
                >
                  {resetStuckFilingsMutation.isPending ? "Resetting..." : "Reset Stuck"}
                </Button>
              )}
              {data.filings.failed > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => retryFailedFilingsMutation.mutate()}
                  disabled={retryFailedFilingsMutation.isPending}
                  className="text-xs border-red-300 text-red-700 hover:bg-red-50"
                >
                  {retryFailedFilingsMutation.isPending ? "Retrying..." : `🔄 Retry ${data.filings.failed} Failed`}
                </Button>
              )}
            </div>
          </div>

        {/* Companies scanned today */}
        <div className={`flex items-center justify-between rounded-lg px-4 py-3 mb-5 ${
          data.filings.companies_scanned_today === data.filings.total_companies && data.filings.total_companies > 0
            ? "bg-green-50 border border-green-200"
            : "bg-blue-50 border border-blue-200"
        }`}>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Companies Scanned Today</p>
            <p className={`text-2xl font-bold mt-0.5 ${
              data.filings.companies_scanned_today === data.filings.total_companies && data.filings.total_companies > 0
                ? "text-green-700"
                : "text-blue-700"
            }`}>
              {data.filings.companies_scanned_today}
              <span className="text-base font-normal text-gray-500"> / {data.filings.total_companies}</span>
            </p>
          </div>
          <div className="text-right">
            <p className={`text-sm font-semibold ${
              data.filings.companies_scanned_today === data.filings.total_companies && data.filings.total_companies > 0
                ? "text-green-600"
                : "text-blue-600"
            }`}>
              {data.filings.total_companies > 0
                ? Math.round((data.filings.companies_scanned_today / data.filings.total_companies) * 100)
                : 0}%
            </p>
            <p className="text-xs text-gray-500">coverage</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div>
            <p className="text-sm text-gray-600">Processing</p>
            <p className="text-2xl font-bold text-yellow-600">{data.filings.processing}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Pending</p>
            <p className="text-2xl font-bold text-blue-600">{data.filings.pending}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Done</p>
            <p className="text-2xl font-bold text-green-600">{data.filings.done}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Failed</p>
            <p className="text-2xl font-bold text-red-600">{data.filings.failed}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total</p>
            <p className="text-2xl font-bold text-gray-900">{data.filings.total}</p>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Progress</span>
            <span className="text-sm font-bold text-gray-900">{data.filings.percent_complete}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-green-500 h-3 rounded-full transition-all duration-500"
              style={{ width: `${data.filings.percent_complete}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-blue-700 font-medium">Processing Rate</p>
            <p className="text-2xl font-bold text-blue-900">{data.filings.rate_per_minute}</p>
            <p className="text-xs text-blue-600">filings per minute</p>
          </div>
          {data.filings.eta_minutes && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <p className="text-purple-700 font-medium">Estimated Time</p>
              <p className="text-2xl font-bold text-purple-900">{data.filings.eta_minutes}</p>
              <p className="text-xs text-purple-600">minutes remaining</p>
            </div>
          )}
        </div>
      </Card>
      ) : null}

      {/* Queue Details */}
      {queueQuery.isLoading ? (
        <Card className="p-6 animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/4 mb-4" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i}>
                <div className="h-4 bg-gray-200 rounded w-20 mb-2" />
                <div className="h-8 bg-gray-200 rounded w-16" />
              </div>
            ))}
          </div>
        </Card>
      ) : data.queue ? (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Queue Status</h2>
            {data.queue.failed_jobs > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => retryFailedJobsMutation.mutate()}
                disabled={retryFailedJobsMutation.isPending}
                className="text-xs border-red-300 text-red-700 hover:bg-red-50"
              >
                {retryFailedJobsMutation.isPending ? "Retrying..." : `🔄 Retry ${data.queue.failed_jobs} Failed Jobs`}
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-sm text-gray-600">Total Jobs</p>
              <p className="text-2xl font-bold text-gray-900">{data.queue.total_jobs}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Default Queue</p>
              <p className="text-2xl font-bold text-blue-600">{data.queue.default_queue}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Rescan Queue</p>
              <p className="text-2xl font-bold text-purple-600">{data.queue.rescan_queue}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Failed Jobs</p>
              <p className="text-2xl font-bold text-red-600">{data.queue.failed_jobs}</p>
            </div>
          </div>

          {/* Job Timeline */}
          {data.queue.total_jobs > 0 && data.queue.oldest_job_at && (
            <div className="border-t border-gray-200 pt-4">
              <p className="text-xs font-medium text-gray-500 mb-2">Queue Timeline</p>
              <div className="flex items-center gap-4 text-xs text-gray-600">
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-500">Oldest:</span>
                  <span className="font-medium text-gray-700">
                    {new Date(data.queue.oldest_job_at).toLocaleString('en-PK', {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-500">Newest:</span>
                  <span className="font-medium text-gray-700">
                    {data.queue.newest_job_at && new Date(data.queue.newest_job_at).toLocaleString('en-PK', {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Job Types Breakdown */}
          {data.queue.job_types && Object.keys(data.queue.job_types).length > 0 && (
            <div className="border-t border-gray-200 pt-4 mt-4">
              <p className="text-xs font-medium text-gray-500 mb-3">Job Types in Queue</p>
              <div className="space-y-2">
                {(Object.entries(data.queue.job_types) as [string, { count: number; oldest: string; newest: string }][]).map(([type, info]) => (
                  <div key={type} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-900">{type}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(info.oldest).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                        {' → '}
                        {new Date(info.newest).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-blue-600">{info.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
