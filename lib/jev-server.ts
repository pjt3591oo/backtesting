import { env } from "cloudflare:workers";

export interface ServerConfig {
  baseUrl: string;
  provider: "jev" | "custom";
  model: string;
  key: string;
  headers: Record<string, string>;
  label: string;
}

// Server-only configuration: supports Local Jev and Custom AI endpoints with client overrides.
export function jevServer(request?: Request): ServerConfig {
  const settings = (env as Record<string, unknown>) || {};

  const reqBaseUrl = request?.headers.get("x-api-base-url");
  const reqKey = request?.headers.get("x-api-key");
  const reqModel = request?.headers.get("x-api-model");
  const reqProvider = request?.headers.get("x-api-provider");

  const baseUrl = String(
    reqBaseUrl ||
      settings.JEV_BASE_URL ||
      process.env.JEV_BASE_URL ||
      process.env.API_BASE_URL ||
      "http://127.0.0.1:8000",
  ).replace(/\/+$/, "");

  const key = String(
    reqKey ||
      settings.TYPESAFE_API_KEY ||
      process.env.TYPESAFE_API_KEY ||
      process.env.API_KEY ||
      "",
  ).trim();

  const model = String(
    reqModel ||
      settings.TYPESAFE_MODEL ||
      process.env.TYPESAFE_MODEL ||
      process.env.MODEL_NAME ||
      "",
  ).trim();

  const rawProvider = String(
    reqProvider || settings.API_PROVIDER || process.env.API_PROVIDER || "jev",
  ).toLowerCase();

  const provider: "jev" | "custom" =
    rawProvider === "custom" ? "custom" : "jev";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }

  let label = "로컬 Jev";
  if (provider === "custom") {
    label = model ? `AI API (${model})` : "Custom AI API";
  } else if (model) {
    label = `로컬 Jev (${model})`;
  }

  return {
    baseUrl,
    provider,
    model,
    key,
    headers,
    label,
  };
}
