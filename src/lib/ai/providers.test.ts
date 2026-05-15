import { describe, expect, it } from "vitest";
import { buildProviderHeaders, getProviderPresets } from "./providers";

describe("provider presets", () => {
  it("puts Chrome AI first as the default browser-native option", () => {
    const presets = getProviderPresets();

    expect(presets[0]).toMatchObject({
      id: "chromeai",
      runtime: "browser",
      auth: { needsApiKey: false },
    });
  });
});

describe("buildProviderHeaders", () => {
  it("keeps Content-Type and Authorization Bearer for providers that need key", () => {
    expect(buildProviderHeaders({ id: "openai", apiKey: "test-key" })).toEqual({
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Bearer test-key",
    });
  });

  it("uses custom auth header when explicitly enabled and set", () => {
    expect(
      buildProviderHeaders({
        id: "openai",
        apiKey: "ignored-key",
        customAuthHeader: {
          enabled: true,
          name: "X-Api-Key",
          value: "custom-value",
        },
      }),
    ).toEqual({
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Api-Key": "custom-value",
    });
  });

  it("falls back to Bearer when custom auth header is empty", () => {
    expect(
      buildProviderHeaders({
        id: "openai",
        apiKey: "test-key",
        customAuthHeader: {
          enabled: true,
          name: "",
          value: "",
        },
      }),
    ).toEqual({
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Bearer test-key",
    });
  });
});
