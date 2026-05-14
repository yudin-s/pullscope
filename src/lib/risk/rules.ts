import { PullRequestData } from "../github/types";
import { PersonaNote } from "./types";

export interface RuleEvaluation {
  id: string;
  reason: string;
  score: number;
  perFileScores: Record<string, number>;
  personaNotes: PersonaNote[];
}

export type RuleEvaluator = (data: PullRequestData) => RuleEvaluation;

const DEPENDENCY_KEYWORDS = [
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "composer.json",
  "requirements.txt",
  "pyproject.toml",
  "cargo.toml",
  "cargo.lock",
  "go.mod",
  "pom.xml",
  "gemfile",
  "gradle",
];

const LOCKFILE_KEYWORDS = [
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "poetry.lock",
  "pipfile.lock",
  "cargo.lock",
  "composer.lock",
  "go.sum",
  "mix.lock",
];

const INFRA_KEYWORDS = [
  "terraform",
  "helm",
  "kubernetes",
  "k8s",
  "dockerfile",
  "docker-compose",
  "nginx",
  ".github/workflows/",
  "ci.yml",
  "workflow",
];

const SECURITY_KEYWORDS = [
  "auth",
  "security",
  "permission",
  "token",
  "secret",
  "password",
  "credential",
  "jwt",
  "oauth",
  "eval",
  "exec",
  "innerhtml",
  "dangerouslysetinnerhtml",
  "sql",
  "query",
  "cors",
  "csrf",
  "xss",
  "encryption",
  "api_key",
  "acl",
];

function hasTestRelatedFile(filename: string): boolean {
  return (
    /\.(test|spec)\.[jt]sx?$/i.test(filename) ||
    /(^|\/)(__tests__|test|tests)\//i.test(filename)
  );
}

function hasProductionFileChange(data: PullRequestData): boolean {
  return data.files.some((file) => {
    const name = file.filename.toLowerCase();
    return (
      !hasTestRelatedFile(name) &&
      !name.endsWith(".md") &&
      !name.includes("/docs/") &&
      !name.includes("readme") &&
      file.status !== "removed"
    );
  });
}

function detectKeywordInText(source: string, needles: string[]): boolean {
  const lower = source.toLowerCase();
  return needles.some((token) => lower.includes(token));
}

function mergeRuleEvaluations(items: RuleEvaluation[]): RuleEvaluation {
  const merged: RuleEvaluation = {
    id: "aggregate",
    reason: "",
    score: 0,
    perFileScores: {},
    personaNotes: [],
  };

  const seenReasons = new Set<string>();
  const seenNotes = new Set<string>();

  for (const item of items) {
    merged.score += item.score;
    if (item.reason && !seenReasons.has(item.reason)) {
      seenReasons.add(item.reason);
      merged.reason += (merged.reason ? " " : "") + item.reason;
    }

    for (const [file, score] of Object.entries(item.perFileScores)) {
      merged.perFileScores[file] = (merged.perFileScores[file] ?? 0) + score;
    }

    for (const note of item.personaNotes) {
      const key = `${note.persona}:${note.message}`;
      if (!seenNotes.has(key)) {
        seenNotes.add(key);
        merged.personaNotes.push(note);
      }
    }
  }

  return merged;
}

const dependencyRule: RuleEvaluator = (data) => {
  const touched = data.files.filter((file) =>
    DEPENDENCY_KEYWORDS.some((token) =>
      file.filename.toLowerCase().includes(token)
    )
  );

  const perFileScores: Record<string, number> = {};
  for (const file of touched) {
    perFileScores[file.filename] = 18;
  }

  return {
    id: "dependency-keywords",
    reason:
      touched.length > 0
        ? "Dependency manifests changed; review dependency updates and provenance."
        : "No dependency manifest changes.",
    score: touched.length > 0 ? 12 : 0,
    perFileScores,
    personaNotes:
      touched.length > 0
        ? [
            {
              persona: "security",
              message:
                "Validate dependency provenance and lockfile integrity before merge.",
            },
            {
              persona: "dx",
              message:
                "Keep changelog notes updated for any dependency and tooling edits.",
            },
          ]
        : [],
  };
};

const lockfileRule: RuleEvaluator = (data) => {
  const touched = data.files.filter((file) =>
    LOCKFILE_KEYWORDS.some((token) =>
      file.filename.toLowerCase().includes(token)
    )
  );

  const perFileScores: Record<string, number> = {};
  for (const file of touched) {
    perFileScores[file.filename] = 14;
  }

  return {
    id: "lockfile-keywords",
    reason:
      touched.length > 0
        ? "Lockfile changes detected, increasing supply-chain blast radius."
        : "No lockfile changes.",
    score: Math.min(24, touched.length * 9),
    perFileScores,
    personaNotes:
      touched.length > 0
        ? [
            {
              persona: "security",
              message:
                "Approve lockfile diffs only if dependency updates are expected.",
            },
          ]
        : [],
  };
};

const infraRule: RuleEvaluator = (data) => {
  const touched = data.files.filter((file) =>
    INFRA_KEYWORDS.some((token) => file.filename.toLowerCase().includes(token))
  );

  const perFileScores: Record<string, number> = {};
  for (const file of touched) {
    perFileScores[file.filename] = 13;
  }

  return {
    id: "infra-keywords",
    reason:
      touched.length > 0
        ? "Infrastructure files changed; coordinate deployment and rollback risk."
        : "No infra files changed.",
    score: Math.min(25, touched.length * 9),
    perFileScores,
    personaNotes:
      touched.length > 0
        ? [
            {
              persona: "reliability",
              message:
                "Validate infra drift, rollback windows, and environment parity.",
            },
          ]
        : [],
  };
};

