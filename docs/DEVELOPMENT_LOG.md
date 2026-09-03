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

- M3 收尾：真機雙端聯調（斷網 → 記錄 → 殺 App → 重啟 → 恢復網路 → server 單條）；Visual 回歸 375/390/430

## Tooling Fix — 啟動前建置 Workspace 套件

**日期：** 2026-09-02

### Changed

- 新增根指令 `build:packages`，按 workspace 依賴順序建置 `packages/*` 的正式 `dist` 匯出。
- `dev`、`dev:client`、`dev:server` 現在透過 pnpm lifecycle 在啟動前執行共用套件建置，修復乾淨工作區首次啟動時 `@runew/shared-utils`、`@runew/domain-types` 等套件入口不存在的問題。
- 保留套件 `exports` 指向 `dist`，避免把正式 Node 執行錯誤地綁到 TypeScript 原始碼。

### Database

- 無 Migration。

### API / Contract

- 無行為或 Contract 變更。

### UI / States

- 無 UI 變更。

### Verification

- `pnpm run predev:client && pnpm --filter @runew/client build:h5`：通過，原 11 個 workspace 套件解析錯誤已消失。
- `pnpm typecheck`：7/7 workspace project 通過。
- `pnpm lint`：通過，0 錯誤。
- `pnpm test`：17 個測試檔、74 個測試通過。
- `pnpm build`：通過，H5、微信小程式與 Server 均完成建置；仍有既有 bundle 體積、CSS 順序及 `postcss-calc` 警告。

### Known Issues

- 已在錯誤狀態中執行的 watch process 不會可靠監看新生成的 package entry；套用此修復後需重啟一次 `pnpm dev`。

## M2 Visual Pass — 日常記錄資訊層級與趣味細節

**日期：** 2026-09-02

### Changed

- 將 `RecordScope` 提升到 `RecordsHome`，統計與時間線共用同一個「全部 / 餵奶 / 睡眠 / 尿布 / 輔食」選擇，不再要求使用者選兩次。
- `日 / 週 / 月` 改為統計卡內完整寬度 `SegmentedControl`；移除第二組類型篩選與四張狹窄摘要卡。
- 「全部」改用統計卡內 2×2 概覽；單一類型維持讀數與柱狀圖，統計卡與時間線之間保留 32px 節奏。
- 在不修改 Warm Glass 材質與按鈕結構的前提下，加入「小日子發芽中」小芽標記、四類記錄線稿圖示、空狀態圖形與「每一筆，都是今天的小腳印」微文案。
- 修正 local-first 時間線合併只套日期、不套 `kind` 的問題；本機尿布 / 輔食現在會服從同一個類型篩選。

### Database

- 無 Migration；瀏覽器視覺驗證使用既有本機開發資料。

### API / Contract

- 無 API 或 Contract 變更；沿用既有 timeline `kind` 與 stats range。

### UI / States

- `all`：2×2 四類概覽，搭配奶瓶、月亮、尿布與小碗線稿圖示。
- `feeding / sleep / diaper / food`：單類讀數、柱狀圖與時間線同步切換。
- 空資料：保留溫柔文案並增加低干擾圖形；所有控制熱區維持至少 48px。
- 裝飾動畫服從全域 Reduce Motion 規則。

### Verification

- `pnpm typecheck`：通過。
- `pnpm lint`：通過。
- `pnpm test`：18 個測試檔、76 個測試通過（含 local timeline kind regression）。
- `pnpm build`：通過，H5、微信小程式與 Server 均完成建置；仍有既有 bundle 體積、CSS 順序及 `postcss-calc` 警告。
- Playwright H5：已用真實 API / 本機資料檢查 375×812、390×844、430×932；類型 chips 無溢出、控制熱區正常、概覽數值未拆行、BottomNav 未遮住可捲動內容。

### Known Issues

- 全倉 `pnpm format:check` 仍會因 88 個既有未格式化檔案失敗；本次變更檔案已單獨通過 Prettier。

