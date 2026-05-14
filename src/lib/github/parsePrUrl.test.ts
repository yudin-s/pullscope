import { describe, expect, it } from "vitest";
import { parseGitHubPrUrl } from "./parsePrUrl";

describe("parseGitHubPrUrl", () => {
  it("parses a canonical GitHub pull request URL", () => {
    expect(parseGitHubPrUrl("https://github.com/openai/codex/pull/123")).toEqual({
      owner: "openai",
      repo: "codex",
      pullNumber: 123,
    });
  });

  it("allows repository names with dots, dashes, and underscores", () => {
    expect(parseGitHubPrUrl("https://github.com/acme-labs/my_repo.tools/pull/7")).toEqual({
      owner: "acme-labs",
      repo: "my_repo.tools",
      pullNumber: 7,
    });
  });

  it("rejects non-GitHub hosts", () => {
    expect(() => parseGitHubPrUrl("https://example.com/openai/codex/pull/123")).toThrow(
      "Unsupported host",
    );
  });

  it("rejects branch, issue, and repository URLs", () => {
    expect(() => parseGitHubPrUrl("https://github.com/openai/codex/issues/123")).toThrow(
      "Expected URL",
    );
    expect(() => parseGitHubPrUrl("https://github.com/openai/codex")).toThrow(
      "Expected URL",
    );
  });

  it("requires HTTPS", () => {
    expect(() => parseGitHubPrUrl("http://github.com/openai/codex/pull/123")).toThrow(
      "HTTPS",
    );
  });
});
