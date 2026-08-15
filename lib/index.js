import z from "@deepseek-ai/schemastery";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import { WebError } from "@deepseek-ai/dsh-web";

/** Stable id this provider registers under. */
const SEARXNG_PROVIDER_ID = "searxng-local";

/** Default SearXNG endpoint (the local compose deployment from this repo). */
const SEARXNG_DEFAULT_BASE_URL = "http://localhost:8080";

/** Default upper bound on sources returned by one search (seam also enforces its own bound). */
const SEARXNG_DEFAULT_MAX_RESULTS = 10;

/** Attribution header sent on every request. Bump with the package version. */
const USER_AGENT = "deepseek-harness-searxng/0.1.0";

/** Browser-ish UA so the local SearXNG botdetection does not flag the harness as a bot. */
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

/**
 * Local SearXNG is reachable from the Docker host only through the compose
 * gateway IP (e.g. 172.18.0.1), which its rate limiter treats as a foreign
 * client.  The limiter trusts the loopback range (see `trusted_proxies`), so
 * forwarding this header makes the local client hit the `pass_ip` whitelist
 * (127.0.0.0/8) and skip the JSON-API rate limit entirely.
 */
const TRUSTED_FORWARDED_FOR = "127.0.0.1";

/**
 * Map a SearXNG JSON-API response to the seam's normalized search result.
 * Dedupes by URL; `publishedDate` becomes `publishedAt`.
 */
function mapSearxngResponse(payload) {
  const seen = new Set();
  const sources = [];
  for (const result of payload.results ?? []) {
    const url = typeof result.url === "string" ? result.url : "";
    if (url.length === 0 || seen.has(url)) continue;
    seen.add(url);
    sources.push({
      url,
      ...(typeof result.title === "string" && result.title.length > 0 ? { title: result.title } : {}),
      ...(typeof result.content === "string" && result.content.length > 0 ? { snippet: result.content } : {}),
      ...(typeof result.publishedDate === "string" && result.publishedDate.length > 0
        ? { publishedAt: result.publishedDate }
        : {}),
    });
  }
  return { sources, truncated: false };
}

/** The SearXNG-backed search provider; HTTP failures surface as `WEB_PROVIDER_ERROR`. */
class SearxngSearchProvider {
  resolveOptions;
  id = SEARXNG_PROVIDER_ID;

  /**
   * @param resolveOptions - options for the NEXT operation, snapshotted once at
   * each operation's entry (settings section can change between searches).
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

    const headers = {
      "user-agent": BROWSER_UA,
      "x-forwarded-for": TRUSTED_FORWARDED_FOR,
      "accept": "application/json, text/html;q=0.9, */*;q=0.8",
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
      ...(apiKey !== undefined ? { "authorization": `Bearer ${apiKey}` } : {}),
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

/** Cordis plugin name used by loader diagnostics. */
const name = "web-search-searxng";

/** The web seam this provider registers into. */
const inject = ["web"];

const DEFAULT_API_KEY_ENV = "SEARXNG_API_KEY";

const Config = z.object({
  apiKey: z.string().role("secret"),
  apiKeyEnv: z.string().role("credential-ref").default(DEFAULT_API_KEY_ENV),
  baseURL: z.string().default(SEARXNG_DEFAULT_BASE_URL),
  maxResults: z.number().step(1).min(1).default(SEARXNG_DEFAULT_MAX_RESULTS),
});

/** Environment variable naming this provider's endpoint. */
const SEARXNG_BASE_URL_ENV = "SEARXNG_BASE_URL";

/** Settings namespace carrying this provider's endpoint and key reference. */
const WEB_SEARCH_SEARXNG_SETTINGS_NAMESPACE = settingsNamespace("web-search-searxng");

/**
 * Project one resolved section into the options the provider serves its next
 * search with. Environment fallbacks stay here rather than in the provider.
 */
function resolveOptions(ctx, config) {
  const apiKeyEnv = credentialRef(config.apiKeyEnv ?? DEFAULT_API_KEY_ENV);
  const literalApiKey = config.apiKey !== undefined && config.apiKey.length > 0 ? config.apiKey : undefined;
  return {
    ...(literalApiKey === undefined ? {} : { apiKey: literalApiKey }),
    resolveApiKey: async () => {
      const credentials = ctx.get("credentials");
      if (credentials !== undefined) return (await credentials.resolve(apiKeyEnv))?.value;
      const ambient = launchEnvironmentOf(ctx).get(apiKeyEnv);
      return ambient !== undefined && ambient.value.length > 0 ? ambient.value : undefined;
    },
    apiKeyEnv,
    baseURL: config.baseURL ?? launchEnvironmentOf(ctx).get(SEARXNG_BASE_URL_ENV)?.value ?? SEARXNG_DEFAULT_BASE_URL,
    maxResults: config.maxResults ?? SEARXNG_DEFAULT_MAX_RESULTS,
    recordRequest: (request) => {
      ctx.get("agents")?.currentInitiator()?.session.append("web/searxng-search-request", request);
    },
  };
}

/** Register the SearXNG search provider with `ctx.web`. */
function apply(ctx, config) {
  let current = () => config;
  installSettingsSection(ctx, WEB_SEARCH_SEARXNG_SETTINGS_NAMESPACE, Config, config, {
    setSource: (source) => {
      current = source;
    },
    onChange: () => {},
  });
  ctx.web.registerSearchProvider(new SearxngSearchProvider(() => resolveOptions(ctx, current())));
}

export {
  Config,
  SEARXNG_DEFAULT_BASE_URL,
  SEARXNG_DEFAULT_MAX_RESULTS,
  SEARXNG_PROVIDER_ID,
  SearxngSearchProvider,
  WEB_SEARCH_SEARXNG_SETTINGS_NAMESPACE,
  apply,
  inject,
  name,
};
