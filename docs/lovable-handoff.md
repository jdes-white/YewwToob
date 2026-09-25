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

## 2. What was proven with REAL external services this round — and what was not

**Be precise about this: no live call to YouTube, FreeTranscriptAPI, Supadata, Neon, or the app's own
Anthropic integration was possible in this session.** This is a network-policy fact, not a shortcut:

```
$ curl https://api.freetranscriptapi.com/...   → CONNECT tunnel failed, response 403 (policy denial)
$ curl https://api.supadata.ai/...             → CONNECT tunnel failed, response 403 (policy denial)
$ curl https://www.youtube.com                 → CONNECT tunnel failed, response 403 (policy denial)
$ curl https://neon.tech                       → CONNECT tunnel failed, response 403 (policy denial)
$ curl https://api.anthropic.com/v1/messages   → HTTP 405 (domain reachable, but no request-signing
                                                   credential available to this session for a real call)
```

The sandbox's egress proxy allowlists only `api.anthropic.com` (and package registries) — confirmed via
its own status endpoint, not inferred. No `DATABASE_URL`, `FREE_TRANSCRIPT_API_KEY`, `SUPADATA_API_KEY`,
or `ANTHROPIC_API_KEY` is configured in this environment either, so even the allowlisted Anthropic
endpoint can't be used for a real signed request from here.

**REAL (verified this round):**
- A real, current, public Jason Pizzino video was identified via web search (not fabricated): *"The
  Bitcoin Target No One Wants to Hear"*, published June 6, 2026 —
  `https://www.youtube.com/watch?v=95Sg5orepBE` (video ID `95Sg5orepBE`). This is the recommended first
  real test video once credentials/network exist.
- Real (if thin) content signal about Jason's actual current public stance, from search snippets, not
  invented: he has forecast "up to a year of lower lows" for Bitcoin with a possible cycle low as late as
  October 2026, and a more recent video ("This Bear Is Now Bullish on Bitcoin," July 2026) suggests a
  shift in his view. This is genuine, sourced, real-world grounding — used only to sanity-check that the
  schema has somewhere to put "a stance that flips" (`stance` + `expectedDirection` +
  `materialChanges`) — **it is not a transcript and was not run through the pipeline.**
- All application-level logic — URL parsing, provider HTTP-status→failure-code mapping, transcript
  normalisation, provider fallback ordering, duplicate-prevention, Zod schema validation (including a
  new drift test between the hand-written tool-call JSON Schema and the Zod schema — see §6) — is
  covered by 52 passing automated tests using mocked `fetch`/mocked DB, `npx eslint .` clean, `npx tsc
  --noEmit` clean, `npx next build` clean (see §7).

**MOCK-ONLY / UNPROVEN (be honest with yourself about this before you trust the recipe):**
- FreeTranscriptAPI's and Supadata's *actual* response field names. The adapters in this repo
  (`lib/transcript/freeTranscriptApi.ts`, `lib/transcript/supadata.ts`) are a best-effort implementation
  against publicly-described behaviour (endpoint shape, Bearer/`x-api-key` auth, a `mode=native` param on
  Supadata to force native-caption-only retrieval) — **not verified against a live response**, because
  outbound access to their docs and APIs was blocked from every environment available to this session.
- Any real Anthropic call using the app's own SDK integration, and therefore the model's actual output
  quality on this exact prompt/schema.
- Any real Neon Postgres read/write.

## 3. Provider contract — status

| Provider | Endpoint shape coded | Auth | Native-caption enforcement | Verified live? |
|---|---|---|---|---|
| FreeTranscriptAPI (primary) | `GET {base}/transcript?video_id=&format=json&include_timestamp=true&send_metadata=true`, `Authorization: Bearer <key>` | Bearer | N/A (no ASR fallback offered by this provider AFAIK) | **No** |
| Supadata (fallback) | `GET {base}/youtube/transcript?videoId=&mode=native&text=false`, `x-api-key: <key>` | API key header | `mode=native` hardcoded — never omit this param, it's what stops Supadata silently falling back to AI transcription | **No** |

Both adapters parse defensively (accept a few plausible field-name spellings — see the `firstDefined`
helper in each file) specifically *because* the real shape is unverified. **Do not treat this table as
gospel.** See §9.

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

**Model:** default to the cheapest Anthropic model that reliably completes this (Haiku). One call per
video — never split into separate summary/BTC/ETH calls.

**Caveat, restated:** this prompt has been *designed and structurally tested* (schema self-consistency,
see §6) — it has **not** been run against a real transcript and a real model call. Its output quality is
unverified. Budget for at least one real iteration once Lovable (or this repo, from an unrestricted
environment) can actually call Anthropic.

## 6. Technical issue found and fixed this round

