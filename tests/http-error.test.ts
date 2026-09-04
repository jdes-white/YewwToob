import { describe, it, expect } from "vitest";
import { httpStatusToResultCode } from "@/lib/transcript/httpError";

describe("httpStatusToResultCode", () => {
  it.each([
    [401, "AUTH_ERROR"],
    [403, "AUTH_ERROR"],
    [404, "VIDEO_NOT_FOUND"],
    [429, "RATE_LIMITED"],
    [500, "PROVIDER_DOWN"],
    [503, "PROVIDER_DOWN"],
    [418, "UNKNOWN_ERROR"],
  ] as const)("maps HTTP %i to %s", (status, expected) => {
    expect(httpStatusToResultCode(status)).toBe(expected);
  });
});
