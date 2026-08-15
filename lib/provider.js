import { WebError } from "@deepseek-ai/dsh-web";

/** Stable id this provider registers under. */
export const SEARXNG_PROVIDER_ID = "searxng-local";

/** Default SearXNG endpoint (the local compose deployment from this repo). */
export const SEARXNG_DEFAULT_BASE_URL = "http://localhost:8080";

/** Default upper bound on sources returned by one search (seam also enforces its own bound). */
export const SEARXNG_DEFAULT_MAX_RESULTS = 10;

/** Browser-ish UA so the local SearXNG botdetection does not flag the harness as a bot. */
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

/**
 * Local SearXNG is reachable from the Docker host only through the compose
 * gateway IP (e.g. 172.18.0.1), which its rate limiter treats as a foreign
 * client. The limiter trusts the loopback range (see `trusted_proxies`), so
 * forwarding this header makes the local client hit the `pass_ip` whitelist
 * (127.0.0.0/8) and skip the JSON-API rate limit entirely.
 */
const TRUSTED_FORWARDED_FOR = "127.0.0.1";

/**
 * Map ONE SearXNG result entry to a normalized source, or `undefined` when it
 * has no URL (an entry without a URL cannot be cited and is dropped).
 * @param result - one entry of SearXNG's `results[]`.
 * @returns the normalized source, or `undefined` when the entry has no URL.
 */
export function mapSearxngResult(result) {
  if (result == null || typeof result.url !== "string" || result.url.length === 0) return undefined;
  return {
    url: result.url,
    ...(typeof result.title === "string" && result.title.length > 0 ? { title: result.title } : {}),
    ...(typeof result.content === "string" && result.content.trim().length > 0 ? { snippet: result.content } : {}),
    ...(typeof result.publishedDate === "string" && result.publishedDate.length > 0
      ? { publishedAt: result.publishedDate }
      : {}),
  };
}

/**
 * Map a SearXNG JSON-API response envelope to a normalized search result.
 * Dedupes by URL and preserves the instance's relevance order. SearXNG returns
 * no provider-generated answer content, so `content` is omitted. The web
 * service owns the final `maxResults` truncation, so `truncated` is always
 * `false` here.
 * @param response - the parsed `GET /search` response body.
 * @returns the normalized result.
 */
export function mapSearxngResponse(response) {
  const seen = new Set();
  const sources = [];
  for (const result of response?.results ?? []) {
    const source = mapSearxngResult(result);
    if (source === undefined || seen.has(source.url)) continue;
    seen.add(source.url);
    sources.push(source);
  }
  return { sources, truncated: false };
}

/**
 * The SearXNG-backed search provider. One search is one HTTP GET against
 * `{baseURL}/search?format=json`; results are mapped into the seam's
 * `WebSearchSource` shape. HTTP failures surface as `WEB_PROVIDER_ERROR`,
 * caller cancellation as `WEB_ABORTED`.
 */
export class SearxngSearchProvider {
  /** Options for the NEXT operation, snapshotted once at each operation's entry. */
  resolveOptions;
  id = SEARXNG_PROVIDER_ID;

  /**
   * @param resolveOptions - a thunk returning fully-defaulted options for one
   *   search; snapshotted at each operation's entry so a settings change
   *   applies to the next search without re-registering the provider.
   */
  constructor(resolveOptions) {
    this.resolveOptions = resolveOptions;
  }

  available() {
    const options = this.resolveOptions();
    return URL.canParse(options.baseURL) && isPositiveInteger(options.maxResults);
  }

  async search(request, signal) {
    const options = this.resolveOptions();
    throwIfSearchAborted(signal);
    const apiKey = await this.apiKey(options, signal);
    throwIfSearchAborted(signal);

    const url = new URL(`${options.baseURL.replace(/\/$/, "")}/search`);
    url.searchParams.set("q", request.query);
    url.searchParams.set("format", "json");
    if (options.maxResults != null) url.searchParams.set("count", String(options.maxResults));
    if (options.language !== undefined && options.language !== "" && options.language !== "all") {
      url.searchParams.set("language", options.language);
    }

    const headers = {
      "user-agent": BROWSER_UA,
      "x-forwarded-for": TRUSTED_FORWARDED_FOR,
      "accept": "application/json, text/html;q=0.9, */*;q=0.8",
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
      ...(apiKey !== undefined && apiKey.length > 0 ? { "authorization": `Bearer ${apiKey}` } : {}),
    };

    options.recordRequest?.({
      endpoint: url.toString(),
      query: request.query,
    });

    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers,
        ...(signal !== undefined ? { signal } : {}),
      });
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
      throw new WebError(`SearXNG search request failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
    }

    if (!response.ok) {
      let message = `SearXNG API error (HTTP ${response.status})`;
      try {
        const parsed = await response.json();
        const detail = typeof parsed.message === "string" ? parsed.message : parsed.error;
        if (typeof detail === "string" && detail.length > 0) message = detail;
      } catch {
        /* non-JSON error body; keep the status-based message */
      }
      throw new WebError(message, "WEB_PROVIDER_ERROR");
    }

    try {
      return mapSearxngResponse(await response.json());
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
      if (error instanceof WebError) throw error;
      throw new WebError(`SearXNG returned an unprocessable response body: ${String(error)}`, "WEB_PROVIDER_ERROR", {
        cause: error,
      });
    }
  }

  /** Resolve one operation's credential without retaining it on the provider. */
  async apiKey(options, signal) {
    throwIfSearchAborted(signal);
    if (options.apiKey !== undefined && options.apiKey.length > 0) return options.apiKey;
    let resolved;
    try {
      resolved = await abortable(options.resolveApiKey?.() ?? Promise.resolve(undefined), signal);
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
      throw new WebError(`SearXNG credential resolution failed: ${String(error)}`, "WEB_PROVIDER_ERROR", {
        cause: error,
      });
    }
    if (resolved !== undefined && resolved.length > 0) return resolved;
    return undefined; // local SearXNG without an API key is fine
  }
}

/** Race a same-process asynchronous preflight against caller cancellation. */
function abortable(operation, signal) {
  if (signal === undefined) return operation;
  if (signal.aborted) return Promise.reject(searchAborted(signal));
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      reject(searchAborted(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(new Error(String(error).replace(/^Error: /u, ""), { cause: error }));
      },
    );
  });
}

/** Throw the provider's stable cancellation error when the caller already aborted. */
function throwIfSearchAborted(signal) {
  if (signal?.aborted === true) throw searchAborted(signal);
}

/** Build the provider's stable cancellation error while retaining the caller's reason. */
function searchAborted(signal, fallback) {
  return new WebError("SearXNG search aborted", "WEB_ABORTED", {
    cause: signal?.aborted === true ? signal.reason : fallback,
  });
}

/** True for a fetch/`AbortSignal` abort, surfaced as `WEB_ABORTED`. */
function isAbortError(error) {
  return error instanceof DOMException && error.name === "AbortError";
}

/** True for positive-integer config values. */
function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}
