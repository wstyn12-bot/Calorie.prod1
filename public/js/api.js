// API client: JSON requests to /api with the session token, timeouts and friendly errors.

const TOKEN_KEY = "cp_token";
const USER_KEY = "cp_user";

function lsGet(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k, v) {
  try {
    if (v === null || v === undefined) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* storage unavailable */
  }
}

export class ApiError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

let token = lsGet(TOKEN_KEY);
let onUnauthorized = null;

export const api = {
  get token() {
    return token;
  },
  setToken(t) {
    token = t || null;
    lsSet(TOKEN_KEY, token);
  },
  get savedUser() {
    try {
      return JSON.parse(lsGet(USER_KEY) || "null");
    } catch {
      return null;
    }
  },
  saveUser(u) {
    lsSet(USER_KEY, u ? JSON.stringify(u) : null);
  },
  onUnauthorized(fn) {
    onUnauthorized = fn;
  },

  async req(method, path, body, opts = {}) {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(new DOMException("timeout", "TimeoutError")), opts.timeout ?? 30_000);
    const outer = opts.signal;
    const onOuterAbort = () => ctrl.abort(new DOMException("cancelled", "AbortError"));
    if (outer) {
      if (outer.aborted) onOuterAbort();
      else outer.addEventListener("abort", onOuterAbort, { once: true });
    }

    const headers = { ...(opts.headers || {}) };
    if (token) headers.authorization = `Bearer ${token}`;
    let payload;
    if (body instanceof Blob) {
      payload = body;
      headers["content-type"] ??= body.type || "application/octet-stream";
    } else if (body !== undefined) {
      payload = JSON.stringify(body);
      headers["content-type"] = "application/json";
    }

    let res;
    try {
      res = await fetch("/api" + path, { method, headers, body: payload, signal: ctrl.signal, cache: "no-store" });
    } catch (err) {
      clearTimeout(timeout);
      outer?.removeEventListener("abort", onOuterAbort);
      if (outer?.aborted) throw new ApiError(0, "Cancelled.", { cancelled: true });
      if (ctrl.signal.aborted) throw new ApiError(0, "The server took too long to respond.", { network: true, timeout: true });
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      throw new ApiError(0, offline ? "You're offline." : "Couldn't reach the server.", { network: true });
    }
    clearTimeout(timeout);
    outer?.removeEventListener("abort", onOuterAbort);

    if (opts.raw && res.ok) return res;
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* not JSON */
    }
    if (!res.ok) {
      if (res.status === 401 && token && path !== "/auth/login") onUnauthorized?.();
      const fallback =
        res.status === 404 && !data
          ? "The app's server isn't responding. If you just deployed, check the Netlify function deployed correctly."
          : `Request failed (${res.status}).`;
      throw new ApiError(res.status, data?.error || fallback);
    }
    return data;
  },

  get: (path, opts) => api.req("GET", path, undefined, opts),
  post: (path, body, opts) => api.req("POST", path, body ?? {}, opts),
};
