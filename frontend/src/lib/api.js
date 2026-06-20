export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export const AUTH_STORAGE_KEY = "tech-fault-rag-auth-token";

export function createTemporaryId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}`;
}

export async function fetchJson(url, options = {}) {
  const { token, ...fetchOptions } = options;
  const headers = { ...(fetchOptions.headers ?? {}) };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...fetchOptions, headers });

  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`;
    try {
      const errorBody = await response.json();
      if (typeof errorBody.detail === "string") {
        detail = errorBody.detail;
      }
    } catch {
      // keep fallback detail
    }
    const error = new Error(detail);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export async function readNdjsonStream(response, onEvent) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Streaming is not supported by this browser.");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      onEvent(JSON.parse(line));
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    onEvent(JSON.parse(buffer));
  }
}
