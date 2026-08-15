import { describe, expect, it } from "vitest";
import { jobFingerprint, normalizeUrl, stripHtml } from "./normalize";

describe("job normalization", () => {
  it("builds a stable company-title-location fingerprint", () => {
    expect(jobFingerprint(" IDEO ", "Senior  Designer", "Shanghai, China"))
      .toBe(jobFingerprint("ideo", "senior designer", "shanghai, china"));
  });

  it("removes tracking parameters and fragments", () => {
    expect(normalizeUrl("https://example.com/jobs/1?utm_source=x&gh_src=y#apply"))
      .toBe("https://example.com/jobs/1");
  });

  it("turns public HTML content into readable text", () => {
    expect(stripHtml("<p>Hello &amp; welcome</p><br><strong>Shanghai</strong>"))
      .toBe("Hello & welcome\n\n Shanghai");
    expect(stripHtml("&lt;p&gt;Encoded &amp;amp; safe&lt;/p&gt;"))
      .toBe("Encoded & safe");
  });
});