const securityRule: RuleEvaluator = (data) => {
  const touched = data.files.filter((file) => {
    const text = `${file.filename} ${file.patch ?? ""}`.toLowerCase();
    return detectKeywordInText(text, SECURITY_KEYWORDS);
  });

  const perFileScores: Record<string, number> = {};
  for (const file of touched) {
    perFileScores[file.filename] = 16;
  }

  return {
    id: "security-keywords",
    reason:
      touched.length > 0
        ? "Security-related code and config changed; perform focused authz/authn checks."
        : "No explicit security keywords in changed files.",
    score: Math.min(28, touched.length * 11),
    perFileScores,
    personaNotes:
      touched.length > 0
        ? [
            {
              persona: "security",
              message:
                "Prioritize security review for auth, secret handling, and permission logic.",
            },
          ]
        : [],
  };
};

const noTestsRule: RuleEvaluator = (data) => {
  const hasTests = data.files.some(
    (file) => file.status !== "removed" && hasTestRelatedFile(file.filename)
  );
  const hasProductionChange = hasProductionFileChange(data);
  if (hasTests) {
    return {
      id: "has-tests",
      reason: "At least one test/spec file exists in the PR.",
      score: 0,
      perFileScores: {},
      personaNotes: [],
    };
  }

  if (!hasProductionChange) {
    return {
      id: "no-production-test-required",
      reason: "No production code change requiring new test coverage was detected.",
      score: 0,
      perFileScores: {},
      personaNotes: [],
    };
  }

  return {
    id: "missing-tests",
    reason:
      "No new or updated test/spec file detected; regression confidence drops.",
    score: 14,
    perFileScores: {},
    personaNotes: [
      {
        persona: "reliability",
        message: "Require replacement coverage before merge approval.",
      },
    ],
  };
};

const heavilyModifiedTestsRule: RuleEvaluator = (data) => {
  const heavyTests = data.files.filter(
    (file) => file.status !== "removed" && hasTestRelatedFile(file.filename) && file.changes >= 100
  );

  const perFileScores: Record<string, number> = {};
  for (const file of heavyTests) {
    perFileScores[file.filename] = 8;
  }

  return {
    id: "heavily-modified-tests",
    reason:
      heavyTests.length > 0
        ? "Large test changes detected; verify coverage was expanded rather than weakened."
        : "No heavily modified tests detected.",
    score: Math.min(12, heavyTests.length * 6),
    perFileScores,
    personaNotes:
      heavyTests.length > 0
        ? [
            {
              persona: "reliability",
              message:
                "Review test diffs for removed assertions, weaker fixtures, or skipped cases.",
            },
          ]
        : [],
  };
};

const largeDiffRule: RuleEvaluator = (data) => {
  const totalChanges = data.files.reduce(
    (acc, file) => acc + (file.changes || 0),
    0
  );
  const perFileScores: Record<string, number> = {};
  let score = 0;

  if (totalChanges > 1200) score = 22;
  else if (totalChanges > 700) score = 16;
  else if (totalChanges > 250) score = 10;

  if (score > 0) {
    const topFiles = [...data.files]
      .sort((a, b) => (b.changes || 0) - (a.changes || 0))
      .slice(0, Math.min(4, data.files.length));
    const distributed = Math.ceil(score / Math.max(topFiles.length, 1));
    for (const file of topFiles) {
      perFileScores[file.filename] = distributed;
    }
  }

  return {
    id: "large-diff",
    reason:
      score > 0
        ? `Large diff detected (${totalChanges} changed lines), raise review load and bug risk.`
        : "Diff size is within normal bounds.",
    score,
    perFileScores,
    personaNotes:
      score > 0
        ? [
            {
              persona: "maintainability",
              message:
                "Consider splitting large diff into smaller reviewable chunks.",
            },
          ]
        : [],
  };
};

const manyFilesRule: RuleEvaluator = (data) => {
  const fileCount = data.files.length;
  let score = 0;

  if (fileCount >= 25) score = 14;
  else if (fileCount >= 16) score = 10;
  else if (fileCount >= 10) score = 6;

  return {
    id: "many-files",
    reason:
      score > 0
        ? `Many files changed (${fileCount}); cross-module interactions can hide regressions.`
        : "File count is contained.",
    score,
    perFileScores: {},
    personaNotes:
      score >= 10
        ? [
            {
              persona: "maintainability",
              message:
                "Validate release notes and communication for broad cross-module change.",
            },
          ]
        : [],
  };
};

const deletedTestsRule: RuleEvaluator = (data) => {
  const removedTests = data.files.filter(
    (file) => file.status === "removed" && hasTestRelatedFile(file.filename)
  );

  const perFileScores: Record<string, number> = {};
  for (const file of removedTests) {
    perFileScores[file.filename] = 20;
  }

  return {
    id: "deleted-tests",
    reason:
      removedTests.length > 0
        ? "Test files were deleted; regression safety coverage may be reduced."
        : "No test files were deleted.",
    score: Math.min(20, removedTests.length * 10),
    perFileScores,
    personaNotes:
      removedTests.length > 0
        ? [
            {
              persona: "reliability",
              message:
                "Ask for explicit replacement test coverage or migration plan for deleted tests.",
            },
          ]
        : [],
  };
};

export const riskRules: RuleEvaluator[] = [
  dependencyRule,
  lockfileRule,
  infraRule,
  securityRule,
  noTestsRule,
  heavilyModifiedTestsRule,
  largeDiffRule,
  manyFilesRule,
  deletedTestsRule,
];

export function evaluateRules(data: PullRequestData): RuleEvaluation {
  return mergeRuleEvaluations(riskRules.map((rule) => rule(data)));
}
