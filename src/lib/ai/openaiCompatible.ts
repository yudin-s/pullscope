import {
  ProviderSelection,
  ProviderId,
  getProviderPreset,
  resolveProviderConfig,
} from "./providers";
import { diagnoseCors } from "./corsDoctor";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenAICompatibleOptions {
  provider: ProviderSelection;
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  responseFormat?: "text" | "json_object";
}

export type EndpointUsed = "responses" | "chat_completions";

export interface OpenAICompatibleResponse<T = unknown> {
  text: string;
  endpointUsed: EndpointUsed;
  status: number;
  raw: unknown;
  data?: T;
}

interface RawResponsesBody {
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  output_text?: string;
}

function safeParseJSON<T>(input: string): T | undefined {
  try {
    return JSON.parse(input) as T;
  } catch {
    return undefined;
  }
}

interface RawChatBody {
  choices?: Array<{ message?: { content?: string } }>;
}

const reviewJsonSchema = {
  name: "pullscope_review",
  schema: {
    type: "object",
    additionalProperties: true,
  },
  strict: false,
};

function shouldUseJsonSchema(providerId: ProviderId, forceJsonSchema = false) {
  return (
    forceJsonSchema ||
    providerId === "openai" ||
    providerId === "openrouter" ||
    providerId === "groq" ||
    providerId === "lmstudio"
  );
}

function normalizeResponsesInput(messages: ChatMessage[]) {
  const instructions = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const input =
    messages
      .filter((message) => message.role !== "system")
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n\n") || instructions;

  return {
    input,
    ...(instructions && input !== instructions ? { instructions } : {}),
  };
}

function normalizeResponsesPayload(
  providerId: ProviderId,
  model: string,
  messages: ChatMessage[],
  responseFormat?: "text" | "json_object"
) {
  const body = {
    model,
    ...normalizeResponsesInput(messages),
    stream: false,
    ...(responseFormat === "json_object"
      ? {
          text: {
            format: shouldUseJsonSchema(providerId)
              ? { type: "json_schema", ...reviewJsonSchema }
              : { type: "json_object" },
          },
        }
      : {}),
  };
  return body;
}

function normalizeChatResponseFormat(
  providerId: ProviderId,
  responseFormat?: "text" | "json_object",
  forceJsonSchema = false
) {
  if (responseFormat !== "json_object") return {};
  if (shouldUseJsonSchema(providerId, forceJsonSchema)) {
    return {
      response_format: {
        type: "json_schema",
        json_schema: reviewJsonSchema,
      },
    };
  }
  return { response_format: { type: "json_object" } };
}

function extractTextFromResponses(raw: RawResponsesBody): string {
  if (raw.output_text) return raw.output_text;
  if (Array.isArray(raw.output)) {
    for (const item of raw.output) {
      const c = item?.content;
      if (!Array.isArray(c)) continue;
      for (const part of c) {
        if (typeof part?.text === "string") {
          return part.text;
        }
      }
    }
  }
  return "";
}

function extractTextFromChat(raw: RawChatBody): string {
  const first = raw.choices?.[0];
  const content = first?.message?.content;
  return typeof content === "string" ? content : "";
}

function extractProviderError(raw: Record<string, unknown>, fallback: string): string {
  if (typeof raw.error === "object" && raw.error && "message" in raw.error) {
    return String((raw.error as { message?: unknown }).message);
  }
  if (typeof raw.message === "string") return raw.message;
  if (typeof raw.rawText === "string") return raw.rawText;
  return fallback;
}

async function readJsonOrText(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { rawText: text };
  }
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs?: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = timeoutMs
    ? window.setTimeout(() => controller.abort(), timeoutMs)
    : null;
  try {
    return await fetch(input, {
      ...init,
      signal: init.signal || controller.signal,
    });
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
}

function createCorsHint(error: unknown, providerId: ProviderId, endpoint: string) {
  return diagnoseCors(error, providerId, endpoint);
}

function shouldRetryWithJsonSchema(error: string, responseFormat?: "text" | "json_object") {
  return (
    responseFormat === "json_object" &&
    /response_format\.type|response_format|json_schema/i.test(error) &&
    /json_schema/i.test(error)
  );
}

