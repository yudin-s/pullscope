export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface FileRiskEntry {
  filename: string;
  score: number;
  reasons: string[];
}

export interface RiskReason {
  id: string;
  label: string;
  score: number;
  detail: string;
}

export interface PersonaNote {
  persona: "security" | "reliability" | "maintainability" | "dx";
  message: string;
}

export interface RiskAssessment {
  overallScore: number;
  level: RiskLevel;
  reasons: RiskReason[];
  perFileScores: FileRiskEntry[];
  personaNotes: PersonaNote[];
}
