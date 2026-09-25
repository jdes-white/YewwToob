import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const mockParse = vi.fn();

vi.mock("openai", () => ({
  default: class MockOpenAI {
    responses = { parse: mockParse };
  },
}));

process.env.OPENAI_API_KEY = "test-key";

const { OpenAiAnalysisProvider } = await import("@/lib/llm/openai");
const { AnalysisProviderError } = await import("@/lib/llm/types");

const schema = z.object({ foo: z.string() });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OpenAiAnalysisProvider", () => {
  it("returns parsed data and the model actually used on success", async () => {
    mockParse.mockResolvedValue({ output_parsed: { foo: "bar" }, model: "gpt-5.6-luna" });

    const provider = new OpenAiAnalysisProvider();
    const result = await provider.generate({ systemPrompt: "sp", userMessage: "um", schema, schemaName: "test_schema" });

    expect(result).toEqual({ data: { foo: "bar" }, model: "gpt-5.6-luna" });
    expect(mockParse).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: "sp",
        input: "um",
        text: expect.objectContaining({ format: expect.objectContaining({ type: "json_schema", name: "test_schema" }) }),
      }),
    );
  });

  it("wraps a rejected API call (network failure or internal schema-validation failure) as AnalysisProviderError", async () => {
    // The OpenAI SDK's zodTextFormat validates the response against our Zod schema internally
    // and throws synchronously inside responses.parse() on a mismatch — this covers both that
    // case and a plain network/API failure, since both surface the same way to us.
    mockParse.mockRejectedValue(new Error("network down"));

    const provider = new OpenAiAnalysisProvider();

    await expect(provider.generate({ systemPrompt: "sp", userMessage: "um", schema, schemaName: "test_schema" })).rejects.toBeInstanceOf(
      AnalysisProviderError,
    );
  });

  it("throws AnalysisProviderError with the incomplete reason when output_parsed is null", async () => {
    mockParse.mockResolvedValue({ output_parsed: null, incomplete_details: { reason: "max_output_tokens" } });

    const provider = new OpenAiAnalysisProvider();

    await expect(provider.generate({ systemPrompt: "sp", userMessage: "um", schema, schemaName: "test_schema" })).rejects.toThrow(
      /max_output_tokens/,
    );
  });
});
