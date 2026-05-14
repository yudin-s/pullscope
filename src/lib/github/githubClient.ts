import { parseGitHubPrUrl } from "./parsePrUrl";
import {
  ChangedFile,
  ChangedFileStatus,
  PullRequestData,
  PullRequestMetadata,
  PullRequestState,
} from "./types";

const API_BASE = "https://api.github.com";

interface GithubPullResponse {
  id: number;
  number: number;
  title: string;
  html_url: string;
  url: string;
  state: "open" | "closed";
  locked: boolean;
  created_at: string;
  updated_at: string;
  additions: number;
  deletions: number;
  changed_files: number;
  comments: number;
  commits: number;
  draft: boolean;
  base: { ref: string; sha: string; repo: { full_name: string } };
  head: { ref: string; sha: string; repo: { full_name: string } };
  user: { login: string; id: string; html_url: string; avatar_url: string };
  body?: string;
  merged?: boolean;
}

interface GithubFileResponse {
  filename: string;
  status:
    | "added"
    | "removed"
    | "modified"
    | "renamed"
    | "copied"
    | "changed";
  additions: number;
  deletions: number;
  changes: number;
  previous_filename?: string;
  patch?: string;
  blob_url?: string;
  raw_url?: string;
  contents_url?: string;
  sha?: string;
}

function getPullState(
  pull: GithubPullResponse,
  maybeMerged: boolean | undefined
): PullRequestState {
  if (pull.draft) return "draft";
  if (maybeMerged) return "merged";
  return pull.state as PullRequestState;
}

function normalizeStatus(status: GithubFileResponse["status"]): ChangedFileStatus {
  return status;
}

function mapMetadata(
  owner: string,
  repo: string,
  pull: GithubPullResponse
): PullRequestMetadata {
  return {
    owner,
    repo,
    number: pull.number,
    title: pull.title,
    url: pull.url,
    htmlUrl: pull.html_url,
    state: getPullState(pull, pull.merged),
    createdAt: pull.created_at,
    updatedAt: pull.updated_at,
    author: {
      login: pull.user?.login ?? "unknown",
      id: pull.user?.id,
      htmlUrl: pull.user?.html_url,
      avatarUrl: pull.user?.avatar_url,
    },
    additions: pull.additions ?? 0,
    deletions: pull.deletions ?? 0,
    changedFilesCount: pull.changed_files ?? 0,
    commits: pull.commits ?? 0,
    comments: pull.comments ?? 0,
    isDraft: Boolean(pull.draft),
    baseRef: pull.base?.ref ?? "",
    headRef: pull.head?.ref ?? "",
    baseSha: pull.base?.sha,
    headSha: pull.head?.sha,
  };
}

function mapFile(file: GithubFileResponse): ChangedFile {
  return {
    filename: file.filename,
    status: normalizeStatus(file.status),
    additions: file.additions ?? 0,
    deletions: file.deletions ?? 0,
    changes: file.changes ?? 0,
    previousFilename: file.previous_filename,
    patch: file.patch,
    blobUrl: file.blob_url,
    rawUrl: file.raw_url,
    contentsUrl: file.contents_url,
    sha: file.sha,
  };
}

function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const parts = linkHeader.split(",");
  for (const part of parts) {
    const section = part.trim();
    const m = section.match(/^<([^>]+)>\s*;\s*rel="next"$/i);
    if (m) {
      return m[1];
    }
  }
  return null;
}

async function githubGetJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
    },
    signal,
  });

  if (!response.ok) {
    const status = response.status;
    const text = await response.text().catch(() => "");
    throw new Error(
      `GitHub API request failed: ${status} ${response.statusText}. ${text}`
    );
  }

  return (await response.json()) as T;
}

async function fetchAllFiles(
  owner: string,
  repo: string,
  pullNumber: number,
  signal?: AbortSignal
): Promise<ChangedFile[]> {
  const files: ChangedFile[] = [];
  let url: string | null = `${API_BASE}/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=100&page=1`;

  while (url) {
    const response = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
      signal,
    });

    if (!response.ok) {
      const status = response.status;
      const text = await response.text().catch(() => "");
      throw new Error(
        `GitHub API files request failed: ${status} ${response.statusText}. ${text}`
      );
    }

    const pageFiles = (await response.json()) as GithubFileResponse[];
    files.push(...pageFiles.map(mapFile));
    url = parseNextLink(response.headers.get("Link"));
  }

  return files;
}

export interface FetchPrDataOptions {
  signal?: AbortSignal;
}

export async function fetchPrData(
  url: string,
  options: FetchPrDataOptions = {}
): Promise<PullRequestData> {
  const { owner, repo, pullNumber } = parseGitHubPrUrl(url);
  const [pullResponse, filesResponse] = await Promise.all([
    githubGetJson<GithubPullResponse>(
      `${API_BASE}/repos/${owner}/${repo}/pulls/${pullNumber}`,
      options.signal
    ),
    fetchAllFiles(owner, repo, pullNumber, options.signal),
  ]);

  return {
    metadata: mapMetadata(owner, repo, pullResponse),
    files: filesResponse,
  };
}
