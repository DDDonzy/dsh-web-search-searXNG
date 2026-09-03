/*
 * Browser half of the SearXNG settings contribution.
 *
 * This file is intentionally kept outside src/: it owns only the DSH browser
 * slot, React view, staged form state, and browser-facing settings writes.
 * The build script wraps it in DSH's lazy-CJS client module format and injects
 * styles.css as CSS_TEXT.
 */

const React = require("react");
const { createSnapshotStore } = require("@deepseek-ai/dsh-client-store");

const name = "web-search-searxng-ui";
// Cordis service names required by this browser half. Package-level client
// graph dependencies are declared separately in package.json.
const inject = ["slots", "locale", "settingsScope", "remote", "remote.credentials"];

const SETTINGS_NAMESPACE = "web-search-searxng";
const LOCALE_NAMESPACE = "web-search-searxng-ui";
const DEFAULT_API_KEY_REF = "SEARXNG_API_KEY";

const translations = {
  zh: {
    title: "SearXNG 搜索",
    description: "使用自托管 SearXNG 作为 DSH 的网页搜索提供方。",
    enabled: "启用 SearXNG",
    enabledHint: "关闭时使用 DSH 自带搜索；\n打开并保存后使用 SearXNG。",
    apiKey: "API Key",
    apiKeyHint: "写入后仅显示配置状态，不会回显密钥。留空并保存不会修改现有密钥。",
    apiKeySet: "已配置",
    apiKeyUnset: "未配置",
    baseURL: "SearXNG URL",
    baseURLHint: "不要包含 /search，例如 https://search.example.com。",
    test: "测试连接",
    testing: "测试中…",
    testSuccess: "搜索成功，返回 {count} 条结果。",
    testNeedsKey: "请输入 SearXNG API Key 后再测试。",
    testUnauthorized: "地址可达，但需要有效的 Bearer Token。",
    testFailed: "连接失败：{message}",
    testResults: "搜索结果预览",
    maxResults: "最大结果数",
    maxResultsHint: "每次搜索最多返回的来源数量。",
    language: "搜索语言",
    languageHint: "例如 zh-CN、en；填写 all 表示由 SearXNG 自行选择。",
    overridden: "已覆盖",
    reset: "重置",
    save: "保存",
    saving: "保存中…",
    discard: "放弃",
    unsaved: "有未保存修改",
    unavailable: "当前连接未提供此设置。",
    failed: "保存失败，请检查配置后重试。",
    invalid: "请输入有效值。",
    invalidURL: "请输入有效的 HTTP(S) 地址。",
    invalidMaxResults: "请输入大于 0 的整数。",
  },
  en: {
    title: "SearXNG search",
    description: "Use your self-hosted SearXNG instance as dsh's web-search provider.",
    enabled: "Enable SearXNG",
    enabledHint: "Off uses dsh's built-in search;\nturn it on and save to use SearXNG.",
    apiKey: "API Key",
    apiKeyHint: "Only the configured state is shown. Leaving it blank preserves the current key.",
    apiKeySet: "Configured",
    apiKeyUnset: "Not configured",
    baseURL: "SearXNG URL",
    baseURLHint: "Base URL without /search, for example https://search.example.com.",
    test: "Test connection",
    testing: "Testing…",
    testSuccess: "Search succeeded; {count} results returned.",
    testNeedsKey: "Enter the SearXNG API key before testing.",
    testUnauthorized: "The address is reachable, but a valid Bearer token is required.",
    testFailed: "Connection failed: {message}",
    testResults: "Search result preview",
    maxResults: "Maximum results",
    maxResultsHint: "Maximum number of sources returned by one search.",
    language: "Search language",
    languageHint: "For example zh-CN or en; all lets SearXNG choose.",
    overridden: "Overridden",
    reset: "Reset",
    save: "Save",
    saving: "Saving…",
    discard: "Discard",
    unsaved: "Unsaved changes",
    unavailable: "This setting is not available on the current connection.",
    failed: "Save failed. Check the values and try again.",
    invalid: "Enter a valid value.",
    invalidURL: "Enter a valid HTTP(S) URL.",
    invalidMaxResults: "Enter a positive integer.",
  },
};

