# GitHub 部署操作手册（流水账）

> 一次性部署步骤记录。当前项目已部署完成，本文档供"换环境/重建"时照做。

## 一、需要的东西

| 凭证 | 管什么 | 放哪 |
|---|---|---|
| Repo Token（勾 repo 权限） | 发布代码 + 读写数据仓库 | publish-config.json + 应用设置页 |
| GitHub 账号 | 拥有仓库 | - |

Token 创建：GitHub 头像 → Settings → Developer settings → Personal access tokens → Generate new token → 勾 **repo** → 有效期建议 90 天以上。

## 二、仓库结构（已完成）

| 仓库 | 可见性 | 用途 |
|---|---|---|
| `XION-Darren/ledger` | 公开 | 网页代码 + GitHub Pages |
| `XION-Darren/ledger-data` | 私有 | 我的账本数据（data/ledger.json） |
| `XION-Darren/Hledger-data` | 私有 | 家人账本数据 |

## 三、部署步骤（换环境重建时）

1. **建公开代码仓库**：GitHub → New repository → 名 `ledger` → Public
2. **开 Pages**：仓库 Settings → Pages → Source 选 `main` 分支 / `/(root)` → Save
3. **上传代码**：`powershell -ExecutionPolicy Bypass -File publish.ps1`（用 TransLedger 里的发布脚本）
4. **建两个私有数据仓库**：`ledger-data`、`Hledger-data` → Private
5. **初始化空账本**：两个仓库各建 `data/ledger.json`（内容为 `{"version":1,"transactions":[],"goals":[],"settings":{},"meta":{...}}`）
6. **应用首次使用**：打开网址 → 设置页填 token → 测试连接并保存 → 自动拉取/初始化数据

## 四、给家人用（可选）

1. 让家人注册 GitHub 账号
2. 到 `Hledger-data` 仓库 → Settings → Collaborators → 添加家人账号
3. 家人打开网址 → 设置页填**自己的** token → 点「家人账本」切换
4. 两家账本互相隔离（各自的私有仓库只有自己/被邀请者能看）

## 五、数据迁移（已有数据时）

- 数据在私有仓库 `data/ledger.json`，换环境只需保证新环境能访问该仓库（token + 仓库名配置正确）
- 也可用应用设置页「数据备份 → 导出 JSON」手动备份，导入恢复
