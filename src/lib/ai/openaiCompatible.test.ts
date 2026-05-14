import { afterEach, describe, expect, it, vi } from "vitest";
import { callOpenAICompatible } from "./openaiCompatible";

describe("callOpenAICompatible", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses text.format for Responses API JSON mode", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ output_text: '{"summary":"ok"}' }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await callOpenAICompatible({
      provider: {
        id: "openai",
        apiKey: "test-key",
        endpointMode: "responses",
      },
      messages: [{ role: "user", content: "Review this." }],
      responseFormat: "json_object",
    });

    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const request = firstCall[1];
    const body = JSON.parse(String(request.body));
    expect(body.response_format).toBeUndefined();
    expect(body.text).toEqual({ format: { type: "json_object" } });
  });
});
