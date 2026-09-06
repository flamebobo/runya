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

## M6 — 健康 / 通知基础闭环（Health / Notification Foundation）

**日期：** 2026-09-03

### Changed

- 健康事项真实 CRUD、完成/取消/过期状态、周/月日历、当天筛选、下一事项、时间线、详情与编辑。
- 提醒整体替换、单条取消、时间重排、终态取消；Notification Center 支持单条已读、全部已读与健康事项深链。
- 通知偏好、21:00–08:00 默认 DND、跨午夜延迟及显式健康提醒 override；Scheduler 60 秒扫描、SQLite job lock、幂等通知、失败记录与重启接管。
- 离线健康编辑通过本地 pending queue 同步，保留提醒和本机附件元数据；附件只接 Media Adapter Contract，UI 明示“本机待上传”，未伪造上传完成。
- 健康文案只记录与提醒，不提供诊断，也不发送“今天没记录”或“连续打卡要断”等压力型通知。

### Database

- Migration: `db/migrations/0006_m6_health_notifications.sql`
- Tables: `health_events`、`health_reminders`、`health_event_media`、`notification_preferences`、`notifications`、`scheduled_notifications`、`job_locks`

### API / Contract

- Health CRUD、提醒替换/删除、恢复路由与共享运行时 Request/Response Schema。
- Notification Center 列表、单条已读、全部已读、偏好读取/更新与共享运行时 Response Schema。
- Offline sync 保留 `payload: null` 的删除/普通同步日志，并保留完成/取消等健康事项终态。

### UI / States

- 健康事项首页、周/月日历、类型筛选、下一事项、时间线、详情、编辑、新增、删除确认与完成状态。
- 通知中心、通知设置、DND 设置、空态/加载态/错误态、深链回到健康详情。
- 复用 R6.2 Warm Glass + Cute Accent 视觉体系，实际检查 375×812、390×844、430×932 截图。

### Verification

- `pnpm test`：35 个测试文件、178 个测试全部通过。
- `pnpm lint`：通过。
- `pnpm db:check`：通过。
- `pnpm build:packages`：通过。
- `pnpm --filter @runew/server typecheck`：通过。
- `pnpm --filter @runew/client typecheck`：通过。
- `pnpm --filter @runew/client build:h5`：Compiled successfully；存在既有 bundle size warning。
- `pnpm --filter @runew/client build:weapp`：Compiled successfully；存在 Taro CSS ordering / `rpx` minimizer warning。

### Known Issues

- M7 媒体/回忆的真实上传与 `health_event_media` 关联仍按阶段边界保留；M6 附件只保证本地持久化元数据，不展示上传完成。
- Taro bundle/CSS warnings 为现有构建警告，不构成 M6 编译失败。
- 工作树中原有的 `apps/client/src/pages/memories/index.module.scss` 删除状态已保留；全量客户端构建若不临时恢复该 M7 文件，会被该范围外缺失文件阻断。

### Status

M6 READY。

## M7 — 媒体平台与回忆（Media Platform / Memories）

**日期：** 2026-09-03

### Changed

- M7 Media Platform & Memories 垂直切片完整交付。
- 本地可靠保存（Local-first Media Preservation）：小程序端在用户选择/拍摄/录制后，先复制至 `USER_DATA_PATH/media/` 目录下持久化，成功后再写 Local Metadata；H5 端优先使用 OPFS (`navigator.storage.getDirectory`)，Fallback 至 IndexedDB Blob，`blob:` URL 仅用于临时预览。只有持久化本地文件成功后，UI 才展示“已保存”状态（遵从 AGENTS.md §30, §31, §32）。
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

- Migrations: `db/migrations/0007_m7_media_memories.sql`、`db/migrations/0008_m7_capsule_favorites.sql`
- 表：`media_files`、`media_uploads`、`media_upload_parts`、`photo_memories`、`photo_memory_media`、`baby_quotes`、`audio_memories`、`first_moments`、`first_moment_media`、`time_capsules`、`time_capsule_media`。

### API / Contract

- Media API：`POST /media/uploads`、`PUT /media/uploads/:uploadId/parts/:partNo`、`GET /media/uploads/:uploadId`、`POST /media/uploads/:uploadId/complete`、`GET /media/:id/content`、`GET /media/:id/thumbnail`。
- Memories API：
  - `GET /babies/:babyId/memories/summary`、`GET /babies/:babyId/memories/on-this-day`
  - `GET /babies/:babyId/memories/favorites`、`GET /babies/:babyId/memories/annual-review`
  - Photos: `GET/POST /babies/:babyId/memories/photos`、`GET/PATCH/DELETE /memories/photos/:id`
  - Quotes: `GET/POST /babies/:babyId/memories/quotes`、`GET/PATCH/DELETE /memories/quotes/:id`
  - Audios: `GET/POST /babies/:babyId/memories/audios`、`GET/PATCH/DELETE /memories/audios/:id`
  - Firsts: `GET/POST /babies/:babyId/memories/firsts`、`GET/PATCH/DELETE /memories/firsts/:id`
  - Capsules: `GET/POST /babies/:babyId/memories/capsules`、`GET/PATCH/DELETE /memories/capsules/:id`、`POST /memories/capsules/:id/seal`、`POST /memories/capsules/:id/open`

### UI / States

- 06.01 回忆博物馆首页已接入统一 AppShell：AppTopBar（菜单/钻石）、AppDrawer、BottomNav（回忆高亮）与全局“留下这一刻”入口，不再渲染为脱离应用上下文的孤立页面。
- 底部 `+` 的照片、声音、宝宝语录会直接进入回忆模块对应的照片表单、录音流程和语录表单；从今天页触发时通过 `action` 深链进入同一模块。
- 06.01 回忆博物馆首页：暖奶油记忆墙、分类统计、Tab 切换、那年今日。
- 06.09–06.13 Inline 音频播放器组件：声音卡片、分类 Tag、自定义 Seek、JIT 麦克风权限说明。
- 06.19–06.21 时光胶囊：`DRAFT` 草稿、`SEALED` 封存锁与倒计时、封存确认 ConfirmDialog、`OPENED` 金色光芒展开卡片。

### Verification

- `pnpm run build:packages`、server `typecheck`/`build`、client `typecheck`：通过。
- `pnpm test`：工作区 36 个测试文件、180 个测试用例全部通过。
  - `media.test.ts`：覆盖分块断点续传、分块合并、Part 校验、SHA256 校验、Range 播放。
  - `memories.test.ts`：覆盖 Photo Memories CRUD、时光胶囊状态机严格转换 (`DRAFT` → `SEALED` → `OPENED`)、`SEALED` 正文修改拒绝。
  - `apps/client/src/api/client.test.ts`：覆盖无 Body 的封存/开启/恢复请求不发送 JSON Content-Type，避免空 JSON 请求被 Fastify 拒绝。