function installStyles() {
  if (typeof document === "undefined") return;
  const id = "@deepseek-ai/dsh-web-search-searxng/ui";
  if (document.querySelector(`style[data-plugin-css=${JSON.stringify(id)}]`)) return;
  const tag = document.createElement("style");
  tag.dataset.plugin = name;
  tag.dataset.pluginCss = id;
  tag.textContent = CSS_TEXT;
  document.head.appendChild(tag);
}

function positiveInteger(text) {
  const value = Number(text);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function fieldText(value) {
  return value === undefined || value === null ? "" : String(value);
}

function own(layer, field) {
  return layer !== null && typeof layer === "object" && Object.prototype.hasOwnProperty.call(layer, field);
}

class SearxngCardController {
  constructor(scope, ctx) {
    this.scope = scope;
    this.ctx = ctx;
    this.staged = new Map();
    this.saving = false;
    this.failed = false;
    this.testStatus = { kind: "idle", results: [] };
    this.testTimer = undefined;
    this.credential = { configured: false, writable: true };
    this.store = createSnapshotStore(this.projection());
    this.unsubscribe = scope.subscribe(() => {
      if (this.staged.size === 0) this.publish();
      this.readCredential();
    });
    this.readCredential();
  }

  dispose() {
    this.unsubscribe?.();
    if (this.testTimer !== undefined) clearTimeout(this.testTimer);
  }

  snapshot() {
    return this.scope.getSnapshot();
  }

  effective(field) {
    const value = this.snapshot().value?.[field];
    return field === "language" && (value === undefined || value === null || value === "") ? "all" : value;
  }

  baseValue(field) {
    const value = this.snapshot().base?.[field];
    return field === "language" && (value === undefined || value === null || value === "") ? "all" : value;
  }

  fieldState(field) {
    const snapshot = this.snapshot();
    const staged = this.staged.get(field);
    const effective = staged?.clear ? this.baseValue(field) : staged?.text ?? this.effective(field);
    const text = fieldText(effective);
    const invalid = staged !== undefined && !staged.clear && this.parse(field, staged.text) === undefined;
    return {
      text: staged?.text ?? text,
      overridden: staged?.clear ? false : staged?.clear === false ? true : own(snapshot.user, field),
      invalid,
    };
  }

  parse(field, text) {
    if (field === "maxResults") return positiveInteger(text);
    if (field === "baseURL") {
      const value = text.trim();
      return value.length > 0 && URL.canParse(value) && /^https?:$/u.test(new URL(value).protocol)
        ? value.replace(/\/$/u, "")
        : undefined;
    }
    if (field === "language") {
      const value = text.trim();
      return value.length > 0 ? value : undefined;
    }
    return undefined;
  }

  projection() {
    const snapshot = this.snapshot();
    const fields = ["baseURL", "maxResults", "language"];
    const invalid = fields.some((field) => this.fieldState(field).invalid);
    const dirty = this.staged.size > 0;
    return {
      status: snapshot.status,
      writable: snapshot.writable,
      dirty,
      invalid,
      saving: this.saving,
      failed: this.failed,
      enabled: {
        value: this.staged.get("enabled")?.value ?? (snapshot.value?.enabled === true),
        overridden: this.staged.has("enabled") ? true : own(snapshot.user, "enabled"),
      },
      test: this.testStatus,
      baseURL: this.fieldState("baseURL"),
      maxResults: this.fieldState("maxResults"),
      language: this.fieldState("language"),
      apiKey: { text: this.staged.get("apiKey")?.text ?? "", invalid: false },
      apiKeyConfigured: this.credential.configured,
      apiKeyWritable: this.credential.writable,
    };
  }

  publish() {
    this.store.set(this.projection());
  }

  edit(field, text) {
    this.failed = false;
    this.staged.set(field, { text, clear: false });
    this.publish();
  }

  editToggle(field, value) {
    this.failed = false;
    this.staged.set(field, { value: value === true, clear: false });
    this.publish();
  }

  resetField(field) {
    this.failed = false;
    if (field === "enabled") this.staged.set(field, { value: this.baseValue(field) === true, clear: true });
    else this.staged.set(field, { text: fieldText(this.baseValue(field)), clear: true });
    this.publish();
  }

  discard() {
    if (this.staged.size === 0 && !this.failed) return;
    this.staged.clear();
    this.failed = false;
    this.publish();
  }

  async readCredential() {
    try {
      const response = await this.ctx.remote.credentials.describe([DEFAULT_API_KEY_REF]);
      if (!response.ok) return;
      const view = response.value[DEFAULT_API_KEY_REF];
      this.credential = {
        configured: view?.configured ?? false,
        writable: view?.writable ?? true,
      };
      this.publish();
    } catch {
      // A credentials provider may temporarily refuse a describe call. Keep
      // the write control enabled so the user can still replace a missing or
      // stale key; the save path reports a real write failure if one occurs.
      this.credential = { configured: false, writable: true };
      this.publish();
    }
  }

  setTestStatus(status) {
    if (this.testTimer !== undefined) clearTimeout(this.testTimer);
    this.testStatus = status;
    this.publish();
    if (status.kind !== "testing" && status.kind !== "idle") {
      this.testTimer = setTimeout(() => {
        this.testTimer = undefined;
        this.testStatus = { kind: "idle", results: [] };
        this.publish();
      }, 10000);
    }
  }

  async testConnection() {
    const baseURL = this.staged.get("baseURL")?.text ?? this.effective("baseURL");
    const parsed = this.parse("baseURL", fieldText(baseURL));
    if (parsed === undefined) {
      this.setTestStatus({ kind: "error", message: "invalid-url", results: [] });
      return;
    }
    const apiKey = this.staged.get("apiKey")?.text.trim();
    if (!apiKey) {
      this.setTestStatus({ kind: "missing-key", results: [] });
      return;
    }
    this.setTestStatus({ kind: "testing", results: [] });
    const url = new URL(`${parsed}/search`);
    url.searchParams.set("q", "dsh searxng test");
    url.searchParams.set("format", "json");
    url.searchParams.set("count", "3");
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
      });
      if (response.status === 401 || response.status === 403) {
        this.setTestStatus({ kind: "unauthorized", results: [] });
      } else if (!response.ok) {
        this.setTestStatus({ kind: "error", message: `HTTP ${response.status}`, results: [] });
      } else {
        const body = await response.json();
        const results = Array.isArray(body?.results) ? body.results.slice(0, 3) : [];
        this.setTestStatus({ kind: "success", count: results.length, results });
      }
    } catch (error) {
      this.setTestStatus({ kind: "error", message: String(error), results: [] });
    }
  }

  async save() {
    if (this.saving || this.staged.size === 0) return;
    const plan = [];
    for (const [field, staged] of this.staged) {
      if (field === "apiKey") {
        if (staged.text.trim() !== "") plan.push({ field, value: staged.text.trim() });
        continue;
      }
      if (field === "enabled") {
        plan.push({ field, value: staged.value === true, clear: staged.clear === true });
        continue;
      }
      if (staged.clear) plan.push({ field, clear: true });
      else {
        const value = this.parse(field, staged.text);
        if (value === undefined) {
          this.publish();
          return;
        }
        plan.push({ field, value });
      }
    }
    if (plan.length === 0) {
      this.staged.clear();
      this.publish();
      return;
    }

    this.saving = true;
    this.failed = false;
    this.publish();
    try {
      for (const item of plan) {
        if (item.field === "apiKey") {
          await this.ctx.remote.credentials.set(DEFAULT_API_KEY_REF, item.value);
        } else if (item.clear) {
          await this.scope.unset(item.field);
        } else {
          await this.scope.set(item.field, item.value);
        }
      }
      this.staged.clear();
      await this.readCredential();
    } catch {
      this.failed = true;
    } finally {
      this.saving = false;
      this.publish();
    }
  }

  inject() {
    return {
      hooks: { searxngCard: this.store },
      edit: (field, text) => this.edit(field, text),
      editToggle: (field, value) => this.editToggle(field, value),
      resetField: (field) => this.resetField(field),
      testConnection: () => this.testConnection(),
      save: () => this.save(),
      discard: () => this.discard(),
    };
  }
}

