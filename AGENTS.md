# 项目说明书：流水账（TransLedger / Ledger）

## 项目是什么

- 一句话：记录每天开销/收入、管理 5 类账户、规划愿望存款的记账 App
- 目标用户：本人（非技术人员，追求简单好用）
- 形态：纯静态 PWA（多文件：index.html + js/ + css/ + manifest + sw + icons）
- 是否多设备：是（手机 + 电脑，同一网址）
- 是否数据同步：是（GitHub 私有数据仓库，代码公开仓库跑网页）

## 核心事实（先读这里）

- 线上网址：`https://xion-darren.github.io/ledger/`（永远不变）
- 代码仓库：`XION-Darren/ledger`（公开，GitHub Pages 托管）
- 数据仓库：`XION-Darren/ledger-data`（私有，我的账本）+ `XION-Darren/Hledger-data`（私有，家人账本）
- 数据文件：数据仓库内 `data/ledger.json`
- 数据存储：各设备浏览器 `localStorage`（主存储，离线可记）+ 云端私有仓库（跨设备同步）
- 历史版本：本机 `versions\` 目录 + 代码仓库 `versions/`，按 `vX.Y` 命名

## 用户需求与行为准则

- 用户是非技术人员，UI 要简洁、美观、易用（Apple 设计语言：浅紫渐变、白卡片、圆角、系统字体）
- **只改被要求改的地方，没让动的绝不动**
- 改动先给用户预览，用户确认后再保存版本
- 版本保存错误不可再犯（零容忍）
- 回复要简洁直接

## 核心功能与数据模型

### 账户（6 支出 + 5 收入）

| key | 名称 | 必要性 | 图标 | 色值 |
|---|---|---|---|---|
| life | 生活 | 必要 | 🍜 | #34C759 |
| study | 学习 | 必要 | 📚 | #007AFF |
| fun | 娱乐 | 非必要 | 🎮 | #FF9500 |
| urgent | 应急 | 必要 | 🩺 | #FF3B30 |
| wish | 愿望 | 非必要 | ⭐ | #AF52DE |
| other | 其他支出 | 兜底 | 📦 | #8E8E93 |

收入：工资💼 / 奖金🎁 / 兼职副业🛠️ / 理财收益📈 / 其他收入💰

### 交易类型

- `expense` 支出 / `income` 收入 / `deposit` 存入愿望（type=deposit 时 account=wish 且必须带 goalId）

### 数据字段

- `data.transactions[]`：`{ id, type, account, amount, note, date(YYYY-MM-DD), payMethod, goalId, createdAt, updatedAt }`
- `data.goals[]`：`{ id, name, target, deadline, createdAt }`
- `data.settings`：`{ monthlyEssential }`（月必要开销，用于愿望计划推算）
- 愿望进度：该愿望 deposit 合计 − 该愿望 wish 支出；达成（saved≥target）标记 achieved
- 愿望基金总余额 = 全部 deposit − 全部 wish 支出（跨愿望累计，删除愿望不影响资金）

### 功能模块

1. 首页：本月结余 + 本月可支配（当月收入 − 必要开销）+ 最近记录（deposit 记录带愿望进度条）+ 记一笔
2. 记账：支出/收入/愿望切换，数字键盘（退格/小数/两位小数），分类宫格，高频备注词，日期，支付方式
3. 报表：按月收支、支出构成环形图、近 6 月趋势柱状图、折叠消费小结（本地规则）
4. 愿望：愿望列表 + 进度条 + 存钱计划（按本月可支配推算）+ 愿望基金总余额 + 弹窗存入
5. 设置：GitHub 同步（双数据仓库一键切换：我的账本/家人账本）、数据备份导出/导入

## 双数据仓库（给两个人用）

- `ledger-data`（我的账本）：仅本人可见
- `Hledger-data`（家人账本）：可邀请家人为仓库协作者，家人用自己的 token 访问
- 设置页「快速切换数据仓库」两个预设 chip，点击即切换并拉取对应数据
- 各设备 token 存各自浏览器 localStorage，互相隔离

## 版本维护与发布流程

用户说「保存为 vX.Y」= 归档当前代码为新版本；「用 vX.Y 重新改」= 用旧版本覆盖开发文件。

### 一键发布（推荐用脚本）
```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\22951\Desktop\戚庆彬\TransLedger\publish.ps1" -Version v1.1 -Message "说明"
```
脚本自动：上传全部代码到 GitHub → 本地+仓库归档版本 versions/vX.Y/。

### 版本号规则
- 核心功能/重构：升大版本，如 v1.x → v2.x
- 修复/小改动：升小版本，如 v1.0 → v1.1
- 版本目录：`versions/vX.Y/`，内含代码快照 + `版本说明.txt`（格式 `# vX.Y` + 功能/修复列表）

## 多设备 / 换电脑开发

- 日常使用：任何设备打开网址 + 首次在设置页填 token 并选数据仓库即可，无需复制文件
- 换电脑开发：复制整个 `TransLedger` 文件夹（含代码、versions、publish.ps1、publish-config.json、AGENTS.md）到新电脑，首次打开填 token 即可继续

## 安全底线（绝不能违反）

- `publish-config.json`、`TOKENS` 文件：内含 Token，**绝不上传 GitHub / 不发人**
- 向 GitHub 上传文件前，先检查内容是否含 `ghp_` / `github_pat_` 开头字符串
- 网页内 Token 只存浏览器 localStorage，不写进代码文件
- 数据仓库均为私有；token 只勾 `repo` 权限，建议有效期 90 天以上

## 技术要点

- 纯静态多文件 PWA：index.html + js/(ES Modules) + css + manifest + sw.js，零构建、零依赖
- `js/models.js` 纯逻辑（可单测），`js/storage.js` GitHub 同步层，`js/views/` 视图层
- 数据文件读写走 GitHub contents API（UTF-8 解码），409/422 冲突自动重试
- 本地预览：`node tools/serve.mjs . 8080`；测试：`node tests/run-tests.js`
- 图标：`assets/icon.svg` 源文件，`tools/make-icons.ps1` 生成 PNG

## 当前版本状态

- 最新已归档：v1.0
- 若本地代码比线上新，说明有未发布的改动（跑 publish.ps1 发布）
