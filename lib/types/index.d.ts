/**
 * Register a SearXNG-backed provider in `ctx.web`. It calls the local SearXNG
 * JSON API (`/search?format=json`) and maps the results into the seam's
 * normalized `WebSearchSource` shape.
 * @module @deepseek-ai/dsh-web-search-searxng
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export { SearxngSearchProvider, SEARXNG_DEFAULT_BASE_URL, SEARXNG_DEFAULT_MAX_RESULTS, SEARXNG_PROVIDER_ID, mapSearxngResponse, mapSearxngResult, } from './provider.ts';
export type { SearxngSearchProviderOptions, SearxngSearchRequestRecord } from './provider.ts';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "web-search-searxng";
/** The web seam this provider registers into. */
export declare const inject: string[];
/** Plugin config (all optional — `apply` fills env-var and constant defaults). */
export interface Config {
    /** Whether searches use SearXNG instead of dsh's native provider. Defaults to false. */
    enabled?: boolean;
    /** Literal SearXNG API key (optional for local instances). */
    apiKey?: string;
    /** Credential reference resolved for each search; defaults to `SEARXNG_API_KEY`. */
    apiKeyEnv?: string;
    /** SearXNG base URL. Defaults to `http://localhost:8080`. */
    baseURL?: string;
    /** Upper bound on sources returned by one search. Defaults to 5. */
    maxResults?: number;
    /** Search language sent as `language=...`; 'all' omits the parameter. Defaults to 'all'. */
    language?: string;
}
export declare const Config: z<Config>;
/** Settings namespace carrying this provider's endpoint and key reference. */
export declare const WEB_SEARCH_SEARXNG_SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
/** Register the SearXNG search provider with `ctx.web`. */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map
