# @deepseek-ai/dsh-web-search-searxng

[English](README.md) | 中文

为 DeepSeek Harness 的 [web 能力 seam](https://github.com/deepseek-ai/deepseek-harness)（`ctx.web`）提供基于 [SearXNG](https://docs.searxng.org/) 的 `WebSearchProvider`。它调用 SearXNG 实例的 JSON API（`/search?format=json`），把聚合结果映射为 seam 标准化的 `WebSearchResult`。

这是一个**实现包**：它向 `ctx.web` 注册 provider，通过 `ctx.credentials` 或进程环境解析可选的 API key，在有发起方 Agent 时把辅助请求记录到会话中，且不注册任何面向模型的工具。它是一个函数/命名空间插件（`inject: ['web']`）。

## 为什么用 SearXNG

- **自托管、隐私**：查询发往你自己的实例，不经过第三方搜索厂商。
- **每次搜索零模型成本**：与需要发起完整模型调用的厂商搜索不同，一次搜索只是一个 HTTP GET——又便宜又快。
- **多引擎聚合**：SearXNG 在一个端点后聚合 Bing、Brave、Baidu、Google、DuckDuckGo 等。
- **可移植**：把 `baseURL` 指向任意 SearXNG——本地 Docker、局域网实例或公共实例均可。

## 依赖

- 一个 DSH 主机可达的 SearXNG 实例（默认 `http://localhost:8080`）。
- 挂载了 `web` seam 的 DeepSeek Harness profile（所有标准 profile 都自带）。

## 安装

### 一键安装（bundle）

本包声明了 `dsh.bundle.patch`（`cordis.patch.yml`），因此一条 `dsh plugin add`
即可同时完成"注册插件 + 切换 web seam"，无需手动编辑任何 YAML：

```bash
dsh plugin --profile web add /path/to/dsh-web-search-searxng
```

配置优先走环境变量——启动 `dsh` 前设置即可，完全不用改配置：

```bash
export SEARXNG_BASE_URL=http://localhost:8080   # 可选；默认 http://localhost:8080
export SEARXNG_MAX_RESULTS=10                    # 可选；默认 10
export SEARXNG_LANGUAGE=en                       # 可选；默认 'all'（不传该参数）
```

### 手动安装（本地开发）

```bash
# 1. 让包能从 profile 的 node_modules 解析
ln -sfn /path/to/dsh-web-search-searxng \
        "$DSH_HOME/profiles/node_modules/@deepseek-ai/dsh-web-search-searxng"

# 2. 在 cordis.patch.yml 中注册插件并切换搜索 provider（见下方配置）
```

```yaml
- insert:
    - id: web-search-searxng
      name: '@deepseek-ai/dsh-web-search-searxng'
      config:
        baseURL: http://localhost:8080
        maxResults: 10

- id: web
  config:
    searchProvider: searxng-local
```

重启 DSH 进程（或 GUI）使 patch 生效。

> web profile 默认禁用 HMR 重载；修改 `cordis.patch.yml` 后需要重启进程。

## 测试

```bash
node --test tests/provider.spec.js   # 17 个测试，零依赖（node:test）
```

## 配置

| 键 | 默认值 | 含义 |
|---|---|---|
| `baseURL` | `http://localhost:8080` | SearXNG 基础地址；自动追加 `/search`。可从任意环境层的 `$SEARXNG_BASE_URL` 回退。无法解析时 provider 不可用。 |
| `maxResults` | `10` | 单次搜索返回来源数量上限（seam 也会强制执行自己的上限）。 |
| `language` | `all` | 搜索语言，作为 `language=...` 发送（如 `en`、`zh-CN`）。`'all'`（或未设置）时完全省略该参数。可从 `$SEARXNG_LANGUAGE` 回退。 |
| `apiKey` | 省略 | 字面量 SearXNG API key（当实例需要时）。优先用 `apiKeyEnv`，避免密钥进入配置文件；非空字面量优先。 |
| `apiKeyEnv` | `SEARXNG_API_KEY` | 每次搜索通过 `ctx.credentials` 解析的凭据引用，seam 缺失时从进程环境读取。本地无密钥实例缺省即可。 |

```yaml
- id: web-search-searxng
  name: '@deepseek-ai/dsh-web-search-searxng'
  config:
    baseURL: http://localhost:8080
    maxResults: 10
```

以上条目是 `web-search-searxng` 设置区块的基础层：用户层对其覆盖会作用于**下一次**搜索，因为 provider 是每次调用时投影配置段，而不是在注册时快照。`apiKey` 带 `role('secret')`，不会出现在任何层的 `describe()` 响应中。

## 限流说明（Docker Desktop 下的本地 Docker）

当 SearXNG 跑在 Docker Desktop 里时，来自宿主机的请求到达容器时 `REMOTE_ADDR` 是 compose **网关 IP**（如 `172.18.0.1`）而非 `127.0.0.1`。SearXNG 限流器会把它当作外部客户端，对 JSON API 返回 429（`API_MAX = 4 次/小时`）。本 provider 每次请求都发送 `X-Forwarded-For: 127.0.0.1`；配合 `limiter.toml` 中 `trusted_proxies = ['127.0.0.0/8']` 以及回环段和 Docker 网段的 `pass_ip` 白名单，本地客户端可以完全绕过 JSON API 配额。

如果你的 SearXNG 是远程实例（局域网/云），请相应移除该头，或在服务端调整 `trusted_proxies`/`pass_ip`。

## 结果映射

SearXNG 返回的 provider 生成答案本 provider 不信任为 `content`，因此省略。`sources[]` 来自 `results[]`：`url` ← `url`、`title` ← `title`、`snippet` ← `content`、`publishedAt` ← `publishedDate`。按 URL 去重。

provider 失败表现为 `WEB_PROVIDER_ERROR`；调用方取消表现为 `WEB_ABORTED`。HTTP 重定向会被跟随（SearXNG 可能对 blob/重定向端点返回 307）。

## 请求日志

在发起方 Agent 下执行的搜索，会在派发前把仅日志用途的 `web/searxng-search-request` 会话事件写入会话，包含解析后的端点和查询（不含密钥）。Agent 之外的直接程序化调用没有发起会话可记录。

## License

MIT
