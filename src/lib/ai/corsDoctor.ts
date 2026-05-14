import { ProviderId } from "./providers";

export interface CorsDiagnosis {
  isCorsLikely: boolean;
  likelyCause: "cors" | "network" | "unknown";
  confidence: number;
  suggestions: string[];
  providerId?: ProviderId;
  endpoint?: string;
}

export interface EndpointCheckResult {
  endpoint: string;
  reachable: boolean;
  status?: number;
  hint?: string;
}

export interface EndpointCheckOptions {
  method?: "GET" | "OPTIONS" | "POST";
  headers?: HeadersInit;
  timeoutMs?: number;
}

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return headers;
}

const NETWORK_KEYWORDS = [
  "failed to fetch",
  "networkerror",
  "typeerror: failed to fetch",
];

const CORS_KEYWORDS = [
  "access to fetch",
  "cors",
  "origin",
  "cross-origin",
  "blocked by cors",
  "has been blocked by cors policy",
];

export function diagnoseCors(
  error: unknown,
  providerId?: ProviderId,
  endpoint?: string
): CorsDiagnosis {
  const message = String((error as Error)?.message ?? error ?? "").toLowerCase();
  const isCors =
    CORS_KEYWORDS.some((word) => message.includes(word)) ||
    (message.includes("response") && message.includes("opaque"));
  const isNetwork = NETWORK_KEYWORDS.some((word) => message.includes(word));

  if (isCors) {
    return {
      isCorsLikely: true,
      likelyCause: "cors",
      confidence: 0.89,
      suggestions: [
        "Check provider API CORS policy allows requests from this origin.",
        "Use a browser-compatible endpoint or enable CORS on the local provider.",
        "Confirm endpoint includes correct protocol (https for remote providers).",
        "Verify custom headers don't trigger preflight restrictions.",
      ],
      providerId,
      endpoint,
    };
  }

  if (isNetwork) {
    return {
      isCorsLikely: true,
      likelyCause: "network",
      confidence: 0.6,
      suggestions: [
        "Check connectivity and DNS.",
        "If using localhost provider URLs, verify host is reachable.",
        "Confirm no ad-blocking or enterprise firewall intercept is happening.",
      ],
      providerId,
      endpoint,
    };
  }

  return {
    isCorsLikely: false,
    likelyCause: "unknown",
    confidence: 0.2,
    suggestions: [
      "Inspect HTTP status and response body for authentication or schema errors.",
      "Retry with a simpler request payload.",
    ],
    providerId,
    endpoint,
  };
}

export function formatCorsTips(diag: CorsDiagnosis): string {
  return [
    `CORS likelihood: ${diag.isCorsLikely ? "yes" : "no"} (${diag.likelyCause})`,
    `Confidence: ${Math.round(diag.confidence * 100)}%`,
    ...diag.suggestions.map((item) => `- ${item}`),
  ].join("\n");
}

export async function checkEndpointReachability(
  endpoint: string,
  options: EndpointCheckOptions = {}
): Promise<EndpointCheckResult> {
  const timeoutMs = options.timeoutMs ?? 6000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: options.method ?? "OPTIONS",
      signal: controller.signal,
      headers: {
        Accept: "application/json, text/plain, */*",
        ...normalizeHeaders(options.headers),
      },
    });
    clearTimeout(timer);
    return {
      endpoint,
      reachable: true,
      status: response.status,
      hint: response.ok
        ? `Endpoint responded (${response.status})`
        : "Endpoint responded but not with ok status; auth may be missing.",
    };
  } catch (error) {
    clearTimeout(timer);
    const diag = diagnoseCors(error, undefined, endpoint);
    return {
      endpoint,
      reachable: false,
      hint: diag.isCorsLikely
        ? `Likely CORS/network block: ${diag.likelyCause}`
        : "Could not verify endpoint reachability from browser.",
    };
  }
}
