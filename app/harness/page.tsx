"use client";

import { useState } from "react";

interface ImportResponse {
  status: string;
  error?: string;
  video?: {
    id: string;
    processingStatus: string;
    transcriptProvider: string | null;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
  };
  transcriptReused?: boolean;
  analysisReused?: boolean;
}

interface VideoDetail {
  video: {
    id: string;
    title: string | null;
    processingStatus: string;
    transcript: { language: string | null; fullText: string; provider: string } | null;
    analyses: { analysisType: string; structuredJson: unknown; model: string }[];
  };
}

const CREATORS = [
  { slug: "jason-pizzino", label: "Jason Pizzino" },
  { slug: "michael-pizzino", label: "Michael Pizzino" },
];

export default function HarnessPage() {
  const [creatorSlug, setCreatorSlug] = useState(CREATORS[0].slug);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [detail, setDetail] = useState<VideoDetail | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setDetail(null);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorSlug, url }),
      });
      const json = (await res.json()) as ImportResponse;
      setResult(json);

      if (json.video?.id) {
        const detailRes = await fetch(`/api/videos/${json.video.id}`);
        if (detailRes.ok) {
          setDetail((await detailRes.json()) as VideoDetail);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-8 font-sans">
      <h1 className="text-2xl font-semibold">Phase 0 Integration Harness</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Submit a real YouTube URL to run the full pipeline: transcript provider → Neon → Anthropic → Neon. This is a
        diagnostic tool, not the product UI.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Creator
          <select
            className="rounded border border-neutral-300 p-2 dark:border-neutral-700 dark:bg-neutral-900"
            value={creatorSlug}
            onChange={(e) => setCreatorSlug(e.target.value)}
          >
            {CREATORS.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          YouTube URL
          <input
            className="rounded border border-neutral-300 p-2 dark:border-neutral-700 dark:bg-neutral-900"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            required
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {loading ? "Running pipeline..." : "Run import"}
        </button>
      </form>

      {result && (
        <section className="mt-6 rounded border border-neutral-300 p-4 dark:border-neutral-700">
          <h2 className="font-medium">Result: {result.status}</h2>
          {result.error && <p className="mt-1 text-sm text-red-600">{result.error}</p>}
          {result.video && (
            <dl className="mt-2 grid grid-cols-2 gap-1 text-sm">
              <dt className="text-neutral-500">Processing status</dt>
              <dd>{result.video.processingStatus}</dd>
              <dt className="text-neutral-500">Transcript provider</dt>
              <dd>{result.video.transcriptProvider ?? "—"}</dd>
              <dt className="text-neutral-500">Transcript reused</dt>
              <dd>{String(result.transcriptReused ?? false)}</dd>
              <dt className="text-neutral-500">Analysis reused</dt>
              <dd>{String(result.analysisReused ?? false)}</dd>
              {result.video.lastErrorCode && (
                <>
                  <dt className="text-neutral-500">Last error code</dt>
                  <dd>{result.video.lastErrorCode}</dd>
                  <dt className="text-neutral-500">Last error message</dt>
                  <dd>{result.video.lastErrorMessage}</dd>
                </>
              )}
            </dl>
          )}
        </section>
      )}

      {detail?.video?.transcript && (
        <section className="mt-6 rounded border border-neutral-300 p-4 dark:border-neutral-700">
          <h2 className="font-medium">Transcript ({detail.video.transcript.provider})</h2>
          <p className="text-sm text-neutral-500">Language: {detail.video.transcript.language ?? "unknown"}</p>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-neutral-100 p-3 text-xs dark:bg-neutral-800">
            {detail.video.transcript.fullText.slice(0, 4000)}
          </pre>
        </section>
      )}

      {detail?.video?.analyses && detail.video.analyses.length > 0 && (
        <section className="mt-6 rounded border border-neutral-300 p-4 dark:border-neutral-700">
          <h2 className="font-medium">Structured analysis ({detail.video.analyses[0].model})</h2>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-neutral-100 p-3 text-xs dark:bg-neutral-800">
            {JSON.stringify(detail.video.analyses[0].structuredJson, null, 2)}
          </pre>
        </section>
      )}

      <p className="mt-8 text-sm">
        <a className="underline" href="/diagnostics">
          View diagnostics →
        </a>
      </p>
    </main>
  );
}
