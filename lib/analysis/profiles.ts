import type { z } from "zod";
import { jasonPizzinoAnalysisSchema, michaelPizzinoAnalysisSchema } from "./schemas";

export const PROMPT_VERSION = "v1";

export interface AnalysisProfile {
  analysisType: string;
  schema: z.ZodTypeAny;
  /** Model-visible name for the structured output format (see lib/llm/provider.ts). */
  schemaName: string;
  /** JSON-shaped instructions shown to the model, kept separate from the Zod schema so the prompt reads naturally. */
  outputShape: string;
  systemPrompt: string;
}

/**
 * The JSON Schema handed to the model is generated directly from `schema`
 * (via `zodTextFormat` in lib/llm/openai.ts) rather than hand-duplicated
 * here. Phase 0 originally hand-wrote a parallel JSON Schema for Anthropic's
 * tool-use API, which drifted out of sync with the Zod schema once
 * (expectedDirection/turningPoints were added to one but not the other) —
 * generating it from the same schema makes that class of bug structurally
 * impossible instead of merely tested-against.
 */

const JASON_OUTPUT_SHAPE = `{
  "overallMarket": { "stance": "", "expectedDirection": "", "summary": "", "evidence": [""], "turningPoints": [""], "conditions": [""], "invalidation": [""] },
  "btc": { "stance": "", "structure": "", "summary": "", "keyLevels": [""], "conditions": [""], "invalidation": [""] },
  "eth": { "stance": "", "structure": "", "summary": "", "keyLevels": [""], "conditions": [""], "invalidation": [""] },
  "otherMentions": [ { "asset": "", "note": "" } ],
  "materialChanges": [""]
}`;

const MICHAEL_OUTPUT_SHAPE = `{
  "overallStructure": { "summary": "" },
  "btc": { "structure": "", "support": [""], "resistance": [""], "confirmationLevels": [""], "invalidationLevels": [""], "turningPoints": [""], "bullishCase": "", "bearishCase": "" },
  "eth": { "structure": "", "support": [""], "resistance": [""], "confirmationLevels": [""], "invalidationLevels": [""], "turningPoints": [""], "bullishCase": "", "bearishCase": "" },
  "otherMentions": [ { "asset": "", "note": "" } ],
  "materialChanges": [""]
}`;

export const ANALYSIS_PROFILES: Record<string, AnalysisProfile> = {
  jason_pizzino: {
    analysisType: "jason_pizzino_v1",
    schema: jasonPizzinoAnalysisSchema,
    schemaName: "jason_pizzino_analysis",
    outputShape: JASON_OUTPUT_SHAPE,
    systemPrompt: `You are writing a concise, information-dense review of a Jason Pizzino market/crypto YouTube video for
someone who wants the substance without watching it. Extract, in his own terms as much as possible:
- overall market structure, macro/economic cycle view, sentiment, risk-on/risk-off positioning (overallMarket.stance
  and .summary)
- expectedDirection: a short, direct label for where he thinks price/the market is headed next (e.g. "further
  downside before a bottom", "grinding higher", "range-bound, no clear edge") — this is the single line a reader
  most wants; do not leave it vague if he gave a clear view
- turningPoints: any macro/cycle turning points, catalysts, or time windows he flags (e.g. "expects capitulation
  low around Q4 2026", "watching the Fed meeting next month") — these are about WHEN or WHAT triggers a shift, as
  distinct from price levels
- his BTC thesis and ETH thesis: stance, structure, summary, key price levels ONLY where explicitly discussed,
  conditions for the view to hold, and what would invalidate/change it
- brief mentions of any other crypto assets discussed (do NOT produce detailed altcoin analysis)
- materialChanges: how this view differs from his previously stored view, if prior-view context is given below;
  otherwise an empty array

Only state what is explicitly supported by the transcript. Do not invent price levels, dates, or claims that are
not present. If a field is not discussed, use an empty string or empty array rather than guessing — never pad
with filler to make a field look complete.`,
  },
  michael_pizzino: {
    analysisType: "michael_pizzino_v1",
    schema: michaelPizzinoAnalysisSchema,
    schemaName: "michael_pizzino_analysis",
    outputShape: MICHAEL_OUTPUT_SHAPE,
    systemPrompt: `You are analysing a transcript of a Michael Pizzino market/crypto YouTube video.
Extract, in his own terms as much as possible:
- overall technical market structure summary
- BTC and ETH technical structure: support/resistance, retracement levels (including 50% levels where discussed),
  swing highs/lows, confirmation levels, invalidation levels, turning points, turning dates/time windows,
  bullish case, bearish case
- brief mentions of any other crypto assets discussed (do NOT produce detailed altcoin analysis)
- materialChanges: how this technical view differs from his previously stored view, if prior-view context is
  given below; otherwise an empty array

Only state what is explicitly supported by the transcript. Do not invent price levels, dates, or claims that
are not present. If a field is not discussed, use an empty string or empty array rather than guessing.`,
  },
};

export function getAnalysisProfile(analysisProfileKey: string): AnalysisProfile {
  const profile = ANALYSIS_PROFILES[analysisProfileKey];
  if (!profile) {
    throw new Error(`Unknown analysis profile: ${analysisProfileKey}`);
  }
  return profile;
}
