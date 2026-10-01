// Transport only. Credentials are supplied exclusively by threads-publishing.ts (server-only).
// Meta's current sample uses graph.threads.com and the app's default API version.
const API_BASE = "https://graph.threads.com/";
type Fetcher = typeof fetch;

export class ThreadsApiError extends Error {
  constructor(message: string, public readonly ambiguous = false) { super(message); }
}

function id(value: unknown): value is string {
  return typeof value === "string" && /^[0-9]+$/.test(value);
}

async function graph(token: string, path: string, params: Record<string, string>, method: "GET" | "POST", transport: Fetcher) {
  const url = new URL(path, API_BASE);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  let response: Response;
  try {
    response = await transport(url, {
      method, headers: { Authorization: "Bearer " + token }, cache: "no-store",
      redirect: "error", signal: AbortSignal.timeout(15000),
    });
  } catch {
    // Never retain fetch exceptions, request URLs, tokens, or provider error text.
    throw new ThreadsApiError("Threads 응답을 확인할 수 없습니다.", true);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const code = typeof data?.error?.code === "number" ? " / code " + data.error.code : "";
    throw new ThreadsApiError("Threads 요청 실패 (HTTP " + response.status + code + "). 토큰 권한·만료와 본문 제한을 확인해 주세요.",
      response.status >= 500 || response.status === 408);
  }
  if (!data || typeof data !== "object" || data.error) {
    throw new ThreadsApiError("Threads 응답 형식을 확인할 수 없습니다.", true);
  }
  return data as Record<string, unknown>;
}

export async function threadsIdentity(token: string, transport: Fetcher = fetch) {
  const data = await graph(token, "me", { fields: "id,username" }, "GET", transport);
  if (!id(data.id) || typeof data.username !== "string" || !data.username || data.username.length > 100) {
    throw new ThreadsApiError("Threads 계정 정보를 확인할 수 없습니다.");
  }
  return { userId: data.id, username: data.username };
}

type PublishCallbacks = {
  saveContainer: (containerId: string) => Promise<void>;
  savePublished: (postId: string) => Promise<void>;
  saveFailure: (message: string, retryable: boolean) => Promise<void>;
};

export async function publishThreadsText(token: string, userId: string, text: string,
  callbacks: PublishCallbacks, transport: Fetcher = fetch,
  pause: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 1000))) {
  if (!id(userId) || !text.trim()) throw new ThreadsApiError("게시 계정과 본문을 확인해 주세요.");
  let publishSent = false;
  let postId: string | null = null;
  try {
    // Omit auto_publish_text: persist the container before causing an external post.
    const container = await graph(token, userId + "/threads", { media_type: "TEXT", text }, "POST", transport);
    if (!id(container.id)) throw new ThreadsApiError("Threads 컨테이너 ID를 확인할 수 없습니다.", true);
    await callbacks.saveContainer(container.id);
    let ready = false;
    const readyDeadline = Date.now() + 30000;
    for (let attempt = 0; attempt < 8; attempt++) {
      if (Date.now() >= readyDeadline) break;
      const status = await graph(token, container.id, { fields: "id,status" }, "GET", transport);
      if (status.status === "FINISHED") { ready = true; break; }
      if (status.status === "PUBLISHED") {
        publishSent = true;
        throw new ThreadsApiError("이미 게시된 컨테이너입니다.", true);
      }
      if (status.status !== "IN_PROGRESS") throw new ThreadsApiError("Threads 컨테이너를 게시할 수 없습니다.");
      await pause();
    }
    if (!ready) throw new ThreadsApiError("Threads 글 준비가 지연되었습니다. 잠시 후 다시 게시해 주세요.");
    publishSent = true;
    const published = await graph(token, userId + "/threads_publish", { creation_id: container.id }, "POST", transport);
    if (!id(published.id)) throw new ThreadsApiError("Threads 게시 결과 ID를 확인할 수 없습니다.", true);
    postId = published.id;
    await callbacks.savePublished(postId);
    return postId;
  } catch (failure) {
    if (postId) {
      // A real post exists. Leave the DB claim locked; do not pretend it is retryable.
      throw new ThreadsApiError("Threads 게시 성공(ID " + postId + ") 후 결과 저장이 지연되었습니다. 재게시하지 말고 관리자에게 알려주세요.");
    }
    const error = failure instanceof ThreadsApiError ? failure : new ThreadsApiError("게시 결과를 저장할 수 없습니다.");
    const retryable = !publishSent || !error.ambiguous;
    const message = retryable ? error.message
      : "게시 응답이 불확실합니다. 중복 게시 방지를 위해 재시도를 차단했습니다. Threads에서 게시 여부를 확인해 주세요.";
    try { await callbacks.saveFailure(message, retryable); } catch {
      throw new ThreadsApiError("게시 시도가 잠겨 있습니다. 결과 저장을 확인하기 전에는 재게시할 수 없습니다.");
    }
    throw new ThreadsApiError(message);
  }
}
