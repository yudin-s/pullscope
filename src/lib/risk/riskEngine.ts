import { PullRequestData } from "../github/types";
import { FileRiskEntry, PersonaNote, RiskAssessment, RiskLevel, RiskReason } from "./types";
import { evaluateRules } from "./rules";

function clamp(value: number): number {
  const asInt = Number.isFinite(value) ? Math.round(value) : 0;
  return Math.min(100, Math.max(0, asInt));
}

function toLevel(score: number): RiskLevel {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  return "low";
}

function splitReasons(raw: string): string[] {
  return raw
    .split(". ")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => (line.endsWith(".") ? line : `${line}.`));
}

function isActiveRiskReason(reason: string): boolean {
  const lower = reason.toLowerCase();
  return !(
    lower.startsWith("no ") ||
    lower.startsWith("at least one test") ||
    lower.startsWith("file count is contained") ||
    lower.startsWith("diff size is within")
  );
}

function inferFileReasons(filename: string, score: number): string[] {
  const lower = filename.toLowerCase();
  const reasons: string[] = [];

  if (/(^|\/)(package\.json|requirements\.txt|pyproject\.toml|cargo\.toml|go\.mod|composer\.json)$/i.test(filename)) {
    reasons.push("Dependency manifest changed.");
  }
  if (/(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|cargo\.lock|go\.sum|poetry\.lock|composer\.lock)$/i.test(filename)) {
    reasons.push("Lockfile changed.");
  }
  if (
    lower.includes(".github/workflows/") ||
    lower.includes("terraform") ||
    lower.includes("dockerfile") ||
    lower.includes("docker-compose") ||
    lower.includes("nginx") ||
    lower.includes("k8s") ||
    lower.includes("kubernetes")
  ) {
    reasons.push("Infrastructure or deployment file changed.");
  }
  if (/(auth|security|token|secret|password|jwt|oauth|cors|csrf|xss|sql|query|innerhtml)/i.test(filename)) {
    reasons.push("Security-sensitive file path.");
  }
  if (/\.(test|spec)\.[jt]sx?$/i.test(filename) || /(^|\/)(__tests__|test|tests)\//i.test(filename)) {
    reasons.push("Test coverage file changed.");
  }

  if (score > 0 && reasons.length === 0) {
    reasons.push(`Matched local risk signal score ${score}.`);
  }

  return reasons.length > 0 ? reasons : ["No direct file signal."];
}

function dedupeNotes(notes: PersonaNote[]): PersonaNote[] {
  const seen = new Set<string>();
  const out: PersonaNote[] = [];
  for (const note of notes) {
    const key = `${note.persona}:${note.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(note);
    }
  }
  return out;
}

export function runRiskEngine(pr: PullRequestData): RiskAssessment {
  const evalResult = evaluateRules(pr);
  const baseScore = clamp(evalResult.score);
  const level: RiskLevel = toLevel(baseScore);

  const fileScoreEntries: FileRiskEntry[] = pr.files.map((file) => {
    const score = clamp(evalResult.perFileScores[file.filename] ?? 0);

    return {
      filename: file.filename,
      score,
      reasons: inferFileReasons(file.filename, score).slice(0, 3),
    };
  });

  const reasons: RiskReason[] = splitReasons(evalResult.reason).filter(isActiveRiskReason).map(
    (line, index) => ({
      id: `${evalResult.id}-${index}`,
      label: line,
      score: baseScore,
      detail: line,
    })
  );

  return {
    overallScore: baseScore,
    level,
    reasons,
    perFileScores: fileScoreEntries,
    personaNotes: dedupeNotes(evalResult.personaNotes),
  };
}