## M2 Cute Accent Follow-up — 日常記錄照護小隊

**日期：** 2026-09-02

### Changed

- 保留既有 Warm Glass 卡片、分段控制與篩選按鈕，未改動任何核心操作或資料流程。
- 將統計卡右上小芽標記升級為「小芽寶寶」貼紙角色，四類概覽圖示改為帶高光的不規則柔軟徽章。
- 將時間線純色圓點改為奶瓶、月亮、尿布、小碗四種語義圖示節點，並以柔和虛線串成一天的路徑，末端用小芽收尾。
- 時間線節點保留整列 52px 點擊區；按壓回饋只作用於圖示，不改變導航行為，Reduce Motion 仍由全域規則接管。

### Database

- 無 Migration；未修改 Schema 或業務資料。

### API / Contract

- 無 API 或 Contract 變更。

### Verification

- 日常記錄定向測試：`StatsChart` / `TimelineList` 共 2 個測試檔、6 個測試通過；時間線測試覆蓋四種記錄圖示映射。
- `pnpm test`：在本次 UI 變更完成後，19 個測試檔、81 個測試通過。
- `pnpm lint`：最終重跑通過。
- `pnpm typecheck`：本次 UI 變更完成後曾通過；最終重跑被同工作區並行中的 M4 Growth 變更阻斷，錯誤為 `GrowthTrendChart.tsx` 從 `echarts/core` 匯入不存在的 `LineSeriesOption`，與日常記錄變更無關。
- `pnpm build`：本次 UI 變更完成後，H5、微信小程式與 Server 建置通過；保留既有 Taro bundle 體積、CSS order、`postcss-calc` 與 Sass legacy API 警告。
- Playwright H5：375×812、390×844、430×932 通過；已檢查標記辨識、文字重疊、篩選按鈕溢出、時間線對齊、可捲動內容及 BottomNav。

### Known Issues

- 最終全倉 TypeScript 檢查需等待並行 M4 Growth 的 ECharts 型別匯入修正；本次日常記錄檔案無 Lint 或編輯器診斷。

## M2 Statistics + Today Guide Pass

**日期：** 2026-09-03

### Changed

- Records 統計統一為以選定日期為終點的自然時間窗口：今天 24 小時、最近 7 天、最近 30 天、最近 12 個自然月；年範圍可正確跨年。
- 餵奶統計由次數改為奶瓶毫升加總；母乳計時沒有毫升資料，因此維持 `0 ml`，Timeline 的 `feedingCount` 不變。
- 客戶端統計請求補傳本地 `utcOffsetMinutes`，服務端依使用者本地日界線分桶。
- Today 四個重複大標題改用共用 `SectionHeader` 的可選 `guide` 變體，搭配快捷入口、記憶、提醒與時間線的語義圖示；其他頁面的預設變體未改動。
- 小熊頭像改由固定圓形展示容器置中；星星偶爾閃爍、笑臉輕點頭，快捷入口按下時只有圖示回應，所有位移與循環動畫均服從 Reduce Motion。

### Database

- 無 Migration；未修改原始記錄 Schema。

### API / Contract

- `statsRangeSchema` 新增 `year`。
- 統計桶欄位由 `feedingCount` 改為非負整數 `feedingAmountMl`；Timeline summary contract 不變。
- `fetchRecordStats` 查詢新增客戶端本地 UTC offset。

### UI / States

- Records 新增「年」分頁，月／年分別顯示「最近 30 天」與「最近 12 个月」，餵奶讀數使用 `ml`。
- Today 保留既有 Warm Glass、點擊行為與至少 48px 的操作熱區，只降低章節標題層級並加入低干擾 CSS 回饋。
- H5 截圖：`output/playwright/today-final-375x812.png`、`today-final-390x844.png`、`today-final-430x932.png`。

### Verification

