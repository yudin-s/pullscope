import { afterEach, describe, expect, it, vi } from "vitest";
import { callAiProvider } from "./callAiProvider";
import { callOpenAICompatible } from "./openaiCompatible";
import { callChromeBuiltInAI, prepareChromeBuiltInAI, probeChromeBuiltInAI } from "./chromeBuiltIn";

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
    const languageModelRow = rows.find((row) => row.label === "LanguageModel API");
    expect(languageModelRow?.help?.join(" ")).toContain("Prompt API for Gemini Nano");
    expect(languageModelRow?.links?.some((link) => link.href.includes("prompt-api-for-gemini-nano"))).toBe(true);
  });

  it("adds actionable download guidance when Gemini Nano is downloadable", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { userActivation: { hasBeenActive: true }, gpu: {} });
    vi.stubGlobal("LanguageModel", {
      availability: vi.fn(async () => "downloadable"),
      create: vi.fn(),
    });

    const rows = await probeChromeBuiltInAI();
    const availabilityRow = rows.find((row) => row.label === "Gemini Nano availability");

    expect(availabilityRow?.status).toBe("warn");
    expect(availabilityRow?.help?.join(" ")).toContain("download");
    expect(availabilityRow?.links?.some((link) => link.href === "chrome://on-device-internals")).toBe(true);
  });

  it("prepares a downloadable Chrome AI model through create", async () => {
    const prompt = vi.fn(async () => "ok");
    const create = vi.fn(async () => ({ prompt }));
    const progress = vi.fn();
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { userActivation: { hasBeenActive: true }, gpu: {} });
    vi.stubGlobal("LanguageModel", {
      availability: vi.fn(async () => "downloadable"),
      create,
    });

    const rows = await prepareChromeBuiltInAI(progress);
    const preparationRow = rows.find((row) => row.label === "Model preparation");

    expect(create).toHaveBeenCalled();
    expect(prompt).toHaveBeenCalledWith("Reply with exactly: ok");
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ status: "pending" }));
    expect(preparationRow?.status).toBe("pass");
  });

  it("passes Chrome downloadprogress into diagnostic progress detail with bytes and percent", async () => {
    const progressRows: Array<{
      status: string;
      detail: string;
      progress?: { percent?: number; loadedBytes?: number; totalBytes?: number; remainingBytes?: number };
    }> = [];
    const create = vi.fn(async (options: { monitor?: (monitor: EventTarget) => void }) => {
      const monitor = new EventTarget();
      options?.monitor?.(monitor);
      monitor.dispatchEvent(
        Object.assign(new Event("downloadprogress"), {
          loaded: 50,
          total: 100,
        })
      );
      return { prompt: vi.fn(async () => "ok") };
    });
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { userActivation: { hasBeenActive: true }, gpu: {} });
    vi.stubGlobal("LanguageModel", {
      availability: vi.fn(async () => "downloadable"),
      create,
    });

    const progress = vi.fn((row) => {
      progressRows.push(row);
    });

    await prepareChromeBuiltInAI(progress);

    const progressRow = progressRows.find((row) => row.status === "pending" && row.progress && row.progress.percent === 50);

    expect(progressRow).toBeDefined();
    expect(progressRow?.progress).toMatchObject({
      percent: 50,
      loadedBytes: 50,
      totalBytes: 100,
      remainingBytes: 50,
    });
    expect(progressRow?.detail).toContain("50%");
    expect(progressRow?.detail).toContain("Downloaded 50 B of 100 B");
  });

  it("passes AbortSignal into LanguageModel.create options during preparation", async () => {
    const controller = new AbortController();
    let createOptions: { signal?: AbortSignal } | undefined;
    const prompt = vi.fn(async () => "ok");
    const create = vi.fn(async (options: { signal?: AbortSignal }) => {
      createOptions = options;
      return { prompt };
    });
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { userActivation: { hasBeenActive: true }, gpu: {} });
    vi.stubGlobal("LanguageModel", {
      availability: vi.fn(async () => "downloadable"),
      create,
    });

    await prepareChromeBuiltInAI(vi.fn(), controller.signal);

    expect(create).toHaveBeenCalled();
    expect(createOptions?.signal).toBe(controller.signal);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: controller.signal,
        monitor: expect.any(Function),
        expectedInputs: [{ type: "text", languages: ["en"] }],
      })
    );
    expect(prompt).toHaveBeenCalled();
  });

  it("does not hide model downloads behind review calls", async () => {
    vi.stubGlobal("LanguageModel", {
      availability: vi.fn(async () => "downloadable"),
      create: vi.fn(),
    });

    await expect(
      callChromeBuiltInAI({
        provider: { id: "chromeai" },
        messages: [{ role: "user", content: "Review this." }],
        responseFormat: "text",
      })
    ).rejects.toThrow("Prepare Chrome AI model");
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
