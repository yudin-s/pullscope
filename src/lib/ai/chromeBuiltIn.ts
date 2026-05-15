import {
  ChatMessage,
  OpenAICompatibleOptions,
  OpenAICompatibleResponse,
} from "./openaiCompatible";

type ChromeAiAvailability = "unavailable" | "downloadable" | "downloading" | "available";

interface ChromeDownloadProgress {
  loaded?: number;
  total?: number;
}

interface ChromeLanguageModelSession {
  prompt(input: string, options?: { signal?: AbortSignal }): Promise<string>;
  destroy?: () => void;
}

interface ChromeLanguageModelApi {
  availability(options?: unknown): Promise<ChromeAiAvailability>;
  create(options?: unknown): Promise<ChromeLanguageModelSession>;
}

export interface ChromeAiDiagnosticRow {
  id?: string;
  label: string;
  status: "pass" | "warn" | "fail" | "pending";
  detail: string;
  help?: string[];
  links?: Array<{
    label: string;
    href: string;
    description?: string;
  }>;
}

const chromeBuiltInAiLinks = {
  getStarted: {
    label: "Chrome built-in AI setup",
    href: "https://developer.chrome.com/docs/ai/get-started",
    description: "Requirements, flags, model download, and troubleshooting from Chrome Developers.",
  },
  promptApi: {
    label: "Prompt API docs",
    href: "https://developer.chrome.com/docs/ai/prompt-api?hl=en",
    description: "LanguageModel API usage, availability checks, and session creation.",
  },
  flagsOptimization: {
    label: "Open on-device model flag",
    href: "chrome://flags/#optimization-guide-on-device-model",
    description: "Enable Optimization Guide On Device Model, then relaunch Chrome.",
  },
  flagsPrompt: {
    label: "Open Prompt API flag",
    href: "chrome://flags/#prompt-api-for-gemini-nano",
    description: "Enable Prompt API for Gemini Nano, then relaunch Chrome.",
  },
  internals: {
    label: "Open on-device internals",
    href: "chrome://on-device-internals",
    description: "Check model status and errors in Chrome's local AI diagnostics page.",
  },
};

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

function progressDetail(progress?: ChromeDownloadProgress) {
  if (
    typeof progress?.loaded === "number" &&
    typeof progress?.total === "number" &&
    progress.total > 0
  ) {
    return `Chrome is downloading Gemini Nano: ${Math.round((progress.loaded / progress.total) * 100)}%.`;
  }
  return "Chrome is preparing or downloading Gemini Nano. Keep this tab open.";
}

function withDownloadMonitor(
  onProgress?: (progress: ChromeDownloadProgress) => void
) {
  return {
    ...languageOptions(),
    monitor(monitor: EventTarget) {
      monitor.addEventListener("downloadprogress", (event) => {
        const progress = event as Event & ChromeDownloadProgress;
        onProgress?.({
          loaded: typeof progress.loaded === "number" ? progress.loaded : undefined,
          total: typeof progress.total === "number" ? progress.total : undefined,
        });
      });
    },
  };
}

