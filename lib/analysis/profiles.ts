import type { z } from "zod";
import { jasonPizzinoAnalysisSchema, michaelPizzinoAnalysisSchema } from "./schemas";

export const PROMPT_VERSION = "v1";

export interface AnalysisProfile {
  analysisType: string;
  schema: z.ZodTypeAny;
  /** JSON-shaped instructions shown to the model, kept separate from the Zod schema so the prompt reads naturally. */
  outputShape: string;
  systemPrompt: string;
  /** Hand-authored JSON Schema mirroring `schema`, used to force structured tool-call output from Anthropic. */
  toolInputSchema: Record<string, unknown>;
}

const stringArray = { type: "array", items: { type: "string" } } as const;

const jasonAssetView = {
  type: "object",
  properties: {
    stance: { type: "string" },
    structure: { type: "string" },
    summary: { type: "string" },
    keyLevels: stringArray,
    conditions: stringArray,
    invalidation: stringArray,
  },
  required: ["stance", "structure", "summary", "keyLevels", "conditions", "invalidation"],
  additionalProperties: false,
} as const;

const michaelAssetView = {
  type: "object",
  properties: {
    structure: { type: "string" },
    support: stringArray,
    resistance: stringArray,
    confirmationLevels: stringArray,
    invalidationLevels: stringArray,
    turningPoints: stringArray,
    bullishCase: { type: "string" },
    bearishCase: { type: "string" },
  },
  required: [
    "structure",
    "support",
    "resistance",
    "confirmationLevels",
    "invalidationLevels",
    "turningPoints",
    "bullishCase",
    "bearishCase",
  ],
  additionalProperties: false,
} as const;

const otherMentionsSchema = {
  type: "array",
  items: {
    type: "object",
    properties: { asset: { type: "string" }, note: { type: "string" } },
    required: ["asset", "note"],
    additionalProperties: false,
  },
} as const;

const JASON_OUTPUT_SHAPE = `{
  "overallMarket": { "stance": "", "summary": "", "evidence": [""], "conditions": [""], "invalidation": [""] },
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
    outputShape: JASON_OUTPUT_SHAPE,
    toolInputSchema: {
      type: "object",
      properties: {
        overallMarket: {
          type: "object",
          properties: {
            stance: { type: "string" },
            summary: { type: "string" },
            evidence: stringArray,
            conditions: stringArray,
            invalidation: stringArray,
          },
          required: ["stance", "summary", "evidence", "conditions", "invalidation"],
          additionalProperties: false,
        },
        btc: jasonAssetView,
        eth: jasonAssetView,
        otherMentions: otherMentionsSchema,
        materialChanges: stringArray,
      },
      required: ["overallMarket", "btc", "eth", "otherMentions", "materialChanges"],
      additionalProperties: false,
    },
    systemPrompt: `You are analysing a transcript of a Jason Pizzino market/crypto YouTube video.
Extract, in his own terms as much as possible:
- overall market structure, macro/economic cycle view, sentiment, risk-on/risk-off positioning
- his BTC thesis and ETH thesis: stance, structure, summary, key levels ONLY where explicitly discussed,
  conditions for the view to hold, and what would invalidate/change it
- brief mentions of any other crypto assets discussed (do NOT produce detailed altcoin analysis)
- materialChanges: how this view differs from his previously stored view, if prior-view context is given below;
  otherwise an empty array

Only state what is explicitly supported by the transcript. Do not invent price levels, dates, or claims that
are not present. If a field is not discussed, use an empty string or empty array rather than guessing.`,
  },
  michael_pizzino: {
    analysisType: "michael_pizzino_v1",
    schema: michaelPizzinoAnalysisSchema,
    outputShape: MICHAEL_OUTPUT_SHAPE,
    toolInputSchema: {
      type: "object",
      properties: {
        overallStructure: {
          type: "object",
          properties: { summary: { type: "string" } },
          required: ["summary"],
          additionalProperties: false,
        },
        btc: michaelAssetView,
        eth: michaelAssetView,
        otherMentions: otherMentionsSchema,
        materialChanges: stringArray,
      },
      required: ["overallStructure", "btc", "eth", "otherMentions", "materialChanges"],
      additionalProperties: false,
    },
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
