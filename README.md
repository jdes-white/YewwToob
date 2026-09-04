# YewwToob — Market Video Intelligence (Phase 0)

Private personal app that ingests selected YouTube videos from a small set of market/crypto
creators, retrieves an existing timestamped transcript from a transcript-provider API, stores it,
sends it to Anthropic for structured analysis, stores the result, and (in a later phase) supports
historical comparison of creator views over time.

**This is Phase 0**: the smallest possible integration spike proving the full chain —
YouTube URL → transcript provider (with fallback) → Neon Postgres → Anthropic → Neon Postgres —
before any polished product UI is built. See the Phase 0 completion report delivered alongside
this repo for test results and current status.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Neon Postgres + Prisma (`@prisma/adapter-neon` driver adapter)
- Anthropic API (Haiku by default, for cost control)
- Transcript providers: FreeTranscriptAPI (primary), Supadata (fallback, native captions only —
  never speech-to-text)
- Deployed on Vercel

No Redis, no queue, no object storage, no embeddings/vector search, no multi-agent workflows —
deliberately deferred. See the BUILD BRIEF for the full "what not to build yet" list.

## Getting started

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, FREE_TRANSCRIPT_API_KEY, SUPADATA_API_KEY, ANTHROPIC_API_KEY
npm run prisma:generate
npm run prisma:migrate   # creates tables in your Neon database
npm run db:seed          # seeds the two Phase 0 creators (Jason Pizzino, Michael Pizzino)
npm run dev
```

Then open:

- `/harness` — minimal test harness: submit a real YouTube URL for a creator and watch the full
  pipeline run (transcript fetch → persist → Anthropic analysis → persist).
- `/diagnostics` — live connectivity checks for the database, Anthropic, and both transcript
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
- **One LLM call per video** (`lib/analysis/service.ts`): a single Anthropic tool-use call per
  creator profile (Jason Pizzino vs. Michael Pizzino extraction schemas — see
  `lib/analysis/profiles.ts` and `schemas.ts`), validated against a strict Zod schema before
  anything is persisted. A malformed response is recorded as `ANALYSIS_FAILED`, never saved.
  Re-opening an already-analysed video reuses the stored result; re-analysis is only triggered
  explicitly (`force: true`, reserved for a future admin/diagnostics action).
- **Duplicate imports are cheap**: `youtubeVideoId` is unique on `Video`. Re-submitting the same
  URL reuses the existing row, and both `getTranscript` and `analyzeVideo` return their stored
  result without a new provider or Anthropic call.

## Known field-mapping risk

The exact response field names for FreeTranscriptAPI and Supadata could not be verified against
live documentation from this build environment (outbound access to their docs domains was
blocked by the sandbox's network policy, and no API keys were available to probe them directly).
The adapters (`lib/transcript/freeTranscriptApi.ts`, `lib/transcript/supadata.ts`) parse several
plausible field-name spellings defensively, and the mapping is isolated to those two files by
design — but this should be the first thing verified once real API keys are configured, via
`/diagnostics` (each provider check makes a real probe request against a known public video).

## Testing

```bash
npm test          # unit/integration tests with mocked providers and mocked Prisma
npm run lint
npx tsc --noEmit
```

Automated tests cover: YouTube URL normalisation/ID extraction, both provider adapters'
success/error mapping (via mocked `fetch`), the fallback and duplicate-prevention logic in
`getTranscript`, and Zod schema validation for both analysis profiles. Real transcript-provider
and Anthropic responses are not (and cannot be) exercised by these tests — see the Phase 0
completion report for what has and hasn't been proven against live services.

## Deployment

Deployed on Vercel from this GitHub repository. Configure the same environment variables from
`.env.example` in the Vercel project settings.
