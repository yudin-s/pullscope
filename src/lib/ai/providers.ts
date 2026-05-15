export type ProviderId =
  | "chromeai"
  | "openai"
  | "groq"
  | "ollama"
  | "lmstudio"
  | "custom";

export interface ProviderAuth {
  needsApiKey: boolean;
  apiKey?: string;
}

export interface ProviderPreset {
  id: ProviderId;
  name: string;
  defaultBaseUrl: string;
  defaultModel: string;
  chatCompletionsPath: string;
  responsesPath: string;
  modelListPath: string;
  suggestedModels: string[];
  supportsResponses: boolean;
  auth: ProviderAuth;
  runtime: "http" | "browser";
  note?: string;
}

export type EndpointMode = "auto" | "responses" | "chat_completions";

export interface ProviderSelection {
  id: ProviderId;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  endpointMode?: EndpointMode;
  customAuthHeader?: {
    enabled: boolean;
    name?: string;
    value?: string;
  };
  headers?: Record<string, string>;
}

const providerPresets: ProviderPreset[] = [
  {
    id: "chromeai",
    name: "Chrome AI",
    defaultBaseUrl: "browser://chrome-ai",
    defaultModel: "Gemini Nano",
    chatCompletionsPath: "",
    responsesPath: "",
    modelListPath: "",
    suggestedModels: ["Gemini Nano"],
    supportsResponses: false,
    auth: { needsApiKey: false },
    runtime: "browser",
    note: "Uses Chrome's built-in LanguageModel API when Gemini Nano is available on this device. No API key, no provider endpoint, and no PullScope backend.",
  },
  {
    id: "openai",
    name: "OpenAI",
    defaultBaseUrl: "https://api.openai.com",
    defaultModel: "gpt-5-mini",
    chatCompletionsPath: "/v1/chat/completions",
    responsesPath: "/v1/responses",
    modelListPath: "/v1/models",
    suggestedModels: ["gpt-5-mini", "gpt-5.2", "gpt-5-nano", "gpt-4.1-mini", "gpt-4.1"],
    supportsResponses: true,
    auth: { needsApiKey: true },
    runtime: "http",
  },
  {
    id: "groq",
    name: "Groq",
    defaultBaseUrl: "https://api.groq.com",
    defaultModel: "openai/gpt-oss-120b",
    chatCompletionsPath: "/openai/v1/chat/completions",
    responsesPath: "/openai/v1/responses",
    modelListPath: "/openai/v1/models",
    suggestedModels: [
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "qwen/qwen3-32b",
    ],
    supportsResponses: true,
    auth: { needsApiKey: true },
    runtime: "http",
  },
  {
    id: "ollama",
    name: "Ollama",
    defaultBaseUrl: "http://localhost:11434",
    defaultModel: "gpt-oss:20b",
    chatCompletionsPath: "/v1/chat/completions",
    responsesPath: "/v1/responses",
    modelListPath: "/v1/models",
    suggestedModels: ["gpt-oss:20b", "llama3.1", "llama3.2", "mistral", "qwen2.5-coder"],
    supportsResponses: true,
    auth: { needsApiKey: false },
    runtime: "http",
    note: "Responses API requires Ollama v0.13.3 or newer; Auto mode falls back to Chat Completions on unsupported local servers.",
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    defaultBaseUrl: "http://localhost:1234",
    defaultModel: "local-model",
    chatCompletionsPath: "/v1/chat/completions",
    responsesPath: "/v1/responses",
    modelListPath: "/v1/models",
    suggestedModels: ["local-model", "openai/gpt-oss-20b"],
    supportsResponses: false,
    auth: { needsApiKey: false },
    runtime: "http",
    note: "Model ids come from the currently loaded LM Studio model. Auto mode uses Chat Completions because some LM Studio versions return an error body for /v1/responses.",
  },
  {
    id: "custom",
    name: "Custom OpenAI-Compatible",
    defaultBaseUrl: "https://api.example.com",
    defaultModel: "local",
    chatCompletionsPath: "/v1/chat/completions",
    responsesPath: "/v1/responses",
    modelListPath: "/v1/models",
    suggestedModels: ["local"],
    supportsResponses: true,
    auth: { needsApiKey: true },
    runtime: "http",
  },
];

const memoryApiKeys = new Map<ProviderId, string>();

export function getProviderPreset(id: ProviderId): ProviderPreset {
  const preset = providerPresets.find((item) => item.id === id);
  if (!preset) {
    throw new Error(`Unknown provider id: ${id}`);
  }
  return preset;
}

export function getProviderPresets(): ProviderPreset[] {
  return providerPresets.map((item) => ({ ...item }));
}

export function setProviderApiKeyInMemory(
  providerId: ProviderId,
  apiKey?: string
): void {
  if (!apiKey) {
    memoryApiKeys.delete(providerId);
    return;
  }
  memoryApiKeys.set(providerId, apiKey);
}

export function getProviderApiKeyFromMemory(providerId: ProviderId): string | undefined {
  return memoryApiKeys.get(providerId);
}

export function buildProviderHeaders(
  provider: ProviderSelection & { apiKey?: string }
): Record<string, string> {
  const preset = getProviderPreset(provider.id);
  const key = provider.apiKey ?? getProviderApiKeyFromMemory(provider.id);
  const customAuthName = provider.customAuthHeader?.name?.trim();
  const customAuthValue = provider.customAuthHeader?.value?.trim();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const hasCustomAuthHeader =
    provider.customAuthHeader?.enabled === true &&
    Boolean(customAuthName) &&
    Boolean(customAuthValue);

  if (hasCustomAuthHeader) {
    headers[customAuthName as string] = customAuthValue as string;
  } else if (preset.auth.needsApiKey && key) {
    headers.Authorization = `Bearer ${key}`;
  }

  if (provider.headers) {
    for (const [k, v] of Object.entries(provider.headers)) {
      headers[k] = v;
    }
  }

  return headers;
}

export function resolveProviderConfig(selection: ProviderSelection): {
  id: ProviderId;
  model: string;
  baseUrl: string;
  endpointMode: EndpointMode;
  headers: Record<string, string>;
} {
  const preset = getProviderPreset(selection.id);
  const resolved = {
    id: selection.id,
    model: selection.model || preset.defaultModel,
    baseUrl: (selection.baseUrl || preset.defaultBaseUrl).replace(/\/$/, ""),
    endpointMode: selection.endpointMode ?? "auto",
    headers: buildProviderHeaders(selection),
  };
  return resolved;
}
