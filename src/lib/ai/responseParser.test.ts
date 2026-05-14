import { describe, expect, it } from "vitest";
import { parseStructuredResponse } from "./responseParser";

describe("parseStructuredResponse", () => {
  it("parses plain JSON", () => {
    const result = parseStructuredResponse<{ summary: string }>('{"summary":"ok"}');

    expect(result.success).toBe(true);
    expect(result.data?.summary).toBe("ok");
  });

  it("parses fenced JSON blocks", () => {
    const result = parseStructuredResponse<{ score: number }>(
      '```json\n{"score":42}\n```'
    );

    expect(result.success).toBe(true);
    expect(result.data?.score).toBe(42);
  });

  it("extracts the first object from surrounding text", () => {
    const result = parseStructuredResponse<{ ok: boolean }>(
      'Here is the result:\n{"ok":true}\nThanks.'
    );

    expect(result.success).toBe(true);
    expect(result.data?.ok).toBe(true);
  });

  it("returns a failure for empty responses", () => {
    const result = parseStructuredResponse("");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Empty response");
  });
});
