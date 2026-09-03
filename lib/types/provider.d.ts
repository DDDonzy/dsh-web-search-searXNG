/**
 * SearXNG search provider: one HTTP GET against `/search?format=json`,
 * results mapped to the seam's `WebSearchSource` shape.
 * @module @deepseek-ai/dsh-web-search-searxng/provider
 */
import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from '@deepseek-ai/dsh-web';
/** Stable id this provider registers under. */
export declare const SEARXNG_PROVIDER_ID = "searxng-local";
/** Default SearXNG endpoint (the local compose deployment). */
export declare const SEARXNG_DEFAULT_BASE_URL = "http://localhost:8080";
/** Default upper bound on sources returned by one search. */
export declare const SEARXNG_DEFAULT_MAX_RESULTS = 5;
/** Options one search is served from (fully defaulted by the plugin). */
export interface SearxngSearchProviderOptions {
    /** Literal API key when configured. */
    readonly apiKey?: string;
    /** Resolver for the configured credential reference. */
    readonly resolveApiKey?: () => Promise<string | undefined>;
    /** Credential reference name for diagnostics. */
    readonly apiKeyEnv: string;
    /** SearXNG base URL; `/search` is appended. */
    readonly baseURL: string;
    /** Upper bound on sources returned by one search. */
    readonly maxResults: number;
    /** Search language sent as `language=...`; 'all' omits the parameter. */
    readonly language?: string;
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
/** Map one SearXNG result entry to a normalized source, or `undefined` when uncitable. */
export declare function mapSearxngResult(result: unknown): {
    url: string;
    title?: string;
    snippet?: string;
    publishedAt?: string;
} | undefined;
/** Map a SearXNG JSON response envelope to a normalized result. */
export declare function mapSearxngResponse(response: unknown): WebSearchResult;
export declare class SearxngSearchProvider implements WebSearchProvider {
    readonly id: string;
    private readonly resolveOptions;
    constructor(resolveOptions: () => SearxngSearchProviderOptions);
    available(): boolean;
    search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>;
    private apiKey;
}
//# sourceMappingURL=provider.d.ts.map
