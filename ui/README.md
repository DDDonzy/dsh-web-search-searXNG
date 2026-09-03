# SearXNG settings UI

This directory is the browser half of the plugin. It deliberately does not import
`src/index.js` or any Host-side package.

- `client.js` registers a keyed `settings.plugin.item` contribution for the
  `web-search-searxng` settings namespace.
- The controller binds `ctx.settingsScope`, stages edits locally, writes only on
  Save, and sends the secret through `ctx.remote.credentials`.
- The master switch updates the Host web provider selection: disabled selects
  `deepseek-official`, enabled selects `searxng-local`.
- The connection test uses the staged URL and staged key only; a stored secret
  is never read back to the browser. The remote SearXNG endpoint must permit
  the DSH origin with CORS for browser-side testing.
- `styles.css` and `toggle-styles.css` use dsh's public CSS design-token
  variables and are injected by the lazy client bundle at materialization time.

The generated `lib/client.js` is a DSH lazy-CJS module. Regenerate it with:

```bash
npm run build:client
```
