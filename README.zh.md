# dsh-web-search-searXNG

[English](README.md) | 中文

> **Fork 声明**：本项目 Fork 自 [acdcgz/dsh-web-search-searxng](https://github.com/acdcgz/dsh-web-search-searxng)。当前维护仓库为 [DDDonzy/dsh-web-search-searXNG](https://github.com/DDDonzy/dsh-web-search-searXNG)。

为 DeepSeek Harness 的 [web 能力 seam](https://github.com/deepseek-ai/deepseek-harness)（`ctx.web`）提供基于 [SearXNG](https://docs.searxng.org/) 的 `WebSearchProvider`。插件调用 SearXNG JSON API，将聚合结果映射为 DSH 标准化搜索来源。

## 功能

- 自托管 SearXNG 搜索，避免每次搜索产生模型调用；
- 支持 SearXNG 的多搜索源聚合；
- 注册 DSH Provider：`searxng-local`；
- 默认关闭 SearXNG，保持使用 DSH 自带搜索；
- 设置面板可切换 DSH 自带搜索和 SearXNG；
- API Key 通过 DSH Credentials 保存，不回显密钥；
- 支持 URL、结果数量、搜索语言配置；
- 支持“测试连接”并显示实际返回的搜索结果预览；
- Host 逻辑与 Browser UI 分离，UI 源码位于 `ui/`。

## 安装

### 本地目录安装

适用于已经将项目放在本机目录的情况：

```bash
dsh plugin --profile web add E:\dsh-searXNG
```

安装后重启 DSH，然后打开：

```text
设置 → 插件 → 插件配置 → SearXNG 搜索
```

### Git 仓库安装

直接从当前维护仓库安装：

```bash
dsh plugin --profile web add github:DDDonzy/dsh-web-search-searXNG
```

也可以先克隆，再按本地目录方式安装：

```bash
git clone https://github.com/DDDonzy/dsh-web-search-searXNG.git
dsh plugin --profile web add .\dsh-web-search-searXNG
```

安装后需要重启 DSH。Web Profile 默认不使用 HMR 重新加载插件。

## 设置页面 UI

设置卡片位于：

```text
设置 → 插件 → 插件配置 → SearXNG 搜索
```

卡片提供：

- `启用 SearXNG` 总开关，默认关闭；
- 关闭时使用 DSH 自带搜索，打开并保存后使用 SearXNG；
- `API Key` 密钥输入，仅显示配置状态；
- `SearXNG URL` 配置；
- `测试连接` 按钮，必须配合 API Key 使用；
- 测试真实搜索请求并显示结果预览；
- 测试成功显示绿色提示，失败显示红色提示；
- 测试结果提示持续 10 秒后自动消失；
- `最大结果数` 默认值为 `5`；
- `搜索语言` 默认值为 `all`；
- 保存、放弃和重置配置。

## 源码结构

```text
src/
  index.js       Host 插件入口与设置配置
  provider.js    SearXNG WebSearchProvider 实现

ui/
  client.js      DSH Browser UI 槽位与设置卡片
  styles.css     卡片和表单样式
  toggle-control.js
  toggle-styles.css
  test-control.js

lib/
  index.js       Host 发布入口
  provider.js    Provider 发布入口
  client.js      DSH lazy-CJS Browser bundle
```

UI 使用 DSH 的 `settingsScope`、Credentials Remote、Snapshot Store 和 `settings.plugin.item` keyed slot，并使用 DSH CSS design tokens 保持界面主题一致。

## 开发与测试

```bash
npm install
npm run build
npm test
```

测试包含 Provider 映射、请求参数、鉴权、错误和取消处理。

## License

MIT
