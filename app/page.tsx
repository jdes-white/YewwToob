export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-8 font-sans">
      <h1 className="text-2xl font-semibold">YewwToob — Phase 0</h1>
      <p className="text-sm text-neutral-500">
        Private market video intelligence app. Phase 0 proves the ingest → transcript → LLM analysis → storage
        pipeline before any product UI is built.
      </p>
      <div className="mt-4 flex gap-4 text-sm underline">
        <a href="/harness">Import harness</a>
        <a href="/diagnostics">Diagnostics</a>
      </div>
    </main>
  );
}