function Field({ id, label, hint, state, disabled, numeric, onEdit, onReset, t }) {
  return React.createElement(
    "div",
    { className: "dshSearxngField" },
    React.createElement(
      "div",
      { className: "dshSearxngFieldHead" },
      React.createElement("label", { className: "dshSearxngLabel", htmlFor: id }, label),
      state.overridden
        ? React.createElement(
            "span",
            { className: "dshSearxngFieldActions" },
            React.createElement("span", { className: "dshSearxngBadge" }, t("overridden")),
            React.createElement(
              "button",
              { className: "dshSearxngReset", type: "button", disabled, onClick: onReset },
              t("reset"),
            ),
          )
        : null,
    ),
    React.createElement("input", {
      id,
      className: "dshSearxngInput",
      type: "text",
      inputMode: numeric ? "numeric" : undefined,
      value: state.text,
      disabled,
      "aria-invalid": state.invalid || undefined,
      "data-invalid": state.invalid ? "true" : "false",
      onChange: (event) => onEdit(event.target.value),
    }),
    React.createElement("p", { className: state.invalid ? "dshSearxngError" : "dshSearxngHint" }, state.invalid ? hint.invalid : hint.text),
  );
}

function SecretField({ state, disabled, onEdit, t }) {
  return React.createElement(
    "div",
    { className: "dshSearxngField" },
    React.createElement(
      "div",
      { className: "dshSearxngFieldHead" },
      React.createElement("label", { className: "dshSearxngLabel", htmlFor: "plugin-config-searxng-key" }, t("apiKey")),
      React.createElement("span", { className: "dshSearxngBadge" }, state.configured ? t("apiKeySet") : t("apiKeyUnset")),
    ),
    React.createElement("input", {
      id: "plugin-config-searxng-key",
      className: "dshSearxngInput",
      type: "password",
      autoComplete: "off",
      value: state.text,
      disabled,
      onChange: (event) => onEdit(event.target.value),
    }),
    React.createElement("p", { className: "dshSearxngHint" }, t("apiKeyHint")),
  );
}

