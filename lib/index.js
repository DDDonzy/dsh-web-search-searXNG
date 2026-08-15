import z from "@deepseek-ai/schemastery";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import {
  SEARXNG_DEFAULT_BASE_URL,
  SEARXNG_DEFAULT_MAX_RESULTS,
  SEARXNG_PROVIDER_ID,
  SearxngSearchProvider,
} from "./provider.js";

export {
  SEARXNG_DEFAULT_BASE_URL,
  SEARXNG_DEFAULT_MAX_RESULTS,
  SEARXNG_PROVIDER_ID,
  SearxngSearchProvider,
} from "./provider.js";

/** Cordis plugin name used by loader diagnostics. */
const name = "web-search-searxng";

/** The web seam this provider registers into. */
const inject = ["web"];

const DEFAULT_API_KEY_ENV = "SEARXNG_API_KEY";

/** Environment variable naming this provider's endpoint. */
const SEARXNG_BASE_URL_ENV = "SEARXNG_BASE_URL";

/** Environment variable naming this provider's result-count default. */
const SEARXNG_MAX_RESULTS_ENV = "SEARXNG_MAX_RESULTS";

/** Environment variable naming this provider's search-language default. */
const SEARXNG_LANGUAGE_ENV = "SEARXNG_LANGUAGE";

const Config = z.object({
  apiKey: z.string().role("secret"),
  apiKeyEnv: z.string().role("credential-ref").default(DEFAULT_API_KEY_ENV),
  baseURL: z.string().default(SEARXNG_DEFAULT_BASE_URL),
  maxResults: z.number().step(1).min(1).default(SEARXNG_DEFAULT_MAX_RESULTS),
  language: z.string().default("all"),
});

/** Settings namespace carrying this provider's endpoint, key reference, and search options. */
const WEB_SEARCH_SEARXNG_SETTINGS_NAMESPACE = settingsNamespace("web-search-searxng");

/**
 * Project one resolved section into the options the provider serves its next
 * search with. Environment fallbacks stay here rather than in the provider:
 * every value it reads is already fully defaulted.
 * @param ctx - plugin context supplying the credential and environment planes.
 * @param config - the currently authoritative section.
 * @returns options for one search.
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
    maxResults:
      config.maxResults ?? Number(launchEnvironmentOf(ctx).get(SEARXNG_MAX_RESULTS_ENV)?.value ?? SEARXNG_DEFAULT_MAX_RESULTS),
    language: config.language ?? launchEnvironmentOf(ctx).get(SEARXNG_LANGUAGE_ENV)?.value ?? "all",
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
  WEB_SEARCH_SEARXNG_SETTINGS_NAMESPACE,
  apply,
  inject,
  name,
};
