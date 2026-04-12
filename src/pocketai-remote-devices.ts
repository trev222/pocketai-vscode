import { normalizeBaseUrl } from "./helpers";
import { LOCAL_POCKETAI_URL } from "./provider-constants";
import type { EndpointConfig } from "./types";

export type PocketAiRemoteDevice = {
  id: string;
  name: string;
  subdomain: string;
  url: string;
  apiKey?: string | null;
  localPort: number;
  status: string;
  lastSeenAt?: string | null;
};

type PocketAiRemoteDevicesResponse = {
  ok?: boolean;
  devices?: PocketAiRemoteDevice[];
};

export function buildPocketAiRemoteEndpoint(
  device: PocketAiRemoteDevice,
): EndpointConfig | null {
  const remoteUrl = normalizeBaseUrl(device.url || "");
  const apiKey = (device.apiKey ?? "").trim();
  const subdomain = (device.subdomain ?? "").trim();
  const baseName = (device.name ?? "").trim() || subdomain || "PocketAI Device";

  if (!device.id || !remoteUrl || !apiKey) {
    return null;
  }

  const name =
    subdomain && !baseName.includes(subdomain)
      ? `${baseName} · ${subdomain}`
      : baseName;

  return {
    name,
    url: remoteUrl,
    apiKey,
    managed: true,
    managedSource: "pocketai-remote-device",
    deviceId: device.id,
    subdomain,
    remoteUrl,
  };
}

export async function fetchPocketAiRemoteEndpoints(
  baseUrl = LOCAL_POCKETAI_URL,
): Promise<EndpointConfig[]> {
  const response = await fetch(
    `${normalizeBaseUrl(baseUrl)}/pocketai/devices`,
    { signal: AbortSignal.timeout(5000) },
  );
  if (!response.ok) {
    throw new Error(`PocketAI device lookup failed (${response.status})`);
  }

  const payload = (await response.json()) as PocketAiRemoteDevicesResponse;
  return Array.from(
    new Map(
      (payload.devices ?? [])
        .map((device) => buildPocketAiRemoteEndpoint(device))
        .filter((endpoint): endpoint is EndpointConfig => !!endpoint)
        .map((endpoint) => [normalizeBaseUrl(endpoint.url), endpoint]),
    ).values(),
  );
}
