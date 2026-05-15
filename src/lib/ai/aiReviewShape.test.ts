import { describe, expect, it } from "vitest";
import { normalizeAiReviewShape, toAiTextList, validateAiReviewShape } from "./aiReviewShape";

describe("AI review shape normalization", () => {
  it("accepts model responses that use object dictionaries for list fields", () => {
    const raw = {
      summary: "Risk looks moderate.",
      overallRiskScore: 41,
      localSignals: {
        dependency: "Dependency manifest changed",
        tests: "No matching test update",
      },
      recommendations: {
        first: { message: "Review dependency provenance" },
        second: { file: "package.json", comment: "Check semver range" },
      },
    };

    expect(validateAiReviewShape(raw)).toBe(true);

    const normalized = normalizeAiReviewShape(raw);

    expect(normalized.localSignals).toEqual([
      "Dependency manifest changed",
      "No matching test update",
    ]);
    expect(normalized.recommendations).toEqual([
      "Review dependency provenance",
      "package.json: Check semver range",
    ]);
  });

  it("returns an empty list for unsupported values instead of crashing render", () => {
    expect(toAiTextList(undefined)).toEqual([]);
    expect(toAiTextList({ empty: null })).toEqual([]);
  });
});
