import { describe, expect, it } from "vitest";
import { classifyAuthFailure, getAuthFailureMessage, getAuthFailureStatus } from "./provider-error";

describe("Supabase auth failure classification", () => {
  it("keeps documented provider codes", () => {
    expect(classifyAuthFailure({ code: "invalid_credentials", status: 400 })).toBe("invalid_credentials");
    expect(classifyAuthFailure({ code: "otp_expired", status: 403 })).toBe("otp_expired");
  });

  it("recognizes blocked or unavailable network access", () => {
    expect(classifyAuthFailure({ name: "AuthRetryableFetchError", message: "fetch failed", status: 0 })).toBe("auth_service_unreachable");
    expect(getAuthFailureStatus("auth_service_unreachable")).toBe(503);
    expect(getAuthFailureMessage("auth_service_unreachable")).toContain("认证服务暂时无法连接");
  });

  it("falls back safely when no session is returned", () => {
    expect(classifyAuthFailure(null, false)).toBe("missing_session");
    expect(classifyAuthFailure(null, true)).toBeNull();
  });

  it("treats a provider outage as unavailable rather than invalid credentials", () => {
    expect(classifyAuthFailure({ status: 500, code: "unexpected_failure" })).toBe("auth_service_unreachable");
    expect(getAuthFailureStatus("auth_service_unreachable")).toBe(503);
  });
});
