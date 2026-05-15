import {
  ChatMessage,
  OpenAICompatibleOptions,
  OpenAICompatibleResponse,
} from "./openaiCompatible";

type ChromeAiAvailability = "unavailable" | "downloadable" | "downloading" | "available";

interface ChromeLanguageModelSession {
  prompt(input: string, options?: { signal?: AbortSignal }): Promise<string>;
  destroy?: () => void;
}

interface ChromeLanguageModelApi {
  availability(options?: unknown): Promise<ChromeAiAvailability>;
  create(options?: unknown): Promise<ChromeLanguageModelSession>;
}

export interface ChromeAiDiagnosticRow {
  label: string;
  status: "pass" | "warn" | "fail" | "pending";
  detail: string;
}

function languageModelApi(): ChromeLanguageModelApi | undefined {
  const runtime = globalThis as typeof globalThis & {
    LanguageModel?: ChromeLanguageModelApi;
    ai?: { languageModel?: ChromeLanguageModelApi };
  };
  return runtime.LanguageModel ?? runtime.ai?.languageModel;
}

function languageOptions() {
  return {
    expectedInputs: [{ type: "text", languages: ["en"] }],
    expectedOutputs: [{ type: "text", languages: ["en"] }],
  };
}

async function checkAvailability(api: ChromeLanguageModelApi): Promise<ChromeAiAvailability> {
  try {
    return await api.availability(languageOptions());
  } catch {
    return api.availability();
  }
}

function messagesToPrompt(messages: ChatMessage[]): string {
  return messages
    .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
    .join("\n\n");
}

function safeParseJSON<T>(input: string): T | undefined {
  try {
    return JSON.parse(input) as T;
  } catch {
    return undefined;
  }
}

function browserCapabilityRows(): ChromeAiDiagnosticRow[] {
  const navigatorRef = globalThis.navigator;
  const userActivation = navigatorRef?.userActivation;
  return [
    {
      label: "Browser runtime",
      status: typeof window === "undefined" ? "fail" : "pass",
      detail:
        typeof window === "undefined"
          ? "Chrome AI must run in a browser document."
          : "Running inside a browser document.",
    },
    {
      label: "User activation",
      status: userActivation?.isActive || userActivation?.hasBeenActive ? "pass" : "warn",
      detail:
        userActivation?.isActive || userActivation?.hasBeenActive
          ? "The page has user activation, so Chrome may start model creation or download."
          : "Click the Chrome AI Doctor or Run combined review to provide activation before model creation.",
    },
    {
      label: "WebGPU hint",
      status: navigatorRef && "gpu" in navigatorRef ? "pass" : "warn",
      detail:
        navigatorRef && "gpu" in navigatorRef
          ? "WebGPU is exposed in this browser."
          : "WebGPU is not exposed. Chrome AI may still use CPU, but local models can be slower or unsupported.",
    },
    {
      label: "WebNN hint",
      status: navigatorRef && "ml" in navigatorRef ? "pass" : "warn",
      detail:
        navigatorRef && "ml" in navigatorRef
          ? "WebNN is exposed in this browser."
          : "WebNN is not exposed. This is only a capability hint, not a hard blocker for Chrome AI.",
    },
  ];
}

export async function probeChromeBuiltInAI(): Promise<ChromeAiDiagnosticRow[]> {
  const rows: ChromeAiDiagnosticRow[] = [...browserCapabilityRows()];
  const api = languageModelApi();

  if (!api) {
    rows.push({
      label: "LanguageModel API",
      status: "fail",
      detail:
        "LanguageModel is not exposed. Use a supported desktop Chrome build and enable Chrome built-in AI / Prompt API flags if needed.",
    });
    return rows;
  }

  rows.push({
    label: "LanguageModel API",
    status: "pass",
    detail: "LanguageModel is exposed in this browser.",
  });

  const availability = await checkAvailability(api);
  rows.push({
    label: "Gemini Nano availability",
    status:
      availability === "available"
        ? "pass"
        : availability === "unavailable"
          ? "fail"
          : "warn",
    detail:
      availability === "available"
        ? "The local model is ready."
        : availability === "downloadable"
          ? "Chrome reports that the model can be downloaded after user activation."
          : availability === "downloading"
            ? "Chrome is still downloading the local model."
            : "This device, Chrome build, or policy does not currently expose the model.",
  });

  if (availability !== "available") {
    return rows;
  }

  try {
    const session = await api.create(languageOptions());
    const result = await session.prompt("Reply with exactly: ok");
    session.destroy?.();
    rows.push({
      label: "Minimal prompt",
      status: result.trim().length > 0 ? "pass" : "warn",
      detail: result.trim().length > 0 ? `Prompt returned: ${result.trim().slice(0, 80)}` : "Prompt returned empty text.",
    });
  } catch (error) {
    rows.push({
      label: "Minimal prompt",
      status: "warn",
      detail: String((error as Error)?.message ?? error),
    });
  }

  return rows;
}

export async function callChromeBuiltInAI<T = unknown>(
  opts: OpenAICompatibleOptions
): Promise<OpenAICompatibleResponse<T>> {
  const api = languageModelApi();
  if (!api) {
    throw new Error("Chrome LanguageModel API is not available in this browser.");
  }

  const availability = await checkAvailability(api);
  if (availability === "unavailable") {
    throw new Error("Chrome AI is unavailable on this device or browser profile.");
  }
  if (availability === "downloading") {
    throw new Error("Chrome AI model is still downloading. Try again after the download completes.");
  }

  const session = await api.create({
    ...languageOptions(),
    monitor(monitor: EventTarget) {
      monitor.addEventListener("downloadprogress", () => {
        // Chrome owns the model download; the doctor reports availability before review runs.
      });
    },
  });

  try {
    const text = await session.prompt(messagesToPrompt(opts.messages), {
      signal: opts.signal,
    });
    return {
      text,
      endpointUsed: "chat_completions",
      status: 200,
      raw: { provider: "chromeai", text },
      data:
        opts.responseFormat === "json_object"
          ? (safeParseJSON<T>(text) as T | undefined)
          : undefined,
    };
  } finally {
    session.destroy?.();
  }
}
