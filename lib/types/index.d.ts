/**
 * Register a SearXNG-backed provider in `ctx.web`. It calls the local SearXNG
 * JSON API (`/search?format=json`) and maps the results into the seam's
 * normalized `WebSearchSource` shape.
 * @module @deepseek-ai/dsh-web-search-searxng
 */
import type { Context } from '@deepseek-ai/cordis';
import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from '@deepseek-ai/dsh-web';
import type { CredentialRef } from '@deepseek-ai/dsh-credentials';
import z from '@deepseek-ai/schemastery';
/** Stable id this provider registers under. */
export declare const SEARXNG_PROVIDER_ID = "searxng-local";
/** Default SearXNG endpoint (the local compose deployment). */
export declare const SEARXNG_DEFAULT_BASE_URL = "http://localhost:8080";
/** Default upper bound on sources returned by one search. */
export declare const SEARXNG_DEFAULT_MAX_RESULTS = 10;
/** Options one search is served from (fully defaulted by the plugin). */
export interface SearxngSearchProviderOptions {
    /** Literal API key when configured. */
    readonly apiKey?: string;
    /** Resolver for the configured credential reference. */
    readonly resolveApiKey?: () => Promise<string | undefined>;
    /** Credential reference name for diagnostics. */
    readonly apiKeyEnv: CredentialRef;
    /** SearXNG base URL; `/search` is appended. */
    readonly baseURL: string;
    /** Upper bound on sources returned by one search. */
    readonly maxResults: number;
    /** Optional exact request recorder (secret-free). */
    readonly recordRequest?: (request: SearxngSearchRequestRecord) => void;
}
/** Exact secret-free SearXNG search request recorded before one dispatch. */
export interface SearxngSearchRequestRecord {
    /** Fully resolved search endpoint. */
    readonly endpoint: string;
    /** The query sent. */
    readonly query: string;
}
export declare class SearxngSearchProvider implements WebSearchProvider {
    readonly id: string;
    private readonly resolveOptions;
    constructor(resolveOptions: () => SearxngSearchProviderOptions);
    available(): boolean;
    search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>;
    private apiKey;
}
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "web-search-searxng";
/** The web seam this provider registers into. */
export declare const inject: string[];
/** Plugin config (all optional — `apply` fills env-var and constant defaults). */
export interface Config {
    /** Literal SearXNG API key (optional for local instances). */
    apiKey?: string;
    /** Credential reference resolved for each search; defaults to `SEARXNG_API_KEY`. */
    apiKeyEnv?: string;
    /** SearXNG base URL. Defaults to `http://localhost:8080`. */
    baseURL?: string;
    /** Upper bound on sources returned by one search. Defaults to 10. */
    maxResults?: number;
}
export declare const Config: z<Config>;
/** Settings namespace carrying this provider's endpoint and key reference. */
export declare const WEB_SEARCH_SEARXNG_SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
/** Register the SearXNG search provider with `ctx.web`. */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map
