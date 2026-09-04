import { z } from "zod";

/**
 * Strict schemas for the two creator extraction profiles. The LLM response
 * is validated against these before anything is persisted — a malformed
 * response is recorded as ANALYSIS_FAILED, never saved as-is.
 */

const assetViewJasonSchema = z.object({
  stance: z.string(),
  structure: z.string(),
  summary: z.string(),
  keyLevels: z.array(z.string()),
  conditions: z.array(z.string()),
  invalidation: z.array(z.string()),
});

const otherMentionSchema = z.object({
  asset: z.string(),
  note: z.string(),
});

export const jasonPizzinoAnalysisSchema = z.object({
  overallMarket: z.object({
    stance: z.string(),
    summary: z.string(),
    evidence: z.array(z.string()),
    conditions: z.array(z.string()),
    invalidation: z.array(z.string()),
  }),
  btc: assetViewJasonSchema,
  eth: assetViewJasonSchema,
  otherMentions: z.array(otherMentionSchema),
  materialChanges: z.array(z.string()),
});

export type JasonPizzinoAnalysis = z.infer<typeof jasonPizzinoAnalysisSchema>;

const assetViewMichaelSchema = z.object({
  structure: z.string(),
  support: z.array(z.string()),
  resistance: z.array(z.string()),
  confirmationLevels: z.array(z.string()),
  invalidationLevels: z.array(z.string()),
  turningPoints: z.array(z.string()),
  bullishCase: z.string(),
  bearishCase: z.string(),
});

export const michaelPizzinoAnalysisSchema = z.object({
  overallStructure: z.object({
    summary: z.string(),
  }),
  btc: assetViewMichaelSchema,
  eth: assetViewMichaelSchema,
  otherMentions: z.array(otherMentionSchema),
  materialChanges: z.array(z.string()),
});

export type MichaelPizzinoAnalysis = z.infer<typeof michaelPizzinoAnalysisSchema>;
