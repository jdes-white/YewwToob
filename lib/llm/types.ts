/**
 * Provider-independent structured-analysis types, mirroring the transcript
 * provider abstraction in lib/transcript/. Nothing outside lib/llm should
 * ever see an OpenAI-specific request/response shape directly.
 */
export class AnalysisProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisProviderError";
  }
}
