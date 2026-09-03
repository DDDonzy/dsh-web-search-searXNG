/**
 * Behavior spec for the SearXNG-backed DSH search provider.
 * Runs with the Node built-in test runner — zero dependencies:
 *   node --test tests/
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mapSearxngResult,
  mapSearxngResponse,
  SearxngSearchProvider,
  SEARXNG_DEFAULT_BASE_URL,
  SEARXNG_DEFAULT_MAX_RESULTS,
  SEARXNG_PROVIDER_ID,
} from "../lib/provider.js";

const options = { apiKey: "", baseURL: "https://searxng.test", maxResults: 5, language: "all" };

/** Wrap provider options in the resolve thunk the provider snapshots per search. */
function provider(opts = options) {
  return new SearxngSearchProvider(() => opts);
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });
}

let originalFetch;
beforeEach(() => {
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("mapSearxngResult", () => {
  it("maps a full result entry", () => {
    assert.deepEqual(
      mapSearxngResult({
        url: "https://a.test",
        title: "A",
        content: "snippet text",
        publishedDate: "2026-01-01",
      }),
      { url: "https://a.test", title: "A", snippet: "snippet text", publishedAt: "2026-01-01" },
    );
  });

  it("drops a result with no URL (uncitable)", () => {
    assert.equal(mapSearxngResult({ url: "", title: "no url" }), undefined);
    assert.equal(mapSearxngResult(undefined), undefined);
    assert.equal(mapSearxngResult({ title: "no url field" }), undefined);
  });

  it("omits blank snippet rather than inventing one", () => {
    assert.deepEqual(mapSearxngResult({ url: "https://a.test", title: "A", content: "   " }), {
      url: "https://a.test",
      title: "A",
    });
  });

  it("omits missing publishedAt", () => {
    assert.deepEqual(mapSearxngResult({ url: "https://a.test" }), { url: "https://a.test" });
  });
});

describe("mapSearxngResponse", () => {
  it("maps a full envelope preserving order", () => {
    const r = mapSearxngResponse({
      results: [
        { url: "https://a.test", title: "A" },
        { url: "https://b.test", title: "B", content: "snippet" },
      ],
    });
    assert.deepEqual(r.sources.map((s) => s.url), ["https://a.test", "https://b.test"]);
    assert.equal(r.truncated, false);
  });

  it("dedupes by URL", () => {
    const r = mapSearxngResponse({
      results: [
        { url: "https://a.test", title: "A" },
        { url: "https://a.test", title: "A again" },
      ],
    });
    assert.equal(r.sources.length, 1);
  });

  it("tolerates a missing or malformed results array", () => {
    assert.deepEqual(mapSearxngResponse(undefined).sources, []);
    assert.deepEqual(mapSearxngResponse({}).sources, []);
    assert.deepEqual(mapSearxngResponse({ results: "not-an-array" }).sources, []);
  });
});

describe("SearxngSearchProvider", () => {
  it("exposes the stable provider id", () => {
    assert.equal(provider().id, SEARXNG_PROVIDER_ID);
    assert.equal(SEARXNG_PROVIDER_ID, "searxng-local");
  });

  it("is available when baseURL parses and maxResults is positive", () => {
    assert.equal(provider().available(), true);
    assert.equal(provider({ ...options, baseURL: "not a url" }).available(), false);
    assert.equal(provider({ ...options, maxResults: 0 }).available(), false);
  });

  it("defaults match the documented constants", () => {
    assert.equal(SEARXNG_DEFAULT_BASE_URL, "http://localhost:8080");
    assert.equal(SEARXNG_DEFAULT_MAX_RESULTS, 5);
  });

  it("sends q, format=json and count, and maps the response", async () => {
    globalThis.fetch = async (url) => {
      const u = new URL(String(url));
      assert.equal(u.pathname, "/search");
      assert.equal(u.searchParams.get("q"), "deepseek");
      assert.equal(u.searchParams.get("format"), "json");
      assert.equal(u.searchParams.get("count"), "5");
      return jsonResponse({ results: [{ url: "https://a.test", title: "A", content: "snip" }] });
    };
    const r = await provider().search({ query: "deepseek" });
    assert.deepEqual(r.sources, [{ url: "https://a.test", title: "A", snippet: "snip" }]);
  });

  it("sends the language parameter when configured (not 'all')", async () => {
    globalThis.fetch = async (url) => {
      const u = new URL(String(url));
      assert.equal(u.searchParams.get("language"), "en");
      return jsonResponse({ results: [] });
    };
    await provider({ ...options, language: "en" }).search({ query: "q" });
  });

  it("omits the language parameter when 'all' or unset", async () => {
    globalThis.fetch = async (url) => {
      const u = new URL(String(url));
      assert.equal(u.searchParams.has("language"), false);
      return jsonResponse({ results: [] });
    };
    await provider({ ...options, language: "all" }).search({ query: "q" });
    await provider({ ...options, language: undefined }).search({ query: "q" });
  });

  it("sends the trusted X-Forwarded-For header (Docker-gateway rate-limit bypass)", async () => {
    globalThis.fetch = async (_url, init) => {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("x-forwarded-for"), "127.0.0.1");
      return jsonResponse({ results: [] });
    };
    await provider().search({ query: "q" });
  });

  it("propagates non-2xx as WEB_PROVIDER_ERROR with the API message", async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ message: "rate limited" }), { status: 429 });
    await assert.rejects(provider().search({ query: "q" }), (err) => err.code === "WEB_PROVIDER_ERROR");
  });

  it("propagates network failure as WEB_PROVIDER_ERROR", async () => {
    globalThis.fetch = async () => {
      throw new TypeError("fetch failed");
    };
    await assert.rejects(provider().search({ query: "q" }), (err) => err.code === "WEB_PROVIDER_ERROR");
  });

  it("honors an already-aborted signal as WEB_ABORTED", async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(provider().search({ query: "q" }, controller.signal), (err) => err.code === "WEB_ABORTED");
  });
});