- `pnpm db:check`、`pnpm lint`、`git diff --check`：通过。
- `pnpm --filter @runew/client run build:h5`、`build:weapp`：均 Compiled successfully；保留既有 bundle size、Taro CSS ordering 和 `rpx` minimizer warnings。
- H5 本地真实浏览器验收：在 `375×812`、`390×844`、`430×932` 检查接入 AppShell 后的回忆首页；确认顶部菜单/钻石、左侧抽屉、回忆高亮底部导航、底部 `+` 入口与照片/声音/宝宝语录深链，实际操作 Tab、创建语录、珍藏筛选、胶囊草稿、封存确认与用户主动开启流程，页面层级、暖奶油 Warm Glass、底部操作区和横向筛选均可用。微信开发者工具真机/模拟器截图未纳入本次环境证据。

### Documentation

- DEVELOPMENT_LOG updated: yes

### Status

M7 READY：Media Platform / Memories 代码、API、数据库、可靠保存、上传恢复、媒体鉴权、回忆状态和 H5 视觉验收完成；微信小程序以构建产物完成编译验证。

## M7 UX 收口与应用壳一致性复核

**日期：** 2026-09-04

### Changed

- 回忆模块继续复用应用主壳：顶部菜单、钻石徽标、左侧抽屉和底部导航均保留；移除页面内第二个“新增回忆”入口，改为由底部中央 `+` 进入。
- 底部 `+` 的照片、声音、宝宝语录合并为一个“回忆”入口，再在回忆模块内选择具体记录类型，减少入口认知负担。
- 今天 / 记录 / 回忆 / 小家在根壳内切换；外部主模块回到根壳时使用统一 `?tab=` URL，避免再次打开一个脱离应用上下文的回忆页。
- `AppTopBar` 统一提供吸顶、玻璃材质、滚动收缩和副标题渐隐；修正 `PageShell` 的第二滚动容器，确保标题在页面滚动时仍可见。
- 根壳内嵌回忆页改用页面默认导出，避免微信小程序构建将页面模块误识别为只有 default export，保证 H5 / Weapp 共用同一入口实现。

### UI / States

- 回忆首页改为暖奶油 Warm Glass 记忆墙：统计、引导、横向分类、那年今日、照片 / 语录 / 声音 / 第一次 / 时光胶囊分区和底部中央添加入口保持同一视觉层级。
- 复核抽屉打开、钻石展示、底部 `+` 八项记录入口、回忆类型选择和根壳底部导航切换。

### Verification

- H5 本地真实浏览器 `m7fix`：实际检查 `375×812`、`390×844`、`430×932`；三个尺寸均确认回忆首页、底部导航、中央 `+` 和滚动后收缩标题可用，页面底部内容未被导航遮挡。
- H5 真实交互：回忆 → 今天保持根路由；健康 → 回忆进入根壳 `?tab=memories`；抽屉可打开并显示钻石；中央 `+` 只出现 8 个入口且照片 / 声音 / 宝宝语录只有一个“回忆”入口。
- H5 视觉证据：`.playwright-cli/m7-375-top.png`、`.playwright-cli/m7-375-sticky.png`、`.playwright-cli/m7-390-top.png`、`.playwright-cli/m7-390-sticky.png`、`.playwright-cli/m7-430-top.png`、`.playwright-cli/m7-430-sticky.png`；共享 `AppTopBar` 同时在成长、健康、知识页复核。
- `pnpm test -- --reporter=dot`：37 个测试文件、182 个测试全部通过。
- `pnpm lint`、`pnpm db:check`、`pnpm run build:packages`、server typecheck / build、client typecheck：通过。
- client `build:h5`、`build:weapp`：均 Compiled successfully；保留既有 bundle size、Taro CSS ordering、CSS Modules 和 `rpx` minimizer warnings。
- `git diff --check`：通过。

### Known Issues

- 本次环境没有微信开发者工具真机 / 模拟器运行证据；Weapp 已完成编译验证，媒体设备权限与真实文件系统链路仍需设备验收。
- 构建警告属于当前 Taro / CSS Modules / `rpx` 基线警告，不影响本次编译退出码。

## M8 / M9 继续实施：宝石事务与回归验证

**日期：** 2026-09-05

### Changed

- 保留现有 M8/M9 工作树与 `.claude/`、`.idea/`，未提交、清理或回退其他改动。
- 补录睡眠与其他 Record Create 一致，在同一写事务保存记录、宝石奖励及 Sync Log。
- 离线尿布/辅食 CREATE 在 `/sync/push` 已有的逐操作事务内接入 `awardRecordGem`；Operation 重放不重复奖励，奖励失败时记录与 ACK 一起回滚。
- 兑换幂等键重用时校验原订单的 rewardId 与 redeemedBy；换用另一愿望返回 409，不返回不匹配的旧订单。
- 取消与履约在写事务内重读订单状态，修复“取消读取 WAITING 后另一请求已完成，仍写入退款”的竞态；状态变化同时追加 Sync Log，锁争用返回可重试冲突。
- Reconcile 使用同一事务读取 Ledger 并修复 Cache，避免用旧账本快照覆盖并发写入。
- Scheduler 的宝石对账成功后，通过现有 job lock 持久化 24 小时后的下次执行时间；重启不重复对账，失败保留短锁以便重试，通知扫描仍为每 60 秒。
- `@libsql/client` 从 0.14.0 升级至 0.18.0：独立最小程序证实旧版本抢锁失败后后续事务出现 `cannot commit transaction - SQL statements in progress`，新版本及 API 并发后退款测试恢复正常。依赖安装产生的无关 lockfile 平台元数据变动已还原，仅保留该升级的依赖变更。

### Migrations

- 本轮无新 Schema / Migration；继续使用 `0010_m9_gems.sql` 的不可变账本触发器。

### API / Contracts

- 本轮不新增 endpoint 或修改 payload schema；修正既有 Record Create、sync push、redeem、cancel、fulfill 的事务与幂等行为。
- 保留此前接入的 Gems API、活动家庭解析与客户端页面；这些文件仍在未提交工作树中。

### UI / States

- 本轮未进行 UI 修改与浏览器截图验收，不以构建成功代替视觉或真实交互完成。

### Verification

- `rtk pnpm test`：40 个测试文件、213 个测试通过。
- Gems 集成测试 10 例通过，覆盖活动家庭、Record 奖励、补录睡眠重放、Daily Cap 不阻止记录保存、兑换幂等/异请求冲突、价格修改后订单快照、余额不足、并发余额只够一单、取消/履约竞态、单次退款与缓存校准。
- Sync 集成测试 13 例通过，包括尿布/辅食离线重放只奖励一次、奖励写入故障导致 Record/ACK 回滚及随后安全重试。
- Scheduler 集成测试 9 例通过，包括每日 Reconcile、重启保持调度时间、通知每分钟扫描不变。
- `db/schema.test.ts` 验证账本 UPDATE/DELETE 被 immutable trigger 拒绝。
- `rtk proxy pnpm run typecheck`：全部 workspace 通过。`rtk pnpm typecheck` 曾错误转发成根目录 `tsc` 帮助输出，其退出码 1 未计入通过证据。
- `rtk pnpm lint`、`rtk pnpm db:check`：通过。
- `rtk pnpm build`：packages、server、H5、Weapp 构建通过；最后追加同步修复后再次执行 server build 通过，客户端无新增变动。
- `rtk proxy pnpm install --frozen-lockfile --ignore-scripts`：通过。
- 保留现有 Fastify/Sass/React 测试环境告警及 Taro CSS 顺序、包体积、`rpx/calc` 构建告警；故障注入测试预期触发一次服务器错误日志。

