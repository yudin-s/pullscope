import { describe, expect, it } from "vitest";
import { PullRequestData } from "../github/types";
import { RiskAssessment } from "../risk/types";
import { buildRiskPrompt } from "./promptBuilder";

const pr: PullRequestData = {
  metadata: {
    owner: "acme",
    repo: "widget",
    number: 42,
    title: "Tighten params prototype handling",
    url: "https://api.github.com/repos/acme/widget/pulls/42",
    htmlUrl: "https://github.com/acme/widget/pull/42",
    state: "open",
    createdAt: "2026-05-15T00:00:00Z",
    updatedAt: "2026-05-15T00:00:00Z",
    author: { login: "octo" },
    additions: 12,
    deletions: 4,
    changedFilesCount: 2,
    commits: 1,
    comments: 0,
    isDraft: false,
    baseRef: "main",
    headRef: "fix-params",
  },
  files: [
    {
      filename: "docs/readme.md",
      status: "modified",
      additions: 2,
      deletions: 1,
      changes: 3,
      patch: "docs patch",
    },
    {
      filename: "src/params.ts",
      status: "modified",
      additions: 10,
      deletions: 3,
      changes: 13,
      patch: "+ Object.hasOwn(params, key)\n- key in params",
    },
  ],
};

const risk: RiskAssessment = {
  overallScore: 35,
  level: "medium",
  reasons: [
    {
      id: "security",
      label: "Security-sensitive patch keywords",
      score: 25,
      detail: "Prototype handling changed.",
    },
  ],
  perFileScores: [
    { filename: "docs/readme.md", score: 5, reasons: [] },
    { filename: "src/params.ts", score: 80, reasons: ["Security-sensitive patch keywords"] },
  ],
  personaNotes: [{ persona: "security", message: "Check prototype shadowing behavior." }],
};

describe("buildRiskPrompt", () => {
  it("puts high-risk files first and asks for concrete diff evidence", () => {
    const prompt = buildRiskPrompt(pr, risk, {
      maxFiles: 2,
      maxPatchCharsPerFile: 500,
      maxTotalPatchChars: 1000,
      includePersonaNotes: true,
    });

    expect(prompt.indexOf("FILE: src/params.ts")).toBeLessThan(
      prompt.indexOf("FILE: docs/readme.md")
    );
    expect(prompt).toContain("UNIFIED DIFF SNIPPET");
    expect(prompt).toContain("Use JSON arrays of strings");
    expect(prompt).toContain("cite file paths and concrete changed behavior");
    expect(prompt).toContain("+ Object.hasOwn(params, key)");
  });
});
