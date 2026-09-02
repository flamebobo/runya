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

## M2 — Today / Daily Records / Timer

**日期：** 2026-09-02

### Database

- Migration: `db/migrations/0002_m2_records.sql`
- 新增 `feeding_records`、`feeding_segments`、`sleep_records`、`diaper_records`、`food_records`
- 离线可编辑实体含 ULID、`family_id`、`baby_id`、`created_by` / `updated_by`、`version`、`deleted_at` / `deleted_by`、UTC epoch ms
- 母乳左右切换历史在 `feeding_segments`，不塞 JSON
- 部分唯一索引 `uq_sleep_running_per_baby`：每宝宝最多一条 RUNNING 睡眠

### API / Contract

- Timeline：`GET /babies/:babyId/records`（各表查询后按 `recorded_at DESC` 合并，cursor、kind、日期过滤、soft delete）
- Bottle：`POST /babies/:babyId/feeding`、`GET/PATCH/DELETE /feeding/:id`
- Breast：`POST .../feeding/breast/start`、`/feeding/:id/breast/switch|pause|resume|finish`
- Sleep：`POST .../sleep/start`、`POST .../sleep` 补录、`POST /sleep/:id/finish`、`GET/PATCH/DELETE /sleep/:id`
- Diaper / Food：baby 下 POST + `GET/PATCH/DELETE`
- Create 强制 Idempotency-Key；Update 强制 If-Match / ETag；Delete 为 Soft Delete
- Bootstrap `running.sleep` / `running.feeding` 改为真实进行中计时
- 不在 M2 改宝石余额（Ledger 仍在 M9）

### Timer

- 业务真相为 `started_at` / `ended_at` / `feeding_segments`
- `setInterval` 只刷新 UI；锁屏、切后台、回页后用当前 UTC 重算
- 母乳时长 = segment 求和（暂停缺口不计）

### UI / States

- Today（`pages/index`）接真实时间线；`01.02/01.03/01.06/01.07` 为 Inline State（RunningBanner / FinishedNotice）
- `01.04` 接下来事项为空态说明（健康提醒属 M6）
- 日常记录 Tab：日期、筛选（14.01–14.04 同一列表）、摘要、时间线
- 表单页：`/pages/records/compose`（奶瓶 / 母乳 / 睡眠 / 尿布 / 辅食）
- 详情页：`/pages/records/detail`（编辑 + 删除确认 Dialog）
- `+` 留下这一刻接到真实创建；喂奶先选奶瓶或母乳
- 视觉沿用 M0/M1 液态 Warm Glass、公共组件，不重搭 Auth/Shell

### Tests

- Records API：Bottle CRUD、Sleep start/finish、双 RUNNING 睡眠拒绝、Breast L→R、Pause/Resume、duration=segment sum、Diaper/Food CRUD、Timeline 顺序、日期过滤、ETag conflict、幂等 Create、Soft Delete、跨家庭权限、23:00–07:00 仍一条
- Timer unit：后台时间跳变后按时戳重算，不靠累加秒
- Schema：新表存在 + RUNNING sleep 唯一索引
- `pnpm typecheck` / `pnpm lint` / `pnpm test`（44 passed）/ `pnpm build` 通过
- 本机 live server：H5 `GET /bootstrap` 与 `GET /babies/:id/records` 200；另用 WEAPP 会话真实写入 bottle 后 timeline 可见

### Known Issues

- 375/390/430 截图仍需本地 dev 目视（布局沿用 100% 宽 + 20px padding，未在本轮截图）
- M2 记录仍走在线 CRUD；Local-first / Pending Queue 属 M3
- `02.13` 重复记录 Dialog 属 M3 Duplicate
- 成长 / 健康 / 回忆 / 宝石仍为后续里程碑入口
- Hero 身高体重头围仍为 M0 预览（M4 Growth）

## M2 — 记录统计图表（日 / 周 / 月）

**日期：** 2026-09-02