### Known Issues / Next Verification

- M8 的 Diary、Baby Quote、Time Capsule、Health Note 尚未逐项完成统一 Auto Draft 生命周期、Kill 后恢复及 baseVersion 冲突可见处理的端到端验收；Memories 仍有自己的草稿保存路径，不能用 hook 单元测试代替四类表单集成证据。
- PRIVATE 的 API/List 与媒体测试通过，但 Search、Notifications、Logs、Analytics 的完整负向证据仍待补齐；不存在某条调用路径不等于已完成相应隐私验收。
- M9 仍需继续检查完整 Reward Detail / Custom Wish / Waiting / Completed / Cancel / Refund 的前端闭环、请求校验与权限边界、奖励规则展示及所有入口。
- M8/M9 的指定 Frame、卡片/标题/按钮/字体/动画/交互打磨和 375x812、390x844、430x932 实际截图检查仍未执行。微信设备运行也未验收。

### Status

M8 NOT READY；M9 NOT READY。本轮完成的是已列出的后端修复与验证，不是两项 Milestone 的完整交付。

## M8 / M9 继续实施：奖励同步拉取合同与窄屏交互回归

**日期：** 2026-09-05

### Changed

- 奖励详情的操作按钮在窄屏保持横向可读；打开兑换确认弹层时关闭详情 Sheet，避免两个 Overlay 叠加并同时响应。
- `/sync/pull` 的响应合同新增 `REWARD_ORDER` 变更类型。订单仍不是可离线推送的 Pending Operation 实体。
- 客户端拉到订单变更时推进 sync cursor，但不写入仅供五类 Record 实体使用的本地离线缓存；订单页面继续以服务端查询结果为准。

### Verification

- `pnpm vitest run apps/client/src/local/syncEngine.test.ts apps/server/src/modules/gems/gems.test.ts`：15 个测试通过，覆盖兑换/退款后 `/sync/pull` 返回 `REWARD_ORDER`，以及订单事件不污染 Record 缓存但推进 cursor。
- `pnpm test`：41 个测试文件、221 个测试通过。
- `pnpm typecheck`、`pnpm db:check`：通过。
- `pnpm lint`：无错误；`apps/client/src/pages/memories/index.tsx` 保留两条既有 Hook dependency 警告。
- `pnpm --filter @runew/client build:weapp`：Webpack 编译成功；保留既有 CSS Modules、CSS 顺序、`rpx/calc` 与包体积警告。
- `git diff --check`：通过。H5 `http://localhost:8087/` 健康检查返回 200，奖励页面可加载。

### Status

M8 NOT READY；M9 NOT READY。完整 Draft/Privacy 验收、奖励前端状态闭环、375x812/390x844/430x932 截图检查及微信设备验收仍未完成。

## M8 继续实施：高价值回忆草稿与版本保护

**日期：** 2026-09-05

### Changed

- 宝宝语录与时光胶囊详情、更新响应现在返回 `ETag`；更新请求强制要求 `If-Match`。
- Quote / Capsule 服务端更新使用条件 `version` 更新。缺失版本返回 `VALIDATION_ERROR`，陈旧版本返回 `ENTITY_VERSION_CONFLICT`，避免高价值正文静默覆盖。
- 回忆页草稿键改为用户、家庭、宝宝和实体级；编辑 Quote / Draft Capsule 时保存 `baseVersion`，恢复前会校验当前版本。
- 草稿版本过期或保存时收到版本冲突后，页面禁用保存并提供“丢弃草稿并查看最新版本”，不会用旧内容覆盖服务端内容。
- 宝宝语录的即时珍藏操作同样发送当前实体版本。

### Verification

- `rtk pnpm vitest run apps/server/src/modules/memories/memories.test.ts`：8 个测试通过，新增 Quote / Capsule 的详情 ETag、缺失 `If-Match`、正常更新与陈旧版本冲突覆盖。
- `rtk pnpm typecheck`、`rtk pnpm lint`、`rtk git diff --check`：通过。
- `rtk pnpm --filter @runew/client build:weapp`：编译成功；保留既有 CSS Modules、CSS 顺序、`rpx/calc` 和包体积警告。

### Status

M8 NOT READY；本轮只完成 Diary、Baby Quote、Time Capsule 的版本保护与回忆页 Quote / Capsule 草稿接入，仍缺少四类表单的 Kill 后恢复、隐私完整负向路径及 375x812、390x844、430x932 实际截图验收。

## M8 / M9 继续实施：本地 H5 验收与工程门禁

**日期：** 2026-09-05

### Changed

- 修复 M9 奖励页视觉映射在严格索引访问下可能返回 `undefined` 的类型错误；未知插图键统一降级为默认愿望视觉。
- 将 Pino 脱敏字段改为兼容 Fastify 日志配置的可变数组，并明确 Fastify 使用 Node 默认 HTTP 服务器泛型，消除 HTTP/2 推导与认证 Hook 类型不匹配。
- 本地 H5 新建账户验收：Diary 草稿刷新后仍可恢复；新建 Diary 默认 PRIVATE，隐私可见性页面可用；宝石余额不足时兑换不可提交，自定义愿望、确认、等待兑现与已完成订单状态均可交互。

### UI / States

- 已保存本地 H5 视觉证据：`output/playwright/m8-mom-375-home.png`、`output/playwright/m8-mom-430-home.png`、`output/playwright/m8-visibility-375.png`、`output/playwright/m9-gems-375x812-final.png`、`output/playwright/m9-gems-390x844-final.png`、`output/playwright/m9-gems-430x932-final.png` 与 `output/playwright/m9-orders-390-actions.png`。

### Verification

- `rtk proxy pnpm typecheck`：全部 workspace 通过；不使用会错误代理为根目录 `tsc` 帮助输出的 `rtk pnpm typecheck` 作为证据。
- `rtk pnpm test`：41 个测试文件、228 个测试通过。
- `rtk pnpm lint`、`rtk pnpm db:check`、`rtk git diff --check`：通过。
- `rtk pnpm --filter @runew/client build:h5`、`rtk pnpm --filter @runew/client build:weapp`：串行编译成功。
- H5 保留既有包体积告警；Weapp 保留既有 CSS Modules、样式顺序、`rpx/calc` 与包体积告警。测试仍会输出现有 Fastify `requestIdLogLabel` 弃用、故障注入日志、React `act`/DOM 属性与 Sass legacy API 警告，均未影响退出码。

