# 润芽 · RUNEW

> 把润润长大的每一天，认真收藏起来。🌱

润芽 · RUNEW 是一个围绕宝宝成长和家庭生活构建的私人家庭成长工作台。当前仓库处于 **M0 Foundations** 阶段，已建立可继续扩展的 Monorepo 工程基础、Design System、Server/DB Foundation。

## 技术栈

- **Frontend:** Taro + React + TypeScript + Zustand + TanStack Query + SCSS/CSS Modules
- **Backend:** Node.js + Fastify + TypeScript + Drizzle ORM
- **Database:** SQLite (WAL)
- **Deployment:** Docker Compose

## 本地开发

### 前置要求

- Node.js >= 20
- pnpm >= 9

### 安装依赖

```bash
pnpm install
```

### 环境变量

```bash
cp .env.example .env
```

### 数据库 Migration

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:check
```

### 启动

```bash
# 同时启动 H5 Client + Server
pnpm dev

# 仅 Client (H5)
pnpm dev:client

# 仅 Server
pnpm dev:server
```

- H5 默认：`http://localhost:8086`
- API 默认：`http://localhost:3000/api/v1`

### 测试 / 质量门禁

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

### Docker

```bash
docker compose up --build runew-app
```

`cloudflared` 与 `runew-backup` 服务已在 `docker-compose.yml` 预留，M0 不实现完整 Tunnel/Backup 逻辑。

## 目录结构

```text
apps/client     Taro 前端
apps/server     Fastify 后端
packages/*      共享 contracts / types / validation / utils
db/             Drizzle schema / migrations / scripts
deploy/         Docker / Cloudflare / Backup 部署资产
docs/           产品与技术事实源
```

## 当前 Milestone

- ✅ **M0 Foundations** — Monorepo、Design System、Server Bootstrap、SQLite Schema/Migration、基础测试
- ⏭ **M1** — Auth / Family / Baby / App Shell

## 文档

- `AGENTS.md`
- `docs/PRD_RUNEW_V3.0.md`
- `docs/UI_IMPLEMENTATION_SPEC.md`
- `docs/TECHNICAL_DESIGN.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/CODEX_TASKS.md`
- `docs/DEVELOPMENT_LOG.md`
