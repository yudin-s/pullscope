export interface ParsedGitHubPrUrl {
  owner: string;
  repo: string;
  pullNumber: number;
}

const PR_PATH_RE = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/i;
const SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

function ensurePathSegment(segment: string, label: string): string {
  if (!SEGMENT_RE.test(segment)) {
    throw new Error(`Invalid GitHub ${label}: ${segment}`);
  }
  return segment;
}

export function parseGitHubPrUrl(url: string): ParsedGitHubPrUrl {
  if (!url || typeof url !== "string") {
    throw new Error("GitHub PR URL is required");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL format");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("GitHub PR URL must use HTTPS");
  }

  if (parsed.hostname.toLowerCase() !== "github.com") {
    throw new Error("Unsupported host for GitHub PR URL");
  }

  const match = parsed.pathname.match(PR_PATH_RE);
  if (!match) {
    throw new Error("Expected URL like https://github.com/owner/repo/pull/123");
  }

  const owner = ensurePathSegment(match[1], "owner");
  const repo = ensurePathSegment(match[2], "repo");
  const pullNumber = Number.parseInt(match[3], 10);

  if (!Number.isFinite(pullNumber) || pullNumber <= 0) {
    throw new Error("Pull number must be a positive integer");
  }

  return { owner, repo, pullNumber };
}

