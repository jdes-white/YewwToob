import { describe, it, expect } from "vitest";
import { ANALYSIS_PROFILES } from "@/lib/analysis/profiles";

/**
 * The tool-use JSON Schema sent to Anthropic (`toolInputSchema`) and the Zod
 * schema used to validate the response (`schema`) are two hand-maintained
 * representations of the same shape. They are easy to let drift silently —
 * e.g. Phase 0 added `expectedDirection`/`turningPoints` to the Zod schema's
 * prompt-facing docs without realising the JSON Schema needed the same
 * fields. This test catches that class of bug directly: build the minimal
 * object the JSON Schema declares valid, and assert the Zod schema accepts
 * it. If a model call ever returns exactly what we asked it for and our own
 * validator still rejects it, that's a "malformed provider response" of our
 * own making — this is the test that should catch it before Anthropic does.
 */

type JsonSchema = {
  type: "object" | "array" | "string";
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
};

function buildMinimalInstance(schema: JsonSchema): unknown {
  if (schema.type === "string") return "placeholder";
  if (schema.type === "array") return schema.items ? [buildMinimalInstance(schema.items)] : [];
  if (schema.type === "object") {
    const out: Record<string, unknown> = {};
    for (const key of schema.required ?? []) {
      const propSchema = schema.properties?.[key];
      if (!propSchema) throw new Error(`toolInputSchema required key "${key}" has no property definition`);
      out[key] = buildMinimalInstance(propSchema);
    }
    return out;
  }
  throw new Error(`Unhandled JSON Schema type: ${schema.type}`);
}

describe("analysis profile schema consistency (toolInputSchema vs Zod schema)", () => {
  for (const [profileKey, profile] of Object.entries(ANALYSIS_PROFILES)) {
    it(`${profileKey}: a minimal instance of toolInputSchema passes the Zod schema`, () => {
      const instance = buildMinimalInstance(profile.toolInputSchema as JsonSchema);
      const result = profile.schema.safeParse(instance);
      if (!result.success) {
        throw new Error(
          `Drift between toolInputSchema and Zod schema for "${profileKey}": ${JSON.stringify(
            result.error.issues,
            null,
            2,
          )}\nGenerated instance: ${JSON.stringify(instance, null, 2)}`,
        );
      }
      expect(result.success).toBe(true);
    });
  }
});
