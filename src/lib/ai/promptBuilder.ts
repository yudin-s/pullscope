import { ChangedFile, PullRequestData } from "../github/types";
import { RiskAssessment } from "../risk/types";

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
  const fileEntries = pr.files.slice(0, maxFiles);
  const filesText = fileEntries
    .map((file) => fileSummary(file, maxPatchCharsPerFile))
    .join("\n");

  const personaHint = options.includePersonaNotes ? "\n\nFocus notes: keep recommendations concise for the UI." : "";

  return `You are a PR risk triage assistant for PullScope.
Combine the deterministic local risk assessment with your model-based review of the changed files.
Treat the local score as the baseline. Adjust the combined score only when the diff evidence strongly supports it.
Summarize risk concisely as JSON with keys: combinedRiskScore, overallRiskScore, summary, localSignals, aiFindings, criticalFindings, recommendations, mergeRecommendation.
combinedRiskScore and overallRiskScore should be 0-100 and reflect the combined local+AI decision.
\n\nPR:
Repo: ${pr.metadata.owner}/${pr.metadata.repo}
PR #: ${pr.metadata.number}
Title: ${pr.metadata.title}
State: ${pr.metadata.state}
Author: ${pr.metadata.author.login}
Diff stats: +${pr.metadata.additions} -${pr.metadata.deletions}, files=${pr.files.length}, changedFiles=${pr.metadata.changedFilesCount}
\n\n${localRiskContext(risk)}
\n\nChanged files:
${filesText}\n\nRules:
- flag dependency/lock/infra/security touch
- flag absence of tests
- flag large diff / many files
- flag deleted tests
- explain when you are agreeing with local risk and when patch evidence changes it
${personaHint}

Respond in compact JSON only.`;
}