function TestControl({ state, disabled, onTest, t }) {
  const message = testMessage(t, state);
  const messageClass = state.kind === "success" ? "dshSearxngSuccess" : "dshSearxngError";
  return React.createElement(
    "div",
    { className: "dshSearxngTest" },
    React.createElement(
      "div",
      { className: "dshSearxngTestActions" },
      React.createElement(
        "button",
        {
          className: "dshSearxngButton",
          type: "button",
          disabled,
          onClick: onTest,
        },
        state.kind === "testing" ? t("testing") : t("test"),
      ),
    ),
    message ? React.createElement("p", { className: messageClass, role: "status" }, message) : null,
    state.kind === "success" && state.results?.length
      ? React.createElement(
          "div",
          { className: "dshSearxngResults", role: "region", "aria-label": t("testResults") },
          React.createElement("div", { className: "dshSearxngResultsTitle" }, t("testResults")),
          React.createElement(
            "ul",
            { className: "dshSearxngResultsList" },
            state.results.map((result, index) =>
              React.createElement(
                "li",
                { className: "dshSearxngResult", key: result.url || index },
                React.createElement("a", { href: result.url, target: "_blank", rel: "noreferrer" }, testResultTitle(result)),
                result.content ? React.createElement("p", null, result.content) : null,
              ),
            ),
          ),
        )
      : null,
  );
}