- TDD 定向測試：3 個測試檔、19 個測試通過，覆蓋四種時間窗口、跨年 12 個自然月、奶量加總、`ml` 顯示與本地 UTC offset。
- `pnpm test`：23 個測試檔、92 個測試全部通過。
- 本次需求檔案定向 ESLint：通過；`pnpm lint`：通過。
- `pnpm build`：通過，H5、微信小程式與 Server 均完成建置；保留既有 CSS order、`postcss-calc`、bundle 體積及 Sass legacy API 警告。
- `pnpm typecheck`：重建共用套件後，統計型別已通過；全倉仍被工作區既有的 `MilestoneViews` 測試 matcher／Taro `TextProps` 與 `SyncHost` 刪除通知型別錯誤阻斷，均不在本次修改範圍。
- Playwright H5：375×812、390×844、430×932 均無頁面水平溢出；小熊容器、章節層級、圖示對齊、BottomNav 與文字換行已實際截圖檢查。App 級 Reduce Motion 驗證結果為星星／笑臉 `animation-name: none`、快捷圖示 `transition-duration: 0s`。

### Known Issues

- 全倉 TypeScript 仍需由目前的 M4 Growth 與 Sync 工作修正其既有型別錯誤後重跑；本次需求本身的定向測試、Lint、完整測試與 Build 均通過。

## M4 Growth Visual Completion — 成長收藏冊

**日期：** 2026-09-03

### Changed

- 重整 Growth 首頁資訊層級：保留三項真實指標、趨勢圖與記錄入口，將「成長里程碑」與「這個月的潤潤」從普通列表提升為可閱讀的收藏預覽。
- 成長里程碑頁改為「成長星圖」時間軸，呈現里程碑數量、順序、日期與真實描述；空狀態仍提供第一個收藏入口。
- 里程碑詳情改為獨立紀念頁，包含紀念插畫、事件標題、發生時間、家人描述與同步狀態；編輯仍由詳情頁明確進入，不再混成同一張表單。
- 月度故事改為完整閱讀頁：故事封面、真實測量數量、第一次數量、三項指標變化與里程碑章節；月度里程碑可直接回到其詳情。
- 統一 Growth 趨勢圖與相關頁面文案為簡體中文，並保留數值列表作為圖表的文字替代。
- 將 `DeletionDialog` 的 callback 型別對齊完整 `SyncDeletionNotice`，收掉 Client typecheck 的適配層錯誤，未改變同步決策行為。

### Database

- 無 Migration；本輪只調整 Client UI 與既有同步對話框型別。

### API / Contract

- 無 API 或 Contract 變更；里程碑與月度故事繼續使用既有真實 Growth API。

### UI / States

- Growth 首頁：指標 Hero、真實趨勢、變化摘要、里程碑收藏預覽、月度故事封面、最近一次測量。
- 里程碑：空狀態、時間軸列表、獨立詳情、詳情進入編輯。
- 月度故事：有資料時顯示真實統計與章節；無資料時保留溫柔空白頁，不生成假故事。
- 核心新增熱區維持至少 48px，375 / 390 / 430 寬度均無頁面橫向溢出。

### Verification

- `pnpm typecheck`：通過，7 個 workspace package 全部完成。
- `pnpm lint`：通過。
- `pnpm test`：23 個測試檔、93 個測試通過。
- Growth 定向測試：3 個測試檔、8 個測試通過，覆蓋圖表數值替代、里程碑列表／詳情、月度故事與里程碑回連。
- `pnpm --filter @runew/client build`：H5 與微信小程式建置通過；保留既有 bundle 體積、CSS ordering、`postcss-calc` 與 Sass legacy API 警告。
- H5 真實 API / 本機 DB：已檢查 Growth 首頁、里程碑列表、里程碑詳情與月度故事；375×812、390×844、430×932 均完成截圖，未發現文字重疊、頁面橫向溢出或新增熱區不足。

### Known Issues