### Known Issues / Next Verification

- Playwright 在 Taro `textarea` 执行 `fill` 后仍出现两条浏览器控制台错误；本轮草稿功能可实际恢复，但该控制台问题尚未单独定位。
- 仍缺失微信真机、完整 Draft/Privacy 负向路径、Search/Notifications/Logs/Analytics 隐私路径及所有 M8/M9 指定状态的端到端验收。

### Status

M8 NOT READY；M9 NOT READY。已补齐本地 H5 交互与工程门禁证据，不代表完成真机或完整隐私验收。

## M8 继续实施：健康笔记草稿冲突保护

**日期：** 2026-09-05

### Changed

- Health Note 编辑草稿现在使用现有 `baseVersion` 冲突信号：草稿版本落后于服务端版本时，表单显示可访问的冲突提示并禁用保存，避免旧备注静默覆盖新内容。
- 用户可选择“丢弃草稿并查看最新版本”；草稿清除后表单恢复当前服务端备注，才允许继续编辑和保存。
- 新增 `HealthEventForm` 组件测试，覆盖冲突提示、保存阻止和丢弃草稿后的恢复路径。

### Verification

- `rtk pnpm exec vitest run apps/client/src/components/health/HealthForms.test.tsx apps/client/src/hooks/useAutoDraft.test.ts apps/server/src/modules/mom/mom.test.ts`：3 个文件、27 个测试通过。
- `mom.test.ts` 覆盖 PRIVATE Diary 的 list/search/direct/media 与日志字段脱敏边界。

### Status

M8 NOT READY；本次仅关闭 Health Note 草稿冲突可见与提交保护缺口，微信真机、所有 M8 隐私/草稿端到端路径及其余 M9 验收仍未完成。

## M9 继续实施：宝石屋页面闭环与空目录补种

**日期：** 2026-09-05

### Changed

- 宝石屋补回 `PageShell` 底栏留白、`BottomNav` 与抽屉。中间 `+` 回到「今天」留下记录，不做成商城结算。
- 旧家庭若还没有愿望行，`GET /rewards` 会补种默认目录（含奶茶、小花、休息、玩具、晚餐、写真）；已有记录（含下架）不重复插入。
- 愿望卡整卡可点，用插画色井和宝石价格胶囊代替挤在窄卡里的「查看详情」按钮。
- 补齐目录 / 我的愿望 / 账本的加载、错误、空状态；详情 Sheet、兑换确认、取消退款确认、完成确认、账本流水详情（15.37）。
- 余额不足时引导去留下记录，不使用下单/秒杀文案。

### Database

- none

### API / Contract

- `GET /rewards` 对空目录家庭有一次幂等补种，不改 payload schema。

### UI / States

- 08.01 目录、08.02 详情、08.03 兑换确认、08.04/08.05/08.06 愿望进度、08.07 账本、08.08 定制愿望、08.09 取消确认。
- 底栏五热区重新可见。

### Verification

- `pnpm exec vitest run apps/client/src/pages/gems/gemsVisual.test.ts apps/client/src/pages/gems/index.test.tsx apps/server/src/modules/gems/gems.test.ts`：16 个测试通过。
- `pnpm --filter @runew/client typecheck`、`pnpm --filter @runew/server typecheck`：通过。
- `pnpm exec eslint apps/client/src/pages/gems`：通过。
- 375/390/430 实机截图本轮未跑。

### Known Issues

- 正在跑的旧 Node 进程不会自动加载服务端补种逻辑，空目录家庭需重启后端后再打开宝石屋。
- 微信真机与指定 Frame 的完整视觉验收仍未做。

### Status

M9 NOT READY。账本后端与页面主闭环已接上，视觉三宽度截图与真机验收仍缺。

## M9 继续实施：宝石屋三宽度视觉验收

**日期：** 2026-09-05

### Changed

- 定制愿望的插画标记改为 4 列网格，避免第 7 个心愿标记单独掉到下一行。
- 本轮用本地 H5 实拍确认：底栏五热区可见、目录六张愿望卡可点、余额不足走「先去留下记录」、空愿望/空账本文案、定制愿望表单。

### Database

- none

### API / Contract

- none

### UI / States

- 08.01 目录：375 / 390 / 430 均有底栏；卡片用色井 + 宝石胶囊，不再挤「查看详情」。
- 08.02 详情：余额不足显示还差颗数，主按钮为「先去留下记录」。
- 08.06 / 08.07 空状态：无「暂无数据」，可回到目录或去留下记录。
- 08.08 定制愿望：名称 / 说明 / 宝石 / 标记 / 加入目录；375 与 390 标记对齐。

### Verification

- `pnpm exec vitest run apps/client/src/pages/gems/gemsVisual.test.ts apps/client/src/pages/gems/index.test.tsx apps/server/src/modules/gems/gems.test.ts`：16 个测试通过。
- `pnpm --filter @runew/client typecheck`：通过。
- `pnpm exec eslint apps/client/src/pages/gems`：通过。
- H5 截图：`output/playwright/m9-gems-375x812-final.png`、`m9-gems-390x844-final.png`、`m9-gems-430x932-final.png`、`m9-gems-390-detail.png`、`m9-gems-390-orders-empty.png`、`m9-gems-390-ledger-empty.png`、`m9-gems-390-custom.png`、`m9-gems-375-custom.png`。

### Known Issues

- 毛玻璃底栏仍会透出后方卡片文字（与「今天」页相同），不是宝石屋单独做的新材质。
- 微信真机未拍。等待兑现 / 已完成 / 取消确认带底栏的订单态本轮未重拍（本地验收账号宝石为 0）。

### Documentation

- DEVELOPMENT_LOG updated: yes

### Status

M9 NOT READY。H5 三宽度与主状态已有截图证据，真机与带宝石的订单闭环截图仍缺。


## M10 · Family Collaboration 首批垂直切片

**日期：** 2026-09-05

### Changed
- 新增 `family_tasks`、`achievements`、`user_achievements`、`family_anniversaries` Schema 与 0011 migration。
- 新增家庭任务列表/创建/编辑/完成/删除、纪念日创建/列表、成就列表 API；所有路由先校验当前用户 Family membership。
- 小家页改为温暖 Warm Glass 协作工作台：成员头像、邀请入口、共同任务、家庭成就、纪念日卡片；不含贡献排行或父母评分。

### Verification
- `pnpm db:migrate`：通过。
- `pnpm build:packages`：通过。
- server/client typecheck：通过。
- `pnpm exec vitest run apps/server/src/app.test.ts db/schema.test.ts`：8 tests passed。
- 相关 ESLint：通过。

### Status
M10 NOT READY：成员详情/权限编辑/禁用恢复、QR/Link/System Share 邀请交互、离线任务冲突、成就写入与完整 API 负向测试仍需补齐。

## M10 继续：成员权限与邀请交互

**日期：** 2026-09-05

