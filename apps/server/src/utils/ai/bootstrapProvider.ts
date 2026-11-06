import { z } from "zod";
import conf from "@/utils/conf";
import { providerSchema } from "./provider";

// Seed only a missing provider. User edits and unrelated settings always win.
export function bootstrapProvider() {
  const settings = conf.get("settings", {});
  const providers = settings.customProviders;
  if (providers !== undefined && !Array.isArray(providers)) throw new Error("Invalid customProviders configuration");
  if (providers?.some((provider: unknown) => typeof provider === "object" && provider !== null && "id" in provider && provider.id === "dx-tokens")) return;
  const apiKey = process.env.DX_TOKENS_API_KEY?.trim();
  if (!apiKey) return;
  const models = process.env.DX_TOKENS_MODELS_JSON
    ? JSON.parse(process.env.DX_TOKENS_MODELS_JSON)
    : [
      { id: "gpt-5.5", label: "GPT-5.5" },
      { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", contextWindow: 270000 },
      { id: "gpt-5.6-terra", label: "GPT-5.6 Terra", contextWindow: 270000 },
      { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", contextWindow: 270000 },
      { id: "gpt-6-astra", label: "GPT-6 Astra", contextWindow: 270000, maxOutputTokens: 128000 },
    ].map(model => ({ ...model, reasoningEfforts: { low: "low", medium: "medium", high: "high" } }));
  const parsed = providerSchema.extend({ id: z.string(), label: z.string() }).safeParse({
    id: "dx-tokens", label: "DX Tokens",
    apiUrl: process.env.DX_TOKENS_BASE_URL || "https://dx-tokens.cmctelecom.vn/v1",
    apiKey, protocol: "openai-completions", models,
  });
  // Do not include the rejected configuration in errors: it contains credentials.
  if (!parsed.success) throw new Error("Invalid DX Tokens bootstrap configuration");
  conf.set("settings", { ...settings, customProviders: [...(providers ?? []), parsed.data] });
}
