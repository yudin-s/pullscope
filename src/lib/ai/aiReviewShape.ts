export interface AiReviewShape {
  combinedRiskScore?: number;
  overallRiskScore?: number;
  summary?: string;
  localSignals?: string[];
  aiFindings?: string[];
  criticalFindings?: string[];
  recommendations?: string[];
  securityConcerns?: string[];
  reliabilityConcerns?: string[];
  maintainabilityConcerns?: string[];
  testSuggestions?: string[];
  reviewComments?: Array<{
    file?: string;
    severity?: string;
    comment?: string;
  }>;
  codexPrompt?: string;
  mergeRecommendation?: string;
}

const listFields = [
  "localSignals",
  "aiFindings",
  "criticalFindings",
  "recommendations",
  "securityConcerns",
  "reliabilityConcerns",
  "maintainabilityConcerns",
  "testSuggestions",
] as const;

type ListField = (typeof listFields)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function textFromListItem(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (!isRecord(value)) return undefined;

  const file = typeof value.file === "string" ? value.file.trim() : "";
  const comment = typeof value.comment === "string" ? value.comment.trim() : "";
  if (file && comment) return `${file}: ${comment}`;

  for (const key of ["summary", "message", "comment", "detail", "text", "title", "label"]) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }

  const joined = Object.values(value)
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .join(" - ");
  return joined || undefined;
}

export function toAiTextList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(textFromListItem).filter((item): item is string => Boolean(item));
  }
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (isRecord(value)) {
    const looksLikeSingleItem = [
      "summary",
      "message",
      "comment",
      "detail",
      "text",
      "title",
      "label",
      "file",
    ].some((key) => key in value);
    const directText = looksLikeSingleItem ? textFromListItem(value) : undefined;
    if (directText) return [directText];
    return Object.values(value).flatMap(toAiTextList);
  }
  return [];
}

function isValidScore(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

export function validateAiReviewShape(value: unknown): value is AiReviewShape {
  if (!isRecord(value)) return false;
  const hasSummary = typeof value.summary === "string" && value.summary.trim().length > 0;
  const hasScore = isValidScore(value.combinedRiskScore) || isValidScore(value.overallRiskScore);
  const hasKnownList = listFields.some((field) => toAiTextList(value[field]).length > 0);
  return hasSummary && (hasScore || hasKnownList);
}

export function normalizeAiReviewShape(review: unknown): AiReviewShape {
  if (!isRecord(review)) return {};
  const normalized: AiReviewShape = { ...(review as AiReviewShape) };

  for (const field of listFields) {
    normalized[field] = toAiTextList(review[field]);
  }

  return normalized;
}