### Changed
- 增加成员详情、权限编辑、成员禁用/恢复 API；管理员操作限制在同一 Family，Owner 不可被停用。
- Disabled 成员沿用 `requireFamilyMembership` 的 ACTIVE 检查，立即失去家庭资源访问。
- 增加成就详情、纪念日更新/删除 API。
- 小家页接入邀请生成、复制邀请 Token、系统分享入口与 72 小时有效提示。
- 增加客户端家庭 API 封装，覆盖邀请、加入、成员、成就、纪念日读取。

### Verification
- `pnpm build:packages`：通过。
- Server / Client typecheck：通过。
- Family 相关 ESLint 与 `git diff --check`：通过。

### Status
M10 NOT READY：仍需补充 QR 真图生成、成员详情 UI/权限编辑 UI、创建/加入家庭完整页面、离线任务持久化与冲突测试、M10 全量 API 负向测试和三宽度视觉截图。
- 新增 `apps/server/src/modules/family/family.test.ts`：验证创建家庭、创建/完成协作任务及无排行字段。
- `pnpm exec vitest run apps/server/src/modules/family/family.test.ts`：1 test passed。

## M10 继续：真实邀请二维码、创建/加入家庭与原子领取

**日期：** 2026-09-06

### Changed
- 邀请二维码改为 `qrcode-generator` 生成的真实 QR，邀请内容为完整可解析的家庭加入链接；H5 使用 Web Share，微信小程序使用 `openType="share"` / `useShareAppMessage`。
- 新增家庭邀请工具：链接生成、Token/链接解析、剪贴板复制与系统分享适配器。
- 新增 `/pages/family/join/index`：支持 Token 加入、无 Token 创建小家、注册/登录、关系选择；成功后按 bootstrap 状态回到家庭或 onboarding。
- `acceptFamilyInvite` 改为条件更新 + SQLite transaction，防止同一邀请并发消费；停用成员不会通过再次接受邀请恢复访问。
- 增加离线家庭任务持久化 Store，并覆盖家庭隔离测试。

### Verification
- `pnpm build:packages`：通过。
- Server / Client typecheck：通过。
- `pnpm exec eslint`（M10 相关目录）：通过。
- `pnpm exec vitest run apps/server/src/modules/family/invites.test.ts apps/server/src/modules/family/family.test.ts apps/client/src/utils/familyInvite.test.ts`：8 tests passed（并发测试包含 SQLite BUSY 领域映射）。
- `pnpm --filter @runew/client build:h5`：构建成功；Webpack 有既有 bundle size warning。
- 发现 SQLite migration 多语句必须用 statement breakpoint；已修正 `0012_m10_task_fields.sql`，并为现有本地开发库补齐新增列（保留原数据）。

### Status
M10 NOT READY：成员详情/权限编辑 UI、成就与纪念日完整编辑 UI、任务离线同步冲突 UI、微信真机视觉验收、全量 M10 E2E 矩阵仍需完成。

## M10 继续：成员详情、成就与纪念日 UI、任务冲突

**日期：** 2026-09-06

### Changed
- 家庭成员头像现在可打开成员详情，展示关系、角色、状态和资源查看权限；支持逐项切换 VIEW 权限及停用/恢复成员。
- 家庭成就卡片接入真实成就列表与空状态 BottomSheet。
- 家庭纪念日卡片接入创建表单与已有纪念日列表。
- 家庭任务补充重复规则、负责人、家庭经验字段；负责人必须是同一家庭的 ACTIVE 成员。
- 任务 PATCH 支持 `If-Match` 版本校验，冲突返回 `ENTITY_VERSION_CONFLICT`，客户端提供对应 API 封装。

### Verification
- Client / Server typecheck：通过。
- M10 相关 ESLint：通过。
- `pnpm exec vitest run apps/server/src/modules/family apps/client/src/utils/familyInvite.test.ts`：8 tests passed。
- `git diff --check`：通过。

### Status
M10 NOT READY：家庭页面仍需拆分完整成员/任务子路由，补齐任务离线冲突 UI、纪念日编辑/删除 UI、成就授予流程、真实 H5/微信三宽度截图与完整 E2E 矩阵。

## M9 视觉：宝石屋首页收紧与愿望贴纸

**日期：** 2026-09-05

### Changed
- 余额卡从居中大数字 Hero 收成横条钱包：顶栏已有宝石数，首页不再重复放大同一个数字。
- 三视图不再用等宽 `SegmentedControl`（那是日/周/月指标控件）。改为短籤「目录 / 我的 / 账本」，12px 字重、内容贴合，热区仍 ≥48px。
- 愿望卡去掉挤在格子里的说明文案，改成色井 + 独立贴纸插画（奶茶 / 花 / 休息 / 玩具 / 晚餐 / 写真 / 心愿）。结构仍统一，差异来自 Illustration + Tint。
- 详情 Sheet 与定制标记同步使用同一套贴纸。

### Database
- none

### API / Contract
- none

### UI / States
- 08.01 目录首屏：矮钱包条、短籤、贴纸愿望卡。
- 08.02 详情插画与目录贴纸一致。
- 08.08 定制愿望标记改为贴纸缩略图。

### Verification
- `pnpm exec vitest run apps/client/src/pages/gems/gemsVisual.test.ts apps/client/src/pages/gems/index.test.tsx`：5 个测试通过。
- `pnpm --filter @runew/client typecheck`：通过。
- `pnpm exec eslint apps/client/src/pages/gems apps/client/src/assets/illustrations/gems`：通过。
- 本轮 H5 登录态已过期，未重拍 375/390/430。

### Known Issues
- 未更新三宽度截图；真机未拍。

### Documentation
- DEVELOPMENT_LOG updated: yes

### Status
M9 视觉未完成验收截图。行为闭环未改。

## M9 视觉：定制愿望贴纸库

**日期：** 2026-09-06

### Changed
- 定制愿望「小标记」从 7 个扩到 28 个家庭愿望贴纸：吃喝、休息、出门、宝宝、家里、心情。
- 选择格改为满宽 6 列，热区仍 ≥48px。未知 `illustrationKey` 仍回落到心愿。

### Database
- none

### API / Contract
- none。`illustrationKey` 仍为自由字符串。

### UI / States
- 08.08 定制愿望标记库。

### Verification
- `pnpm exec vitest run apps/client/src/pages/gems/gemsVisual.test.ts apps/client/src/pages/gems/index.test.tsx`：6 个测试通过。
- `pnpm --filter @runew/client typecheck`：通过。
- `pnpm exec eslint apps/client/src/pages/gems apps/client/src/assets/illustrations/gems`：通过。

### Status
贴纸库已可点选。三宽度截图仍缺。

## M9 视觉：贴纸标记可预览类型

**日期：** 2026-09-06

