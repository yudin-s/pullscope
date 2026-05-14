import { FormEvent, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clipboard,
  Code2,
  FileCode2,
  Gauge,
  Github,
  KeyRound,
  Loader2,
  Lock,
  Network,
  Radar,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wand2,
  XCircle,
} from "lucide-react";
import clsx from "clsx";
import { demoPullRequestData } from "../lib/demo/demoFixture";
import { fetchPrData } from "../lib/github/githubClient";
import { PullRequestData } from "../lib/github/types";
import { checkEndpointReachability } from "../lib/ai/corsDoctor";
import { callOpenAICompatible } from "../lib/ai/openaiCompatible";
import { buildRiskPrompt } from "../lib/ai/promptBuilder";
import {
  buildProviderHeaders,
  EndpointMode,
  getProviderPreset,
  getProviderPresets,
  ProviderId,
  ProviderSelection,
  setProviderApiKeyInMemory,
} from "../lib/ai/providers";
import { parseStructuredResponse } from "../lib/ai/responseParser";
import { runRiskEngine } from "../lib/risk/riskEngine";
import { RiskAssessment } from "../lib/risk/types";
import {
  getModelProfiles,
  ModelProfile,
  saveModelProfile,
  StorageScope,
} from "../lib/storage/modelProfileStorage";

type LoadState = "idle" | "loading" | "error";