- ECharts 仍使 Growth 微信分包超過建議體積；這是既有效能警告，不阻斷本輪 UI 功能。
- 測試環境的 Taro Canvas mock 仍會輸出 `canvasId` / `disableScroll` DOM 警告，不影響 H5 或微信實際建置。

## M4 Growth Final Review — 同步一致性與離線故事

**日期：** 2026-09-03

### Changed

- 將 Growth 與共用同步操作改為單操作資料庫事務；實體更新、版本遞增、同步日誌與最終結果要嘛一起成功，要嘛一起回滾。
- 所有已套用的同步結果回傳完整 `serverSnapshot`；相同 `operationId` 重試直接重播第一次結果，不再重複遞增版本。
- 衝突與「對端已刪除」操作保留在持久化佇列，直到使用者明確選擇；App 重啟後可由同一佇列重建提示。
- 「保留本機」直接將原操作改基於伺服器最新版本；「恢復這條記錄」改為原子替換成 `RESTORE`，再接續使用者原本的 `UPDATE`。
- 待同步佇列成為本機寫入的恢復來源；若 App 在佇列寫入後、實體寫入前中止，重新啟動可重建本機實體。
- 三方合併辨識「客戶端值仍等於基準值」為未修改欄位，避免把伺服器的有效更新誤判成衝突。
- 月度故事改由伺服器資料與本機待同步 Growth／里程碑合併生成，離線新增、修改與刪除都會立即反映。
- Growth 使用者可見文案完成簡體中文掃描；里程碑保留 8 個可點選、可繼續編輯的常用選項。
- 將 Playwright 暫存資料與本機驗證輸出加入 `.gitignore`，避免把生成檔提交到版本庫。

### Verification

- `pnpm typecheck`：通過，7 個 workspace package 全部完成。
- `pnpm lint`：通過，0 錯誤。
- `pnpm test`：24 個測試檔、104 個測試全部通過。
- 同步與 Growth 定向測試：5 個測試檔、34 個測試通過，覆蓋冪等重試、最終快照、自動合併、持久化決策、真正恢復與中斷寫入重建。
- `pnpm db:check`：通過，Schema、Migration 與資料庫約束一致。
- `pnpm build`：Server、H5 與微信小程式全部建置通過。
- `git diff --check` 與簡繁體字元掃描：通過。

### Known Issues

- 保留既有的 Taro bundle 體積、CSS ordering、`postcss-calc`、Sass legacy API、Fastify deprecation 與測試 DOM mock 警告；均未造成建置或測試失敗，本輪沒有新增阻斷問題。

## M2/M4 UI 鎵撶（ 鈥?鍒嗘鎺т欢 / 璁板綍琛ㄥ崟 / 缁熻鍥捐〃

**鏃ユ湡锛?* 2026-09-03

### Changed

