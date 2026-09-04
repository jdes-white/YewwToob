import type { TranscriptResultCode, TranscriptProviderName } from "./types";
import { TranscriptProviderError } from "./types";

/**
 * Maps an HTTP status code from a transcript provider to our internal
 * result code. Providers differ in exact status usage, so this is
 * deliberately generous (e.g. some APIs use 402/403 for auth/quota
 * interchangeably).
 */
export function httpStatusToResultCode(status: number): Exclude<TranscriptResultCode, "SUCCESS"> {
  if (status === 401 || status === 403) return "AUTH_ERROR";
  if (status === 404) return "VIDEO_NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "PROVIDER_DOWN";
  return "UNKNOWN_ERROR";
}

export function providerHttpError(
  provider: TranscriptProviderName,
  status: number,
  bodySnippet: string,
): TranscriptProviderError {
  const code = httpStatusToResultCode(status);
  return new TranscriptProviderError(code, provider, `HTTP ${status}: ${bodySnippet.slice(0, 300)}`);
}

const DEFAULT_TIMEOUT_MS = 20_000;

export async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