function browserCapabilityRows(): ChromeAiDiagnosticRow[] {
  const navigatorRef = globalThis.navigator;
  const userActivation = navigatorRef?.userActivation;
  return [
    {
      id: "browser-runtime",
      label: "Browser runtime",
      status: typeof window === "undefined" ? "fail" : "pass",
      detail:
        typeof window === "undefined"
          ? "Chrome AI must run in a browser document."
          : "Running inside a browser document.",
      help:
        typeof window === "undefined"
          ? ["Open PullScope in a real Chrome tab. The built-in model cannot run from server-side rendering or Node."]
          : ["This check confirms the doctor is running in a page where browser-native APIs can exist."],
      links: [chromeBuiltInAiLinks.getStarted],
    },
    {
      id: "user-activation",
      label: "User activation",
      status: userActivation?.isActive || userActivation?.hasBeenActive ? "pass" : "warn",
      detail:
        userActivation?.isActive || userActivation?.hasBeenActive
          ? "The page has user activation, so Chrome may start model creation or download."
          : "Click the Chrome AI Doctor or Run combined review to provide activation before model creation.",
      help: [
        "Chrome may require a direct click, key press, or tap before it can create a model session or start a model download.",
        "If this stays warning, click the Chrome AI Doctor button again after the page is focused.",
      ],
      links: [chromeBuiltInAiLinks.getStarted],
    },
    {
      id: "webgpu",
      label: "WebGPU hint",
      status: navigatorRef && "gpu" in navigatorRef ? "pass" : "warn",
      detail:
        navigatorRef && "gpu" in navigatorRef
          ? "WebGPU is exposed in this browser."
          : "WebGPU is not exposed. Chrome AI may still use CPU, but local models can be slower or unsupported.",
      help: [
        "Chrome built-in AI can run on GPU or CPU, but GPU availability can improve local inference.",
        "If local AI is unavailable, check Chrome hardware acceleration and the hardware requirements in Chrome's built-in AI docs.",
      ],
      links: [chromeBuiltInAiLinks.getStarted],
    },
    {
      id: "webnn",
      label: "WebNN hint",
      status: navigatorRef && "ml" in navigatorRef ? "pass" : "warn",
      detail:
        navigatorRef && "ml" in navigatorRef
          ? "WebNN is exposed in this browser."
          : "WebNN is not exposed. This is only a capability hint, not a hard blocker for Chrome AI.",
      help: [
        "WebNN is only a capability hint here. Prompt API availability is decided by Chrome's LanguageModel API and model status.",
        "If WebNN is missing but LanguageModel is available, you can still use Chrome AI.",
      ],
      links: [chromeBuiltInAiLinks.getStarted],
    },
  ];
}

export async function probeChromeBuiltInAI(): Promise<ChromeAiDiagnosticRow[]> {
  const rows: ChromeAiDiagnosticRow[] = [...browserCapabilityRows()];
  const api = languageModelApi();

  if (!api) {
    rows.push({
      id: "language-model-api",
      label: "LanguageModel API",
      status: "fail",
      detail:
        "LanguageModel is not exposed. Use a supported desktop Chrome build and enable Chrome built-in AI / Prompt API flags if needed.",
      help: [
        "Use desktop Chrome. Gemini Nano APIs are not generally available on mobile Chrome.",
        "For localhost testing, enable the on-device model flag and the Prompt API for Gemini Nano flag, then relaunch Chrome.",
        "After relaunch, open DevTools and run await LanguageModel.availability() to confirm the API is exposed.",
      ],
      links: [
        chromeBuiltInAiLinks.getStarted,
        chromeBuiltInAiLinks.promptApi,
        chromeBuiltInAiLinks.flagsOptimization,
        chromeBuiltInAiLinks.flagsPrompt,
      ],
    });
    return rows;
  }

  rows.push({
    id: "language-model-api",
    label: "LanguageModel API",
    status: "pass",
    detail: "LanguageModel is exposed in this browser.",
    help: [
      "The API object exists. The next check determines whether the model is downloaded and usable for the requested language options.",
    ],
    links: [chromeBuiltInAiLinks.promptApi],
  });

  const availability = await checkAvailability(api);
  rows.push({
    id: "gemini-nano-availability",
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
    help:
      availability === "available"
        ? ["Gemini Nano is ready, so PullScope can create a local LanguageModel session."]
        : availability === "downloadable"
          ? [
              "Click Run combined review or Chrome AI Doctor from a focused page to let Chrome start the model download.",
              "Use an unmetered connection and keep Chrome open while the model downloads.",
              "If download does not start, confirm the two Chrome flags and restart Chrome.",
            ]
          : availability === "downloading"
            ? [
                "Wait for Chrome to finish downloading Gemini Nano.",
                "Open chrome://on-device-internals and check the Model Status tab for progress or errors.",
              ]
            : [
                "Check Chrome's hardware requirements: desktop OS, enough free disk space, and sufficient RAM/CPU or GPU.",
                "Managed Chrome profiles can disable AI features through enterprise policy.",
                "Confirm the Prompt API flags are enabled and retry after restarting Chrome.",
              ],
    links: [
      chromeBuiltInAiLinks.getStarted,
      chromeBuiltInAiLinks.internals,
      chromeBuiltInAiLinks.flagsOptimization,
      chromeBuiltInAiLinks.flagsPrompt,
    ],
  });

  if (availability !== "available") {
    return rows;
  }

  try {
    const session = await api.create(languageOptions());
    const result = await session.prompt("Reply with exactly: ok");
    session.destroy?.();
    rows.push({
      id: "minimal-prompt",
      label: "Minimal prompt",
      status: result.trim().length > 0 ? "pass" : "warn",
      detail: result.trim().length > 0 ? `Prompt returned: ${result.trim().slice(0, 80)}` : "Prompt returned empty text.",
      help:
        result.trim().length > 0
          ? ["The browser accepted a local prompt. PullScope can now try the full PR review prompt."]
          : [
              "The model session was created but returned empty text.",
              "Try restarting Chrome, then check chrome://on-device-internals for model errors.",
            ],
      links: [chromeBuiltInAiLinks.internals, chromeBuiltInAiLinks.promptApi],
    });
  } catch (error) {
    rows.push({
      id: "minimal-prompt",
      label: "Minimal prompt",
      status: "warn",
      detail: String((error as Error)?.message ?? error),
      help: [
        "The API exists, but creating a session or prompting failed.",
        "Check chrome://on-device-internals for model status and errors.",
        "Restart Chrome after changing flags or after a failed model download.",
      ],
      links: [chromeBuiltInAiLinks.internals, chromeBuiltInAiLinks.promptApi],
    });
  }

  return rows;
}