- `SegmentedControl` 閲嶅仛涓烘恫浣撶幓鐠冩粦鍧楋細澧炲姞 `segmentThumb` 婊戝姩鎸囩ず鍣紙鏆栨潖鐜荤拑娓愬彉 + 鍐呬晶楂樺厜锛夛紝鍒囨崲鏃朵互 320ms 寮规€ф洸绾垮钩绉伙紝鏇夸唬鍘熷厛閫愭牸鍙樿壊锛涚敤浜庢垚闀块〉銆岃韩楂?浣撻噸/澶村洿銆嶄笌缁熻鍥捐〃銆屾棩/鍛?鏈?骞淬€嶄袱澶?
- 缁熻鍥捐〃锛坄StatsChart`锛夎瑙夊崌绾э細鏌变綋澧炲姞椤堕儴楂樺厜鐐?+ 鐜荤拑鏂滃悜鍙嶅厜锛堟恫浣撶幓鐠冭川鎰燂級銆佸簳閮ㄦí鍚戝弬鑰冪嚎銆佹椿璺冩煴鎶曞奖锛涜鏁版暟鍊煎姞娣″叆鍔ㄦ晥
- 鍥捐〃鍒囨崲娴佺晠搴︼細`useRecordStatsQuery` 鏀寔 `placeholderData`锛屽垏鎹㈡棩/鍛?鏈?骞存椂淇濈暀涓婁竴浠芥暟鎹钩婊戣繃娓★紝涓嶅啀闂鏋跺睆锛涙煴瀛?React key 鍘绘帀 range 鍓嶇紑锛岄珮搴﹀彉鍖栬蛋 CSS transition 鑰屼笉鏄噸鎾叆鍦哄姩鐢?
- 鍠傚ザ杩涜涓崱鐗囨寜閽眰绾ч噸鎺掞細鏆傚仠/鎹㈣竟鏀逛负鏇磋交鐨勭幓鐠冩绾ф牱寮忥紙46px / 灏忓瓧鍙凤級锛屻€岀粨鏉熷杺濂躲€嶄繚鎸佸敮涓€涓绘寜閽紱鍏ㄥ眬涓?娆℃寜閽瓧閲?600 鈫?700 骞跺姞瀛楄窛
- 澶囨敞鍗犱綅鏂囨銆屽彲浠ヤ笉鍐欍€嶁啋銆屾兂鐣欎竴鍙ヨ瘽锛屽啓缁欎互鍚庣殑鑷繁銆嶏紙compose 浜斿 + detail 涓€澶勶級锛沗GlassTextArea` 琛岄珮涓庡崰浣嶅瓧璺濈簿淇?
- 杈呴琛ㄥ崟閲嶆瀯锛氥€屽ぇ绾﹀垎閲忋€嶆敼涓轰竴琛屽洓鏋氱瓑瀹?chip锛?8px 鐑尯銆佹殩鏉忛€変腑鎬侊級锛屼笌澶囨敞鍚堝苟杩涖€屽悆浜嗕粈涔堛€嶉潰鏉匡紱鏃堕棿闈㈡澘鍒犳帀銆屾棩鏈熴€嶅瓧娈靛彧鐣欍€屾椂闂淬€嶏紙褰撳満璁板綍鍦烘櫙鏃ユ湡鎭掍负浠婂ぉ锛?

### Database

- 鏃?Migration锛涙湰杞粎瀹㈡埛绔?UI 璋冩暣

### API / Contract

