# YewwToob → Lovable MVP handoff

This document is the technical recipe proven (or, where explicitly flagged, *not* proven) in the
`YewwToob` Next.js test bench (this repository), for handing to Lovable to build a deliberately tiny,
polished, single-creator/single-review MVP. It is written to become the basis of the initial Lovable
build prompt. Read the **"What must be resolved before spending Lovable credits"** section first — it
names one real blocker.

Everything here concerns the recipe (transcript flow, analysis schema, data model, architecture
boundaries). It does not assume Lovable will reuse this repo's stack (Next.js/Prisma/Neon) — Lovable
should use its own normal integration (typically a Supabase-backed React app with server-side edge
functions). What must carry over is the **shape**, not the framework.

---

## 1. Selected MVP creator: Jason Pizzino

Between the two brief profiles, **Jason Pizzino** is the better first test subject:

- His extraction profile (`overallMarket` stance/summary/direction, BTC/ETH thesis, conditions,
  invalidation) is narrative and qualitative. A model summarising "what he thinks and why" is a much
  lower-risk extraction task than Michael's profile, which leans on precise numeric technical levels
  (support/resistance, retracement %, confirmation/invalidation prices) — a much higher hallucination
  risk, and one that's genuinely hard to spot-check without frame-by-frame chart review.
- A narrative macro review is also the more convincing "I'd rather read this than watch the video"
  demo — the exact product thesis in the brief.
- Michael Pizzino's profile and schema remain in this repo (`lib/analysis/profiles.ts`,
  `lib/analysis/schemas.ts`, unchanged this round) for Claude Code to reintroduce after the Lovable
  handoff. Lovable does not need to know Michael exists.

## 2. What was proven with REAL external services — and what was not

Updated across two rounds. This sandbox's own outbound network access is still hard-blocked for
everything except `api.anthropic.com` and package registries (confirmed via the egress proxy's own
status endpoint — YouTube, Supadata, FreeTranscriptAPI, Neon, and even this app's own deployed URL
all get a policy-denied `403` at the CONNECT stage). What changed is that **real infrastructure now
exists outside this sandbox**, provisioned via Render's API (already-connected account, zero
dashboard steps):

- A real Render Postgres database (`yewwtoob-phase0`) — live.
- A real Render web service deploying this exact GitHub branch — live, and a real deploy has already
  been run against it (not simulated): it correctly builds with zero env vars, and correctly fails at
  exactly the "DATABASE_URL is required" point once a database is expected but not yet connected. That
  failure was itself real evidence, not mocked — see §6b.

**REAL (verified):**
- A real, current, public Jason Pizzino video, identified via web search (not fabricated): *"The
  Bitcoin Target No One Wants to Hear"*, published June 6, 2026 —
  `https://www.youtube.com/watch?v=95Sg5orepBE` (video ID `95Sg5orepBE`). Recommended first real test
  video.
