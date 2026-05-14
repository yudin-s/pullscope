export interface ParseResult<T> {
  success: boolean;
  data?: T;
  raw: string;
  error?: string;
}

function stripCodeFences(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  return text.trim();
}

function extractObjectString(text: string): string | null {
  const cleaned = stripCodeFences(text);
  const firstOpen = cleaned.indexOf("{");
  const firstClose = cleaned.lastIndexOf("}");
  if (firstOpen !== -1 && firstClose !== -1 && firstClose > firstOpen) {
    return cleaned.substring(firstOpen, firstClose + 1).trim();
  }
  return null;
}

export function parseStructuredResponse<T = unknown>(rawText: unknown): ParseResult<T> {
  const raw = String(rawText ?? "");
  const source = raw.trim();
  if (!source) {
    return { success: false, raw, error: "Empty response" };
  }

  const fenced = stripCodeFences(source);
  try {
    const data = JSON.parse(fenced);
    return { success: true, data: data as T, raw };
  } catch {
    const extracted = extractObjectString(source);
    if (extracted) {
      try {
        const data = JSON.parse(extracted);
        return { success: true, data: data as T, raw };
      } catch (error) {
        return {
          success: false,
          raw,
          error: String((error as Error).message || error),
        };
      }
    }
    return { success: false, raw, error: "Could not find JSON payload" };
  }
}

