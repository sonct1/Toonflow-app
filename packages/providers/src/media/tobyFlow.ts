const rules = [
  { type: "input", field: "baseUrl" as const, title: "TobyFlow bridge URL", value: "http://host.docker.internal:8765" },
  { type: "input", field: "sessionId" as const, title: "Existing Dreamina session (optional)", value: "" },
] as const;

const ratios = ["1:1", "3:4", "16:9", "4:3", "9:16", "2:3", "3:2", "21:9"];

type ImageTask = ProviderTaskData & { baseUrl: string; idempotencyKey: string; taskId?: string; sessionId?: string };

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid TobyFlow response");
  return value as Record<string, unknown>;
}

function bridgeUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Configure the TobyFlow bridge URL");
  const url = new URL(value.trim());
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("TobyFlow bridge URL must be HTTP(S), without credentials, query or fragment");
  }
  return url.href.replace(/\/+$/, "");
}

async function request(context: ProviderContext, baseUrl: string, path: string, init?: RequestInit) {
  const response = await context.tool.fetch(`${baseUrl}${path}`, {
    ...init, signal: context.signal ? AbortSignal.any([context.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`TobyFlow HTTP ${response.status}: ${context.tool.errorMessage(await response.text())}`);
  return object(object(await response.json()).data);
}

function wait(signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal?.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, 3000);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function collect(context: ProviderContext, task: ImageTask): Promise<MediaAsset[]> {
  const baseUrl = bridgeUrl(task.baseUrl);
  if (typeof task.taskId !== "string" || !task.taskId) {
    // No receipt means dispatch may already have happened. Never silently submit again.
    throw new Error(`TobyFlow submission outcome unknown. Inspect the bridge before creating another task. Idempotency key: ${task.idempotencyKey}`);
  }
  const path = `/v1/nomi/generations/${encodeURIComponent(task.taskId)}`;
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    context.signal?.throwIfAborted();
    const operation = await request(context, baseUrl, path);
    if (operation.id !== task.taskId) throw new Error("TobyFlow returned a different task ID");
    if (operation.status === "failed_preparation") {
      throw Object.assign(new Error(context.tool.errorMessage(operation.error) || "TobyFlow preparation failed"), { code: "MEDIA_TASK_FAILED" });
    }
    if (operation.status === "outcome_unknown") {
      throw new Error(`TobyFlow outcome unknown for ${task.taskId}. Inspect/reconcile the existing task in TobyFlow, then resume; do not generate again.`);
    }
    if (operation.status === "completed") {
      if (!Array.isArray(operation.assets) || !operation.assets.length || operation.assets.length > 8) throw new Error("TobyFlow returned no valid image assets");
      const assets: MediaAsset[] = [];
      for (let index = 0; index < operation.assets.length; index++) {
        // Build URLs from the configured bridge: returned loopback URLs cannot work inside Docker.
        const response = await context.tool.fetch(`${baseUrl}${path}/media/${index}`, {
          signal: context.signal ? AbortSignal.any([context.signal, AbortSignal.timeout(200000)]) : AbortSignal.timeout(200000),
        });
        if (!response.ok) throw new Error(`TobyFlow image download HTTP ${response.status}: ${context.tool.errorMessage(await response.text())}`);
        const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
        if (!mimeType || !["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"].includes(mimeType)) throw new Error("TobyFlow returned an unsupported image type");
        const data = new Uint8Array(await response.arrayBuffer());
        if (!data.length || data.length > 16 * 1024 * 1024) throw new Error("TobyFlow image must be between 1 byte and 16 MiB");
        assets.push({ type: "binary", mediaType: "image", data, mimeType });
      }
      return assets;
    }
    if (!["preparing", "dispatching"].includes(String(operation.status))) throw new Error("Unknown TobyFlow task status; inspect the existing task before retrying");
    await wait(context.signal);
  }
  throw new Error(`TobyFlow wait timed out for ${task.taskId}. Resume this task instead of generating again.`);
}

export default {
  id: "tobyFlow",
  label: "TobyFlow (Dreamina images)",
  version: "1.0.1",
  readme: `Text-to-image via a local TobyFlow bridge and a logged-in Chrome extension. No API key required.\n\nDocker: use http://host.docker.internal:8765. Native server: use http://127.0.0.1:8765. Keep the unauthenticated bridge on a trusted, firewalled network.\n\nSeedream 4.6 and GPT Image 2 only. Downloads are previews (possibly 720px), not guaranteed 2K/4K originals. Size controls generation resolution only. No reference images, editing or video.\n\nKeep Chrome and the bridge running. Resume interrupted tasks; do not create a new task after an unknown outcome. Existing prompt text in the owned Dreamina composer is always replaced.`,
  rules,
  models: [
    { id: "dreamina:image:Seedream 4.6", label: "Dreamina / Seedream 4.6 (preview)", type: "image", mode: ["text"], imageRatios: ["1:1", "3:4", "16:9", "4:3", "9:16", "2:3", "3:2", "21:9"], imageSizes: ["2K", "4K"] },
    { id: "dreamina:image:GPT Image 2", label: "Dreamina / GPT Image 2 (preview)", type: "image", mode: ["text"], imageRatios: ["1:1", "3:4", "16:9", "4:3", "9:16", "2:3", "3:2", "21:9"], imageSizes: ["1K", "2K", "4K"] },
  ],
  async generateImage(request: ImageRequest): Promise<MediaAsset[]> {
    if (!["dreamina:image:Seedream 4.6", "dreamina:image:GPT Image 2"].includes(request.model)) throw new Error("Unsupported TobyFlow image model");
    if (!request.prompt?.trim()) throw new Error("Image prompt is required");
    if (request.images?.length || request.mask) throw new Error("TobyFlow supports text-to-image only; reference images and masks are not supported");
    if (request.outputFormat || Object.keys(request.other ?? {}).length) throw new Error("TobyFlow does not support output format overrides or extra parameters");
    const gpt = request.model === "dreamina:image:GPT Image 2";
    const quantity = request.n ?? 1;
    const ratio = request.ratio || "1:1";
    const resolution = request.size || (gpt ? "1K" : "2K");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > (gpt ? 1 : 8)) throw new Error("Invalid image count for this Dreamina model");
    if (!ratios.includes(ratio) || !(gpt ? ["1K", "2K", "4K"] : ["2K", "4K"]).includes(resolution)) throw new Error("Unsupported Dreamina aspect ratio or generation resolution");
    if (request.quality && (!gpt || !["low", "medium", "high"].includes(request.quality))) throw new Error("Unsupported Dreamina quality");
    if (!this.saveTaskData) throw new Error("TobyFlow requires persistent task recovery; update the Toonflow host");
    const baseUrl = bridgeUrl(this.config.baseUrl);
    // The provider VM has no crypto global; combine independent random values and timestamp for task identity.
    const idempotencyKey = `toonflow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    const task: ImageTask = { baseUrl, idempotencyKey };
    const sessionId = this.config.sessionId.trim();
    const body = {
      provider: "dreamina", type: "image", prompt: request.prompt, idempotencyKey,
      ...(sessionId ? { sessionId } : {}),
      settings: { model: request.model.slice("dreamina:image:".length), ratio, resolution, quantity, downloadMode: "preview", replaceDraft: true,
        ...(gpt ? { quality: request.quality || "low" } : {}) },
    };
    await this.saveTaskData(task);
    const operation = await requestOperation(this, baseUrl, body);
    if (typeof operation.id !== "string" || !operation.id || typeof operation.sessionId !== "string") throw new Error("Invalid TobyFlow submission receipt; inspect the bridge before retrying");
    task.taskId = operation.id;
    task.sessionId = operation.sessionId;
    await this.saveTaskData(task);
    return collect(this, task);
  },
  async resumeTask(data: ProviderTaskData): Promise<MediaAsset[]> {
    if (typeof data.baseUrl !== "string" || typeof data.idempotencyKey !== "string") throw new Error("Invalid TobyFlow recovery data");
    if (bridgeUrl(this.config.baseUrl) !== data.baseUrl) throw new Error("Restore the original TobyFlow bridge URL before resuming this task");
    return collect(this, data as ImageTask);
  },
} satisfies ProviderDefinition<typeof rules>;

function requestOperation(context: ProviderContext, baseUrl: string, body: ProviderTaskData) {
  return request(context, baseUrl, "/v1/nomi/generations", {
    method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": String(body.idempotencyKey) }, body: JSON.stringify(body),
  });
}