function SearxngCard(props) {
  const state = props.useSearxngCard((snapshot) => snapshot);
  const [open, setOpen] = React.useState(false);
  const t = props.t;
  const disabled = !state.writable || state.saving;
  if (state.status === "unavailable") return null;

  return React.createElement(
    "div",
    { className: "dshSearxngCard", "data-open": open ? "true" : "false" },
    React.createElement(
      "button",
      {
        className: "dshSearxngHeader",
        type: "button",
        "aria-expanded": open,
        onClick: () => setOpen((value) => !value),
      },
      React.createElement(
        "span",
        { className: "dshSearxngHeadText" },
        React.createElement("span", { className: "dshSearxngTitle" }, t("title")),
        React.createElement("span", { className: "dshSearxngDescription" }, t("description")),
      ),
      React.createElement("span", { className: "dshSearxngChevron", "data-open": open ? "true" : "false", "aria-hidden": true }, "⌄"),
    ),
    open
      ? React.createElement(
          "div",
          { className: "dshSearxngBody" },
          React.createElement(ToggleField, {
            value: state.enabled.value,
            disabled: state.saving || !state.writable,
            label: t("enabled"),
            hint: t("enabledHint"),
            onChange: (value) => props.editToggle("enabled", value),
          }),
          React.createElement(SecretField, {
            state: { ...state.apiKey, configured: state.apiKeyConfigured },
            disabled: !state.apiKeyWritable || state.saving,
            onEdit: (text) => props.edit("apiKey", text),
            t,
          }),
          React.createElement(Field, {
            id: "plugin-config-searxng-base-url",
            label: t("baseURL"),
            hint: { text: t("baseURLHint"), invalid: t("invalidURL") },
            state: state.baseURL,
            disabled,
            onEdit: (text) => props.edit("baseURL", text),
            onReset: () => props.resetField("baseURL"),
            t,
          }),
          React.createElement(TestControl, {
            state: state.test,
            disabled: state.saving || state.test.kind === "testing",
            onTest: () => props.testConnection(),
            t,
          }),
          React.createElement(Field, {
            id: "plugin-config-searxng-max-results",
            label: t("maxResults"),
            hint: { text: t("maxResultsHint"), invalid: t("invalidMaxResults") },
            state: state.maxResults,
            disabled,
            numeric: true,
            onEdit: (text) => props.edit("maxResults", text),
            onReset: () => props.resetField("maxResults"),
            t,
          }),
          React.createElement(Field, {
            id: "plugin-config-searxng-language",
            label: t("language"),
            hint: { text: t("languageHint"), invalid: t("invalid") },
            state: state.language,
            disabled,
            onEdit: (text) => props.edit("language", text),
            onReset: () => props.resetField("language"),
            t,
          }),
          React.createElement(
            "div",
            { className: "dshSearxngFooter" },
            state.failed ? React.createElement("p", { className: "dshSearxngStatus", role: "status" }, t("failed")) : null,
            state.dirty ? React.createElement("span", { className: "dshSearxngUnsaved" }, t("unsaved")) : null,
            React.createElement("button", { className: "dshSearxngButton", type: "button", disabled: state.saving, onClick: props.discard }, t("discard")),
            React.createElement(
              "button",
              {
                className: "dshSearxngButton dshSearxngButtonPrimary",
                type: "button",
                disabled: disabled || !state.dirty || state.invalid,
                onClick: props.save,
              },
              state.saving ? t("saving") : t("save"),
            ),
          ),
        )
      : null,
  );
}

function apply(ctx) {
  installStyles();
  const t = ctx.locale.bind(LOCALE_NAMESPACE);
  ctx.effect(
    () => ctx.locale.register(LOCALE_NAMESPACE, translations),
    `${name}: locale`,
  );
  const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE });
  const controller = new SearxngCardController(scope, ctx);
  ctx.effect(() => () => controller.dispose(), `${name}: controller`);
  ctx.effect(
    () => ctx.remote.$on("credentials/reference-updated", (ref) => {
      if (ref === DEFAULT_API_KEY_REF) controller.readCredential();
    }),
    `${name}: credential invalidations`,
  );
  ctx.slots.inject("settings.plugin.item", () =>
    ctx.slots.register(
      {
        name: "settings.plugin.item",
        key: SETTINGS_NAMESPACE,
        locale: LOCALE_NAMESPACE,
        inject: () => controller.inject(),
      },
      SearxngCard,
    ),
  );
}

module.exports = { name, inject, apply };
