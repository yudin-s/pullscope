export type ProviderId =
  | "openai"
  | "openrouter"
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
  supportsResponses: boolean;
  auth: ProviderAuth;
  note?: string;
}

export type EndpointMode = "auto" | "responses" | "chat_completions";

export interface ProviderSelection {
  id: ProviderId;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  endpointMode?: EndpointMode;
  headers?: Record<string, string>;
}

const providerPresets: ProviderPreset[] = [
  {
    id: "openai",
    name: "OpenAI",
    defaultBaseUrl: "https://api.openai.com",
    defaultModel: "gpt-4.1-mini",
    chatCompletionsPath: "/v1/chat/completions",
    responsesPath: "/v1/responses",
    modelListPath: "/v1/models",
    supportsResponses: true,
    auth: { needsApiKey: true },
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai",
    defaultModel: "openai/gpt-4.1-mini",
    chatCompletionsPath: "/api/v1/chat/completions",
    responsesPath: "/api/v1/responses",
    modelListPath: "/api/v1/models",
    supportsResponses: false,
    auth: { needsApiKey: true },
    note: "Some models may ignore temperature metadata.",
  },
  {
    id: "groq",
    name: "Groq",
    defaultBaseUrl: "https://api.groq.com",
    defaultModel: "openai/gpt-oss-120b",
    chatCompletionsPath: "/openai/v1/chat/completions",
    responsesPath: "/openai/v1/responses",
    modelListPath: "/openai/v1/models",
    supportsResponses: false,
    auth: { needsApiKey: true },
  },
  {
    id: "ollama",
    name: "Ollama",
    defaultBaseUrl: "http://localhost:11434",
    defaultModel: "llama3.1",
    chatCompletionsPath: "/v1/chat/completions",
    responsesPath: "/v1/responses",
    modelListPath: "/v1/models",
    supportsResponses: false,
    auth: { needsApiKey: false },
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    defaultBaseUrl: "http://localhost:1234",
    defaultModel: "local-model",
    chatCompletionsPath: "/v1/chat/completions",
    responsesPath: "/v1/responses",
    modelListPath: "/v1/models",
    supportsResponses: false,
    auth: { needsApiKey: false },
  },
  {
    id: "custom",
    name: "Custom OpenAI-Compatible",
    defaultBaseUrl: "https://api.example.com",
    defaultModel: "local",
    chatCompletionsPath: "/v1/chat/completions",
    responsesPath: "/v1/responses",
    modelListPath: "/v1/models",
    supportsResponses: true,
    auth: { needsApiKey: true },
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
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (preset.auth.needsApiKey && key) {
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