### Changed
- 定制愿望 28 个贴纸按「吃喝 / 休息 / 出门 / 宝宝与家 / 心情」分组。
- 鼠标移入或手指按上时，标题下显示「类型 · 名称」，例如「吃喝 · 奶茶」。点选仍是选定标记。
- `rest` 显示名改为「睡觉」，`travel` 改为「旅行」，避免和分组名撞车。默认 6 个目录 key 未改。

### Database
- none

### API / Contract
- none

### UI / States
- 08.08 定制愿望标记库：分组标题 + 即时类型预览。

### Verification
- `pnpm exec vitest run apps/client/src/pages/gems/gemsVisual.test.ts apps/client/src/pages/gems/index.test.tsx`：7 个测试通过。
- `pnpm --filter @runew/client typecheck`：通过。
- `pnpm exec eslint apps/client/src/pages/gems`：通过。
- 未重拍 375/390/430。

### Status
贴纸类型可预览。三宽度截图仍缺。

## M9 视觉：定制愿望 Sheet 可收起

**日期：** 2026-09-06

### Changed
- BottomSheet 限制在视口 88% 内，标题与「收起」固定，正文滚动；高内容不再把关闭区顶出屏幕。
- 定制愿望贴纸改为按类型短籤切换，一次只展示当前类，避免五组贴纸把手机表单撑满。

### Database
- none

### API / Contract
- none

### UI / States
- 全局 BottomSheet：手柄、收起、限高。
- 08.08 定制愿望标记改为类型短籤。

### Verification
- `pnpm exec vitest run apps/client/src/pages/gems/gemsVisual.test.ts apps/client/src/pages/gems/index.test.tsx`：7 个测试通过。
- `pnpm exec eslint apps/client/src/pages/gems apps/client/src/components/overlay`：通过。
- 本轮完整 `pnpm --filter @runew/client typecheck` 被无关的 `FamilyHome.tsx` Task 类型错误挡住；宝石屋与 BottomSheet 文件无新的类型报错。
- 未重拍 375/390/430。

### Status
定制愿望可收起。三宽度截图仍缺。
# M10 家庭协作：纪念日与成就详情客户端闭环（2026-09-06）

- 客户端新增家庭成就详情读取，并在成就列表中打开详情 BottomSheet。
- 家庭纪念日列表接入编辑、删除操作；编辑沿用同一表单，删除后即时更新本地列表。
- 所有请求继续使用当前 `familyId` 路径，由服务端执行家庭成员与权限校验。
- 验证：`pnpm exec tsc -p apps/client/tsconfig.json --noEmit` 通过；ESLint 目标 TS 文件无错误。
# M10 家庭任务：离线读写接入（2026-09-06）

