# RUNEW Implementation Baseline

> 审计时间：2026-03-24  
> 状态：由 M0 施工前空仓状态建立

## 1. 当前目录结构

施工前仓库仅包含：

- `AGENTS.md`
- `docs/PRD_RUNEW_V3.0.md`
- `docs/UI_IMPLEMENTATION_SPEC.md`
- `docs/TECHNICAL_DESIGN.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/CODEX_TASKS.md`

无 `apps/`、`packages/`、`db/`、Docker、测试、Migration、Client/Server 代码。

## 2. 前端技术栈与版本

M0 新建：

- Taro 4.0.9
- React 18
- Zustand 5
- TanStack Query 5
- SCSS / CSS Modules

## 3. 后端技术栈与版本

M0 新建：

- Fastify 5
- Pino (via Fastify logger)
- Drizzle ORM 0.38
- better-sqlite3 11

## 4. 数据库 / Migration

M0 新建 SQLite Schema + Drizzle Migration，包含：

- `system_metadata`
- Identity/Family/Baby 基础表（M1 预备）

## 5. 已实现页面 / Route

- `/pages/index/index` — M0 App Shell，对照 Figma `01.01 今天` / `00.07 全局抽屉` / `00.10 留下这一刻`
- `/pages/dev/design-system/index` — 开发环境 Design System Showcase

## 6. 已实现公共 UI Component

按 `UI_IMPLEMENTATION_SPEC.md` R6.2 实现 Foundation 组件集（PageShell、Glass、Nav、Buttons、Forms、Overlay、Feedback）。

## 7. 已实现 API

- `GET /api/v1/health/live`
- `GET /api/v1/health/ready`

## 8. Auth / Family / Baby 状态

- 仅 Client Runtime Skeleton + DB Schema
- 无真实 Auth/Family API

## 9. Offline / Sync

未实现（M3）

## 10. Media

未实现（M7）

## 11. Admin

未实现（M12）

## 12. Backup / Deploy

Docker Compose 基础预留；Backup/Tunnel 未实现业务逻辑（M13）

## 13. 命令

```bash
pnpm dev / dev:client / dev:server
pnpm typecheck / lint / test / build
pnpm db:generate / db:migrate / db:check
```

## 14. 与事实文档的主要 Gap（M0 前）

全部基础设施缺失；M0 目标即补齐 Gap 的地基部分。

## 15. 保留 / 重构 / 删除

- 保留：全部 docs 与 AGENTS.md
- 新建：Monorepo 工程
- 删除：无

## 16. 最大 P0 技术风险（M0 前）

- 无持久化与 Migration → M0 已建立
- 无 Design System → M0 已建立
- 后续 M1+ 业务仍依赖 Auth/Media/Sync 正确落地
