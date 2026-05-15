import { afterEach, describe, expect, it, vi } from "vitest";
import { callAiProvider } from "./callAiProvider";
import { callOpenAICompatible } from "./openaiCompatible";
import { callChromeBuiltInAI, probeChromeBuiltInAI } from "./chromeBuiltIn";

describe("Chrome built-in AI provider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reports missing LanguageModel as unavailable", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { userActivation: { hasBeenActive: true } });

    const rows = await probeChromeBuiltInAI();

    expect(rows.some((row) => row.label === "LanguageModel API" && row.status === "fail")).toBe(true);
  });

  it("calls Chrome LanguageModel and parses JSON output", async () => {
    const destroy = vi.fn();
    const prompt = vi.fn(async () => '{"summary":"ok"}');
    const create = vi.fn(async () => ({ prompt, destroy }));
    const availability = vi.fn(async () => "available");
    vi.stubGlobal("LanguageModel", { availability, create });
    vi.stubGlobal("navigator", { userActivation: { hasBeenActive: true }, gpu: {}, ml: {} });

    const response = await callChromeBuiltInAI<{ summary: string }>({
      provider: { id: "chromeai" },
      messages: [{ role: "user", content: "Review this." }],
      responseFormat: "json_object",
    });

    expect(availability).toHaveBeenCalled();
    expect(create).toHaveBeenCalled();
    expect(prompt).toHaveBeenCalledWith(expect.stringContaining("USER:"), { signal: undefined });
    expect(destroy).toHaveBeenCalled();
    expect(response.data).toEqual({ summary: "ok" });
  });

  it("routes chromeai through the browser provider facade", async () => {
    const prompt = vi.fn(async () => "ok");
    vi.stubGlobal("LanguageModel", {
      availability: vi.fn(async () => "available"),
      create: vi.fn(async () => ({ prompt })),
    });

    const response = await callAiProvider({
      provider: { id: "chromeai" },
      messages: [{ role: "user", content: "health check" }],
      responseFormat: "text",
    });

    expect(response.raw).toMatchObject({ provider: "chromeai" });
    expect(response.text).toBe("ok");
  });

  it("keeps browser-native providers out of HTTP endpoints", async () => {
    await expect(
      callOpenAICompatible({
        provider: { id: "chromeai" },
        messages: [{ role: "user", content: "health check" }],
      })
    ).rejects.toThrow("browser-native provider");
  });
});
