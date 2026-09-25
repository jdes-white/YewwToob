import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

function requestWithAuth(header?: string): NextRequest {
  const headers = new Headers();
  if (header) headers.set("authorization", header);
  return new NextRequest("https://example.com/harness", { headers });
}

describe("proxy (Basic Auth gate)", () => {
  const originalUser = process.env.BASIC_AUTH_USER;
  const originalPassword = process.env.BASIC_AUTH_PASSWORD;

  afterEach(() => {
    if (originalUser === undefined) delete process.env.BASIC_AUTH_USER;
    else process.env.BASIC_AUTH_USER = originalUser;
    if (originalPassword === undefined) delete process.env.BASIC_AUTH_PASSWORD;
    else process.env.BASIC_AUTH_PASSWORD = originalPassword;
  });

  it("does not block requests when no credentials are configured", () => {
    delete process.env.BASIC_AUTH_USER;
    delete process.env.BASIC_AUTH_PASSWORD;

    const response = proxy(requestWithAuth());

    expect(response.status).toBe(200);
  });

  describe("with credentials configured", () => {
    beforeEach(() => {
      process.env.BASIC_AUTH_USER = "owner";
      process.env.BASIC_AUTH_PASSWORD = "s3cret";
    });

    it("rejects a request with no Authorization header", () => {
      const response = proxy(requestWithAuth());

      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toContain("Basic");
    });

    it("rejects wrong credentials", () => {
      const header = `Basic ${btoa("owner:wrong-password")}`;
      const response = proxy(requestWithAuth(header));

      expect(response.status).toBe(401);
    });

    it("accepts correct credentials", () => {
      const header = `Basic ${btoa("owner:s3cret")}`;
      const response = proxy(requestWithAuth(header));

      expect(response.status).toBe(200);
    });
  });
});