export async function callOpenAICompatible<T = unknown>(
  opts: OpenAICompatibleOptions
): Promise<OpenAICompatibleResponse<T>> {
  const preset = getProviderPreset(opts.provider.id);
  const config = resolveProviderConfig(opts.provider);
  const model = opts.model || config.model;
  const temperature = opts.temperature ?? 0.2;
  const maxTokens = opts.maxTokens;
  const signal = opts.signal;

  const endpoint = `${config.baseUrl}${preset.responsesPath}`;
  const shouldPreferResponses =
    config.endpointMode === "responses" ||
    (config.endpointMode === "auto" && preset.supportsResponses);
  const forceChatCompletions = config.endpointMode === "chat_completions";
  const headers = config.headers;
  const responsePayload = normalizeResponsesPayload(
    preset.id,
    model,
    opts.messages,
    opts.responseFormat
  );

  if (shouldPreferResponses && !forceChatCompletions) {
    try {
      const response = await fetchWithTimeout(
        endpoint,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            ...responsePayload,
            temperature,
            ...(maxTokens ? { max_output_tokens: maxTokens } : {}),
          }),
          signal,
        },
        opts.timeoutMs
      );

      const raw = (await readJsonOrText(response)) as Record<string, unknown>;
      if (response.status < 500 && response.ok) {
        const text = extractTextFromResponses(raw as RawResponsesBody);
        return {
          text,
          endpointUsed: "responses",
          status: response.status,
          raw,
          data:
            opts.responseFormat === "json_object"
              ? (safeParseJSON<T>(text) as T | undefined)
              : undefined,
        };
      }

      const shouldFallbackToChat =
        config.endpointMode === "auto" && [400, 404, 405, 422].includes(response.status);
      if (!shouldFallbackToChat) {
        throw new Error(extractProviderError(raw, `Responses endpoint error: ${response.status}`));
      }
    } catch (error) {
      const diag = createCorsHint(error, preset.id, endpoint);
      if (!diag.isCorsLikely) {
        throw error;
      }
      throw new Error(
        `Responses endpoint unavailable or blocked (possible CORS): ${
          String((error as Error)?.message ?? error)
        }`
      );
    }
  }

  const chatEndpoint = `${config.baseUrl}${preset.chatCompletionsPath}`;
  async function callChatCompletions(forceJsonSchema = false) {
    const response = await fetchWithTimeout(
      chatEndpoint,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: opts.messages,
          temperature,
          ...(maxTokens ? { max_tokens: maxTokens } : {}),
          ...normalizeChatResponseFormat(preset.id, opts.responseFormat, forceJsonSchema),
        }),
        signal,
      },
      opts.timeoutMs
    );
    const raw = (await readJsonOrText(response)) as Record<string, unknown>;
    return { response, raw };
  }

  let { response: chatResponse, raw: rawChat } = await callChatCompletions();
  if (!chatResponse.ok) {
    const errorMessage = extractProviderError(
      rawChat,
      `Chat Completions endpoint error: ${chatResponse.status}`
    );
    if (preset.id !== "lmstudio" && shouldRetryWithJsonSchema(errorMessage, opts.responseFormat)) {
      const retry = await callChatCompletions(true);
      chatResponse = retry.response;
      rawChat = retry.raw;
      if (chatResponse.ok) {
        const text = extractTextFromChat(rawChat as RawChatBody);
        return {
          text,
          endpointUsed: "chat_completions",
          status: chatResponse.status,
          raw: rawChat,
          data:
            opts.responseFormat === "json_object"
              ? (safeParseJSON<T>(text) as T | undefined)
              : undefined,
        };
      }
    }
    throw new Error(
      extractProviderError(rawChat, `Chat Completions endpoint error: ${chatResponse.status}`)
    );
  }
  const text = extractTextFromChat(rawChat as RawChatBody);
  return {
    text,
    endpointUsed: "chat_completions",
    status: chatResponse.status,
    raw: rawChat,
    data:
      opts.responseFormat === "json_object"
        ? (safeParseJSON<T>(text) as T | undefined)
        : undefined,
  };
}

export async function pingProvider(
  provider: ProviderSelection
): Promise<boolean> {
  const preset = getProviderPreset(provider.id);
  const config = resolveProviderConfig(provider);
  const headers = config.headers;
  const probeUrl = `${config.baseUrl}${preset.chatCompletionsPath}`;

  try {
    const response = await fetch(probeUrl, {
      method: "OPTIONS",
      headers,
    });
    return response.ok;
  } catch {
    return false;
  }
}