- FamilyHome 断网时从 `familyTaskStore` 恢复当前家庭任务。
- 断网创建/完成任务先写入本地持久存储并即时展示，明确提示待联网同步，不伪造远端成功。
- 验证：Family task store 与 invite QR 定向测试共 3 项通过；FamilyHome/API ESLint 无错误。
- 客户端全量 TypeScript 检查现已通过。
- 完成任务时识别 `ENTITY_VERSION_CONFLICT`，以温和提示 BottomSheet 引导家庭成员重新确认，避免静默覆盖。
- 修复 `0011_m10_family.sql` 缺少 statement breakpoint 导致空库只执行首条语句的问题；Anniversary CRUD 与 Achievement Detail 集成测试现已覆盖并通过。
- 新增家庭成就创建 API 与共享 Contract，集成测试覆盖创建、详情及无排名字段约束；服务端 TypeScript 检查通过。
- FamilyHome 的家庭成就 BottomSheet 已接入创建表单（标题、表情、共同记忆描述），创建后即时加入列表。
- 新增独立 `/pages/family/index` 路由，复用 AppBootstrapGate、PageShell、AppTopBar 与 FamilyHome，家庭协作不再只能通过 Today 内嵌 Tab 访问。
- `rootTabUrl('family')` 与独立页面 BottomNav 已接通，底部“小家”入口现在进入独立 Family 页面并保留返回其他主 Tab 的能力。
- FamilyHome 任务列表补齐编辑、删除入口；编辑使用 `If-Match` 版本控制，冲突继续提示重新确认。
- 离线编辑/删除任务也先写入本地任务存储并即时反馈，避免断网操作丢失；完整 PendingOperation 远端同步仍待接入。
- 修复任务行内编辑/删除按钮事件冒泡，避免操作 CRUD 时误触发任务完成。
- 本地任务仓库新增显式删除标记，离线删除跨应用重启保持生效；对应单元测试已覆盖。
- 家庭成员与任务行补齐 `role`、`aria-label`、完成状态语义，成员详情改为整行可触控。
- Onboarding 欢迎页新增“已有邀请？创建或加入小家”入口，连接现有 Family Join 页面。
- M10 相关回归：服务端 Family/Invite 与客户端离线任务/邀请二维码共 4 个测试文件、11 项测试全部通过。
- 反竞争式育儿静态门禁通过：Family UI/API/Schema 无贡献排行榜或个人评分字段；仅保留测试中的负向断言。
- 最新独立 Family 路由、Onboarding 入口、成就表单与离线任务分支 H5 构建成功；保留既有 bundle 体积警告。
- 纪念日表单补齐可选备注，并支持编辑时回填，完整保留家庭记忆上下文。
- 新增 `user_achievements` 授予 API：校验成就归属当前家庭，重复授予返回已有记录；Family API 集成测试覆盖 201/幂等 200。
- 成就详情 BottomSheet 新增“收下这份共同成就”客户端动作，接入授予 API 并显示成功/失败反馈。
- Disabled 成员详情中的权限编辑行现在标记 `aria-disabled` 并阻止点击，仅保留恢复动作。
- 空库 schema 回归测试 2/2 通过，确认 M10 家庭表迁移链完整可执行。
- 综合回归通过：5 个测试文件、13 项测试覆盖 Family/Invite、成就授予、Anniversary CRUD、离线任务、邀请解析与空库迁移；客户端 TypeScript 检查通过。
- 成就授予接口增加并发唯一冲突回读，避免竞态下返回 500；服务端类型检查与 Family API 测试通过。
- 新增跨家庭成就详情负向测试，确认错误 Family 访问返回 403。
- 成就授予接口补充跨家庭 403 负向测试，确保写入路径同样执行 Family 归属校验。
- FamilyHome 轨道装饰加入轻量漂浮动效，并在 `prefers-reduced-motion: reduce` 下自动停用。
- FamilyHome 监听网络恢复事件，回读并合并远端任务，同时保留本地未同步任务。
- 家庭任务本地仓库新增可重放操作队列（CREATE/UPDATE/DELETE/COMPLETE），离线动作会持久化 operationId、familyId、taskId 与 payload；3 项单元测试通过。
- 家庭任务离线队列接入网络恢复提交：服务端接受客户端任务 ID 并对重复 CREATE 幂等，客户端按序提交后才移除队列。
- 队列提交兼容性回归通过：3 个测试文件、10 项测试，以及客户端/服务端 TypeScript 检查均通过。
- FamilyHome 新增待同步任务数量提示与“重试同步”入口；离线新增、完成、编辑、删除会即时累加，网络恢复逐项成功后扣减并重新从持久队列校准。
- 验证：客户端 TypeScript 检查通过；Family/Invite 与离线任务测试 3 个文件、10 项测试通过。
- Task Complete 纳入 `If-Match` 版本校验并递增任务版本；网络恢复提交沿用离线操作的基线版本，新增旧版本完成请求 409 回归测试。
- 加入小家页面补齐创建/加入模式切换：支持粘贴邀请链接或邀请码、`SYSTEM_NATIVE` 扫码二维码，并保留路由 token 直达加入；邀请输入无效时在本地阻止提交。
- 验证：邀请解析、Family/Invite 集成测试共 9 项通过；客户端 TypeScript 与 Family 页面 ESLint 通过。
- H5 构建最终验证通过（Webpack 编译成功）；保留既有包体积超限警告，未引入新的构建错误。
- 启动临时 H5 开发服务器 `http://localhost:10086/` 做实际页面检查；创建/加入模式与邀请输入在移动视图中无重叠、无横向溢出，检查后已关闭临时服务。
- 家庭任务创建/编辑补齐负责人、日期、重复规则与家庭经验字段；列表显示轻量任务元信息，离线 CREATE/UPDATE 重放保留完整 payload。
- 验证：家庭相关 4 个测试文件、12 项测试通过；客户端 TypeScript、ESLint 与 H5 构建通过。
- Family 任务 API 增加跨家庭负责人校验、跨家庭任务 ID 复用拒绝，以及 PATCH/Complete 的原子版本条件；删除任务回归覆盖完成后的列表为空。
- 服务端 Family 路由 ESLint 通过，Family 测试 7 项通过；全量服务端 TypeScript 仍被既有 `admin/routes.ts` readonly preHandler 类型错误阻挡，非本轮改动引入。
- 修正负责人选择的 ID 映射：客户端现在传递成员对应的 `userId`，与服务端 Family Membership 校验一致，避免合法负责人被误判为跨家庭。
- 验证：客户端 TypeScript、FamilyHome ESLint 与 `git diff --check` 通过。
- 负责人 ID 映射修正后的 H5 构建复验通过（Webpack 编译成功）；仍有既有 bundle 体积超限警告，无新增构建错误。
- 客户端家庭回归复验通过：离线任务仓库 3 项、邀请解析 2 项测试全部通过。
- 微信小程序构建复验通过（`pnpm --filter @runew/client build:weapp`）；保留既有 Taro CSS/rpx、CSS Modules 与 bundle 体积警告，无新增编译错误。
- H5 加入小家页面实际画面复核：创建/加入模式、邀请码输入、扫码入口及主 CTA 在移动画布中无文字重叠或横向溢出。
- M10 综合回归复验通过：5 个测试文件、14 项测试（Family/Invite、空库 schema、离线任务、邀请解析）全部通过；包含停用/恢复与三项反排行断言。
- Family 负向回归加强：明确断言 `mom_score`、`dad_score`、`contribution_rank` 均不存在，并验证成员停用后任务 API 立即返回 403、恢复后恢复访问。
- 验证：客户端 TypeScript、M10 Family 相关 ESLint 与 `git diff --check` 均通过。
- 家庭任务行改为打开详情 BottomSheet，详情内提供共同完成、编辑、删除动作，覆盖 09.08 任务详情状态并避免误触直接完成。
- 任务详情改动后的 H5 构建通过（Webpack 编译成功）；仅保留既有 bundle 体积警告。
- 任务行无障碍语义同步调整：详情入口保留可读标签，移除不再适用的 `aria-pressed` 切换状态。
- Task CRUD UI 补全备注字段：创建/编辑表单、离线实体与联网重放均保留 `note`；客户端 5 项离线/邀请测试通过，H5 构建成功。
- Family CRUD 集成测试新增备注持久化断言：创建与编辑后的 `note` 均正确回读，Family 测试 3 项通过。
- 权限编辑 API 回归补齐：Owner 可更新并读回权限，普通成员被拒绝，真实异家庭成员目标返回 404；Family 相关测试 8 项通过。
- 纪念日列表新增详情 BottomSheet，展示日期/备注并提供编辑、删除入口，覆盖 UI 13.11 状态；H5 构建复验通过。
- 家庭任务与纪念日删除入口统一先打开公共 ConfirmDialog，覆盖 15.12/15.13 删除确认状态；取消不会触发删除 API。
- 删除确认与纪念日详情改动后的 H5 构建成功（Webpack 编译完成）；保留既有 bundle 体积警告。
- 权限回归补充真实异家庭成员目标校验，Owner/Member/跨家庭三类权限编辑路径均有 API 证据；Family 测试 8 项通过。
- 任务详情、纪念日详情及删除确认完成后的微信小程序构建复验通过；仅有既有 Taro CSS/rpx、CSS Modules 与 bundle 警告。
- M10 窄屏样式加固：任务内容允许长中文换行，纪念日/邀请/操作按钮允许换行，减少 375px 宽度下的挤压与横向溢出；H5 构建再次成功。
- 成员权限替换改为 SQLite 短事务（删除旧权限与写入新权限原子完成），Family 路由 ESLint 与 8 项 Family 测试通过。
- 邀请创建改为邀请专用幂等路径：作用域绑定用户与家庭，重放前重新校验活跃成员；`response_json` 仅保存邀请元数据，token 由服务端密钥稳定派生，不落库明文；并发同键只生成一条邀请。邀请测试 8 项、相关 ESLint 与 server TypeScript 检查通过。
- 家庭任务更新禁止请求体修改 `id` 主键；任务/离线同步允许 `note: null`，可真正清空备注。Family 测试 3 项与 Invite 测试 8 项通过。
- 本轮验证：相关 ESLint、server/client TypeScript、Family/Invite 回归与 `git diff --check` 均通过；仍缺完整设备与端到端证据，未将 M10 标记为 READY。
- 客户端全量 TypeScript 复验已通过，H5 生产构建成功（保留既有 bundle 体积警告）；Family/Invite 11 项服务端回归与客户端家庭存储/邀请 5 项测试通过。
- 在线拉取的家庭任务现在写入无待同步标记的本地实体缓存，断网或重启后可恢复最近任务；离线存储新增缓存回归，4 项测试、客户端 ESLint/TypeScript 通过。
- 家庭协作一致性补强：重复任务 ID 携带不同内容返回 409，重复完成保持原版本，纪念日拒绝不存在的日历日期；M10 窄测 17 项与 server/client TypeScript 复验通过。
- 任务与纪念日删除改为目标不存在时返回 `NOT_FOUND`，避免离线重放误报成功；对应 Family 回归已覆盖。
- 家庭任务离线队列加入模块内串行写入，避免并发新增/删除的读改写互相覆盖；队列测试扩展至 5 项并通过。
- 最终窄测复验：4 个 M10 测试文件、18 项测试全部通过；Server/Client TypeScript 与 `git diff --check` 通过。
- 任务/纪念日删除增加真实目标存在性检查：不存在时返回 `NOT_FOUND`，并补充重复删除回归；家庭协作窄测继续通过。
- 数据库迁移前漂移修复通过实际服务库副本验证：副本迁移成功，`search_documents.capsule_state` 已补齐，迁移记录 17 条；原服务库未直接修改。
- Family 权限边界补强：新增服务端 `requireFamilyPermission`，先校验 ACTIVE membership，再按 `resource + action` 应用显式 `DENY` 覆盖；家庭详情、成员列表、宝宝列表/创建、邀请创建及任务、成就、纪念日读写均接入策略检查，停用成员仍即时失去访问。成员详情开关改为写入显式拒绝，补充 VIEW/CREATE/MANAGE 负向回归，Family/Invite 12 项通过。
- 权限接入后的 H5 生产构建成功；保留既有 bundle 体积警告。Server/Client/DB 全量 TypeScript 复验通过。
- Family 任务与纪念日日期字段改用公共 `GlassDateField`（Taro `Picker`），避免手输非法日期并支持未来纪念日；客户端类型、Lint、本地任务/邀请测试与 H5 构建通过。
- 家庭创建/加入页补齐 `GRANDPARENT` 关系选项，客户端 TypeScript、Family 页面 ESLint 与差异检查通过。
- Family 在线任务创建统一生成稳定 `taskId + operationId`，请求携带 `Idempotency-Key`；网络/可重试错误会落本地并进入同步队列，重放复用同一 ID，补充客户端幂等请求回归测试。
- Family 服务端任务回归改为首请求与重试都携带同一任务 ID/幂等键，确认客户端重放形态仍返回同一任务；Family 测试、Server TypeScript 与 ESLint 通过。
- 本轮最终验证：`rtk pnpm test` 全量 50 个测试文件 / 281 个测试通过；H5 与 Weapp 均编译成功，保留既有构建告警。
- H5 空白页根因定位：Taro 4.0.9 的 Terser 默认 `quote_keys: true` 会把依赖私有字段压成非法的 `#"e"` 语法；改为仅覆盖 `h5.terser.config.output.quote_keys = false`，恢复生产 JS/CSS 压缩，不再全局关闭 Terser。新增私有字段产物执行回归，H5 25 个 JS 文件全部通过 `vm.Script` 解析。
- 本轮全量复验：52 个测试文件 / 284 个测试通过，客户端 TypeScript 通过，H5 生产构建成功（保留 bundle 体积警告）；浏览器视觉复验此前因自动审批服务 429 暂停，M10 仍未标记 READY。
- 家庭任务离线检测与恢复改用统一 `platformAdapters.network`，同时覆盖 H5 与微信小程序的初始断网、网络恢复和任务创建/编辑/删除路径；不再在 Family 页面散落 `navigator.onLine` 或仅监听 `window.online`。
- Family Task 生命周期补齐：新增 `status`（`OPEN` / `COMPLETED` / `DELETED`）与 `deleted_at` 字段及活动任务索引；删除改为带版本递增的软删除，普通列表、编辑和完成路径过滤已删除任务，保留协作记录。空库迁移、删除后状态回读与全量回归通过。
- 家庭纪念日提醒补齐：Scheduler 按家庭成员 ACTIVE 状态和 `anniversariesEnabled` 偏好生成下一次年度提醒，派发前再次校验成员与纪念日归属；通知使用 `FAMILY_ANNIVERSARY` 目标和共同记忆文案，唯一索引与 Job Lock 保证重跑不重复。新增真实 API + Scheduler 集成测试通过。

