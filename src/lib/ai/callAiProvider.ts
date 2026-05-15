import { callChromeBuiltInAI } from "./chromeBuiltIn";
import {
  callOpenAICompatible,
  OpenAICompatibleOptions,
  OpenAICompatibleResponse,
} from "./openaiCompatible";

export async function callAiProvider<T = unknown>(
  opts: OpenAICompatibleOptions
): Promise<OpenAICompatibleResponse<T>> {
  if (opts.provider.id === "chromeai") {
    return callChromeBuiltInAI<T>(opts);
  }
  return callOpenAICompatible<T>(opts);
}
