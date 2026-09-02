# RUNEW Development Log

## M0 Foundations

**日期：** 2026-03-24

### 项目结构

- 建立 pnpm Monorepo：`apps/client`、`apps/server`、`packages/*`、`db/`、`deploy/`
- 根目录统一脚本：`dev`、`typecheck`、`lint`、`test`、`build`、`db:*`

### 新增 Package

- `@runew/contracts` — API Success/Error Envelope、Health Contracts
- `@runew/domain-types` — Domain Enums / Shared Types
- `@runew/validation` — Zod Runtime Validation（ULID、Pagination、ETag、Idempotency）
- `@runew/shared-utils` — ULID、Cursor、ETag、Idempotency helpers
- `@runew/db` — Drizzle Schema、SQLite 连接、Migration 执行（`@libsql/client` 本地 file 模式）

### DB Schema / Migration

- Migration: `db/migrations/0000_goofy_trauma.sql`
- Schema: `system_metadata` + M1 预备 Identity/Family/Baby 表
- 启动 PRAGMA：`foreign_keys=ON`、`journal_mode=WAL`、`busy_timeout=5000`

### Design System

- Tokens：`tokens.scss`、`glass.scss`、`typography.scss`、`motion.scss`、`globals.scss`
- Warm Glass 五级 + blur fallback
- 公共组件：PageShell、GlassSurface、SectionHeader、AppTopBar、RoundIconButton、GemBadge、BottomNav、AppDrawer、Buttons、Forms、Overlay、Feedback
- M0 首页对照 Figma `11 R6.2 Mobile Complete`：`01.01 今天`、全屏 `00.07 全局抽屉`、`00.10 留下这一刻`
- Dev Showcase：`/pages/dev/design-system`

### Server

- Fastify bootstrap + requestId + Pino redact
- Unified error envelope
- Typed config
- Health routes：`/api/v1/health/live`、`/api/v1/health/ready`

### Tests

- Server boot / health / error envelope
- SQLite WAL / FK / empty migration / schema presence
- ULID validator
- Design System component smoke（BottomNav 五热区、Drawer 11 项、Button loading/disabled）

### Known Issues

- Windows 环境下 `@libsql/client` 临时 DB 清理可能遇到 EPERM（测试已做容错；不影响 Migration/Schema 校验）
- 当前 Node 26 环境未使用 `better-sqlite3`（原生编译失败），改用 `@libsql/client` file 模式，行为仍符合 SQLite + WAL + FK 要求
- Client 组件测试依赖 Taro mock，小程序真机 Glass fallback 需 M1 后截图回归
- Taro H5 在 Node 26 需关闭 compiler.prebundle；H5 端口 `8086`
- `cloudflared` / `runew-backup` 仅 compose 预留，无生产逻辑
- Auth/Family/Baby 仅有 Schema skeleton，无业务 API
- M0 首页按 Figma 摆好框架与静态预览数据，快捷入口/抽屉未上线模块仅提示后续接入，不进入 M1/M2 业务
- Figma `00.07` 抽屉为 390 全帧；产品确认侧栏约 2/3，右侧露出今天页。以用户确认行为为准。

### Next

- **M1：** Auth / Family / Baby / App Shell / Onboarding

## M0 Visual Pass — Drawer / Glass / Icons

**日期：** 2026-09-01

- 全局抽屉改为左侧约 2/3（`min(264px, 66%)`）+ 半透明遮罩，打开时仍能看到今天页
- 图标改为居中 inline SVG；底栏「回忆 / 小家」不再复用会错位的 CSS 几何形
- 卡片 / 抽屉 / 底栏使用更通透的 Warm Glass（半透明 + backdrop-filter）
- 底栏中间 `+` 改为 52px CSS 圆钮，避免 Figma 装饰图溢出到相邻列

## M0 Design Polish — Warm Glass / Motion / Copy

**日期：** 2026-09-02

- Warm Glass 回校准：卡片/控件更接近 Figma 奶油半透明（约 0.70–0.86），保留 blur + inner highlight；无 blur 时仍保留语义 tint，不再一律褪成实心奶油
- 夜间模式补齐表面、边框、阴影与 tinted glass
- 底栏中间 `+` 改为 56px 暖杏玻璃钮（主按钮语义），去掉高饱和实橙底
- 「回忆」Tab 改为照片图标，避免与健康心形语义冲突
- 抽屉 / 留下这一刻改为常驻 + 进出动效；返回热区补到 48px
- 今天页：按时问候、Hero/记忆卡/时间线可点、时间线连接线、Section「全部」
- 产品文案去掉「后续里程碑」开发口吻；Empty / Toast / 热区与 press 反馈一并打磨

## M0 Design Polish — Liquid Glass / Display Type

**日期：** 2026-09-02

- 底栏改为 64px 液态 Warm Glass：更高 blur / saturate、高光描边、半透明填充，避免实心奶油条
- 中间 `+` 改为玻璃高光圆钮；选中 Tab 使用小玻璃 pill
- 页面/区块标题改为 800 字重 + 浅浮雕阴影；Section 增加嫩芽标记与暖杏短下划线
- 背景增加不挡内容的慢速光斑漂浮与星点闪烁，尊重 Reduce Motion

## M1 — Auth / Family / Baby / App Shell

**日期：** 2026-09-02

### Database

- Migration: `db/migrations/0001_m1_infra.sql`
- 新增 `idempotency_keys`；`users.topic_preferences_json`；`devices.current_family_id` / `current_baby_id`

### API / Contract

- Auth：`POST /auth/register|login|logout`、`GET /auth/me`、`GET /bootstrap`
- Onboarding：`POST /onboarding/complete`（幂等）
- Family / Baby：P0 CRUD + invite accept
- Argon2id；Opaque Session（DB 仅存 token hash）；H5 Cookie + CSRF；小程序 Bearer

### UI / States

- `/pages/auth/login`、`/pages/auth/register`、`/pages/onboarding/index`（四步 Wizard）
- `AppBootstrapGate` 驱动登录 / Onboarding / Today；Drawer 11 项 + 管理模式；BottomNav 五热区

### Tests

- Identity API integration（含 H5 cookie session）25 tests total pass
- `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm build` 通过

### Visual

- 登录 / 注册使用 `AuthScreen`：Hero 品牌卡（插画 + 贴纸）+ Glass 表单卡，与今天页同一套液态材质
- Onboarding 与今天页同构：Hero / SectionHeader / QuickTile / ChoiceCard；生日使用 `GlassDateField` 系统日期选择器
- 视觉基线写入 `UI_IMPLEMENTATION_SPEC.md` §0.5 与 `.cursor/rules/runew-visual.mdc`

### Tests

- Identity API integration（含 H5 cookie session）+ boot auto-migrate + Zod 400
- `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm build` 通过

### Known Issues

- `POST /auth/csrf` 独立端点未实现（登录/注册已下发 CSRF Cookie）
- 375/390/430 截图需本地 dev 手动回归
- Today 时间线仍为 M0 静态预览（真实记录属 M2）

### Next

- **M2：** Today / Daily Records / Timer
