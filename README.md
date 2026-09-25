# YewwToob — Market Video Intelligence (Phase 0)

Private personal app that ingests selected YouTube videos from a small set of market/crypto
creators, retrieves an existing timestamped transcript from a transcript-provider API, stores it,
sends it to OpenAI for structured analysis, stores the result, and (in a later phase) supports
historical comparison of creator views over time.

**This is Phase 0**: the smallest possible integration spike proving the full chain —
YouTube URL → transcript provider (with fallback) → Postgres → OpenAI → Postgres —
before any polished product UI is built.

**This repository is also the technical test bench for a Lovable-built MVP.** See
[`docs/lovable-handoff.md`](docs/lovable-handoff.md) for the proven (and explicitly-flagged-unproven)
recipe — selected MVP creator, provider contract status, normalised transcript structure, the final
analysis prompt/schema, minimum Lovable build scope, and the one blocker to resolve before spending
Lovable credits.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Postgres + Prisma. Neon (`@prisma/adapter-neon`) is the documented default; a standard
  `@prisma/adapter-pg` path (`DATABASE_ADAPTER=pg`) is also supported for any regular Postgres —
  used for the real-integration proof run on Render, since no Neon project was available.
- OpenAI API (Responses API, structured outputs via `zodTextFormat` — see `lib/llm/openai.ts`)
- Transcript providers: FreeTranscriptAPI.com (primary — confirmed real product, keyless free
  tier), Supadata (fallback, native captions only — never speech-to-text)
- Deployed on Render (web service + Postgres, provisioned directly via Render's API — see
  `docs/lovable-handoff.md` for why Render rather than Vercel/Neon for this phase)
- Minimal access gate: HTTP Basic Auth via `proxy.ts` (`BASIC_AUTH_USER`/`BASIC_AUTH_PASSWORD`) —
  this is a personal app whose routes trigger paid requests, so it must not sit open on a public
  URL; no accounts/sessions/new UI, the browser's native Basic Auth prompt is the "login screen"

No Redis, no queue, no object storage, no embeddings/vector search, no multi-agent workflows —
deliberately deferred. See the BUILD BRIEF for the full "what not to build yet" list.

## Getting started

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, OPENAI_API_KEY at minimum — see .env.example
npm run prisma:generate
npm run prisma:migrate   # creates tables in your database
npm run db:seed          # seeds the two Phase 0 creators (Jason Pizzino, Michael Pizzino)
npm run dev
```

`FREE_TRANSCRIPT_API_KEY` and `SUPADATA_API_KEY` are optional for local dev — FreeTranscriptAPI
works keyless on its free tier; Supadata's fallback simply won't be reachable without a key.
`BASIC_AUTH_USER`/`BASIC_AUTH_PASSWORD` are optional locally too (the gate is a no-op if unset) but
required in any publicly reachable deployment.

Then open:

- `/harness` — minimal test harness: submit a real YouTube URL for a creator and watch the full
  pipeline run (transcript fetch → persist → OpenAI analysis → persist).
- `/diagnostics` — live connectivity checks for the database, OpenAI, and both transcript
  providers, plus the most recent import's status and attempt history. No secrets are ever
  displayed.

## Architecture notes

- **Provider-independent transcript interface** (`lib/transcript/`): `getTranscript()` in
  `service.ts` is the only entry point the rest of the app calls. It checks the database first,
  then tries FreeTranscriptAPI, then falls back to Supadata — the caller never knows which
  provider actually served the transcript except via the informational `provider` field on the
  result. Provider-specific response shapes are isolated to `freeTranscriptApi.ts` and
  `supadata.ts`; everything else works with the internal `NormalisedTranscript` type.
- **Supadata is configured for native-caption retrieval only** (`mode=native` on every request).
  Supadata's default behaviour falls back to AI-generated transcription when a video has no
  captions; this app explicitly disables that and treats a caption-less video as `NO_CAPTIONS`
  rather than silently invoking speech-to-text.
- **Typed failure states** throughout: `TranscriptResultCode` (`NO_CAPTIONS`, `VIDEO_NOT_FOUND`,
  `RATE_LIMITED`, `PROVIDER_DOWN`, `AUTH_ERROR`, `UNKNOWN_ERROR`) at the provider level, and
  `ProcessingStatus` (including `TRANSCRIPT_FAILED` / `ANALYSIS_FAILED`) at the video level.
  Every provider attempt (success or failure) is recorded in `ImportLog` for diagnostics.
- **Provider-independent LLM analysis interface** (`lib/llm/`), mirroring the transcript
  abstraction: `lib/analysis/service.ts` depends only on `StructuredAnalysisProvider`
  (`lib/llm/provider.ts`), never on an OpenAI-specific shape. `lib/llm/openai.ts` is the only
  implementation — swapping providers again later means adding one new file there, not touching
  the analysis orchestration, prompts, or schemas.
- **One LLM call per video**, one creator profile schema per creator (Jason Pizzino vs. Michael
  Pizzino — see `lib/analysis/profiles.ts` and `schemas.ts`). The JSON Schema shown to the model is
  generated directly from the same Zod schema used to validate the response (via OpenAI's
  `zodTextFormat` helper) — there is no hand-duplicated schema to drift out of sync, which is what
  caused a real bug during the Anthropic → OpenAI migration (see `docs/lovable-handoff.md`). A
  malformed or incomplete response is recorded as `ANALYSIS_FAILED`, never saved. Re-opening an
  already-analysed video reuses the stored result; re-analysis is only triggered explicitly
  (`force: true`, reserved for a future admin/diagnostics action).
- **Duplicate imports are cheap**: `youtubeVideoId` is unique on `Video`. Re-submitting the same
  URL reuses the existing row, and both `getTranscript` and `analyzeVideo` return their stored
  result without a new provider or OpenAI call.

## Known field-mapping risk

FreeTranscriptAPI.com is a confirmed real product (endpoint, primary `video_url` parameter, and
top-level response fields verified against its own published documentation); Supadata's contract
was verified similarly in an earlier round. Neither has been exercised by a **live** call from this
build environment (outbound access is blocked by this sandbox's network policy), so exact
per-segment field spellings remain defensive/best-effort in both adapters
(`lib/transcript/freeTranscriptApi.ts`, `lib/transcript/supadata.ts`) — this should be the first
thing verified once real infrastructure can reach them, via `/diagnostics` (each provider check
makes a real probe request against a known public video).

## Testing

```bash
npm test          # unit/integration tests with mocked providers, mocked OpenAI SDK, and mocked Prisma
npm run lint
npx tsc --noEmit
```

Automated tests cover: YouTube URL normalisation/ID extraction, both transcript provider adapters'
success/error mapping (via mocked `fetch`), the OpenAI provider wrapper's success/failure/incomplete
handling (via a mocked SDK client), the fallback and duplicate-prevention logic in `getTranscript`
and `analyzeVideo` and `importVideo`, Zod schema validation for both analysis profiles, and the
Basic Auth gate. Real transcript-provider and OpenAI responses are not (and cannot be) exercised by
these tests — see `docs/lovable-handoff.md` for what has and hasn't been proven against live
services.

## Deployment

Deployed on Render (web service + Postgres) from this GitHub repository. Configure the environment
variables from `.env.example` in the Render service settings. `npm run build` itself succeeds with
zero environment variables configured (the Prisma client is constructed lazily — see `lib/db.ts` —
so build-time route analysis never touches `DATABASE_URL`); the service start command
(`prisma migrate deploy && npm run db:seed && npm start`) does need `DATABASE_URL` to actually run
migrations, so a deploy without it fails informatively at exactly that point rather than earlier
during the build or silently at request time.
