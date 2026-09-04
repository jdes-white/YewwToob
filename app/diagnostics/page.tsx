"use client";

import { useCallback, useEffect, useState } from "react";

interface HealthCheck {
  name: string;
  state: "CONNECTED" | "FAILED" | "NOT_CONFIGURED";
  detail: string;
  checkedAt: string;
}

interface LastImport {
  id: string;
  youtubeUrl: string;
  title: string | null;
  processingStatus: string;
  transcriptProvider: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  creator: { name: string };
  analyses: { model: string }[];
  importLogs: { stage: string; provider: string | null; resultCode: string; durationMs: number | null; createdAt: string }[];
}

interface HealthResponse {
  checks: HealthCheck[];
  lastImport: LastImport | null;
}

const STATE_STYLES: Record<HealthCheck["state"], string> = {
  CONNECTED: "text-green-700 dark:text-green-400",
  FAILED: "text-red-700 dark:text-red-400",
  NOT_CONFIGURED: "text-amber-700 dark:text-amber-400",
};

export default function DiagnosticsPage() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (!res.ok) throw new Error(`Health endpoint returned ${res.status}`);
      setData((await res.json()) as HealthResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load health status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount: intentional, not a derived-state anti-pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return (
    <main className="mx-auto max-w-3xl p-8 font-sans">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Diagnostics</h1>
        <button onClick={load} className="rounded border border-neutral-300 px-3 py-1 text-sm dark:border-neutral-700">
          {loading ? "Checking..." : "Refresh"}
        </button>
      </div>
      <p className="mt-2 text-sm text-neutral-500">
        Live connectivity checks. Each provider check makes a real minimal request — no cached or fabricated status.
        No secrets are ever displayed here.
      </p>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {data && (
        <>
          <section className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {data.checks.map((check) => (
              <div key={check.name} className="rounded border border-neutral-300 p-3 dark:border-neutral-700">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{check.name}</span>
                  <span className={`text-sm font-semibold ${STATE_STYLES[check.state]}`}>{check.state}</span>
                </div>
                <p className="mt-1 text-xs text-neutral-500">{check.detail}</p>
              </div>
            ))}
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-medium">Last import</h2>
            {!data.lastImport && <p className="mt-2 text-sm text-neutral-500">No videos imported yet.</p>}
            {data.lastImport && (
              <div className="mt-2 rounded border border-neutral-300 p-4 text-sm dark:border-neutral-700">
                <dl className="grid grid-cols-2 gap-1">
                  <dt className="text-neutral-500">Creator</dt>
                  <dd>{data.lastImport.creator.name}</dd>
                  <dt className="text-neutral-500">Video</dt>
                  <dd className="truncate">{data.lastImport.title ?? data.lastImport.youtubeUrl}</dd>
                  <dt className="text-neutral-500">Processing status</dt>
                  <dd>{data.lastImport.processingStatus}</dd>
                  <dt className="text-neutral-500">Transcript provider</dt>
                  <dd>{data.lastImport.transcriptProvider ?? "—"}</dd>
                  <dt className="text-neutral-500">Analysis model</dt>
                  <dd>{data.lastImport.analyses[0]?.model ?? "—"}</dd>
                  {data.lastImport.lastErrorCode && (
                    <>
                      <dt className="text-neutral-500">Error code</dt>
                      <dd>{data.lastImport.lastErrorCode}</dd>
                      <dt className="text-neutral-500">Error message</dt>
                      <dd>{data.lastImport.lastErrorMessage}</dd>
                    </>
                  )}
                </dl>

                <h3 className="mt-4 text-sm font-medium">Recent attempts</h3>
                <table className="mt-1 w-full text-left text-xs">
                  <thead>
                    <tr className="text-neutral-500">
                      <th className="pr-2">Stage</th>
                      <th className="pr-2">Provider</th>
                      <th className="pr-2">Result</th>
                      <th className="pr-2">Duration</th>
                      <th>At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lastImport.importLogs.map((log, i) => (
                      <tr key={i}>
                        <td className="pr-2">{log.stage}</td>
                        <td className="pr-2">{log.provider ?? "—"}</td>
                        <td className="pr-2">{log.resultCode}</td>
                        <td className="pr-2">{log.durationMs != null ? `${log.durationMs}ms` : "—"}</td>
                        <td>{new Date(log.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <p className="mt-8 text-sm">
        <a className="underline" href="/harness">
          ← Back to import harness
        </a>
      </p>
    </main>
  );
}