- 新增统计 API：`GET /api/v1/babies/:babyId/records/stats?range=day|week|month&date=YYYY-MM-DD&utcOffsetMinutes=...`，契约 `recordStatsQuerySchema` / `recordStatsResponseSchema`（`@runew/contracts`）
- 服务端 `getRecordStats`：窗口制聚合（日=24 小时桶 / 周=7 天桶 / 月=当月天数桶），睡眠按本地日重叠秒数拆分（跨午夜一觉正确分摊到两天的桶）；分桶用客户端 UTC 偏移，UTC 真相 + 本地展示符合 §24
- 客户端新增 `StatsChart`：纯 CSS 液态玻璃柱状图（不引入 ECharts），复用 `GlassSurface` + `SegmentedControl` + `FilterChip`；维度切换整组错峰升起动画（`bar-rise` + `--i` 延迟），柱高 `transition` 流动变形；喂奶/睡眠/尿布/辅食四指标 chip 切换，读数区显示汇总或单桶数值；支持 Reduce Motion（全局 motion.scss 覆盖）
- RecordsHome 删除「日期」选择行（前一天/日期/今天），顶部替换为统计图表卡；当日时间线与 summary 保留
- 修复 M3 WIP 代码暴露的阻断问题：`contracts/sync.ts` 运行时崩溃（`DiaperType.optional()` → `diaperTypeSchema.optional()`，`.loose()` → `.passthrough()`）、`sync/service.ts` / `sync/routes.ts` 四处类型错误（`base` 缺 `status`、`patch` 作用域泄漏、死比较、drizzle 联合表推断）、`domain-types`/`db` 构建产物过期

### Verification

- `pnpm exec vitest run`：16 文件 69 用例全过（含新增 stats 集成测试：分桶、跨午夜拆分、周标签、月桶数、跨家庭 403；StatsChart 组件测试 5 例）
- typecheck：client / server / contracts 全过
- build：H5 与 weapp 均编译成功（weapp 有既有的 css 顺序 Conflicting Order 警告，与本次改动无关）

## M2 Visual / Interaction Pass — Records Compose

**日期：** 2026-09-02

- 奶瓶改为 `AmountStepper`：默认 120ml，±30 刻度，快捷 90/120/150/180；详情页同步
- 睡眠改为全宽 ChoiceCard（现在开始 / 补录一觉）+ 薰衣草玻璃舞台，去掉 FilterChip 当主交互
- 辅食空提交先本地拦截，文案「先写一写今天吃了什么」；Zod / API 同步中文 message
- 各记录页补 Onboarding 同级 hero（液态 tinted glass + 浮雕标题），去掉常驻「先返回」
- 尿布 / 详情改 ChoiceCard；进行中 Banner 时钟加厚浮雕

## M2 Visual Pass — Running Banner / Forms / Food Compose

**日期：** 2026-09-02

- `SecondaryGlassButton` 补齐 `font-size: --font-body-lg` + `font-weight: 600`，与主按钮排版一致（原来继承 13px/400，字体发虚）
- 喂奶进行中 Banner：暂停/换边/结束喂奶改为一行三等宽（`flex: 1`，热区仍 ≥48px），不再竖向堆三个全宽大按钮
- 计时时钟 `line-height: 1.1`、`letter-spacing: 0.02em`，去掉过紧行高
- `GlassTextArea` 补 `placeholderStyle`（weapp 端占位色），全局 `input/textarea::placeholder` 统一 `--color-text-tertiary`（H5 端原生兜底）；textarea 降为 88px、`line-height: 1.55`、禁用 resize
- `GlassInput` 占位色从硬编码 `#8D7D70` 改为 token `--color-text-tertiary`
- `FilterChip` 补排版定义：`--font-body` / 600 字重 / `line-height: 1`，消除继承浏览器默认 16px/400 的「发虚大字」；辅食分量、详情页分量、记录页筛选 chips 一并受益
- 辅食页重排：拆「吃了什么」（输入 + 分量）与「什么时候吃的」（时间 + 备注）两张卡；分量 4 个 FilterChip 改两列等宽居中网格，替换参差换行的 flex 流

### Verification

- `pnpm --filter @runew/client typecheck` 通过
- `vitest run`（records / forms 相关）3 passed

### Next

- **M3：** Local-first Sync / Conflict / Duplicate

## M3 — Offline Sync / Conflict / Duplicate

**日期：** 2026-09-02

### Local-first 客户端（apps/client/src/local/）

- `LocalEntityStore`（`entityStore.ts`）：实体按类型分索引持久化（H5 localStorage 兜底 IndexedDB 语义 / 小程序 Taro Storage），禁止单一巨型 JSON
- `PendingOperationStore`（`pendingStore.ts`）：持久化队列，operationId 幂等去重，App 重启后完整恢复
- `DraftStore` 基础 / `SyncCursorStore` / `DeviceStore`：cursor、epoch、deviceId 独立 KV
- `repository.ts`：统一写入口 `createRecordLocally` / `updateRecordLocally` / `deleteRecordLocally` / `restoreRecordLocally`，写入 = 本地实体 + Pending 一体；「未同步就删除」折叠为撤回 CREATE，不产生 CREATE+DELETE 双往返
- `syncEngine.ts`：push → pull 主循环；epoch 变化或 cursor 失效触发 full resync（snapshot 重建本地，Pending 原样保留回放）；仅「明确已决议」（APPLIED / DUPLICATE_QUEUED / CONFLICT / ENTITY_DELETED）的操作才移出队列，禁止静默丢弃
- 时间线本地兜底：离线时列表/汇总从本地实体读取，pending 记录带 SyncBadge 小标记

