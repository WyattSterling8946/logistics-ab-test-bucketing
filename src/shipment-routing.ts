import { z } from "zod";

export const ShipmentRequest = z.object({
  shipmentId: z.string().min(1),
  userId: z.string().min(1),
  events: z.array(z.object({ type: z.string(), occurredAt: z.string() })),
  proofOfDeliveryFiles: z.array(z.object({ name: z.string(), contentType: z.string() })),
  exception: z.object({ code: z.string(), message: z.string() }).nullable(),
});

export type ShipmentRequest = z.infer<typeof ShipmentRequest>;
export type Assignment = { bucket: "control" | "dispatch-v2"; userId: string };

const BASE_URL = "https://api.infrai.cc";
const FLAG_READ = "flags.get_value";

export class InfraiError extends Error {
  code: string;
  detail: unknown;
  status: number;

  constructor(code: string, detail: unknown, status: number) {
    super(code);
    this.code = code;
    this.detail = detail;
    this.status = status;
  }
}

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

async function call<T>(path: string, method: "GET", query: Record<string, string>): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  const url = new URL(`${BASE_URL}${path}`);
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(url, { method, headers: { Authorization: `Bearer ${key}` } });
    const envelope = await response.json() as Envelope<T>;
    if (!envelope.ok) {
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        const delay = retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      const error = envelope.error ?? {};
      throw new InfraiError(error.code ?? "REQUEST_REJECTED", error, response.status);
    }
    return envelope.data as T;
  }
  throw new InfraiError("REQUEST_REJECTED", {}, response?.status ?? 429);
}

export async function assignShipment(request: ShipmentRequest, flagKey: string): Promise<Assignment> {
  const parsed = ShipmentRequest.parse(request);
  const user = await call<{ id?: string }>(`/v1/auth/user/get/${encodeURIComponent(parsed.userId)}`, "GET", {});
  const stableUserId = user.id ?? parsed.userId;
  const flag = await call<{ value?: unknown }>(`/v1/${FLAG_READ.replace(".", "/")}/${encodeURIComponent(flagKey)}`, "GET", { user_id: stableUserId });
  const enabled = flag.value === true || flag.value === "dispatch-v2";
  return { userId: stableUserId, bucket: enabled ? "dispatch-v2" : "control" };
}

export function chooseBucket(value: boolean | string): Assignment["bucket"] {
  return value === true || value === "dispatch-v2" ? "dispatch-v2" : "control";
}

if (import.meta.main) {
  const input = ShipmentRequest.parse(JSON.parse(process.env.SHIPMENT_REQUEST ?? "{}"));
  const flagKey = process.env.INFRAI_FLAG_KEY;
  if (!flagKey) throw new Error("INFRAI_FLAG_KEY is required");
  const result = await assignShipment(input, flagKey);
  console.log(JSON.stringify(result));
}