interface AiReviewShape {
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

interface DiagnosticRow {
  label: string;
  status: "pass" | "warn" | "fail" | "pending";
  detail: string;
}

const samplePrUrl = "https://github.com/vercel/next.js/pull/70568";

function latestProfile(profiles: ModelProfile[]): ModelProfile | undefined {
  return [...profiles].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

function levelTone(level: RiskAssessment["level"]) {
  return {
    low: "text-signal-lime border-signal-lime/30 bg-signal-lime/10",
    medium: "text-signal-amber border-signal-amber/30 bg-signal-amber/10",
    high: "text-orange-300 border-orange-300/30 bg-orange-300/10",
    critical: "text-signal-rose border-signal-rose/30 bg-signal-rose/10",
  }[level];
}

function scoreGradient(score: number) {
  if (score >= 80) return "from-signal-rose to-orange-300";
  if (score >= 60) return "from-orange-300 to-signal-amber";
  if (score >= 35) return "from-signal-amber to-signal-cyan";
  return "from-signal-lime to-signal-cyan";
}

function shortDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function humanPersona(persona: string) {
  return {
    security: "Security reviewer",
    reliability: "Reliability reviewer",
    maintainability: "Maintainability reviewer",
    dx: "DX reviewer",
  }[persona] ?? persona;
}

function buildCodexBrief(pr: PullRequestData, risk: RiskAssessment) {
  const topFiles = [...risk.perFileScores]
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((file) => `- ${file.filename}: ${file.score}/100 (${file.reasons.join(" ")})`)
    .join("\n");

  const reasons = risk.reasons
    .filter((reason) => !reason.label.toLowerCase().startsWith("no "))
    .slice(0, 8)
    .map((reason) => `- ${reason.label}`)
    .join("\n");

  return `# PullScope Review Brief

Review this GitHub PR with extra attention to risk signals.

PR: ${pr.metadata.htmlUrl}
Repository: ${pr.metadata.owner}/${pr.metadata.repo}
Title: ${pr.metadata.title}
Author: ${pr.metadata.author.login}
Branches: ${pr.metadata.baseRef} <- ${pr.metadata.headRef}
Diff stats: +${pr.metadata.additions} / -${pr.metadata.deletions}, ${pr.files.length} files

## Local Risk

Score: ${risk.overallScore}/100
Level: ${risk.level}

## Main Reasons

${reasons || "- No major local risk signals."}

## Highest-Risk Files

${topFiles || "- No direct file signals."}

## Reviewer Focus

${risk.personaNotes.map((note) => `- ${humanPersona(note.persona)}: ${note.message}`).join("\n")}

Please produce a concise code review with blocking findings first, concrete file-level concerns, missing tests, and a merge recommendation.`;
}

async function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the legacy command for embedded browsers.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error("Clipboard command was blocked by the browser.");
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function validateAiReviewShape(value: unknown): value is AiReviewShape {
  if (!value || typeof value !== "object") return false;
  const review = value as AiReviewShape;
  const hasSummary = typeof review.summary === "string" && review.summary.trim().length > 0;
  const hasScore =
    (typeof review.combinedRiskScore === "number" &&
      Number.isFinite(review.combinedRiskScore) &&
      review.combinedRiskScore >= 0 &&
      review.combinedRiskScore <= 100) ||
    (typeof review.overallRiskScore === "number" &&
      Number.isFinite(review.overallRiskScore) &&
      review.overallRiskScore >= 0 &&
      review.overallRiskScore <= 100);
  const hasKnownList =
    isStringArray(review.localSignals) ||
    isStringArray(review.aiFindings) ||
    isStringArray(review.criticalFindings) ||
    isStringArray(review.recommendations) ||
    isStringArray(review.securityConcerns) ||
    isStringArray(review.reliabilityConcerns) ||
    isStringArray(review.maintainabilityConcerns) ||
    isStringArray(review.testSuggestions);
  return hasSummary && (hasScore || hasKnownList);
}

function extractModelIds(raw: unknown): string[] {
  const source = raw as {
    data?: Array<{ id?: unknown; name?: unknown; model?: unknown }>;
    models?: Array<string | { id?: unknown; name?: unknown; model?: unknown }>;
  };
  const candidates = Array.isArray(source.data)
    ? source.data
    : Array.isArray(source.models)
      ? source.models
      : [];
  const ids = candidates
    .map((item) => {
      if (typeof item === "string") return item;
      return item.id ?? item.name ?? item.model;
    })
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

function providerErrorMessage(raw: unknown, fallback: string): string {
  const body = raw as { error?: { message?: unknown }; message?: unknown };
  if (typeof body?.error?.message === "string") return body.error.message;
  if (typeof body?.message === "string") return body.message;
  return fallback;
}

function StatusIcon({ status }: { status: DiagnosticRow["status"] }) {
  if (status === "pass") return <CheckCircle2 className="h-4 w-4 text-signal-lime" />;
  if (status === "fail") return <XCircle className="h-4 w-4 text-signal-rose" />;
  if (status === "warn") return <AlertTriangle className="h-4 w-4 text-signal-amber" />;
  return <Loader2 className="h-4 w-4 animate-spin text-signal-cyan" />;
}

function HelpTooltip({ label }: { label: string }) {
  return (
    <span className="group relative inline-flex">
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-white/[0.04] text-xs font-semibold text-slate-300">
        ?
      </span>
      <span className="pointer-events-none absolute left-1/2 top-7 z-20 hidden w-72 -translate-x-1/2 rounded-lg border border-white/10 bg-ink-950 p-3 text-xs leading-5 text-slate-300 shadow-glow group-hover:block group-focus-within:block">
        {label}
      </span>
    </span>
  );
}

function Modal({
  title,
  icon,
  children,
  onClose,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/80 px-4 backdrop-blur">
      <div className="max-h-[86vh] w-full max-w-2xl overflow-auto rounded-lg border border-white/10 bg-ink-900 p-5 shadow-glow">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {icon}
            <h2 className="text-xl font-semibold text-white">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10"
          >
            Close
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

function DesignSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string; hint?: string }>;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((state) => !state)}
        className="flex min-h-[46px] w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-ink-950 px-3 py-3 text-left text-sm text-white outline-none transition hover:bg-white/[0.04] focus:border-signal-cyan"
      >
        <span className="min-w-0">
          <span className="block truncate">{selected?.label ?? value}</span>
          {selected?.hint && (
            <span className="mt-1 block truncate text-xs text-slate-500">{selected.hint}</span>
          )}
        </span>
        <ArrowRight
          className={clsx(
            "h-4 w-4 shrink-0 text-slate-500 transition",
            open ? "-rotate-90 text-signal-cyan" : "rotate-90",
          )}
        />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={`${ariaLabel} options`}
          className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-lg border border-white/10 bg-ink-950 p-1 shadow-glow"
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={clsx(
                "w-full rounded-lg px-3 py-2 text-left text-sm transition",
                option.value === value
                  ? "bg-signal-cyan/10 text-white"
                  : "text-slate-300 hover:bg-white/[0.06]",
              )}
            >
              <span className="block truncate font-medium">{option.label}</span>
              {option.hint && (
                <span className="mt-1 block truncate text-xs text-slate-500">{option.hint}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function App() {
  const presets = getProviderPresets();
  const [prUrl, setPrUrl] = useState(samplePrUrl);
  const [prData, setPrData] = useState<PullRequestData>(demoPullRequestData);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [githubToken, setGithubToken] = useState("");

  const [providerId, setProviderId] = useState<ProviderId>("openai");
  const selectedPreset = getProviderPreset(providerId);
  const [aiPowerEnabled, setAiPowerEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState(selectedPreset.defaultBaseUrl);
  const [model, setModel] = useState(selectedPreset.defaultModel);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [modelLoadState, setModelLoadState] = useState<LoadState>("idle");
  const [modelLoadMessage, setModelLoadMessage] = useState("");
  const [endpointMode, setEndpointMode] = useState<EndpointMode>("auto");
  const [apiKey, setApiKey] = useState("");
  const [profileStorage, setProfileStorage] = useState<StorageScope>("memory");
  const saveProfile = profileStorage !== "memory";
  const [diagnostics, setDiagnostics] = useState<DiagnosticRow[]>([]);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [doctorRunning, setDoctorRunning] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiErrorOpen, setAiErrorOpen] = useState(false);
  const [aiReview, setAiReview] = useState<{
    parsed?: AiReviewShape;
    raw: string;
    endpoint?: string;
    parsedOk: boolean;
  } | null>(null);

  const risk = useMemo(() => runRiskEngine(prData), [prData]);
  const codexBrief = useMemo(() => buildCodexBrief(prData, risk), [prData, risk]);
  const modelOptions = useMemo(() => {
    const options = [
      ...fetchedModels,
      ...selectedPreset.suggestedModels,
      selectedPreset.defaultModel,
      model,
    ].filter(Boolean);
    return [...new Set(options)];
  }, [fetchedModels, model, selectedPreset]);

  useEffect(() => {
    const consent = { allowSessionStorage: true, allowLocalStorage: true };
    const sessionProfile = latestProfile(getModelProfiles("session", consent));
    const localProfile = latestProfile(getModelProfiles("local", consent));
    if (sessionProfile) {
      applyStoredProfile(sessionProfile, "session");
    } else if (localProfile) {
      applyStoredProfile(localProfile, "local");
    }
  }, []);

  useEffect(() => {
    if (profileStorage === "memory") return;
    persistModelProfile(profileStorage);
  }, [profileStorage, providerId, baseUrl, model, endpointMode]);

  function selectPreset(nextId: ProviderId) {
    const nextPreset = getProviderPreset(nextId);
    setProviderId(nextId);
    setBaseUrl(nextPreset.defaultBaseUrl);
    setModel(nextPreset.defaultModel);
    setFetchedModels([]);
    setModelLoadState("idle");
    setModelLoadMessage("");
    setEndpointMode("auto");
    setApiKey("");
    setProviderApiKeyInMemory(nextId, undefined);
    setDiagnostics([]);
    setAiReview(null);
  }

  function currentProvider(): ProviderSelection {
    setProviderApiKeyInMemory(providerId, apiKey || undefined);
    return {
      id: providerId,
      baseUrl,
      model,
      endpointMode,
      apiKey: apiKey || undefined,
    };
  }

  function applyStoredProfile(profile: ModelProfile, scope: StorageScope) {
    if (!presets.some((preset) => preset.id === profile.providerId)) return;
    const preset = getProviderPreset(profile.providerId as ProviderId);
    setProviderId(profile.providerId as ProviderId);
    setBaseUrl(profile.baseUrl || preset.defaultBaseUrl);
    setModel(profile.model || preset.defaultModel);
    setEndpointMode((profile.endpointMode as EndpointMode | undefined) || "auto");
    setProfileStorage(scope);
  }

  function persistModelProfile(scope: StorageScope) {
    saveModelProfile(
      {
        providerId,
        baseUrl,
        model,
        endpointMode,
        updatedAt: new Date().toISOString(),
      },
      scope,
      {
        allowSessionStorage: scope === "session",
        allowLocalStorage: scope === "local",
      },
    );
  }

  async function analyzeLivePr(event: FormEvent) {
    event.preventDefault();
    setLoadState("loading");
    setError("");
    setAiReview(null);
    setAiError("");
    try {
      const data = await fetchPrData(prUrl.trim(), {
        githubToken: githubToken || undefined,
      });
      setPrData(data);
      setLoadState("idle");
    } catch (err) {
      setLoadState("error");
      setError(String((err as Error)?.message ?? err));
    }
  }

  function loadDemo() {
    setPrData(demoPullRequestData);
    setLoadState("idle");
    setError("");
    setAiReview(null);
    setAiError("");
  }

  async function runDoctor() {
    setDoctorRunning(true);
    setDiagnosticsOpen(true);
    setDiagnostics([{ label: "URL syntax", status: "pending", detail: "Checking base URL." }]);
    const rows: DiagnosticRow[] = [];

    try {
      const url = new URL(baseUrl);
      rows.push({
        label: "URL syntax",
        status: ["http:", "https:"].includes(url.protocol) ? "pass" : "fail",
        detail: `${url.protocol}//${url.host}`,
      });
    } catch {
      rows.push({
        label: "URL syntax",
        status: "fail",
        detail: "The base URL is not a valid URL.",
      });
      setDiagnostics(rows);
      setDoctorRunning(false);
      return;
    }

    rows.push({
      label: "Key handling",
      status: apiKey || !selectedPreset.auth.needsApiKey ? "pass" : "warn",
      detail: selectedPreset.auth.needsApiKey
        ? apiKey
          ? "API key is held in memory for this tab."
          : "This preset usually needs a bearer key."
        : "This preset usually works without an API key.",
    });
    rows.push({
      label: "Endpoint mode",
      status: "pass",
      detail:
        endpointMode === "auto"
          ? `Auto mode will prefer ${selectedPreset.supportsResponses ? "Responses API" : "Chat Completions"} for ${selectedPreset.name}.`
          : endpointMode === "responses"
            ? "Responses API is forced for review calls."
            : "Chat Completions is forced for review calls.",
    });
    setDiagnostics([...rows]);

    const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
    const provider = currentProvider();
    const headers = buildProviderHeaders(provider);
    const authReady = Boolean(apiKey || !selectedPreset.auth.needsApiKey);

    setDiagnostics([
      ...rows,
      { label: "Model list endpoint", status: "pending", detail: "Checking provider model list route." },
    ]);
    const modelsEndpoint = `${normalizedBaseUrl}${selectedPreset.modelListPath}`;
    const modelList = authReady
      ? await checkEndpointReachability(modelsEndpoint, { method: "GET", headers, timeoutMs: 7000 })
      : null;
    rows.push({
      label: "Model list endpoint",
      status: !authReady ? "warn" : modelList?.reachable ? "pass" : "warn",
      detail: !authReady
        ? "Skipped until a key is provided for this preset."
        : modelList?.hint ?? `HTTP ${modelList?.status ?? "unknown"}`,
    });

    setDiagnostics([
      ...rows,
      { label: "Responses API support", status: "pending", detail: "Probing Responses path." },
    ]);
    const responsesEndpoint = `${normalizedBaseUrl}${selectedPreset.responsesPath}`;
    const responsesReachability = await checkEndpointReachability(responsesEndpoint, {
      method: "OPTIONS",
      headers,
      timeoutMs: 7000,
    });
    rows.push({
      label: "Responses API support",
      status: responsesReachability.reachable && selectedPreset.supportsResponses ? "pass" : "warn",
      detail: selectedPreset.supportsResponses
        ? responsesReachability.hint ?? `HTTP ${responsesReachability.status ?? "unknown"}`
        : "This preset prefers Chat Completions, but the path was still probed for compatibility.",
    });

    setDiagnostics([
      ...rows,
      { label: "Chat fallback support", status: "pending", detail: "Probing Chat Completions path." },
    ]);
    const chatEndpoint = `${normalizedBaseUrl}${selectedPreset.chatCompletionsPath}`;
    const reachability = await checkEndpointReachability(chatEndpoint, {
      method: "OPTIONS",
      headers,
      timeoutMs: 7000,
    });
    rows.push({
      label: "Chat fallback support",
      status: reachability.reachable ? "pass" : "warn",
      detail: reachability.hint ?? `HTTP ${reachability.status ?? "unknown"}`,
    });

    rows.push({
      label: "CORS compatibility",
      status: reachability.reachable ? "pass" : "warn",
      detail: reachability.reachable
        ? "The browser received a response. A completion call may still require auth."
        : "This endpoint may be valid, but it does not allow browser requests from this origin. PullScope cannot proxy it.",
    });

    setDiagnostics([
      ...rows,
      { label: "Minimal completion", status: "pending", detail: "Sending tiny model probe if auth is ready." },
    ]);
    if (!authReady) {
      rows.push({
        label: "Minimal completion",
        status: "warn",
        detail: "Skipped because this preset needs an API key.",
      });
    } else {
      try {
        const probe = await callOpenAICompatible({
          provider,
          messages: [
            { role: "system", content: "Reply with exactly: ok" },
            { role: "user", content: "health check" },
          ],
          responseFormat: "text",
          maxTokens: 12,
          timeoutMs: 12000,
        });
        rows.push({
          label: "Minimal completion",
          status: probe.text ? "pass" : "warn",
          detail: probe.text
            ? `Completion succeeded via ${probe.endpointUsed}.`
            : `Endpoint responded via ${probe.endpointUsed}, but no text was returned.`,
        });
      } catch (err) {
        rows.push({
          label: "Minimal completion",
          status: "warn",
          detail: String((err as Error)?.message ?? err),
        });
      }
    }

    setDiagnostics(rows);
    setDoctorRunning(false);
  }

  async function refreshModelList() {
    setModelLoadState("loading");
    setModelLoadMessage("Checking model list endpoint.");
    const authReady = Boolean(apiKey || !selectedPreset.auth.needsApiKey);
    if (!authReady) {
      setModelLoadState("error");
      setModelLoadMessage("Add an API key to fetch models for this provider.");
      return;
    }

    try {
      const provider = currentProvider();
      const endpoint = `${baseUrl.replace(/\/$/, "")}${selectedPreset.modelListPath}`;
      const response = await fetch(endpoint, {
        method: "GET",
        headers: buildProviderHeaders(provider),
      });
      const raw = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          providerErrorMessage(raw, `Model list request failed: ${response.status}`)
        );
      }
      const models = extractModelIds(raw);
      if (models.length === 0) {
        throw new Error("The provider responded, but no model ids were found.");
      }
      setFetchedModels(models);
      setModelLoadState("idle");
      setModelLoadMessage(`Loaded ${models.length} models from ${selectedPreset.name}.`);
    } catch (err) {
      setModelLoadState("error");
      setModelLoadMessage(String((err as Error)?.message ?? err));
    }
  }

  async function runAiReview() {
    setAiRunning(true);
    setAiError("");
    setAiErrorOpen(false);
    setAiReview(null);
    try {
      const prompt = buildRiskPrompt(prData, risk, {
        maxFiles: 12,
        maxPatchCharsPerFile: 420,
        includePersonaNotes: true,
      });
      const response = await callOpenAICompatible<AiReviewShape>({
        provider: currentProvider(),
        messages: [
          {
            role: "system",
            content:
              "You are a senior PR reviewer. Combine local deterministic risk with model reasoning. Return compact JSON only. Never include markdown fences.",
          },
          { role: "user", content: prompt },
        ],
        responseFormat: "json_object",
        timeoutMs: 25000,
        maxTokens: 1200,
      });
      const parsed = response.data
        ? { success: true, data: response.data, raw: response.text }
        : parseStructuredResponse<AiReviewShape>(response.text);
      const parsedOk = parsed.success && validateAiReviewShape(parsed.data);
      setAiReview({
        parsed: parsedOk ? parsed.data : undefined,
        raw: response.text || JSON.stringify(response.raw, null, 2),
        endpoint: response.endpointUsed,
        parsedOk,
      });
    } catch (err) {
      setAiError(String((err as Error)?.message ?? err));
      setAiErrorOpen(true);
    } finally {
      setAiRunning(false);
    }
  }

  async function copyBrief() {
    setCopyError("");
    try {
      await copyToClipboard(codexBrief);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      setCopyError(String((err as Error)?.message ?? err));
    }
  }

  const providerWizard = (
    <div id="provider" className="mt-6 border-t border-white/10 pt-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Bot className="h-5 w-5 text-signal-lime" />
          <div>
            <h2 className="text-lg font-semibold text-white">Provider wizard</h2>
            <p className="mt-1 text-xs text-slate-500">Combined local+AI review controls</p>
          </div>
        </div>
        <button
          type="button"
          aria-pressed={aiPowerEnabled}
          onClick={() => setAiPowerEnabled((value) => !value)}
          className={clsx(
            "inline-flex min-h-10 items-center gap-3 rounded-full border px-3 py-2 text-xs font-semibold transition",
            aiPowerEnabled
              ? "border-signal-lime/50 bg-signal-lime/20 text-white shadow-glow"
              : "border-white/15 bg-white/[0.04] text-slate-300 hover:bg-white/10",
          )}
        >
          <span className={clsx(
            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition",
            aiPowerEnabled ? "bg-signal-lime/80" : "bg-slate-700",
          )}>
            <span
              className={clsx(
                "h-5 w-5 rounded-full bg-white shadow transition",
                aiPowerEnabled ? "translate-x-5" : "translate-x-0.5",
              )}
            />
          </span>
          <span className="inline-flex items-center gap-2 whitespace-nowrap">
            <Sparkles className="h-4 w-4" />
            Turn AI Power
          </span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {aiPowerEnabled && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
            className="overflow-visible"
          >
            <div className="mt-5 grid grid-cols-2 gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => selectPreset(preset.id)}
                  className={clsx(
                    "rounded-lg border px-3 py-3 text-left text-sm transition",
                    preset.id === providerId
                      ? "border-signal-cyan bg-signal-cyan/10 text-white"
                      : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/10",
                  )}
                >
                  <span className="block font-semibold">{preset.name}</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {preset.supportsResponses ? "Responses" : "Chat"} ready
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-5 space-y-4">
              <Field label="Base URL">
                <input
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  className="field"
                />
              </Field>
              <Field label="Model">
                <div className="space-y-2">
                  <DesignSelect
                    value={model}
                    onChange={setModel}
                    ariaLabel="Model"
                    options={modelOptions.map((item) => ({ value: item, label: item }))}
                  />
                  <button
                    type="button"
                    onClick={refreshModelList}
                    disabled={modelLoadState === "loading"}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-60"
                  >
                    {modelLoadState === "loading" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Refresh models
                  </button>
                  {modelLoadMessage && (
                    <p
                      className={clsx(
                        "text-xs leading-5",
                        modelLoadState === "error" ? "text-signal-amber" : "text-slate-500",
                      )}
                    >
                      {modelLoadMessage}
                    </p>
                  )}
                </div>
              </Field>
              <Field label="Endpoint mode">
                <DesignSelect<EndpointMode>
                  value={endpointMode}
                  onChange={setEndpointMode}
                  ariaLabel="Endpoint mode"
                  options={[
                    { value: "auto", label: "Auto from preset" },
                    { value: "responses", label: "Responses API" },
                    { value: "chat_completions", label: "Chat Completions" },
                  ]}
                />
              </Field>
              <Field
                label={
                  <span className="inline-flex items-center gap-2">
                    API key
                    <HelpTooltip label="Model API keys stay in this browser tab's memory. PullScope sends the key directly to the endpoint you configure, never stores it in session/local profile storage, and has no server-side secret store." />
                  </span>
                }
              >
                <input
                  type="password"
                  value={apiKey}
                  onChange={(event) => {
                    setApiKey(event.target.value);
                    setProviderApiKeyInMemory(providerId, event.target.value || undefined);
                  }}
                  placeholder={selectedPreset.auth.needsApiKey ? "Memory-only bearer key" : "Optional"}
                  className="field"
                />
              </Field>
              <Field label="Profile storage">
                <DesignSelect<StorageScope>
                  value={profileStorage}
                  onChange={setProfileStorage}
                  ariaLabel="Profile storage"
                  options={[
                    { value: "memory", label: "Memory only" },
                    { value: "session", label: "Session profile" },
                    { value: "local", label: "Local profile" },
                  ]}
                />
              </Field>
            </div>
            {saveProfile && (
              <p className="mt-3 rounded-lg border border-signal-amber/30 bg-signal-amber/10 p-3 text-sm leading-6 text-amber-100">
                Profile saving stores provider, model, base URL, and endpoint mode in{" "}
                {profileStorage === "session" ? "sessionStorage" : "localStorage"}. API keys
                remain memory-only.
              </p>
            )}
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={runDoctor}
                disabled={doctorRunning}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 font-semibold text-ink-950 disabled:opacity-60"
              >
                {doctorRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Network className="h-4 w-4" />}
                Run CORS Doctor
              </button>
              <button
                type="button"
                onClick={runAiReview}
                disabled={aiRunning}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-4 py-3 font-semibold text-white hover:bg-white/10 disabled:opacity-60"
              >
                {aiRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                Run combined review
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <main className="noise min-h-screen overflow-hidden">
      <header className="border-b border-white/10 bg-ink-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-signal-cyan/30 bg-signal-cyan/10">
              <Radar className="h-5 w-5 text-signal-cyan" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">PullScope</p>
              <p className="text-xs text-slate-400">Client-side AI PR review</p>
            </div>
          </div>
          <nav className="hidden items-center gap-3 text-sm text-slate-300 md:flex">
            <a className="rounded-lg px-3 py-2 hover:bg-white/10" href="#analyzer">
              Analyze
            </a>
            <a className="rounded-lg px-3 py-2 hover:bg-white/10" href="#provider">
              Providers
            </a>
            <a className="rounded-lg px-3 py-2 hover:bg-white/10" href="#brief">
              Brief
            </a>
          </nav>
          <a
            href="https://github.com/yudin-s/pullscope"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
          >
            <Github className="h-4 w-4" />
            <span className="hidden sm:inline">View source on GitHub</span>
          </a>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:py-14">
        <div className="flex flex-col justify-center">
          <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-signal-lime/30 bg-signal-lime/10 px-3 py-1 text-sm text-signal-lime">
            <ShieldCheck className="h-4 w-4" />
            Zero-backend GitHub Pages devtool
          </div>
          <h1 className="max-w-4xl text-5xl font-semibold tracking-normal text-white md:text-7xl">
            PullScope
          </h1>
          <p className="mt-5 max-w-2xl text-xl leading-8 text-slate-300">
            Client-side AI PR review with your own model endpoint. Paste a public pull request,
            get local risk signals instantly, then combine them with a browser-only AI review.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="#analyzer"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 font-semibold text-ink-950 hover:bg-slate-200"
            >
              Analyze a PR
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#provider"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-5 py-3 font-semibold text-white hover:bg-white/10"
            >
              Connect model endpoint
              <KeyRound className="h-4 w-4" />
            </a>
          </div>
          <div className="mt-9 grid gap-3 sm:grid-cols-3">
            {[
              ["No backend", "Static deploy, no proxy, no server secrets."],
              ["Local first", "Rules-based risk engine always runs before AI."],
              ["BYOK models", "OpenAI-compatible endpoint from your browser."],
            ].map(([title, body]) => (
              <div key={title} className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                <p className="font-semibold text-white">{title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
              </div>
            ))}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="rounded-lg border border-white/10 bg-ink-900/80 p-5 shadow-glow"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Live preview</p>
              <h2 className="mt-1 text-2xl font-semibold text-white">Risk command center</h2>
            </div>
            <span className={clsx("rounded-full border px-3 py-1 text-sm uppercase", levelTone(risk.level))}>
              {risk.level}
            </span>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-[180px_1fr]">
            <ScoreRing score={risk.overallScore} level={risk.level} />
            <div className="space-y-3">
              {risk.reasons
                .filter((reason) => !reason.label.toLowerCase().startsWith("no "))
                .slice(0, 4)
                .map((reason) => (
                  <div key={reason.id} className="rounded-lg bg-white/[0.04] p-3 text-sm text-slate-300">
                    {reason.label}
                  </div>
                ))}
            </div>
          </div>
          <FileHeatmap risk={risk} />
        </motion.div>
      </section>

      <section className="border-y border-white/10 bg-white/[0.03]">
        <div className="mx-auto grid max-w-7xl gap-5 px-5 py-8 md:grid-cols-4">
          {[
            ["Fetch", "Public GitHub REST API"],
            ["Score", "Local deterministic rules"],
            ["Diagnose", "Browser CORS compatibility"],
            ["Review", "Optional OpenAI-compatible AI"],
          ].map(([title, body], index) => (
            <div key={title} className="flex gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-ink-800 text-sm text-signal-cyan">
                {index + 1}
              </div>
              <div>
                <p className="font-semibold text-white">{title}</p>
                <p className="mt-1 text-sm text-slate-400">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="analyzer" className="mx-auto max-w-7xl px-5 py-10">
        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
          <div className="rounded-lg border border-white/10 bg-ink-900/85 p-5">
            <div className="flex items-center gap-3">
              <Gauge className="h-5 w-5 text-signal-cyan" />
              <h2 className="text-xl font-semibold text-white">PR analyzer</h2>
            </div>
            <form onSubmit={analyzeLivePr} className="mt-5 space-y-4">
              <label className="block text-sm font-medium text-slate-300" htmlFor="pr-url">
                Public GitHub PR URL
              </label>
              <input
                id="pr-url"
                value={prUrl}
                onChange={(event) => setPrUrl(event.target.value)}
                placeholder={samplePrUrl}
                className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-3 text-sm text-white outline-none transition focus:border-signal-cyan"
              />
              <label className="flex items-center gap-2 text-sm font-medium text-slate-300" htmlFor="github-token">
                GitHub token for private PRs
                <HelpTooltip label="This token is optional and memory-only. PullScope sends it directly from your browser to api.github.com for PR reads, never stores it in profile storage, and has no backend that can receive it." />
              </label>
              <input
                id="github-token"
                type="password"
                value={githubToken}
                onChange={(event) => setGithubToken(event.target.value)}
                placeholder="Optional memory-only fine-grained token"
                className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-3 text-sm text-white outline-none transition focus:border-signal-cyan"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="submit"
                  disabled={loadState === "loading"}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-signal-cyan px-4 py-3 font-semibold text-ink-950 disabled:opacity-60"
                >
                  {loadState === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
                  Analyze a PR
                </button>
                <button
                  type="button"
                  onClick={loadDemo}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-4 py-3 font-semibold text-white hover:bg-white/10"
                >
                  <Sparkles className="h-4 w-4" />
                  Demo mode
                </button>
              </div>
            </form>
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-4 rounded-lg border border-signal-rose/30 bg-signal-rose/10 p-3 text-sm text-rose-100"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>
            <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Lock className="h-4 w-4 text-signal-lime" />
                Security model
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                PullScope runs entirely in your browser. Your model key is sent directly from your
                browser to the endpoint you configure. An optional GitHub token is sent directly to
                api.github.com for private PR reads. PullScope has no backend and cannot store
                these keys on a server. Use temporary, read-only, restricted, or low-limit tokens.
              </p>
            </div>
            {providerWizard}
          </div>

          <Dashboard pr={prData} risk={risk} />
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-5 pb-12 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border border-white/10 bg-ink-900/85 p-5">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-signal-cyan" />
              <h2 className="text-xl font-semibold text-white">Combined review output</h2>
          </div>
          {aiError && (
            <button
              type="button"
              onClick={() => setAiErrorOpen(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-signal-rose/30 bg-signal-rose/10 px-3 py-2 text-sm font-semibold text-rose-100 hover:bg-signal-rose/20"
            >
              <AlertTriangle className="h-4 w-4" />
              View AI error details
            </button>
          )}
          {!aiReview && !aiError && (
            <EmptyState
              icon={<Bot className="h-5 w-5" />}
              title="Local review is ready"
              body="Local deterministic risk is always included; connect a model when you want a combined local+AI verdict."
            />
          )}
          {aiReview && (
            <div className="mt-5 space-y-4">
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm uppercase text-slate-500">
                  {aiReview.parsedOk
                    ? `Combined with local ${risk.overallScore}/100 via ${aiReview.endpoint}`
                    : "Raw fallback"}
                </p>
                <h3 className="mt-2 text-lg font-semibold text-white">
                  {aiReview.parsed?.summary ?? "Provider returned non-JSON text"}
                </h3>
                {aiReview.parsed?.mergeRecommendation && (
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    {aiReview.parsed.mergeRecommendation}
                  </p>
                )}
              </div>
              <ConcernList title="Local signals used" items={aiReview.parsed?.localSignals} />
              <ConcernList title="Model findings" items={aiReview.parsed?.aiFindings} />
              <ConcernList title="Critical findings" items={aiReview.parsed?.criticalFindings ?? aiReview.parsed?.securityConcerns} />
              <ConcernList title="Recommendations" items={aiReview.parsed?.recommendations ?? aiReview.parsed?.testSuggestions} />
              {!aiReview.parsedOk && (
                <pre className="max-h-72 overflow-auto rounded-lg bg-ink-950 p-4 text-xs leading-6 text-slate-300">
                  {aiReview.raw}
                </pre>
              )}
            </div>
          )}
        </div>

        <div id="brief" className="rounded-lg border border-white/10 bg-ink-900/85 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Code2 className="h-5 w-5 text-signal-lime" />
              <h2 className="text-xl font-semibold text-white">Codex-ready brief</h2>
            </div>
            <button
              type="button"
              onClick={copyBrief}
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              <Clipboard className="h-4 w-4" />
              {copied ? "Copied" : "Copy Codex brief"}
            </button>
          </div>
          <pre className="mt-5 max-h-[520px] overflow-auto rounded-lg bg-ink-950 p-4 text-xs leading-6 text-slate-300">
            {codexBrief}
          </pre>
          {copyError && (
            <p className="mt-3 rounded-lg border border-signal-rose/30 bg-signal-rose/10 p-3 text-sm text-rose-100">
              Clipboard copy failed: {copyError}
            </p>
          )}
        </div>
      </section>

      <footer className="border-t border-white/10 bg-ink-950/80">
        <div className="mx-auto grid max-w-7xl gap-5 px-5 py-8 md:grid-cols-[1fr_auto]">
          <div>
            <p className="font-semibold text-white">PullScope is built for public launch.</p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Static frontend, public GitHub API, local risk analysis, combined BYOK AI, and a
              security-aware UX that demonstrates product engineering without server-side secrets.
            </p>
          </div>
          <a
            href="#analyzer"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-signal-lime px-4 py-3 font-semibold text-ink-950"
          >
            Analyze a PR
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </footer>
      <AnimatePresence>
        {diagnosticsOpen && (
          <Modal
            title="CORS Doctor"
            icon={<Activity className="h-5 w-5 text-signal-amber" />}
            onClose={() => setDiagnosticsOpen(false)}
          >
            <div className="space-y-3">
              {diagnostics.length === 0 ? (
                <EmptyState
                  icon={<Network className="h-5 w-5" />}
                  title="No diagnostics yet"
                  body="Run a browser compatibility probe before sending review context."
                />
              ) : (
                diagnostics.map((row) => (
                  <div key={row.label} className="flex gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-3">
                    <StatusIcon status={row.status} />
                    <div>
                      <p className="font-medium text-white">{row.label}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-400">{row.detail}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-slate-400">
              If CORS fails, the endpoint may still be valid. A fully client-side app cannot
              bypass browser CORS policy or proxy requests, so use a browser-compatible endpoint,
              enable CORS on your local server, or choose another provider.
            </div>
          </Modal>
        )}
        {aiErrorOpen && aiError && (
          <Modal
            title="AI Review Error"
            icon={<AlertTriangle className="h-5 w-5 text-signal-rose" />}
            onClose={() => setAiErrorOpen(false)}
          >
            <div className="rounded-lg border border-signal-rose/30 bg-signal-rose/10 p-4">
              <p className="text-sm font-semibold text-rose-100">Provider request failed</p>
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-ink-950 p-4 text-xs leading-6 text-slate-300">
                {aiError}
              </pre>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-400">
              Check endpoint mode, model id, API key permissions, provider CORS policy, and whether
              the provider supports browser-origin requests.
            </p>
          </Modal>
        )}
      </AnimatePresence>
    </main>
  );
}

function ScoreRing({ score, level }: { score: number; level: RiskAssessment["level"] }) {
  const gradient = scoreGradient(score);
  return (
    <div className="flex items-center justify-center">
      <div className={clsx("relative flex h-44 w-44 items-center justify-center rounded-full bg-gradient-to-br p-2", gradient)}>
        <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-ink-950">
          <span className="text-5xl font-semibold text-white">{score}</span>
          <span className={clsx("mt-2 rounded-full border px-3 py-1 text-xs uppercase", levelTone(level))}>
            {level}
          </span>
        </div>
      </div>
    </div>
  );
}

function FileHeatmap({ risk }: { risk: RiskAssessment }) {
  const files = [...risk.perFileScores].sort((a, b) => b.score - a.score).slice(0, 10);
  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
        <FileCode2 className="h-4 w-4 text-signal-cyan" />
        Changed files heatmap
      </div>
      <div className="grid gap-2">
        {files.map((file) => (
          <div key={file.filename} className="grid grid-cols-[minmax(0,1fr)_80px] items-center gap-3">
            <p className="truncate text-sm text-slate-300">{file.filename}</p>
            <div className="h-2 rounded-full bg-white/10">
              <div
                className={clsx("h-full rounded-full bg-gradient-to-r", scoreGradient(file.score))}
                style={{ width: `${Math.max(6, file.score)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Dashboard({ pr, risk }: { pr: PullRequestData; risk: RiskAssessment }) {
  const topFiles = [...risk.perFileScores].sort((a, b) => b.score - a.score).slice(0, 7);
  const activeReasons = risk.reasons.filter((reason) => !reason.label.toLowerCase().startsWith("no "));

  return (
    <div className="rounded-lg border border-white/10 bg-ink-900/85 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm text-slate-400">
            {pr.metadata.owner}/{pr.metadata.repo} #{pr.metadata.number}
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{pr.metadata.title}</h2>
          <p className="mt-2 text-sm text-slate-400">
            {pr.metadata.baseRef} {"<-"} {pr.metadata.headRef} by {pr.metadata.author.login}, updated{" "}
            {shortDate(pr.metadata.updatedAt)}
          </p>
        </div>
        <span className={clsx("rounded-full border px-3 py-1 text-sm uppercase", levelTone(risk.level))}>
          {risk.overallScore}/100
        </span>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        {[
          ["Files", pr.files.length],
          ["Additions", `+${pr.metadata.additions}`],
          ["Deletions", `-${pr.metadata.deletions}`],
          ["Commits", pr.metadata.commits],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[220px_1fr]">
        <ScoreRing score={risk.overallScore} level={risk.level} />
        <div className="grid gap-3">
          {activeReasons.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="h-5 w-5" />} title="No major local risk signals" body="The deterministic engine did not flag high-risk patterns." />
          ) : (
            activeReasons.slice(0, 6).map((reason) => (
              <div key={reason.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                <p className="text-sm font-medium text-white">{reason.label}</p>
                <p className="mt-1 text-xs text-slate-500">Signal score contribution: {reason.score}</p>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-3 font-semibold text-white">Highest-risk files</h3>
          <div className="space-y-2">
            {topFiles.map((file) => (
              <div key={file.filename} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-medium text-white">{file.filename}</p>
                  <span className="text-sm text-slate-400">{file.score}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">{file.reasons[0]}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-3 font-semibold text-white">Reviewer personas</h3>
          <div className="space-y-2">
            {risk.personaNotes.map((note) => (
              <div key={`${note.persona}-${note.message}`} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                <p className="text-sm font-medium text-white">{humanPersona(note.persona)}</p>
                <p className="mt-1 text-sm leading-6 text-slate-400">{note.message}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-300">{label}</span>
      {children}
    </label>
  );
}

function EmptyState({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="mt-5 rounded-lg border border-dashed border-white/15 bg-white/[0.03] p-5 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-signal-cyan">
        {icon}
      </div>
      <p className="mt-3 font-semibold text-white">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{body}</p>
    </div>
  );
}

function ConcernList({ title, items }: { title: string; items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <p className="font-semibold text-white">{title}</p>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-400">
        {items.slice(0, 5).map((item) => (
          <li key={item}>- {item}</li>
        ))}
      </ul>
    </div>
  );
}
