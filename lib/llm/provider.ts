import type { z } from "zod";

export interface StructuredAnalysisRequest<T> {
  systemPrompt: string;
  userMessage: string;
  schema: z.ZodType<T>;
  /** Model-visible name for the structured output format (letters/digits/underscore/dash, max 64 chars). */
  schemaName: string;
}

export interface StructuredAnalysisResult<T> {
  data: T;
  model: string;
}

/**
 * Every LLM analysis provider adapter implements this. lib/analysis/service.ts
 * only ever talks to this interface — swapping providers (as this project
 * already did once, Anthropic -> OpenAI) touches only lib/llm/, never the
 * analysis orchestration or the Zod schemas themselves.
 */
export interface StructuredAnalysisProvider {
  readonly name: string;
  generate<T>(request: StructuredAnalysisRequest<T>): Promise<StructuredAnalysisResult<T>>;
}
