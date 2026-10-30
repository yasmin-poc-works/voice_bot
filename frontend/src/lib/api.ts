export type Role = "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface ChatResult {
  reply: string;
  status: "ACCEPTED" | "REJECTED";
  category: string;
  usage: { total_tokens: number };
}

// Inlined at build time, so it must be read as a literal property access.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  /** Seconds to wait, when the server is busy (Retry-After header). */
  retryAfter?: number;

  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Wakes a sleeping free-tier backend. Failures are ignored on purpose. */
export function wakeBackend(): void {
  fetch(`${API_URL}/health`).catch(() => undefined);
}

export async function sendChat(
  message: string,
  history: ChatMessage[],
  sessionId: string,
): Promise<ChatResult> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history, session_id: sessionId }),
    });
  } catch {
    throw new ApiError(0, "network");
  }
  if (!res.ok) {
    const err = new ApiError(res.status, "request failed");
    err.retryAfter = Number(res.headers.get("Retry-After")) || undefined;
    throw err;
  }
  return (await res.json()) as ChatResult;
}
