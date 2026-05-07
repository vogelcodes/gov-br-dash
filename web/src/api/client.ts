export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
  }
}

type Method = "GET" | "POST" | "DELETE" | "PUT";

export async function api<T>(
  method: Method,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const opts: RequestInit = {
    method,
    credentials: "include",
    headers: { Accept: "application/json" },
    signal,
  };
  if (body !== undefined) {
    (opts.headers as Record<string, string>)["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(path, opts);
  const text = await r.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!r.ok) {
    let message = `HTTP ${r.status}`;
    if (parsed && typeof parsed === "object" && "message" in parsed) {
      const m = (parsed as { message: unknown }).message;
      if (typeof m === "string" && m.length > 0) message = m;
    }
    throw new ApiError(r.status, message, parsed);
  }
  return parsed as T;
}
