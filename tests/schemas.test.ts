import { describe, it, expect } from "vitest";
import { jasonPizzinoAnalysisSchema, michaelPizzinoAnalysisSchema } from "@/lib/analysis/schemas";

const validJason = {
  overallMarket: { stance: "bullish", summary: "s", evidence: [], conditions: [], invalidation: [] },
  btc: { stance: "bullish", structure: "uptrend", summary: "s", keyLevels: [], conditions: [], invalidation: [] },
  eth: { stance: "neutral", structure: "range", summary: "s", keyLevels: [], conditions: [], invalidation: [] },
  otherMentions: [{ asset: "SOL", note: "briefly mentioned" }],
  materialChanges: [],
};

const validMichael = {
  overallStructure: { summary: "s" },
  btc: {
    structure: "uptrend",
    support: [],
    resistance: [],
    confirmationLevels: [],
    invalidationLevels: [],
    turningPoints: [],
    bullishCase: "c",
    bearishCase: "c",
  },
  eth: {
    structure: "uptrend",
    support: [],
    resistance: [],
    confirmationLevels: [],
    invalidationLevels: [],
    turningPoints: [],
    bullishCase: "c",
    bearishCase: "c",
  },
  otherMentions: [],
  materialChanges: [],
};

describe("jasonPizzinoAnalysisSchema", () => {
  it("accepts a well-formed analysis", () => {
    expect(jasonPizzinoAnalysisSchema.safeParse(validJason).success).toBe(true);
  });

  it("rejects a response missing required fields", () => {
    const { btc, ...missingBtc } = validJason;
    void btc;
    expect(jasonPizzinoAnalysisSchema.safeParse(missingBtc).success).toBe(false);
  });

  it("rejects a response with the wrong type for a field", () => {
    const malformed = { ...validJason, materialChanges: "not an array" };
    expect(jasonPizzinoAnalysisSchema.safeParse(malformed).success).toBe(false);
  });
});

describe("michaelPizzinoAnalysisSchema", () => {
  it("accepts a well-formed analysis", () => {
    expect(michaelPizzinoAnalysisSchema.safeParse(validMichael).success).toBe(true);
  });

  it("rejects a response missing required fields", () => {
    const { eth, ...missingEth } = validMichael;
    void eth;
    expect(michaelPizzinoAnalysisSchema.safeParse(missingEth).success).toBe(false);
  });

  it("rejects completely malformed input", () => {
    expect(michaelPizzinoAnalysisSchema.safeParse({ random: "junk" }).success).toBe(false);
  });
});
