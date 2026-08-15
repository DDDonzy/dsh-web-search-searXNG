#!/bin/bash
# 发布 dsh-web-search-searxng 到 GitHub
# 前提: gh auth login 已登录（见 README 说明）
# 用法: bash publish-to-github.sh

set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PLUGIN_DIR"

echo "=== 检查 gh 登录状态 ==="
if ! gh auth status >/dev/null 2>&1; then
  echo "✗ gh 未登录。请先运行: gh auth login （选择 GitHub.com → HTTPS → 浏览器登录）"
  exit 1
fi
echo "✓ gh 已登录: $(gh api user -q .login 2>/dev/null || echo '?')"

echo
echo "=== 初始化 git 仓库 ==="
if [ ! -d .git ]; then
  git init -b main
  echo "✓ git 仓库已初始化 (main)"
else
  echo "✓ git 仓库已存在"
fi

echo
echo "=== 检查 git 身份配置 ==="
if git config user.name >/dev/null && git config user.email >/dev/null; then
  echo "✓ user.name=$(git config user.name), user.email=$(git config user.email)"
else
  echo "✗ 缺少 user.name/user.email，执行:"
  echo "  git config user.name \"你的名字\""
  echo "  git config user.email \"你的邮箱\""
  exit 1
fi

echo
echo "=== 创建 GitHub 仓库 ==="
REPO_NAME="dsh-web-search-searxng"
if gh repo view "$(gh api user -q .login)/$REPO_NAME" >/dev/null 2>&1; then
  echo "✓ 仓库已存在: $(gh api user -q .login)/$REPO_NAME"
else
  gh repo create "$REPO_NAME" --public --source . --remote origin --push --description "SearXNG-backed WebSearchProvider for DeepSeek Harness (ctx.web) — self-hosted, zero per-search model cost, multi-engine aggregation"
  echo "✓ 仓库已创建并推送"
fi

echo
echo "=== 添加 dsh-plugin 标签 ==="
REPO_FULL="$(gh api user -q .login)/$REPO_NAME"
gh repo edit "$REPO_FULL" --add-topic dsh-plugin
echo "✓ 已添加 topic: dsh-plugin"
echo "  （可再补充 topic: searxng, deepseek-harness, dsh）"

echo
echo "=== 提交并推送代码 ==="
git add -A
if git diff --cached --quiet; then
  echo "✓ 无新改动，跳过提交"
else
  git commit -m "feat: SearXNG search provider for DeepSeek Harness (ctx.web)

- WebSearchProvider registered as 'searxng-local'
- Calls SearXNG JSON API (/search?format=json)
- X-Forwarded-For: 127.0.0.1 to bypass Docker-gateway rate limiting
- Config: baseURL / maxResults / apiKey / apiKeyEnv
- Logs web/searxng-search-request session events"
  git push -u origin main
  echo "✓ 已提交并推送"
fi

echo
echo "=== 更新 package.json repository 字段 ==="
if command -v node >/dev/null 2>&1; then
  node -e "
    const fs = require('fs');
    const p = 'package.json';
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    d.repository = { type: 'git', url: 'git+https://github.com/$REPO_FULL.git' };
    fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n');
    console.log('✓ repository 已更新为: ' + d.repository.url);
  "
  git add package.json
  git commit -m "chore: set repository URL" || echo "（无变化）"
  git push 2>/dev/null || echo "（推送跳过）"
fi

echo
echo "=== 完成 ==="
echo "仓库地址: https://github.com/$REPO_FULL"
echo "下一步（可选）:"
echo "  1. npm 发布: npm publish --access public（需 npm 账号，见 README）"
echo "  2. 提交到社区目录: https://dshplugins.com/zh 和 https://deepseekdocs.com/ecosystem"
echo "  3. 分享安装方式: npx -y @deepseek-ai/dsh plugin --profile web add $REPO_FULL"