Adding `expectedDirection`/`turningPoints` to the Zod schema without also updating the hand-authored
Anthropic tool-call JSON Schema would have silently broken analysis in production — the model would
never be asked for the new fields, so real output would fail our own validation. This is exactly the
"malformed provider response" failure class the brief asks to guard against, except self-inflicted.
Caught and fixed by:
- Updating both `jasonPizzinoAnalysisSchema` (Zod) and `ANALYSIS_PROFILES.jason_pizzino.toolInputSchema`
  (hand-written JSON Schema) together.
- Adding `tests/profile-schema-consistency.test.ts`: builds the minimal object each profile's
  `toolInputSchema` declares valid and asserts the corresponding Zod schema accepts it. This test would
  have caught the bug above, and will catch the next one. **Recommend Lovable's backend function apply
  the same two-artifacts-must-agree discipline** if it re-expresses the schema in its own backend
  language — or better, just serialise/consume this repo's JSON Schema and Zod schema directly rather
  than hand-transcribing them a third time.

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

## 7. Test/build status (this repository, this round)

```
npx vitest run     → 8 test files, 52 tests, all passing
npx eslint .        → clean
npx tsc --noEmit    → clean (after `next typegen`, which next build also runs)
npm run build       → clean, verified with zero environment variables set (see §6b)
```

New test files added this round: `tests/analysis-service.test.ts` (AI failure, malformed model response,
duplicate/cache reuse, success path — this was a real coverage gap, `lib/analysis/service.ts` had no
tests before), `tests/import.test.ts` (full orchestration: invalid URL, unknown creator, duplicate
youtubeVideoId prevention, failure propagation), `tests/profile-schema-consistency.test.ts` (§6), plus a
new case in `tests/transcript-service.test.ts` proving a provider that throws a raw non-typed error
(e.g. a JSON parse crash on a malformed response) is safely converted to a typed `UNKNOWN_ERROR` rather
than crashing the pipeline.

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

1. **API keys server-side only.** All four secrets (`DATABASE_URL`/Supabase equivalent,
   `FREE_TRANSCRIPT_API_KEY`, `SUPADATA_API_KEY`, `ANTHROPIC_API_KEY`) live only in backend/edge function
   environment config, never in client bundle code or client-visible network calls.
2. **One backend entry point for transcript retrieval**, e.g. a single `getTranscript(videoId)`
   function/edge function. It should internally: check the database for an existing transcript → try the
   primary provider → try the fallback provider (native-caption mode only, per §3) → return a normalised
   `NormalisedTranscript` (§4) or a typed failure. The UI and the analysis step never talk to
   FreeTranscriptAPI/Supadata directly, and never know which provider actually served the result.
3. **One backend entry point for analysis**, e.g. `analyzeVideo(transcript)`, using the prompt/schema in
   §5. The UI never calls Anthropic directly.
4. **Provider implementation is swappable.** Keep FreeTranscriptAPI/Supadata-specific parsing inside
   their own small functions/files, isolated behind the normalised-transcript boundary — so if a
   provider's real contract turns out to differ (likely, per §3), fixing it touches one file, not the UI
   or the analysis step.
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

None of the above asks Lovable to build multi-creator UI, history, or provider-management tooling — only
to shape the plumbing so those remain additive later.

## 10. What must be resolved BEFORE spending Lovable credits

**One real blocker, stated plainly:** nobody has yet run this pipeline against real credentials and real
network access — not in this session (hard-blocked, see §2's curl evidence), and, as far as this
session's history shows, not anywhere else either. The provider contract in §3 is a best-effort design,
not a verified fact.

**Recommended action, in order of cost:** before writing the Lovable build prompt, run this repo's own
`/harness` page (already built, already tested at the unit level — see §7) from an environment with real
network access and real `DATABASE_URL`/`FREE_TRANSCRIPT_API_KEY`/`SUPADATA_API_KEY`/`ANTHROPIC_API_KEY`
values (a local machine, or a Claude Code session/environment without this sandbox's network
restriction) against the real video identified in §2
(`https://www.youtube.com/watch?v=95Sg5orepBE`). This is a five-minute check that answers the two
open questions this handoff cannot: (a) do the provider adapters' field-mappings need fixing, and (b)
does the analysis prompt/schema produce a genuinely good review on real content. Either finding is far
cheaper to act on here than inside a Lovable build.

If that isn't practical before Lovable starts, the fallback is to accept the risk explicitly: tell
Lovable up front that the provider contract is unverified and budget one iteration for Lovable (or
Claude Code immediately after) to correct field-mapping once it sees a real response — but that is
exactly the credit spend this exercise was meant to avoid, so treat it as a fallback, not the plan.

No other credential, network, or account blocker was found — GitHub push access for this repository
worked normally this session.
