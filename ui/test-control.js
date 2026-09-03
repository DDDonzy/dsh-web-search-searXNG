/* UI-only helpers for the SearXNG connection test control. */

function testMessage(t, state) {
  if (state.kind === "success") return t("testSuccess").replace("{count}", String(state.count));
  if (state.kind === "missing-key") return t("testNeedsKey");
  if (state.kind === "unauthorized") return t("testUnauthorized");
  if (state.kind === "error") {
    const message = state.message === "invalid-url" ? t("invalidURL") : state.message;
    return t("testFailed").replace("{message}", message);
  }
  return "";
}

function testResultTitle(result) {
  return result?.title || result?.url || "";
}

