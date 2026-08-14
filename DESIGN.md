# 流水账 · 设计规范（DESIGN.md）

> 本项目设计语言的集中定义。它既是开发规范，也是将来把项目提炼为模板时
> "设计要素"章节的原始素材（见 README「模板提炼」）。

## 1. 产品定位

- 名称：流水账（Ledger）
- 形态：纯静态单页 Web 应用（PWA），手机浏览器打开 → 「添加到主屏幕」即成 App 形态
- 数据：存储在 GitHub 仓库 JSON 文件中，通过 GitHub REST API 读写，跨设备自动同步
- 原则：记录快、看得懂、无多余功能

## 2. 设计语言（Apple 风格）

| 要素 | 取值 |
| --- | --- |
| 背景色 | `#F2F2F7`（iOS 系统灰） |
| 卡片 | `#FFFFFF`，圆角 `18px`，阴影 `0 1px 3px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.06)` |
| 分割线 | `rgba(60,60,67,.12)`（iOS separator） |
| 主色 | `#007AFF`（iOS 蓝） |
| 危险色 | `#FF3B30` |
| 成功色 | `#34C759` |
| 文字 | 主 `#1C1C1E` / 次 `#3C3C43`(90%) / 弱 `#8E8E93` |
| 圆角 | 卡片 18px、控件 12px、胶囊按钮 999px |
| 字体 | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", sans-serif` |
| 字号 | 页面标题 22 semibold / 区块标题 17 semibold / 正文 15 / 辅助 13 |
| 动效 | 120ms ease（hover/active 反馈） |
| 布局 | 移动优先，内容最大宽度 480px 居中；底部 Tab Bar 毛玻璃（backdrop-filter: blur(20px)） |

## 3. 账户分类（核心业务语义）

| 键 | 名称 | 必要性 | 图标 | 颜色 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `life` | 生活账户 | 必要 | 🍜 | `#34C759` | 吃饭、交通、水果等必要开销 |
| `study` | 学习账户 | 必要 | 📚 | `#007AFF` | 学习、技能提升等变动开销 |
| `fun` | 娱乐账户 | 非必要 | 🎮 | `#FF9500` | 娱乐、零食等非必要开销 |
| `urgent` | 应急账户 | 必要 | 🩺 | `#FF3B30` | 医疗、意外等开销 |
| `wish` | 愿望账户 | 非必要 | ⭐ | `#AF52DE` | 想买但非刚需（愿望基金） |
| `other` | 其他支出 | 非必要 | 📦 | `#8E8E93` | 兜底分类 |

收入账户：工资 💼 / 奖金 🎁 / 兼职副业 🛠️ / 理财收益 📈 / 其他收入 💰

支付方式标签：微信 / 支付宝 / 云闪付 / 京东 / 现金 / 银行卡

## 4. 数据模型

- 记账单位：交易（transaction）。类型 `income` 收入 / `expense` 支出 / `deposit` 存入愿望基金。
- 愿望（goal）：名称、目标金额、目标日期；已存 = 该愿望的 deposit 合计 − 该愿望的 expense(account=wish) 合计。
- 计划推算（见 `js/models.js` 的 `planGoal`）：
  1. 剩余月数 = ceil(剩余天数 / 30)
  2. 每月需存 = max(0, 目标 − 已存) / 剩余月数（不足 1 月按 1 月）
  3. 可支配能力 = 月收入 − 月必要开销（用户预设或按近 3 个月生活+学习+应急均值自动估算）
  4. 每月需存 > 可支配能力 → 提示「超支风险」，建议延长期限或调低目标

## 5. 页面结构（SPA + hash 路由）

- `#/home` 首页：本月概览卡、今日/最近记录、快捷记账按钮
- `#/entry` 记账：大金额键盘、分类宫格、日期/备注/支付方式
- `#/reports` 报表：本月分类占比（环形）、近 6 月收支趋势（柱状）、CSV 导出
- `#/wishes` 愿望：目标列表 + 进度环、新建愿望、存钱计划计算
- `#/settings` 设置：GitHub 连接、同步状态、导入/导出、提醒

## 6. 工程约定

- 零构建、零外部依赖：全部原生 HTML/CSS/JS（ES Modules）
- 纯逻辑与 DOM 分离：`models.js`（可单测）与视图层解耦
- 图标：`assets/icon.svg` 为唯一源，`tools/gen-icons.js` 用 Node 生成各尺寸 PNG
- 测试：`tests/run-tests.js`，Node 直接运行 `node tests/run-tests.js`