- FreeTranscriptAPI.com confirmed as a real, current product via multiple independent search results
  (not a single adapter's guess): official site, real endpoint (`api.freetranscriptapi.com/v1/transcript`),
  a documented `video_url` query parameter (confirmed via a published curl example), and confirmation
  that **no API key or signup is required** for its free tier (50 requests/hour/IP). This meaningfully
  de-risks what was previously an open question — see §3.
- All application-level logic — URL parsing, provider HTTP-status→failure-code mapping, transcript
  normalisation, provider fallback ordering, duplicate-prevention, Zod schema validation, the OpenAI
  provider wrapper's success/failure/incomplete-response handling, and the Basic Auth gate — is covered
  by 57 passing automated tests using mocked `fetch`/mocked OpenAI SDK/mocked DB, `npx eslint .` clean,
  `npx tsc --noEmit` clean, `npm run build` clean with zero env vars (see §7).

**MOCK-ONLY / UNPROVEN (be honest with yourself about this before you trust the recipe):**
- Supadata's *actual* response field names, and FreeTranscriptAPI's per-segment field names within its
  confirmed `transcript` array — both still best-effort, isolated to their adapter files.
- Any real OpenAI call using the app's own SDK integration, and therefore the model's actual output
  quality on this exact prompt/schema.
- Any real read/write against the now-live Render Postgres database, or a real request against the
  now-live Render web service — both exist and are reachable from the internet, just not from this
  sandbox. See §10.

## 3. Provider contract — status

| Provider | Endpoint shape | Auth | Native-caption enforcement | Verified how |
|---|---|---|---|---|
| FreeTranscriptAPI (primary) | `GET {base}/transcript?video_url=<url>` | None required (keyless free tier); optional `Authorization: Bearer <key>` for the paid tier | N/A (no ASR fallback offered by this provider) | Endpoint, param name, and keyless-access confirmed via the vendor's own site and published examples (search-verified, not a live call) |
| Supadata (fallback) | `GET {base}/youtube/transcript?videoId=&mode=native&text=false`, `x-api-key: <key>` | API key header, required | `mode=native` hardcoded — never omit this param, it's what stops Supadata silently falling back to AI transcription | Unchanged from the original round — search-verified product/docs, not a live call |

Both adapters still parse defensively (accept a few plausible field-name spellings — see the
`firstDefined` helper in each file) for exactly the fields not independently confirmed above. **Do
not treat unconfirmed fields as gospel.** See §9.

## 4. Normalised transcript structure (proven design, not proven against a live payload)

```ts
interface NormalisedTranscriptSegment {
  text: string;
  startSeconds: number;
  durationSeconds: number;
}

interface NormalisedTranscript {
  videoId: string;           // YouTube video ID
  language: string | null;
  title: string | null;
  segments: NormalisedTranscriptSegment[];
  fullText: string;          // convenience join of all segment text, for the LLM prompt
  provider: "FREE_TRANSCRIPT_API" | "SUPADATA";
}
```

Whichever provider actually served the transcript, the rest of the app only ever sees this shape
(`lib/transcript/types.ts`). Lovable's backend function should do the same: one normalising boundary,
provider-specific parsing never leaks past it.

## 5. Final analysis prompt and schema (Jason Pizzino) — this round's main deliverable

This is what changed this round, and what should be handed to Lovable verbatim rather than asking
Lovable to design the analysis methodology itself.

**Schema** (`lib/analysis/schemas.ts`):

```json
{
  "overallMarket": {
    "stance": "string",
    "expectedDirection": "string",
    "summary": "string",
    "evidence": ["string"],
    "turningPoints": ["string"],
    "conditions": ["string"],
    "invalidation": ["string"]
  },
  "btc": {
    "stance": "string", "structure": "string", "summary": "string",
    "keyLevels": ["string"], "conditions": ["string"], "invalidation": ["string"]
  },
  "eth": {
    "stance": "string", "structure": "string", "summary": "string",
    "keyLevels": ["string"], "conditions": ["string"], "invalidation": ["string"]
  },
  "otherMentions": [ { "asset": "string", "note": "string" } ],
  "materialChanges": ["string"]
}
```

This maps directly onto the seven review elements requested: overall market view (`overallMarket`), BTC
(`btc`), ETH (`eth`), expected direction (`overallMarket.expectedDirection` — added this round, see
below), important levels/turning points (`btc.keyLevels`/`eth.keyLevels` for prices,
`overallMarket.turningPoints` for cycle timing/catalysts, since Jason talks in cycle-timing terms as much
as exact prices), conditions/invalidation (`conditions`/`invalidation` at both the overall and per-asset
level), and other observations (`otherMentions`).

**What changed and why (this round's prompt-quality pass):**
- Added `overallMarket.expectedDirection` — a short, explicit "where does he think this is headed next"
  label. The original Phase 0 schema only had `stance`, which is fine for a data model but under-serves
  a *reader* — "bullish" is not the same as "he expects a re-test of the lows before a Q4 move up," and
  the latter is what someone reading instead of watching actually wants on line one.
- Added `overallMarket.turningPoints` — macro/cycle turning points, catalysts, or time windows,
  distinct from the per-asset price `keyLevels`. Jason's content (per real search evidence, §2) is
  cycle/timing-oriented ("not reaching bottom until October 2026"), which the original schema had no
  clean home for.
- Rewrote the system prompt to frame the task explicitly as "writing a concise review for someone who
  wants the substance without watching it" rather than neutral "extract this data" — small wording
  change, but it's the difference between a form-filling exercise and a genuinely useful review, and it's
  cheap to get right now rather than after Lovable has built a UI around bland output.
- Kept the "no invented data, empty array/string over guessing" instruction unchanged — this is doing
  real work (see the Zod schema's strictness) and should not be softened.

**System prompt** (`lib/analysis/profiles.ts`, `ANALYSIS_PROFILES.jason_pizzino.systemPrompt`) — hand
this to Lovable as the literal system prompt, do not ask Lovable to write its own:

> You are writing a concise, information-dense review of a Jason Pizzino market/crypto YouTube video for
> someone who wants the substance without watching it. Extract, in his own terms as much as possible:
> - overall market structure, macro/economic cycle view, sentiment, risk-on/risk-off positioning
>   (overallMarket.stance and .summary)
> - expectedDirection: a short, direct label for where he thinks price/the market is headed next (e.g.
>   "further downside before a bottom", "grinding higher", "range-bound, no clear edge") — this is the
>   single line a reader most wants; do not leave it vague if he gave a clear view
> - turningPoints: any macro/cycle turning points, catalysts, or time windows he flags (e.g. "expects
>   capitulation low around Q4 2026", "watching the Fed meeting next month") — these are about WHEN or
>   WHAT triggers a shift, as distinct from price levels
> - his BTC thesis and ETH thesis: stance, structure, summary, key price levels ONLY where explicitly
>   discussed, conditions for the view to hold, and what would invalidate/change it
> - brief mentions of any other crypto assets discussed (do NOT produce detailed altcoin analysis)
> - materialChanges: how this view differs from his previously stored view, if prior-view context is
>   given below; otherwise an empty array
>
> Only state what is explicitly supported by the transcript. Do not invent price levels, dates, or claims
> that are not present. If a field is not discussed, use an empty string or empty array rather than
> guessing — never pad with filler to make a field look complete.

**LLM provider: OpenAI** (changed this round from the original Anthropic integration — a deliberate
product decision, not a technical fallback; see §6 for why the swap was clean). Use the Responses API
with Structured Outputs (`text.format: { type: "json_schema", strict: true }`), generating the JSON
Schema directly from whatever schema representation your backend uses rather than hand-authoring a
parallel one — see §6 for why that matters. Default to the cheapest current model that reliably
completes this extraction (this repo defaults to `gpt-5.6-luna`, override via env var — verify current
naming/pricing yourself, this was current as of this integration but not pinned as gospel). One call
per video — never split into separate summary/BTC/ETH calls.

**Caveat, restated:** this prompt has been *designed and structurally tested* — it has **not** been run
against a real transcript and a real model call. Its output quality is unverified. Budget for at least
one real iteration once real infrastructure (now live on Render, see §2) has real credentials.

## 6. Technical issue found (Anthropic round) and how the OpenAI swap fixed its root cause

Originally, adding `expectedDirection`/`turningPoints` to the Zod schema without also updating a
hand-authored Anthropic tool-call JSON Schema silently broke analysis — the model was never asked for
the new fields, so real output would have failed our own validation. That was caught by a dedicated
drift test at the time.

**The OpenAI swap eliminated this bug class structurally, not just tested-against-it.** OpenAI's Node
SDK ships a `zodTextFormat` helper (`openai/helpers/zod`) that generates the strict JSON Schema handed
to the model *directly from the same Zod schema* used to validate the response — there is no second,
hand-maintained schema to drift out of sync. `lib/analysis/profiles.ts` no longer has a
`toolInputSchema` field at all. **Strongly recommend Lovable's backend do the same** — if its stack has
an equivalent (e.g. a Zod-to-JSON-Schema helper, or a schema library its LLM SDK consumes directly),
use it, rather than hand-transcribing the schema a third time in a third language.

## 6b. Second technical issue found and fixed this round: build-time DB dependency

Running a real `npm run build` with no `DATABASE_URL` set (the state any fresh clone — including a
CI/typecheck job with no secrets — starts in) failed outright:

```
Error: Failed to collect configuration for /api/videos/[id]
  Error: DATABASE_URL is not set
    at lib/db.ts:16:11
```

Next.js's build-time route-data collection imports every API route module, which imported
`lib/db.ts`, which eagerly constructed the Prisma client (and threw without `DATABASE_URL`) at module
load rather than at first use. Fixed by making `prisma` in `lib/db.ts` a lazy proxy — importing the
module is now side-effect-free; the real client is constructed on first actual property access (i.e.
the first request that touches the database), never at build time. Re-verified: `npm run build` now
succeeds with zero environment variables configured. **Apply the same discipline in Lovable's backend
function** — don't let a database/client singleton be constructed at module-import time if the platform
might import the module (for bundling, type-checking, or route analysis) before secrets are available.

## 7. Test/build status (this repository)

```
npx vitest run     → 9 test files, 57 tests, all passing
npx eslint .        → clean
npx tsc --noEmit    → clean (after `next typegen`, which next build also runs)
npm run build       → clean, verified with zero environment variables set (see §6b)
```

Notable coverage: `tests/analysis-service.test.ts` (duplicate/cache reuse, provider failure, malformed/
incomplete response, success — `lib/analysis/service.ts` had no tests originally), `tests/openai-provider.test.ts`
(the OpenAI wrapper's success/network-failure/incomplete-response handling, via a mocked SDK client —
this is the boundary that actually talks to OpenAI, so it's tested directly rather than only through
`analyzeVideo`), `tests/import.test.ts` (full orchestration: invalid URL, unknown creator, duplicate
youtubeVideoId prevention, failure propagation), `tests/proxy.test.ts` (Basic Auth gate: open when
unconfigured, rejects missing/wrong credentials, accepts correct ones), plus a case in
`tests/transcript-service.test.ts` proving a provider that throws a raw non-typed error is safely
converted to a typed `UNKNOWN_ERROR` rather than crashing the pipeline.

**Every one of these is a mocked test.** They prove the code's logic is internally correct and
self-consistent. They do not and cannot prove the real integrations work — see §2.

## 8. Bare-minimum Lovable build scope

**Build:**
1. **Input screen** (mobile-first, single screen): a text field for a YouTube URL and a submit button.
   No creator picker — Jason Pizzino is the only, implicit creator for this MVP.
2. **Processing state**: a loading view while the backend runs transcript-fetch → analysis. A single
   synchronous request/response is fine for MVP (expect the full pipeline to take some tens of seconds);
   do not build a job queue or polling infrastructure for this — that's a Claude Code job later if the
   synchronous call proves too slow or times out on the hosting platform.
3. **Result screen**: a clean, mobile-first rendering of the structured review — Overall View (stance +
   expectedDirection + summary), Turning Points, BTC, ETH, Conditions/Invalidation, Other Observations
   (only if non-empty). This is the actual product moment — the visual/typographic effort belongs here.
4. **Error state**: one clear message per typed failure (`INVALID_URL`, `NO_CAPTIONS`,
   `VIDEO_NOT_FOUND`, `RATE_LIMITED`, `PROVIDER_DOWN`, `AUTH_ERROR`, `ANALYSIS_FAILED`, `UNKNOWN_ERROR`)
   — reuse the plain-English message the backend returns; do not collapse everything to "something went
   wrong."

**Visual/UX objective:** establish a clear visual identity — typography, spacing, color, a loading/result
transition with some polish — good enough that Claude Code inherits a strong pattern to extend, not a
placeholder to redo. The app can (and should) look considerably more finished than its feature count
suggests.

**Explicitly do NOT build:** multiple creators or a creator picker, creator management, creator
comparison, history or "what changed" UI, RAG/embeddings, automatic channel monitoring, notifications,
subscriptions, authentication beyond whatever Lovable's default template includes for free, extensive
settings, dashboards, admin tooling, elaborate provider-management UI, or architecture for hypothetical
scale. If it isn't required for "paste video → receive excellent review," it doesn't belong in this
build.

## 9. Architecture boundaries Lovable must respect (so Claude Code doesn't have to rebuild)

1. **API keys server-side only.** All secrets (`DATABASE_URL`/Supabase equivalent,
   `FREE_TRANSCRIPT_API_KEY` [optional — see §3], `SUPADATA_API_KEY`, `OPENAI_API_KEY`) live only in
   backend/edge function environment config, never in client bundle code or client-visible network calls.
2. **One backend entry point for transcript retrieval**, e.g. a single `getTranscript(videoId)`
   function/edge function. It should internally: check the database for an existing transcript → try the
   primary provider → try the fallback provider (native-caption mode only, per §3) → return a normalised
   `NormalisedTranscript` (§4) or a typed failure. The UI and the analysis step never talk to
   FreeTranscriptAPI/Supadata directly, and never know which provider actually served the result.
3. **One backend entry point for analysis**, e.g. `analyzeVideo(transcript)`, using the prompt/schema in
   §5, behind its own small interface (this repo's `lib/llm/provider.ts`) rather than an OpenAI-specific
   shape leaking into the rest of the app. The UI never calls OpenAI directly. This is not hypothetical
   caution — this exact codebase swapped its LLM provider once already (Anthropic → OpenAI) with zero
   changes outside `lib/llm/` and one new file, specifically because this boundary existed from the start.
4. **Provider implementation is swappable.** Keep FreeTranscriptAPI/Supadata-specific parsing inside
   their own small functions/files, isolated behind the normalised-transcript boundary — so if a
   provider's real contract turns out to differ (see §3's unconfirmed fields), fixing it touches one
   file, not the UI or the analysis step.
5. **Sensible data structures, not UI-shaped ones.** Store the normalised transcript and the full
   structured analysis JSON as returned by the schema in §5 — don't flatten either into bespoke
   UI-specific columns/fields. The review screen reads from the stored JSON; it doesn't redefine the
   shape.
6. **Unique constraint on the YouTube video ID from day one.** A `videos` table (or equivalent) with a
   unique `youtube_video_id` column, so duplicate submissions are a lookup-and-return, not a
   re-fetch/re-analyse. Trivial to add now; a real migration headache to retrofit once real data exists.
7. **A `creators` entity exists even with a single seeded row** ("Jason Pizzino"), with `videos`
   referencing it by ID — don't hardcode "there is only ever one creator" into the schema, even though
   the UI behaves as if there is. This is the one decision that most determines whether Claude Code can
   add Michael Pizzino later without a schema migration.
8. **Gate the whole app behind a single shared credential (HTTP Basic Auth or equivalent) before it is
   reachable on a public URL** — every submission triggers real paid transcript-provider and OpenAI
   requests, and this is a personal app with exactly one legitimate user. This repo does it with ~30
   lines of middleware and zero new UI (the browser's native Basic Auth prompt is the login screen) — do
   not build a real auth system, but do not ship without this either.

None of the above asks Lovable to build multi-creator UI, history, or provider-management tooling — only
to shape the plumbing so those remain additive later.

## 10. What must be resolved BEFORE spending Lovable credits

**Status: infrastructure is live; the one remaining blocker is credentials, not access.** A real
Postgres database and a real deployed web service now exist on Render (§2), and this exact codebase's
build/migrate/start sequence has already been proven against them, up to the point of needing secrets.
Nobody has yet run this pipeline against real transcript-provider/OpenAI credentials, because that
requires either pasting them in or a human opening the deployed `/harness` page — neither is possible
from this sandbox (no outbound access to anything but `api.anthropic.com`, see §2). That is a
credentials gap now, not an infrastructure or code gap.

**Recommended action:** once `DATABASE_URL`, `OPENAI_API_KEY`, and (optionally — see §3)
`SUPADATA_API_KEY` are set on the Render service, open the deployed `/harness` page and submit the real
video identified in §2 (`https://www.youtube.com/watch?v=95Sg5orepBE`). `FREE_TRANSCRIPT_API_KEY` is
not required — its free tier is keyless. This is a five-minute check that answers the two open
questions this handoff cannot: (a) does the FreeTranscriptAPI/Supadata field-mapping need fixing, and
(b) does the analysis prompt/schema produce a genuinely good review on real content. Either finding is
far cheaper to act on here than inside a Lovable build.

If that isn't practical before Lovable starts, the fallback is to accept the risk explicitly: tell
Lovable up front that the provider contract is unverified and budget one iteration for Lovable (or
Claude Code immediately after) to correct field-mapping once it sees a real response — but that is
exactly the credit spend this exercise was meant to avoid, so treat it as a fallback, not the plan.

No credential, network, or account blocker was found for GitHub or Render — both worked normally via
their own APIs, with zero dashboard steps.
