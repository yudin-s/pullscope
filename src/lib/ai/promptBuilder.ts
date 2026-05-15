import { ChangedFile, PullRequestData } from "../github/types";
import { RiskAssessment } from "../risk/types";

export interface PromptBuildOptions {
  maxFiles?: number;
  maxPatchCharsPerFile?: number;
  maxTotalPatchChars?: number;
  includePersonaNotes?: boolean;
}

function shortenText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function fileRiskScore(risk: RiskAssessment, filename: string): number {
  return risk.perFileScores.find((file) => file.filename === filename)?.score ?? 0;
}

function sortFilesForReview(files: ChangedFile[], risk: RiskAssessment): ChangedFile[] {
  return [...files].sort((a, b) => {
    const scoreDelta = fileRiskScore(risk, b.filename) - fileRiskScore(risk, a.filename);
    if (scoreDelta !== 0) return scoreDelta;
    return b.changes - a.changes;
  });
}

function fileSummary(file: ChangedFile, maxPatchChars = 250): string {
  const previous = file.previousFilename ? `, previous=${file.previousFilename}` : "";
  const links = [
    file.blobUrl ? `blob=${file.blobUrl}` : "",
    file.rawUrl ? `raw=${file.rawUrl}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const patch = file.patch
    ? `\nUNIFIED DIFF SNIPPET:\n${shortenText(file.patch, maxPatchChars)}`
    : "\nUNIFIED DIFF SNIPPET:\n<not available from GitHub API for this file>";

  return `FILE: ${file.filename}
Status: ${file.status}${previous}
Stats: +${file.additions}/-${file.deletions}, total changes=${file.changes}
${links ? `Links: ${links}\n` : ""}${patch}`;
}

function localRiskContext(risk: RiskAssessment): string {
  const reasons = risk.reasons
    .filter((reason) => !reason.label.toLowerCase().startsWith("no "))
    .slice(0, 8)
    .map((reason) => `- ${reason.label} (${reason.detail})`)
    .join("\n");
  const files = risk.perFileScores
    .slice(0, 8)
    .map((file) => `- ${file.filename}: ${file.score}/100 (${file.reasons.join(" ")})`)
    .join("\n");
  const personas = risk.personaNotes
    .map((note) => `- ${note.persona}: ${note.message}`)
    .join("\n");

  return `Local deterministic assessment:
Score: ${risk.overallScore}/100
Level: ${risk.level}

Local reasons:
${reasons || "- No major local risk signals."}

Highest-risk files:
${files || "- No direct file signals."}

Reviewer focus:
${personas || "- No persona-specific focus."}`;
}

export function buildRiskPrompt(
  pr: PullRequestData,
  risk: RiskAssessment,
  options: PromptBuildOptions = {}
): string {
  const maxFiles = options.maxFiles ?? 20;
  const maxPatchCharsPerFile = options.maxPatchCharsPerFile ?? 240;
  const maxTotalPatchChars = options.maxTotalPatchChars ?? maxFiles * maxPatchCharsPerFile;
  const fileEntries = sortFilesForReview(pr.files, risk).slice(0, maxFiles);
  const patchBudgetPerFile = Math.max(
    0,
    Math.floor(maxTotalPatchChars / Math.max(1, fileEntries.length))
  );
  const filesText = fileEntries
    .map((file) => fileSummary(file, Math.min(maxPatchCharsPerFile, patchBudgetPerFile)))
    .join("\n");

  const personaHint = options.includePersonaNotes ? "\n\nFocus notes: keep recommendations concise for the UI." : "";

  return `You are a PR risk triage assistant for PullScope.
Combine the deterministic local risk assessment with your model-based review of the changed files.
Treat the local score as the baseline. Adjust the combined score only when the diff evidence strongly supports it.
Summarize risk concisely as JSON with keys: combinedRiskScore, overallRiskScore, summary, localSignals, aiFindings, criticalFindings, recommendations, reviewComments, mergeRecommendation.
combinedRiskScore and overallRiskScore should be 0-100 and reflect the combined local+AI decision.
Use JSON arrays of strings for localSignals, aiFindings, criticalFindings, and recommendations.
Use reviewComments as an array of objects with file, severity, and comment when the diff supports file-specific feedback.
Prefer concrete evidence from unified diff snippets over generic security or reliability advice.
\n\nPR:
Repo: ${pr.metadata.owner}/${pr.metadata.repo}
PR #: ${pr.metadata.number}
Title: ${pr.metadata.title}
State: ${pr.metadata.state}
Author: ${pr.metadata.author.login}
Diff stats: +${pr.metadata.additions} -${pr.metadata.deletions}, files=${pr.files.length}, changedFiles=${pr.metadata.changedFilesCount}
\n\n${localRiskContext(risk)}
\n\nChanged files and unified diff snippets, sorted by local risk and size:
${filesText}\n\nRules:
- flag dependency/lock/infra/security touch
- flag absence of tests
- flag large diff / many files
- flag deleted tests
- explain when you are agreeing with local risk and when patch evidence changes it
- cite file paths and concrete changed behavior whenever possible
- say "insufficient diff evidence" instead of inventing risks when the snippet is too short
${personaHint}

Respond in compact JSON only.`;
}
