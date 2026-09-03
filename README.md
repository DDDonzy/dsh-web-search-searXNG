# dsh-web-search-searXNG

English | [中文](README.zh.md)

> **Fork notice**: This project is forked from [acdcgz/dsh-web-search-searxng](https://github.com/acdcgz/dsh-web-search-searxng). The maintained repository is [DDDonzy/dsh-web-search-searXNG](https://github.com/DDDonzy/dsh-web-search-searXNG).

A [SearXNG](https://docs.searxng.org/)-backed `WebSearchProvider` for the DeepSeek Harness [web capability seam](https://github.com/deepseek-ai/deepseek-harness) (`ctx.web`). The plugin calls SearXNG's JSON API and maps aggregated results into dsh's normalized search-source shape.

## Features

- Self-hosted SearXNG search without a per-search model request;
- SearXNG multi-engine aggregation;
- dsh provider ID: `searxng-local`;
- SearXNG disabled by default, preserving dsh's native search;
- Settings card for switching between native dsh search and SearXNG;
- API Key stored through dsh Credentials without echoing the secret;
- URL, result-count, and language controls;
- Connection test with a preview of real search results;
- Host logic and Browser UI kept separate, with UI source under `ui/`.

## Installation

### Install from a local directory

Use this when the project is already available on the local machine:

```bash
dsh plugin --profile web add E:\dsh-searXNG
```

Restart dsh after installation, then open:

```text
Settings → Plugins → Plugin configuration → SearXNG search
```

### Install from the Git repository

Install directly from the maintained repository:

```bash
dsh plugin --profile web add github:DDDonzy/dsh-web-search-searXNG
```

Alternatively, clone it first and install the local directory:

```bash
git clone https://github.com/DDDonzy/dsh-web-search-searXNG.git
dsh plugin --profile web add .\dsh-web-search-searXNG
```

Restart dsh after installation. Web profiles do not hot-reload plugin changes by default.

## Settings UI

The settings card is located at:

```text
Settings → Plugins → Plugin configuration → SearXNG search
```

The card provides:

- an `Enable SearXNG` master switch, off by default;
- native dsh search when off, and SearXNG after enabling and saving;
- an `API Key` input that only exposes configured state;
- a `SearXNG URL` input;
- a `Test connection` button that requires the API Key;
- a real search request and result preview;
- green success and red failure messages;
- automatic test-message expiry after 10 seconds;
- `Maximum results`, defaulting to `5`;
- `Search language`, defaulting to `all`;
- save, discard, and reset actions.

## Source layout

```text
src/
  index.js       Host plugin entry and settings configuration
  provider.js    SearXNG WebSearchProvider implementation

ui/
  client.js      dsh Browser UI slot and settings card
  styles.css     Card and form styles
  toggle-control.js
  toggle-styles.css
  test-control.js

lib/
  index.js       Host publish entrypoint
  provider.js    Provider publish entrypoint
  client.js      dsh lazy-CJS Browser bundle
```

The UI uses dsh's `settingsScope`, Credentials Remote, Snapshot Store, and `settings.plugin.item` keyed slot, together with dsh CSS design tokens for theme consistency.

## Development and tests

```bash
npm install
npm run build
npm test
```

Tests cover result mapping, request parameters, authentication, errors, and cancellation.

## License

MIT
