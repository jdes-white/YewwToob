import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import { AnalysisProviderError } from "./types";
import type { StructuredAnalysisProvider, StructuredAnalysisRequest, StructuredAnalysisResult } from "./provider";

/**
 * Cheapest current model that reliably completes structured extraction, per
 * the BUILD BRIEF's cost-control directive. Override via env without a code
 * change. Model naming was current as of this integration but not verified
 * against a live API call from this build environment — /diagnostics makes
 * a real minimal call and will surface a wrong model name immediately as a
 * FAILED check rather than silently.
 */
export const ANALYSIS_MODEL = process.env.OPENAI_ANALYSIS_MODEL ?? "gpt-5.6-luna";

let client: OpenAI | undefined;

function getOpenAiClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

export class OpenAiAnalysisProvider implements StructuredAnalysisProvider {
  readonly name = "openai";

  async generate<T>(request: StructuredAnalysisRequest<T>): Promise<StructuredAnalysisResult<T>> {
    const openai = getOpenAiClient();

    let response;
    try {
      response = await openai.responses.parse({
        model: ANALYSIS_MODEL,
        instructions: request.systemPrompt,
        input: request.userMessage,
        text: { format: zodTextFormat(request.schema, request.schemaName) },
      });
    } catch (err) {
      throw new AnalysisProviderError(`OpenAI request failed: ${err instanceof Error ? err.message : "unknown error"}`);
    }

    if (response.output_parsed == null) {
      const reason = response.incomplete_details?.reason ?? "model returned no parseable structured output";
      throw new AnalysisProviderError(`OpenAI did not return valid structured output (${reason})`);
    }

    return { data: response.output_parsed, model: response.model ?? ANALYSIS_MODEL };
  }
}
