import { describe, expect, it } from "vitest";
import { buildGitHubHeaders } from "./githubClient";

describe("buildGitHubHeaders", () => {
  it("adds bearer auth only when a token is provided", () => {
    expect(buildGitHubHeaders()).toEqual({
      Accept: "application/vnd.github+json",
    });

    expect(buildGitHubHeaders("ghp_test")).toEqual({
      Accept: "application/vnd.github+json",
      Authorization: "Bearer ghp_test",
    });
  });
});