export async function prepareChromeBuiltInAI(
  onProgress?: (row: ChromeAiDiagnosticRow) => void
): Promise<ChromeAiDiagnosticRow[]> {
  const rows = await probeChromeBuiltInAI();
  const api = languageModelApi();
  const availability = rows.find((row) => row.id === "gemini-nano-availability");

  if (!api || availability?.status === "fail") {
    return rows;
  }

  if (availability?.detail.includes("ready")) {
    return rows;
  }

  onProgress?.({
    id: "model-download",
    label: "Model preparation",
    status: "pending",
    detail: "Starting Chrome's model preparation. This can take a while on the first run.",
    help: [
      "Chrome owns the model download and cache. Keep this tab open and avoid metered connections.",
      "If this remains stuck, restart Chrome and inspect chrome://on-device-internals.",
    ],
    links: [chromeBuiltInAiLinks.internals, chromeBuiltInAiLinks.getStarted],
  });

  try {
    const session = await api.create(
      withDownloadMonitor((progress) => {
        onProgress?.({
          id: "model-download",
          label: "Model preparation",
          status: "pending",
          detail: progressDetail(progress),
          help: [
            "The first model preparation can be slow because Chrome downloads browser-managed model files.",
            "Subsequent use should not require a network connection once the model is available.",
          ],
          links: [chromeBuiltInAiLinks.internals, chromeBuiltInAiLinks.getStarted],
        });
      })
    );
    const result = await session.prompt("Reply with exactly: ok");
    session.destroy?.();
    return [
      ...rows,
      {
        id: "model-download",
        label: "Model preparation",
        status: result.trim().length > 0 ? "pass" : "warn",
        detail:
          result.trim().length > 0
            ? "Chrome AI model is prepared and responded to a local prompt."
            : "Chrome prepared a session, but the local prompt returned empty text.",
        help:
          result.trim().length > 0
            ? ["You can now run the combined PullScope review with Chrome AI."]
            : [
                "Try running Chrome AI Doctor again.",
                "If this repeats, check chrome://on-device-internals for model errors.",
              ],
        links: [chromeBuiltInAiLinks.internals, chromeBuiltInAiLinks.promptApi],
      },
    ];
  } catch (error) {
    return [
      ...rows,
      {
        id: "model-download",
        label: "Model preparation",
        status: "fail",
        detail: String((error as Error)?.message ?? error),
        help: [
          "Confirm Chrome flags are enabled, relaunch Chrome, and retry from a focused tab.",
          "Open chrome://on-device-internals and check the Model Status tab for download or policy errors.",
        ],
        links: [
          chromeBuiltInAiLinks.internals,
          chromeBuiltInAiLinks.flagsOptimization,
          chromeBuiltInAiLinks.flagsPrompt,
        ],
      },
    ];
  }
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
  if (availability === "downloadable") {
    throw new Error("Chrome AI model is not downloaded yet. Click Prepare Chrome AI model first, then run the review.");
  }
  if (availability === "downloading") {
    throw new Error("Chrome AI model is still downloading. Keep Chrome open and try again after the download completes.");
  }

  const session = await api.create(languageOptions());

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