## M5 知识种子：0–12 个月分类覆盖（2026-09-06）

- `db/scripts/seed-knowledge.ts` 从 12 篇扩到 32 篇：8 个分类各 4 段重叠月龄窗（0–119 / 90–209 / 180–299 / 270–400 天），写入前校验 0–365 天每天每类至少一篇。
- 内容边界保持科普、不写诊断；满 12 个月前蜂蜜、仰睡空床、洗澡一臂看护等硬规则写进对应窗。
- 种子默认写入正在跑的 `apps/server/data/runew.db`（不再只写仓库根 `data/runew.db`）。
- `pnpm db:seed:knowledge`：32 篇 PUBLISHED 入库。5 个月 15 天（约 165 天）命中 8 篇。

## M5 知识详情 / 收藏 / 搜索视觉与切换（2026-09-06）

- 详情 / 搜索 / 收藏从页面抽到 `KnowledgeViews`，样式回到 `Knowledge.module.scss`。此前页面引用 `index.module.scss`，标题字重、分类色点、毛玻璃操作全部丢失，看起来像纯文字列表。
- 详情改为阅读英雄卡 + 来源/月龄/版本玻璃芯片 + 2×2 着色玻璃操作盘（学到了 / 收藏 / 稍后看 / 更多），顶栏用分类名 + 月龄。
- 收藏 Tab 不再 `redirectTo` 整页重挂；Tab 条在 loading 时保持挂载。库列表改走真实 `sourceName` / 月龄，不再写空来源。
- 搜索页增加辅食 / 睡眠 / 出牙 / 发育快捷词，主按钮带搜索图标。
- 契约 `knowledgeLibraryResponseSchema` 兼容扩展 `sourceName`、`minAgeDays`、`maxAgeDays`。

## H5 开发：实时通道与热更新 WebSocket 抢路（2026-09-06）

- webpack-dev-server 4 默认 HMR 也走 `/ws`，与产品实时通道（Tech Design §57.1）撞车，控制台出现 `Invalid frame header` 并不断重连。
- H5 开发服务器把热更新改到 `/__webpack_hmr`；`/ws` 只代理到 Fastify。产品路径不变。

## 视觉统一：CuteIconChip + 家庭页（2026-09-06）

- 补齐规格里的 `CuteIconChip`：双层玻璃气泡 + sparkle/sprout，默认 48px，快捷磁贴仍用 40px `sm`。
- `QuickTile` / `ChoiceCard` / `EmptyState` / `ErrorState` 改用同一颗芯片；错误态改盾牌，不再和空状态共用同一颗星。
- Toast 改暖玻璃；BottomSheet / ConfirmDialog 增加 160–260ms 进入动效，并接夜间 token。夜间主题本身已挂在 `html[data-theme]`，本轮不再另接 PageShell。
- 家庭页去掉英文 kicker、手写 hex 和功能 Emoji；区块改 `SectionHeader`，输入改 `GlassInput` / `GlassDateField`，成员头像与成就记号改芯片。
- 加入小家改走 `AuthScreen` + `SegmentedControl` + 与引导页同一套 `ChoiceCard` 身份卡。
- 验证：客户端 TypeScript 通过；ESLint 目标文件无错误；design-system / 知识视图 / 宝石视觉 / 家庭邀请与离线任务共 5 个测试文件、30 项通过。未重拍 375/390/430。
