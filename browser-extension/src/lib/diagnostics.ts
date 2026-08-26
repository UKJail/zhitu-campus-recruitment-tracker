import type { FieldMatch } from "./field-matcher";
import type { ScanResult } from "./page-client";

export function createDiagnosticReport(scan: ScanResult, matches: FieldMatch[]) {
  const pageUrl = new URL(scan.url);
  const fieldsByToken = new Map(scan.fields.map((field) => [field.token, field]));
  const isExisting = (match: FieldMatch) => match.reason.includes("网页中已有内容");
  return {
    format: "zhitu-autofill-diagnostics",
    version: 2,
    exportedAt: new Date().toISOString(),
    page: {
      hostname: pageUrl.hostname,
      route: pageUrl.pathname,
      title: scan.title,
    },
    summary: {
      total: matches.length,
      reliable: matches.filter((item) => item.confidence === "high" && !item.reviewRequired).length,
      review: matches.filter((item) => item.confidence === "medium" || item.reviewRequired).length,
      existing: matches.filter(isExisting).length,
      skipped: matches.filter((item) => item.confidence === "skipped" && !isExisting(item)).length,
    },
    fields: matches.map((match, index) => {
      const field = fieldsByToken.get(match.token);
      return {
        marker: index + 1,
        label: match.label,
        kind: field?.kind ?? "unknown",
        section: field?.section ?? "",
        required: field?.required ?? false,
        inputType: field?.inputType ?? "",
        readOnly: field?.readOnly ?? false,
        componentHint: field?.componentHint ?? "",
        optionCount: field?.options.length ?? 0,
        status: isExisting(match) ? "existing" : match.confidence,
        reviewRequired: match.reviewRequired,
        reason: match.reason,
        profilePath: match.profilePath,
      };
    }),
  };
}