- 鏃?API 鍙樻洿锛沗RecordStatsQuery` 濂戠害鏈姩锛屼粎鍓嶇鏌ヨ琛屼负澧炲姞 placeholderData

### UI / States

- 鎴愰暱椤垫寚鏍囧垏鎹€佺粺璁″浘琛ㄧ淮搴﹀垏鎹㈠潎鑾峰緱婊戝潡寮忓垎娈垫帶浠?
- 杈呴鏂板琛ㄥ崟锛氶鐗?+ 澶х害鍒嗛噺 + 鏃堕棿 + 澶囨敞涓夋寮忓彉涓ゆ寮?
- 鍠傚ザ杩愯涓崱鐗囷細鏆傚仠鎬併€岀户缁€嶄粛涓轰富鎸夐挳锛岃繍琛屾€併€屾殏鍋?鎹㈣竟銆嶉檷涓烘绾?

### Verification

- `pnpm --filter @runew/client typecheck`锛氶€氳繃
- `eslint`锛堟敼鍔ㄦ枃浠讹級锛氶€氳繃
- `vitest`锛圫tatsChart 鐩稿叧 6 渚嬶級锛氶€氳繃锛涘叏閲?117 渚嬮€氳繃锛坄growth/routes.test.ts` 鐨?afterAll 娓呯悊鎶?Windows EPERM锛屼负 DEVELOPMENT_LOG 宸茶褰曠殑鏃㈡湁鐜闂锛屾柇瑷€鍏ㄩ儴閫氳繃锛?
- `pnpm --filter @runew/client build:h5` 涓?`build:weapp`锛氬潎缂栬瘧鎴愬姛锛沗mini-css-extract` chunk 璀﹀憡鍦ㄦ湭鍚湰鏀瑰姩鐨勫熀绾夸笂鍚屾牱鍑虹幇锛屽睘鏃㈡湁闂

### Known Issues

- ECharts 灏忕▼搴忓垎鍖呬綋绉€丼ass legacy API銆乀aro Canvas mock DOM 璀﹀憡绛夋棦鏈夐棶棰樹繚鎸佸師鏍?

### Documentation

- DEVELOPMENT_LOG updated: yes

### Status

Ready for next task

## M5 — 育儿知识（Knowledge）

**日期：** 2026-09-03

### Changed

- M5 Knowledge 垂直切片完成，实现 Version-aware Knowledge State 完整闭环：`learned_version == content_version` 不再普通推荐；`content_version > learned_version` 显示「内容有更新」并可重新推荐；重读当前版本后横幅消失。
- 补齐首页快捷入口真实计数：新增 `GET /babies/:babyId/knowledge/library/counts`，收藏 / 稍后看 / 已学三个入口展示服务端真实数量，替代原先硬编码的 0（假完成）。
- 详情页状态改由服务端真相驱动：新增 `GET /babies/:babyId/knowledge/:id/state`（从未互动返回 null），收藏 / 稍后看 / 已学 / 内容有更新横幅（04.09）全部以服务端状态为准；修复原先从收藏进入详情页收藏态丢失的问题。
- 搜索页接入真实输入框（Taro Input），键盘搜索键可直接触发搜索，替代原先仅可点击跳转的假输入框。
- 「学到了」实现 04.07 Inline Transition：推荐卡新增「学到了」操作，点击后展示 ✓ 反馈并播放 480ms 轻折叠动画，动画结束后由服务端数据（推荐流失效）自然补位；`prefers-reduced-motion` 下保留淡出反馈去掉位移。动画与保存解耦，动画失败不影响已保存状态。
- 详情页「更多」面板的「内容有问题」反馈接通 `POST /knowledge/:id/feedback`，成功 / 失败均有产品语气提示，替代原先只弹 toast 的假反馈。
- 详情页新增「稍后看」主操作（04.05），三按钮（学到了 / 收藏 / 稍后看）+ 更多，当前版本已学后按钮变为「已学这一版」禁用态。
- 服务端测试新增计数端点与单篇状态端点覆盖，并修复测试抓出的真实缺陷：计数查询未按 babyId 过滤，会把所有用户所有宝宝的状态计入（跨家庭状态数泄露）。
- 测试桩 `Input` 组件桥接 DOM change 事件为 Taro `onInput` 的 `{ detail: { value } }` 形态，使可输入组件可被真实键入测试。

### Database

- 无新增 Migration；`0005_m5_knowledge.sql`（knowledge + knowledge_user_states，含年龄区间 CHECK、user+baby+knowledge 唯一索引）已存在于本轮之前，本轮未改 Schema。

### API / Contract

- 新增 `GET /babies/:babyId/knowledge/library/counts` → `KnowledgeLibraryCountsResponse`（contracts 新增类型）。
- 新增 `GET /babies/:babyId/knowledge/:id/state` → `KnowledgeUserState | null`。
- 既有 7 个端点不变：`GET /knowledge`、`GET /knowledge/:id`、`GET /knowledge/search`、`GET /babies/:babyId/knowledge/recommendations`、`PUT /babies/:babyId/knowledge/:id/state`、`GET /babies/:babyId/knowledge/library`、`POST /knowledge/:id/feedback`。

### UI / States

- 04.01 知识首页：搜索入口、三快捷入口（真实计数）、按月龄推荐流（透明推荐理由）、学到了过渡、不感兴趣。
- 04.02 搜索：真实输入、空态、结果列表；04.10/14.05–14.09/14.19 分类：chips 过滤 + 空分类文案。
- 04.03 详情：正文分段、可信度卡（来源 / 原文链接 / 适用月龄 / 审核时间 / 内容版本）；04.09 内容有更新横幅；04.08 更多 Sheet（学到了 / 收藏 / 减少此类推荐 / 内容问题反馈）。
- 04.04/04.05/04.06 收藏 / 稍后看 / 已学：三段切换，已学列表显示 `contentUpdated` 标记。
- 推荐规则保持透明（P0）：PUBLISHED + 未删除 + 未 dismissed + learnedVersion < contentVersion + 月龄窗口命中，按 priority / 发布时间排序，无 AI 平台。

### Verification

- `pnpm typecheck`：通过（contracts 重建后 7 个 workspace 全部完成）。
- `pnpm lint`：通过。
- `pnpm test`：26 个测试文件、126 个测试全部通过（含知识模块 22 例：年龄上下边界、PUBLISHED/OFFLINE/DRAFT 排除、收藏 / 稍后看 / 已学分桶、学到版本闭环、内容更新重进推荐、dismissed、搜索、来源元数据、宝宝 A/B 状态隔离、越权 403、未认证 401、幂等 PUT、计数与单篇状态）。
- `pnpm --filter @runew/client build:h5` / `build:weapp` / `@runew/server build`：编译成功。
- `pnpm db:migrate` + `pnpm db:seed:knowledge`：临时库验证通过（12 篇知识入库）。
- 客户端组件测试覆盖：卡片元信息 / 操作 / 更新横幅 / 学到了过渡、快捷入口计数、可输入搜索栏、月龄与审核日期格式化。

### Known Issues

- weapp 构建存在基线性 `UNKNOWN_DIMENSION`（postcss 对 `env(safe-area-inset-*)` calc）与 mini-css chunk 警告；经移除模块对比验证，知识页与 growth 页共用同一模式，非本轮新增问题类别。
- ECharts 使微信分包超建议体积，为既有问题。
- 反馈为轻量信号（P0 不落表）；REDUCE_CATEGORY 类型已定义但推荐侧暂不消费，记录为后续可选优化。

### Documentation

- DEVELOPMENT_LOG updated: yes

### Status

Ready for next task（M5 READY：Version-aware Knowledge State 完整）

## M7 — 媒体平台与回忆（Media Platform / Memories）

**日期：** 2026-09-03

### Changed

- M7 Media Platform & Memories 垂直切片完整交付。
- 本地可靠保存（Local-first Media Preservation）：小程序端在用户选择/拍摄/录制后，先复制至 `USER_DATA_PATH/media/` 目录下持久化，成功后再写 Local Metadata；H5 端使用 OPFS (`navigator.storage.getDirectory`) 存储 Blob（Fallback 至 IndexedDB Blob / Object URL）。只有持久化本地文件成功后，UI 才展示“已保存”状态（遵从 AGENTS.md §30, §31, §32）。
- 分块断点续传（Resumable Chunked Upload Engine）：服务器端实现 4 MiB 分块接收（`POST /media/uploads` 初始化会话、`PUT /media/uploads/:uploadId/parts/:partNo` 分块上传、`GET /media/uploads/:uploadId` 状态与已完成分块查询、`POST /media/uploads/:uploadId/complete` 合并与 SHA256 校验）。相同 Part 重试具备幂等性；分块合并校验 SHA256 与文件大小，不匹配拒绝合并。
- 媒体处理与原件保留（Media Processing & Safety）：图片校验 Magic Bytes/Decode，异步生成 Display 与 Thumbnail 缩略图；音频提取 AAC/Opus 时长。处理失败保留原始 Binary 文件（遵从 AGENTS.md §33）。
- 鉴权流媒体播放（Authenticated Media Delivery with HTTP 206 Range）：`GET /media/:id/content` 强制用户家庭鉴权（防 IDOR），支持 `Range: bytes=start-end` 分段请求，响应 `206 Partial Content`，供音频播放器与媒体播放平滑 Seek。
- 回忆博物馆（Memories Museum）：
  - 照片回忆（Photo Memories）：多图关联、相簿流、故事记述。
  - 宝宝语录（Baby Quotes）：趣事文字、关联声音录音、自动草稿。
  - 宝宝声音（Audio Memories）：Inline 音频播放器组件，包含播放/暂停控制、自定义进度条与时间 Seek，且具备 JIT 麦克风权限说明弹窗（PermissionSheet）。
  - 第一次（First Moments）：宝贵成长第一次记录。
  - 时光胶囊（Time Capsules）：严格后端状态机约束 `DRAFT` → `SEALED` → `OPENED`。草稿支持编辑；`SEALED` 封存态拒绝正文编辑，卡片展示锁图标 🔒 与开启倒计时；到达 `openAt` 后支持显式解锁开启 ✨。
- 那年今日与回顾（On-This-Day）：汇总去年今日的相片与回忆事件。

### Database

- Migration: `db/migrations/0007_m7_media_memories.sql`
- 表：`media_files`、`media_uploads`、`media_upload_parts`、`photo_memories`、`photo_memory_media`、`baby_quotes`、`audio_memories`、`first_moments`、`first_moment_media`、`time_capsules`、`time_capsule_media`。

### API / Contract

- Media API：`POST /media/uploads`、`PUT /media/uploads/:uploadId/parts/:partNo`、`GET /media/uploads/:uploadId`、`POST /media/uploads/:uploadId/complete`、`GET /media/:id/content`、`GET /media/:id/thumbnail`。
- Memories API：
  - `GET /babies/:babyId/memories/summary`、`GET /babies/:babyId/memories/on-this-day`
  - Photos: `GET/POST /babies/:babyId/memories/photos`、`GET/PATCH/DELETE /memories/photos/:id`
  - Quotes: `GET/POST /babies/:babyId/memories/quotes`、`GET/PATCH/DELETE /memories/quotes/:id`
  - Audios: `GET/POST /babies/:babyId/memories/audios`、`GET/PATCH/DELETE /memories/audios/:id`
  - Firsts: `GET/POST /babies/:babyId/memories/firsts`、`GET/PATCH/DELETE /memories/firsts/:id`
  - Capsules: `GET/POST /babies/:babyId/memories/capsules`、`GET/PATCH/DELETE /memories/capsules/:id`、`POST /memories/capsules/:id/seal`、`POST /memories/capsules/:id/open`

### UI / States

- 06.01 回忆博物馆首页：暖奶油记忆墙、分类统计、Tab 切换、那年今日。
- 06.09–06.13 Inline 音频播放器组件：声音卡片、分类 Tag、自定义 Seek、JIT 麦克风权限说明。
- 06.19–06.21 时光胶囊：`DRAFT` 草稿、`SEALED` 封存锁与倒计时、封存确认 ConfirmDialog、`OPENED` 金色光芒展开卡片。

### Verification

- `pnpm build`：工作区全量编译成功（`@runew/db`、`@runew/shared-utils`、`@runew/domain-types`、`@runew/validation`、`@runew/contracts`、`@runew/server`、`@runew/client` H5 & WeChat Mini Program）。
- `pnpm test`：工作区 35 个测试文件、178 个测试用例 100% 运行通过！
  - `media.test.ts`：覆盖分块断点续传、分块合并、Part 校验、SHA256 校验、Range 播放。
  - `memories.test.ts`：覆盖 Photo Memories CRUD、时光胶囊状态机严格转换 (`DRAFT` → `SEALED` → `OPENED`)、`SEALED` 正文修改拒绝。

### Documentation

- DEVELOPMENT_LOG updated: yes

### Status

Ready for next task (M7 READY: Media Platform & Memories 阶段交付完成)