### Server 同步域（apps/server/src/modules/sync/）

- `sync_operations` 追加式变更日志；`POST /sync/push`、`GET /sync/pull`、`GET /sync/snapshot`
- 幂等：同 operationId 重放返回原结果；同 ID 不同 payload 拒绝（ENTITY_ID_REUSED）
- Three-way conflict：baseSnapshot + patch + serverCurrent，非重叠字段 auto merge，同字段 CONFLICT（返回 conflictFields + serverSnapshot），禁止 silent LWW
- Delete vs offline update：返回 ENTITY_DELETED，不自动复活、不丢客户端修改
- Duplicate：`duplicate_candidates`（同 family/baby/type + 近时间戳），`GET /sync/duplicates` + `POST /sync/duplicates/:id/resolve`（MERGE 保来源 / KEEP_BOTH），禁止自动删除
- 权限：所有端点 requireAuth + family membership；跨家庭混包整批拒绝
- `sync_epoch`（system_metadata）：Restore 后 bump，客户端 pull 时发现 epoch 变化即 full resync

### 客户端 UI（apps/client/src/components/sync/）

- `SyncBar`：离线/待同步/同步中状态条 + Pending 数量徽标，点击立即同步；文案遵守「已保存在本机，联网后自动同步」，不出现「保存失败」
- `SyncBadge`：时间线内 pending/syncing 小圆点
- `ConflictDialog`：同字段冲突双值对照，保留本机/另一台设备
- `DuplicateDialog`：合并（保 canonical）/都保留，注明另一条进最近删除 30 天可找回
- `DeletionDialog`：对端已删除 vs 本机修改，恢复/放弃两选
- compose 页离线保存提示「已保存在本机，联网后会自动同步 🌱」
- `SyncProvider`：前台 pull + 20s 轮询兜底 + 网络恢复/回前台触发

### 修复

- contracts dist 过期导致 `syncState` 类型缺失：重建 `@runew/contracts`
- `duplicateResolveBodySchema.canonical` 改为 optional（KEEP_BOTH 不带 canonical），与 server schema 对齐
- `runtime.ts` 补 `getFamilyRuntimeStore()` 非 React 访问器与 `SyncRuntimeState` 导出
- lint 清零：未使用 import、非 React 函数 `use*` 命名、`import()` 类型注解

### API / Contract

- `@runew/contracts`：`syncPushRequestSchema` / `syncPullResponseSchema` / `syncSnapshotResponseSchema` / `syncConflictInfoSchema` / `duplicateCandidateSchema` / `duplicateResolveBodySchema`（canonical optional）

### Database

- 无新 Migration（sync 域表在 M2 迁移中已建立）；测试中确认 `sync_epoch` 行无 seed，读取兜底为 1

### Tests（M3 验收 A–J）

- A + B：offline create + 同 operation 重放 → server 仅一条（幂等）
- 同 operationId 不同 payload → ENTITY_ID_REUSED
- C：A 改 note / B 改 recordedAt → auto merge
- D：A/B 同改 diaperType → CONFLICT + conflictFields，无覆盖
- E：delete vs offline update → ENTITY_DELETED，记录保持删除态
- F：snapshot 全量对齐语义（客户端测试断言 Pending 不被 resync 清空）
- G：sync_epoch bump → snapshot/pull 返回新 epoch，数据保留（restore 场景）
- H + I：duplicate merge 留一条 / keep both 留两条
- J：跨家庭 push → 403 FAMILY_ACCESS_DENIED；未认证 → 401
- 客户端：`repository.test.ts` 5 用例（离线创建重启不丢 / 未同步删除折叠 / UPDATE 带 baseSnapshot+changedFields / DELETE 软删 / 队列幂等）

### Verification

- `pnpm -r typecheck`：7/7 通过
- `pnpm run lint`：0 错误
- `pnpm -w run test`：17 文件 / 74 用例全过
- build：未执行（tsc build 由 CI/部署链路覆盖；本阶段改动均为源码级）

### Known Issues

- full resync 的客户端半程（pull 应用 snapshot + pending 回放）目前以单测断言 Pending 保留逻辑 + server snapshot 端点覆盖，尚未做双端 E2E（依赖 M13 部署链）
- `sync_epoch` 行迁移时不 seed（读时兜底 1），bump 依赖 upsert；正式 Restore 流程落地时统一
- WebSocket sync_hint 未实现（Technical Design 最低要求为 foreground pull + polling，已满足）

### Next

- M3 收尾：真机双端联调（断网 → 记录 → 杀 App → 重启 → 恢复网络 → server 单条）；Visual 回归 375/390/430


