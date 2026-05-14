import { ChangedFile, PullRequestData } from "../github/types";

export interface PromptBuildOptions {
  maxFiles?: number;
  maxPatchCharsPerFile?: number;
  includePersonaNotes?: boolean;
}

function shortenText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function fileSummary(file: ChangedFile, maxPatchCharsPerFile = 250): string {
  const patch = file.patch ? `\nPATCH:\n${shortenText(file.patch, maxPatchCharsPerFile)}` : "";
  return `- ${file.filename} (${file.status}, +${file.additions}/-${file.deletions}=${file.changes})${patch}`;
}

export function buildRiskPrompt(
  pr: PullRequestData,
  options: PromptBuildOptions = {}
): string {
  const maxFiles = options.maxFiles ?? 20;
  const maxPatchCharsPerFile = options.maxPatchCharsPerFile ?? 240;
  const fileEntries = pr.files.slice(0, maxFiles);
  const filesText = fileEntries
    .map((file) => fileSummary(file, maxPatchCharsPerFile))
    .join("\n");

  const personaHint = options.includePersonaNotes ? "\n\nFocus notes: keep recommendations concise for the UI." : "";

  return `You are a PR risk triage assistant for PullScope.
Summarize risk concisely as JSON with keys: overallRiskScore, summary, criticalFindings, recommendations.
Overall score 0-100 should consider scope, change size, dependency/security risk, infra scope, and test coverage.
\n\nPR:
Repo: ${pr.metadata.owner}/${pr.metadata.repo}
PR #: ${pr.metadata.number}
Title: ${pr.metadata.title}
State: ${pr.metadata.state}
Author: ${pr.metadata.author.login}
Diff stats: +${pr.metadata.additions} -${pr.metadata.deletions}, files=${pr.files.length}, changedFiles=${pr.metadata.changedFilesCount}
\n\nChanged files:
${filesText}\n\nRules:
- flag dependency/lock/infra/security touch
- flag absence of tests
- flag large diff / many files
- flag deleted tests
${personaHint}

Respond in compact JSON only.`;
}
