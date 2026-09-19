export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  provider: "jev" | "custom";
}

const STORAGE_KEY = "jev_api_config";

export const DEFAULT_API_CONFIG: ApiConfig = {
  baseUrl: "http://127.0.0.1:8000",
  apiKey: "",
  model: "",
  provider: "jev",
};

export function getClientApiConfig(): ApiConfig {
  if (typeof window === "undefined") return DEFAULT_API_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_API_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      baseUrl: parsed.baseUrl || DEFAULT_API_CONFIG.baseUrl,
      apiKey: parsed.apiKey || "",
      model: parsed.model || "",
      provider: parsed.provider || "jev",
    };
  } catch {
    return DEFAULT_API_CONFIG;
  }
}

export function saveClientApiConfig(config: ApiConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  window.dispatchEvent(new Event("api-config-changed"));
}

export function getApiHeaders(config?: ApiConfig): Record<string, string> {
  const cfg = config || getClientApiConfig();
  const headers: Record<string, string> = {};
  if (cfg.baseUrl) headers["x-api-base-url"] = cfg.baseUrl;
  if (cfg.apiKey) headers["x-api-key"] = cfg.apiKey;
  if (cfg.model) headers["x-api-model"] = cfg.model;
  if (cfg.provider) headers["x-api-provider"] = cfg.provider;
  return headers;
}
