export type StorageScope = "session" | "local" | "memory";

export interface ModelProfile {
  providerId: string;
  model: string;
  baseUrl?: string;
  endpointMode?: string;
  temperature?: number;
  maxTokens?: number;
  updatedAt: string;
}

export interface StorageConsent {
  allowSessionStorage: boolean;
  allowLocalStorage: boolean;
}

const SESSION_KEY = "pullscope:modelProfiles:session";
const LOCAL_KEY = "pullscope:modelProfiles:local";

const memoryStore: ModelProfile[] = [];

function isBrowserStorageAvailable(kind: "session" | "local"): boolean {
  if (typeof window === "undefined") return false;
  try {
    const storage = kind === "session" ? window.sessionStorage : window.localStorage;
    const test = "__pullscope_storage_test__";
    storage.setItem(test, "1");
    storage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

function safeRead<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeByKey(key: string, profiles: ModelProfile[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(profiles));
  } catch {
    // ignore by design
  }
}

function dedupeProfiles(profiles: ModelProfile[]): ModelProfile[] {
  const out: ModelProfile[] = [];
  const seen = new Set<string>();
  for (const profile of profiles) {
    const key = `${profile.providerId}/${profile.model}/${profile.baseUrl ?? ""}/${profile.endpointMode ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...profile });
  }
  return out;
}

export function getModelProfiles(
  scope: StorageScope,
  consent: StorageConsent
): ModelProfile[] {
  if (scope === "memory") {
    return [...memoryStore];
  }

  if (scope === "session" && consent.allowSessionStorage) {
    if (!isBrowserStorageAvailable("session")) return [...memoryStore];
    return safeRead<ModelProfile>(window.sessionStorage.getItem(SESSION_KEY));
  }

  if (scope === "local" && consent.allowLocalStorage) {
    if (!isBrowserStorageAvailable("local")) return [...memoryStore];
    return safeRead<ModelProfile>(window.localStorage.getItem(LOCAL_KEY));
  }

  return [...memoryStore];
}

export function saveModelProfile(
  profile: ModelProfile,
  scope: StorageScope,
  consent: StorageConsent
): void {
  const enriched = { ...profile, updatedAt: profile.updatedAt || new Date().toISOString() };
  const next = dedupeProfiles([...getModelProfiles(scope, consent), enriched]);

  if (scope === "memory") {
    memoryStore.length = 0;
    memoryStore.push(...next);
    return;
  }

  if (scope === "session" && consent.allowSessionStorage) {
    if (!isBrowserStorageAvailable("session")) {
      memoryStore.length = 0;
      memoryStore.push(...next);
      return;
    }
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    return;
  }

  if (scope === "local" && consent.allowLocalStorage) {
    if (!isBrowserStorageAvailable("local")) {
      memoryStore.length = 0;
      memoryStore.push(...next);
      return;
    }
    writeByKey(LOCAL_KEY, next);
    return;
  }

  memoryStore.length = 0;
  memoryStore.push(...next);
}

export function clearModelProfiles(
  scope: StorageScope,
  consent: StorageConsent
): void {
  if (scope === "memory") {
    memoryStore.length = 0;
    return;
  }

  if (scope === "session" && consent.allowSessionStorage && isBrowserStorageAvailable("session")) {
    window.sessionStorage.removeItem(SESSION_KEY);
    return;
  }

  if (scope === "local" && consent.allowLocalStorage && isBrowserStorageAvailable("local")) {
    window.localStorage.removeItem(LOCAL_KEY);
  }
}
