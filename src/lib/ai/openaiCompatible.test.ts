import { afterEach, describe, expect, it, vi } from "vitest";
import { callOpenAICompatible } from "./openaiCompatible";

describe("callOpenAICompatible", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses text.format json_schema for Responses API JSON mode", async () => {
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
    expect(body.text.format).toMatchObject({
      type: "json_schema",
      name: "pullscope_review",
    });
  });

  it("uses response_format.type json_schema for schema-capable chat providers", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"summary":"ok"}' } }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await callOpenAICompatible({
      provider: {
        id: "groq",
        apiKey: "test-key",
        endpointMode: "chat_completions",
      },
      messages: [{ role: "user", content: "Review this." }],
      responseFormat: "json_object",
    });

    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const request = firstCall[1];
    const body = JSON.parse(String(request.body));

    expect(body.response_format).toMatchObject({ type: "json_schema" });
    expect(body.response_format.type).not.toBe("json_object");
  });

  it("keeps json_object mode for Ollama chat completions", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"summary":"ok"}' } }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await callOpenAICompatible({
      provider: {
        id: "ollama",
        endpointMode: "chat_completions",
      },
      messages: [{ role: "user", content: "Review this." }],
      responseFormat: "json_object",
    });

    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const request = firstCall[1];
    const body = JSON.parse(String(request.body));

    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("uses JSON Schema for LM Studio chat completions JSON mode", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"summary":"ok"}' } }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await callOpenAICompatible({
      provider: {
        id: "lmstudio",
        endpointMode: "chat_completions",
      },
      messages: [{ role: "user", content: "Review this." }],
      responseFormat: "json_object",
    });

    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const request = firstCall[1];
    const body = JSON.parse(String(request.body));

    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { name: "pullscope_review" },
    });
  });

  it("falls back from unsupported Responses API to chat completions in auto mode", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "unsupported text.format" } }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"summary":"ok"}' } }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await callOpenAICompatible({
      provider: {
        id: "openrouter",
        apiKey: "test-key",
        endpointMode: "auto",
      },
      messages: [{ role: "user", content: "Review this." }],
      responseFormat: "json_object",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/v1/responses");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/api/v1/chat/completions");
    expect(response.endpointUsed).toBe("chat_completions");
  });

  it("retries with json_schema when a chat provider rejects json_object format", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { message: "response_format.type must be json_schema" },
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"summary":"ok"}' } }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await callOpenAICompatible({
      provider: {
        id: "custom",
        baseUrl: "https://example.test",
        apiKey: "test-key",
        endpointMode: "chat_completions",
      },
      messages: [{ role: "user", content: "Review this." }],
      responseFormat: "json_object",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstRequestBody = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    const secondRequestBody = JSON.parse(String(fetchMock.mock.calls[1][1].body));

    expect(firstRequestBody.response_format.type).toBe("json_object");
    expect(secondRequestBody.response_format.type).toBe("json_schema");
    expect(secondRequestBody.response_format.json_schema.schema).toEqual({
      type: "object",
      additionalProperties: true,
    });
    expect(response.text).toBe('{"summary":"ok"}');
    expect(response.data).toEqual({ summary: "ok" });
  });
});
