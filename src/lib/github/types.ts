export type PullRequestState = "open" | "closed" | "merged" | "draft";

export interface PullRequestAuthor {
  login: string;
  id?: string | number;
  htmlUrl?: string;
  avatarUrl?: string;
}

export interface PullRequestMetadata {
  owner: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  htmlUrl: string;
  state: PullRequestState;
  createdAt: string;
  updatedAt: string;
  author: PullRequestAuthor;
  additions: number;
  deletions: number;
  changedFilesCount: number;
  commits: number;
  comments: number;
  isDraft: boolean;
  baseRef: string;
  headRef: string;
  baseSha?: string;
  headSha?: string;
}

export type ChangedFileStatus =
  | "added"
  | "removed"
  | "modified"
  | "renamed"
  | "copied"
  | "changed"
  | "unchanged";

export interface ChangedFile {
  filename: string;
  status: ChangedFileStatus;
  additions: number;
  deletions: number;
  changes: number;
  previousFilename?: string;
  patch?: string;
  blobUrl?: string;
  rawUrl?: string;
  contentsUrl?: string;
  sha?: string;
}

export interface PullRequestData {
  metadata: PullRequestMetadata;
  files: ChangedFile[];
}
