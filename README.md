# 流水账 · Ledger

记录每天开销、管理进账支出、理性消费、按计划实现愿望的轻量记账应用。

- **形态**：纯静态 PWA（零构建、零外部依赖），手机浏览器打开后「添加到主屏幕」即成 App
- **界面**：Apple 设计语言（简约、圆角卡片、毛玻璃、系统字体）
- **数据**：存储在 GitHub 仓库的 `data/ledger.json`，手机与电脑访问同一网址即自动同步

---

## 一、账户分类

| 账户 | 必要性 | 说明 |
| --- | --- | --- |
| 🍜 生活账户 | 必要 | 吃饭、交通、水果等必要开销 |
| 📚 学习账户 | 必要 | 学习、技能提升等变动开销 |
| 🎮 娱乐账户 | 非必要 | 娱乐、零食等非必要开销 |
| 🩺 应急账户 | 必要 | 医疗、意外等开销 |
| ⭐ 愿望账户 | 非必要 | 想买但非刚需的愿望基金（新电脑、自行车等） |
| 📦 其他支出 | 兜底 | 无法归类的支出 |

收入账户：工资 / 奖金 / 兼职副业 / 理财收益 / 其他收入。
支付方式标签：微信 / 支付宝 / 云闪付 / 京东 / 现金 / 银行卡（仅作为记录来源标签，不接入任何支付平台，保护隐私）。

> 打通微信/支付宝等消费记录：涉及开放平台权限与大量隐私，默认不做。当前以「支付方式标签 + 手动录入」替代，够用且安全。

## 二、功能

1. **记账**：大金额键盘 + 分类宫格，支出/收入/存入愿望一键切换，支持日期、备注、支付方式
2. **首页**：本月结余、收入、支出、存入愿望概览 + 最近记录（可删除）
3. **报表**：本月支出构成环形图、近 6 个月收支趋势柱状图；导出交易明细 CSV / 账户汇总 CSV（带 BOM，Excel 直接打开）
4. **愿望计划**：设置目标金额与目标日期，自动推算「每月需存 X 元（约每周 Y 元）」，并与你的可支配能力（月收入 − 月必要开销）比对，超出时提示风险；月必要开销可按近 3 个月生活/学习/应急均值自动估算
5. **GitHub 同步**：设置页填入 owner/repo/token 后，数据自动读写远端 `data/ledger.json`，多设备共享
6. **PWA**：自定义 Logo，可安装到手机桌面

## 三、部署（GitHub Pages）

### 前置
- 一个 GitHub 账号
- 一个 Personal Access Token（GitHub → Settings → Developer settings → Personal access tokens → Generate new token，勾选 `repo` 权限）

### 方式 A：应用内连接（推荐，最简）
1. 在 GitHub 手动新建一个空仓库（如 `ledger`），勾选「Add a README」或不勾选均可
2. 仓库 Settings → Pages → Build and deployment → Source 选 `Deploy from a branch` → 分支 `main` / `/(root)` → Save
3. 把本项目文件上传到仓库 `main` 分支（可用 GitHub 网页上传，或本仓库 `tools/deploy.ps1` 自动上传）
4. 浏览器打开 `https://你的用户名.github.io/ledger/`
5. 打开应用「设置」页，填入仓库所有者、仓库名、token，点「测试连接并保存」→ 数据即开始同步

### 方式 B：命令行自动部署（需在配置了 Git 的电脑上）
```bash
git init && git add . && git commit -m "init"
git remote add origin https://github.com/你的用户名/ledger.git
git push -u origin main
# 然后在仓库 Settings → Pages 中启用 main 分支部署
```

### 方式 C：一键自动部署（推荐，无需本地 Git）
```powershell
# 1. 创建 token（见下方「创建 Token 步骤」）
# 2. 运行部署脚本（自动建仓库 + 上传全部文件 + 启用 Pages）
powershell -ExecutionPolicy Bypass -File tools/deploy.ps1 -Token ghp_你的token
# 可选：-RepoName ledger（默认）-Owner 你的用户名 -Private（私有仓库）
```
脚本通过 GitHub REST API 完成全部步骤，输出线上地址 `https://你的用户名.github.io/ledger/`。

### 创建 Token 步骤
> 先搞清楚两个用途，避免混淆：
> - **部署用**（一次性）：deploy.ps1 建仓库、传代码、开 Pages。用完即可撤销 → **有效期 7 天足够**。
> - **运行用**（长期）：应用「设置」页输入，日常同步 `data/ledger.json` → **有效期建议 90 天以上**（GitHub 最长可选 1 年或 No expiration）。
>
> 省事做法：**只创建一个长期 token**（有效期 90 天以上），部署和运行都用它；到期前到 GitHub 重建并到设置页更新即可。

1. 登录 GitHub，打开 https://github.com/settings/tokens
2. 点击 **Generate new token** → **Generate new token (classic)**
3. Note 填 `ledger`；Expiration 按上面用途选择（长期使用选 **90 days** 或更久）
4. 勾选权限 **repo**（含 repo:status / repo_deployment / public_repo）
5. 点击 **Generate token**，复制生成的 `ghp_...`（只显示一次，请立即保存）
6. 部署：`powershell -ExecutionPolicy Bypass -File tools/deploy.ps1 -Token ghp_...`；部署完成后**不要撤销**（若只用于部署，用完可 Revoke，另建长期 token 供应用同步）

> 注意：token 只在浏览器 localStorage 中保存（应用「设置」页输入一次），**不要**把 token 提交到仓库；若 token 泄露，到 GitHub 撤销重建即可。

## 四、本地开发与验证

```bash
# 单元测试（纯逻辑，无需浏览器）
node tests/run-tests.js

# 生成图标 PNG（Windows + Edge）
powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1

# 本地预览（任意静态服务器，如 Python / VS Code Live Server）
python -m http.server 8080
# 浏览器打开 http://localhost:8080
```

## 五、目录结构

```
ledger-app/
├── index.html              # 单页入口
├── manifest.webmanifest    # PWA 清单（桌面图标、独立窗口）
├── sw.js                   # Service Worker（离线缓存静态资源）
├── css/style.css           # 设计系统（Apple 风格）
├── js/
│   ├── app.js              # 入口：路由、状态、持久化
│   ├── models.js           # 数据模型与纯逻辑（可单测）
│   ├── storage.js          # GitHub API 存储层（token 管理、冲突重试）
│   ├── charts.js           # 零依赖 SVG 图表（环形/柱状/进度环）
│   └── views/              # 五个页面视图
├── assets/                 # Logo 与图标（icon.svg 为唯一源）
├── data/ledger.json        # 账本数据文件（GitHub 中的同步文件）
├── tests/run-tests.js      # 单元测试
├── tools/make-icons.ps1    # 图标 PNG 生成脚本
└── DESIGN.md               # 设计规范（模板提炼的原始素材）
```

## 六、模板提炼（重要提醒）

**本项目做完后，请提醒我**：把「流水账」深度提炼成一个**标准项目模板**，供下次开发另一款程序时，按「大纲引擎」快速填充要素、更低成本部署。

本项目就是为这个目标设计的——无构建、纯静态、模块分层（模型/存储/视图分离）、配置驱动，`DESIGN.md` 已按模板思维记录设计要素。下次开发新程序时，只需：
1. 复制本仓库结构
2. 替换 `DESIGN.md` 中的数据模型与分类
3. 按大纲（数据模型 → 存储 → 视图 → 样式 → 部署）逐项填充

届时可将提炼后的通用骨架与「大纲引擎」清单沉淀为一个独立模板仓库（如 `app-template`），实现「一次沉淀、处处复用」。
