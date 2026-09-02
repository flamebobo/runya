# 🌱 润芽 · RUNEW — CODEX_TASKS.md

> **文档类型：** Codex / Cursor Staged Construction Tasks  
> **配套文档：** `PRD_RUNEW_V3.0.md`、`UI_IMPLEMENTATION_SPEC.md`、`TECHNICAL_DESIGN.md`、`IMPLEMENTATION_PLAN.md`  
> **使用方式：** 一次只执行一个 Milestone Task。任务完成、测试通过、人工/截图验收后，才开始下一个任务。  
> **禁止：** 将本文件全部一次性粘给 Codex 并要求“一次做完”。

---

# 0. Codex 总执行规则

每次任务开始前，Codex 必须：

1. 阅读仓库根目录 `AGENTS.md`；
2. 查找并阅读与 UI / 产品实现相关的 Skill；如仓库存在 `mottpock/SKILL.md`，必须先阅读；
3. 阅读 `docs/PRD_RUNEW_V3.0.md`；
4. 阅读 `docs/UI_IMPLEMENTATION_SPEC.md` 对应模块；
5. 阅读 `docs/TECHNICAL_DESIGN.md` 对应模块；
6. 阅读 `docs/IMPLEMENTATION_PLAN.md` 当前 Milestone；
7. 阅读现有代码，不得假设项目还是空仓；
8. 先输出一个简短 Implementation Plan，再修改代码；
9. 优先复用已有 Component / Service / Repository；
10. 完成后运行 typecheck、lint、tests、build；
11. 更新 `docs/DEVELOPMENT_LOG.md`；
12. 只报告真实完成内容、未完成内容和测试结果。

若 Figma 可通过当前开发环境访问，必须对照 `11 R6.2 Mobile Complete`；如果无法访问，不得凭空修改设计规格，应以 `UI_IMPLEMENTATION_SPEC.md` 为 Design-to-Code 事实源。

---

# 1. 所有 Task 通用约束

## 1.1 不允许做的事

Codex 不得：

- 修改 PRD 来适配自己的实现；
- 创建与 UI Spec 冲突的新 Route；
- 为每张 Figma Frame 建一个页面；
- 在页面内部直接写重复 Glass Style；
- 把所有业务状态塞进一个巨型 Zustand Store；
- 用 `any` 绕过 Contract；
- 用 Mock 数据伪装功能完成；
- 在 API 中信任客户端传入 `created_by`；
- 用前端隐藏代替权限；
- 以 Last-write-wins 覆盖重要冲突；
- 让 Timer 依赖页面持续运行；
- 把图片 Base64 写 SQLite；
- 把 Admin 密码放前端；
- 直接修改 Gem Balance 而没有 Transaction；
- 删除媒体失败后要求用户重新拍/录；
- 跳过 Migration；
- 跳过测试并说“应该能工作”。

## 1.2 每次 Task 完成格式

最终报告必须包含：

```text
1. Changed
2. Database migrations
3. API/contracts
4. UI/screens/states
5. Tests executed + exact result
6. Build/typecheck/lint result
7. Known issues
8. DEVELOPMENT_LOG update
9. Ready / Not Ready for next milestone
```

如果有测试失败，不得声明 Milestone Completed。

---

# 2. TASK 00 — Repository Preflight Audit

将下面整段交给 Codex：

```text
你现在负责润芽 RUNEW 的正式开发施工前审计。不要直接大规模修改代码。

请先完整阅读：
- AGENTS.md
- 仓库中相关 Skill；如存在 mottpock/SKILL.md 必须阅读
- docs/PRD_RUNEW_V3.0.md
- docs/UI_IMPLEMENTATION_SPEC.md
- docs/TECHNICAL_DESIGN.md
- docs/IMPLEMENTATION_PLAN.md

然后审计当前仓库，输出并保存 `docs/IMPLEMENTATION_BASELINE.md`，内容至少包括：
1. 当前目录结构；
2. 当前前端技术栈与版本；
3. 当前后端技术栈与版本；
4. 当前数据库、Schema、Migration 情况；
5. 已实现的页面/Route；
6. 已实现公共 UI Component；
7. 已实现 API；
8. Auth/Family/Baby 状态；
9. Offline/Sync 是否已有实现；
10. Media 是否已有可靠持久化；
11. Admin 是否已有实现；
12. Backup/Deploy 是否已有实现；
13. 当前 test/lint/typecheck/build 命令；
14. 与四份事实文档之间的主要 Gap；
15. 需要保留、重构、删除的现有代码；
16. 当前最大的 P0 技术风险。

不要因为现有代码与文档不一致而立即推翻全部代码。先判断哪些能复用。
运行现有 typecheck/lint/test/build 并记录结果。
最后只提交审计文档和必要的非侵入性修复，不开始 M0 大开发。
```

### Task 00 Exit

必须有：

```text
docs/IMPLEMENTATION_BASELINE.md
```

并确认项目真实现状。

---

# 3. TASK M0 — Foundations

```text
执行 RUNEW M0 Foundations。严格限制范围在基础设施、Design System、Server/DB Foundation，不开始业务模块开发。

先阅读事实源与 `IMPLEMENTATION_BASELINE.md`，复用已有正确代码。

目标：

A. Repository
- 确认/建立 apps/client、apps/server、packages/contracts、packages/domain-types、packages/validation、packages/shared-utils、db/schema、db/migrations；
- TypeScript strict；
- pnpm scripts；
- ESLint/format；
- .env.example；
- CI baseline。

B. Server
- Fastify bootstrap；
- Pino structured logger；
- requestId；
- unified error envelope；
- config loader；
- CORS/security header baseline；
- SQLite + Drizzle；
- PRAGMA foreign_keys=ON、journal_mode=WAL、busy_timeout；
- /health/live；
- /health/ready。

C. Contracts
建立共享：
- API success envelope；
- error envelope；
- ULID validator；
- UTC milliseconds；
- Cursor pagination；
- ETag / If-Match helper；
- Idempotency-Key helper。

D. Client
- Taro + React + TS；
- Zustand；
- TanStack Query；
- API client；
- PageShell；
- theme；
- Safe Area；
- error boundary；
- platform adapters skeleton。

E. UI Design System
必须从 UI_IMPLEMENTATION_SPEC 真实实现：
PageShell
GlassSurface
SectionHeader
AppTopBar
RoundIconButton
GemBadge
BottomNav
AppDrawer
PrimaryActionButton
SecondaryGlassButton
IconActionButton
DangerButton
GlassInput
GlassTextArea
SegmentedControl
FilterChip
BottomSheet
ConfirmDialog
Toast
Skeleton
EmptyState
ErrorState
OfflineBanner

不得每个页面单独重新声明 glass token。

F. DB
建立 system_metadata 以及 Identity/Family/Baby 所需的基础 Schema/Migration。

G. Tests
- server boot；
- health；
- SQLite WAL；
- FK；
- empty DB migration；
- Design System smoke；
- client/server build。

完成后：
- 更新 docs/DEVELOPMENT_LOG.md；
- 输出 migration 文件；
- 运行 pnpm typecheck/lint/test/build；
- 不开始 Auth UI。
```

---

# 4. TASK M1 — Auth / Family / Baby / Shell

```text
执行 RUNEW M1，只完成 Auth、Family、Baby、Onboarding 和 App Shell。不要进入日常记录业务。

必须基于现有 M0 Component，不复制视觉系统。

Backend：
1. users/user_auth_credentials/user_sessions/devices；
2. families/family_members/family_member_permissions/family_invites baseline；
3. babies；
4. Argon2id user password；
5. opaque user session，DB 只保存 token hash；
6. H5 Cookie + CSRF/Origin；
7. Mini Program Bearer session；
8. family member ACTIVE policy；
9. baby-family ownership validation；
10. /auth/register /login /logout /me /bootstrap；
11. family/baby CRUD 当前 P0 所需接口。

Frontend：
1. 00.01 登录；
2. 00.02 注册；
3. Onboarding Wizard：welcome → baby → identity → topics；
4. Today 空 Shell 跳转；
5. AppDrawer 11 个普通菜单；
6. 管理模式是独立入口，不计入 11 菜单；
7. BottomNav：今天 / 记录 / + / 回忆 / 小家；
8. Current Family / Current Baby context；
9. 一个宝宝时隐藏宝宝切换。

状态：
loading、auth error、field error、session expired、first-run、family missing、baby missing。

测试：
- register/login/logout；
- password invalid；
- disabled user；
- revoked/expired session；
- user A 不可读 family B；
- baby family mismatch denied；
- onboarding bootstrap；
- 375/390/430。

完成后更新 DEVELOPMENT_LOG。
不要实现 Records。
```

---

# 5. TASK M2 — Today / Daily Records / Timer

```text
执行 RUNEW M2。目标是完成第一个真正可长期使用的 Vertical Slice：Today + Daily Records + Timer。

Schema/Migration：
feeding_records
feeding_segments
sleep_records
diaper_records
food_records
必须包含 Tech Design 规定的 family_id、baby_id、created_by、updated_by、version、deleted_at、UTC timestamp。
Sleep 必须实现每宝宝最多一个 RUNNING 的约束。

Backend：
- unified records timeline；
- bottle feeding CRUD；
- breast feeding start/switch/pause/resume/finish；
- sleep start/finish/edit/delete；
- diaper CRUD；
- food CRUD；
- Today summary；
- running timer bootstrap；
- version + ETag；
- Idempotency-Key；
- Soft Delete；
- created_by / updated_by 从 Auth Context 注入。

Timer：
禁止使用前台累计值作为业务真相。
elapsed = now - started_at - paused segments。
必须支持后台/锁屏/重开恢复。

Frontend：
实现 UI Spec/Figma 的：
- 01.01 Today；
- SleepRunning；
- FeedingRunning；
- Today summary；
- recent timeline；
- 02 Daily Records；
- filter/date；
- bottle；
- breast timer；
- sleep；
- diaper；
- food；
- record detail/edit/delete。
Inline State 不创建多余 route。

不要在此阶段用临时 gem balance hack。宝石正式处理在 M9。

Tests：
- all CRUD；
- timeline order；
- ETag conflict baseline；
- sleep running unique；
- breast segments；
- cross-midnight；
- background timer；
- soft delete；
- permission；
- 375/390/430 screenshot。

必须真实从 UI 创建数据到 SQLite。
```

---

# 6. TASK M3 — Offline Sync / Conflict / Duplicate

```text
执行 RUNEW M3。此任务是 P0 可靠性的核心，不要跳过测试。

Client：
建立统一 LocalRepository：
- LocalEntityStore；
- PendingOperationStore；
- DraftStore base；
- SyncCursorStore；
- DeviceId。
H5 使用 IndexedDB；Mini Program 使用 Taro storage/FileSystem abstraction。
禁止 localStorage 巨型 JSON 和 Base64 媒体。

PendingOperation 支持 CREATE/UPDATE/DELETE/RESTORE，保存 operationId、baseVersion、baseSnapshot、patch/fullPayload、changedFields、retryCount、clientCreatedAt。

Server：
- sync_operations；
- POST /sync/push；
- GET /sync/pull；
- GET /sync/snapshot；
- sync_epoch；
- operation idempotency；
- batch limit；
- cursor。

Conflict：
实现 Tech Design 三方比较：
- 非重叠字段自动 merge；
- 重叠字段返回 Conflict；
- delete vs offline update 不静默处理；
- restore；
- FULL_RESYNC_REQUIRED。
禁止 Last-write-wins。

Duplicate：
实现 duplicate_candidates；
按 same family/baby/type/time-window 检测；
UI 允许 Merge / Keep Both；
不能静默删除。

UI：
OfflineBanner、SyncBadge、Pending count、Retry、Conflict dialog、DuplicateRecordDialog。

Realtime：
至少完成 foreground pull + polling fallback。
如果实现 WebSocket，只发送 sync_hint，不让 WebSocket 成为一致性来源。

必须自动测试：
1. 飞行模式创建尿布；
2. 杀 App；
3. 重开，记录还在；
4. 恢复网络；
5. 服务端只产生一条；
6. same operation retry 不重复；
7. A 改 note、B 改 amount 可 merge；
8. A/B 同改 amount 产生 conflict；
9. delete vs offline update；
10. full resync 保留 pending；
11. duplicate merge/keep both。

任何一项不通过不得完成 M3。
```

---

# 7. TASK M4 — Growth

```text
执行 RUNEW M4 Growth，不修改已完成 Sync Contract。

Schema：
growth_records
milestones

Backend：
- growth CRUD；
- latest metrics；
- height/weight/head trend；
- milestones CRUD；
- monthly base story；
- raw records 与 statistics 分离；
- Sync/Version/Soft Delete 复用 M3。

Frontend：
实现 03.xx：
- Growth main；
- height/weight/head segmented state；
- trend chart；
- record growth；
- detail/edit/delete；
- milestones；
- milestone detail；
- monthly story。
ECharts 必须提供数字信息，不仅靠颜色。

状态：
loading/empty/error/offline/success/deleted/restorable。

测试：
- partial metric；
- ordering；
- edit；
- delete/restore；
- offline；
- conflict；
- chart data；
- monthly summary。
```

---

# 8. TASK M5 — Knowledge

```text
执行 RUNEW M5 Knowledge。

Schema：
knowledge
knowledge_user_states

Backend：
- published list；
- age/category filter；
- detail；
- source/review/version；
- recommendation；
- favorite；
- later；
- learned；
- dismissed；
- feedback。

核心逻辑必须严格：
learned_version == current content_version → 当前版本不重复推荐；
current content_version > learned_version → 可重新出现“内容有更新”。

Frontend：
实现 Knowledge home、category、search、detail、library、source、learned transition、updated state、more sheet。
不要把教育内容做成医疗诊断。

测试：
- min/max age boundary；
- learned current version；
- updated version；
- dismissed；
- favorite/later；
- OFFLINE article 不进入普通用户列表；
- source metadata。
```

---

# 9. TASK M6 — Health / Notifications

```text
执行 RUNEW M6 Health + Notification Foundation。

Schema：
health_events
health_reminders
health_event_media
notification_preferences
notifications
scheduled_notifications
job_locks

Backend：
- health CRUD；
- event timeline/calendar；
- reminders；
- complete/cancel；
- scheduler 60s baseline；
- in-app notifications；
- notification read；
- DND；
- notification deep link target。

DND 默认建议 21:00–08:00。
禁止压力型“今天没记录”提醒。
健康模块只做事项和提醒，不做诊断。

Frontend：
Health home、calendar、next event、list、detail、edit、reminder sheet、notification center、notification settings、DND。
附件入口接 Media abstraction；如果 M7 Media 尚未完成，必须使用明确 adapter contract，不做假上传成功。

测试：
- reminder schedule/reschedule/cancel；
- DND；
- scheduler restart idempotency；
- expired/completed；
- notification read；
- permission；
- offline edit；
- no diagnosis text generated by system。
```

---

# 10. TASK M7 — Media / Memories

```text
执行 RUNEW M7。先完成 Media Reliability，再做 Memories UI。

Schema：
media_files
media_uploads
media_upload_parts
photo_memories
photo_memory_media
baby_quotes
audio_memories
first_moments
first_moment_media
time_capsules
time_capsule_media

Client Media：
Mini Program：系统临时文件必须先复制到 USER_DATA_PATH；
H5：优先 OPFS，fallback IndexedDB Blob；
只有 durable local copy 完成才标记“已安全保存”。

Upload：
POST init；
4 MiB chunk；
part hash；
query upload；
resume；
complete；
size/hash；
atomic rename；
PROCESSING → READY；
retry queue。

Server：
image validate + display ~1600px + thumbnail ~400px；
audio AAC/Opus metadata + duration + Range；
SQLite 不存 Binary。

Memories：
photo；
quote + optional baby audio；
audio memories/player；
first moments；
time capsules；
favorites；
on-this-day；
annual review。

Capsule：
严格 DRAFT → SEALED → OPENED；
SEALED 后普通编辑返回错误；
open 必须达到 open_at 且用户显式打开。

必须测试：
- 拍照/录音后杀 App，本地文件仍在；
- 上传中断/重启恢复；
- part retry idempotent；
- server processing failure 原文件仍在；
- photo/audio delete+restore；
- capsule invalid transition。
```

---

# 11. TASK M8 — Mom / Privacy / Draft

```text
执行 RUNEW M8。

Schema：
moods
diaries

Backend：
- mood CRUD；
- diary CRUD；
- visibility PRIVATE/FAMILY；
- owner policy；
- PRIVATE direct API deny；
- PRIVATE search deny；
- PRIVATE media inheritance；
- audit/log 不记录正文。

Frontend：
Mom home；
MoodPicker；
Mood Calendar；
Diary list/detail/editor；
Visibility Sheet；
Draft Recovery。

Draft：
至少接入 diary、baby quote、capsule、health note；
500–1000ms debounce；
onBlur；
onAppHide；
route leave；
baseVersion；
draft/server conflict 提示。

安全自动测试：
- 妈妈 PRIVATE diary；
- 爸爸列表看不到；
- search 看不到；
- direct ID denied；
- 日志不含 body；
- analytics 不含 body。
```

---

# 12. TASK M9 — Gems

```text
执行 RUNEW M9 Gems。Gem 是账本系统，不是简单 UI 数字。

Schema：
gem_rules
gem_transactions
rewards
reward_orders

必须：
gem_transactions immutable；
family balance cache 可由 ledger 校验；
所有自动奖励 idempotent；
记录创建重试不得重复发宝石。

Backend：
- gem rules；
- daily reward cap；
- reward on record；
- ledger；
- balance；
- reward list/detail；
- redeem；
- waiting；
- fulfill；
- cancel/refund；
- custom reward；
- reconcile。

Transaction：
record+reward；
redeem+debit+order；
cancel+refund；
必须原子。

Frontend：
Gem home、balance、ledger、reward list/detail、redeem dialog、orders、custom wish、fulfill/cancel state。

测试：
- same create retry no double reward；
- daily cap only caps gem, not record；
- two concurrent redeems；
- insufficient；
- cancel exactly one refund；
- ledger sum == cache。
```

---

# 13. TASK M10 — Family Collaboration

```text
执行 RUNEW M10 Family。

完成：
family invite token/hash/expiry；
member list/detail；
permission edit；
disable/restore；
family tasks；
complete；
basic repeat rule；
anniversaries；
family achievements。

Frontend：
Family home、members、member detail、tasks、task detail/edit、achievements、anniversaries、join/create、invite。

强制产品约束：
禁止爸爸排名、妈妈排名、贡献排行榜；
不得为此创建 API 字段或 UI 占位。

测试：
- invite expiry；
- token reuse；
- permission；
- disabled member；
- offline task update；
- conflict；
- anniversary reminder；
- no ranking。
```

---

# 14. TASK M11 — Baby / Settings / Search / Trash / Export

```text
执行 RUNEW M11，目标是把前面已完成能力整合为完整产品。

Baby：
profile、edit、likes/dislikes、recent changes、multiple babies、switch；
single baby 时不显示 switch。

Settings：
account、notifications、DND、appearance、night mode、privacy、backup status、storage、export、backup history UI、trash、about。

Global Search：
使用 SQLite FTS5 + application Chinese bigram strategy；
索引 records/growth/knowledge/health/memories/quotes/audio/authorized diary；
PRIVATE 权限必须发生在 query 层；
soft deleted 不返回。

Trash：
统一最近删除；
restore；
普通 UI 30 天。

Export：
异步 export_jobs；
CSV、growth report、photos/audio archive、memory archive、annual review；
下载每次重新做权限。

Realtime：
若 M3 未完成 WebSocket，现在完成 one-time ticket + sync_hint/notification_hint/session_revoked/maintenance。
WebSocket 不发送 PRIVATE 正文。

全局审查所有一级页面状态：
Default/Loading/Empty/Error/Offline/Success/Disabled/Uploading/Permission/Draft/Deleted。

运行完整功能回归并更新 DEVELOPMENT_LOG。
```

---

# 15. TASK M12 — Admin

```text
执行 RUNEW M12 Admin。管理员是独立权限域，不是 family role。

Schema：
admin_credentials
admin_sessions
admin_reauth_grants
audit_logs
system_settings

Auth：
- 独立管理员密码；
- Argon2id；
- 独立 Admin Session；
- absolute expiry ~30min；
- failed attempt rate limit；
- user session + admin session 双重要求；
- password 不在前端/git/localStorage。

Danger：
- POST /admin/reauth；
- single-use scoped grant <=2min；
- final confirmation；
- execute；
- audit。
Grant 不得重复使用或跨 action/resource 使用。

Admin modules：
knowledge；
gems；
gem rules；
rewards；
content；
members；
data；
system；
audit。

UI：
严格使用 RUNEW Warm Glass Component，允许信息密度更高，但不做企业后台风。

Audit：
记录必要 before/after；
PRIVATE Diary/Audio/Photo/Time Capsule 正文/内容不得进入 audit。

Tests：
wrong password；
rate limit；
expired；
normal user no admin；
reused grant；
wrong scope；
danger action；
audit success/failure；
private content redaction。
```

---

# 16. TASK M13 — Backup / Restore / Deployment

```text
执行 RUNEW M13。

Backup：
- backup_runs；
- SQLite Online Backup / sqlite3 .backup；
- 禁止直接 cp live runew.db；
- media manifest；
- checksum；
- verify；
- retention；
- /backups；
- optional restic encrypted offsite；
- backup status UI/API。

Restore：
必须是真实流程：
Admin Reauth
→ Maintenance
→ PRE_RESTORE backup
→ restore staging
→ PRAGMA integrity_check
→ manifest/hash verify
→ atomic activate
→ migration
→ smoke
→ sync_epoch++
→ exit maintenance。

恢复过程中普通 client write 返回 MAINTENANCE_MODE，客户端保留 Pending Queue。

Docker：
runew-app
cloudflared
runew-backup

runew-app 不映射公网 Host Port。

Cloudflare：
Tunnel、HTTPS、proxy、CORS、secret、安全 headers。

DR：
执行一次真实 Restore Drill，生成 `docs/RESTORE_DRILL_REPORT.md`：
- initial data；
- backup id；
- failure simulated；
- restore；
- DB verify；
- media hash verify；
- login；
- records；
- audio/photo；
- search；
- sync epoch/full resync；
- result。

没有真实 Restore Drill 不得完成 M13。
```

---

# 17. TASK M14 — Hardening / RC

```text
执行 RUNEW M14 Release Candidate Hardening。原则上不增加新产品功能。

A. Full P0 E2E
覆盖 11 modules + Admin。

B. Visual
关键页面在 375 / 390 / 430 与 UI_IMPLEMENTATION_SPEC/Figma 对照。
修复 hierarchy、spacing、alignment、glass、icon optical center、button visibility、safe area、bottom nav。

C. State
逐模块验证 Loading/Empty/Error/Offline/Uploading/Permission/Draft/Delete/Restore。

D. Motion
micro、record success、gem、growth、knowledge learned、capsule、sleep；
实现 reduced motion；
动画不得阻塞业务保存。

E. Accessibility
touch >=48；
key actions >=56；
font scaling；
labels；
chart numerical；
non-color；
contrast。

F. Performance
Today/Timeline/Search；
SQLite busy；
media processing concurrency；
memory；
bundle；
images。

G. Security
IDOR；
PRIVATE；
CSRF；
XSS；
SQL injection；
file traversal；
fake MIME；
rate limit；
session revoke；
admin grant；
log redaction。

H. Chaos
network loss；
app kill；
API 503；
SQLite busy；
disk low；
upload interrupted；
scheduler restart；
backup interrupted；
session expiry。

I. Release Docs
生成：
- docs/RC_CHECKLIST.md
- docs/KNOWN_ISSUES.md
- docs/DEPLOYMENT_RUNBOOK.md
- docs/DR_RUNBOOK.md

J. Commands
运行完整 typecheck/lint/test/build/migrations/docker compose smoke。
任何 P0 blocker 不清零不得声明 RC ready。
```

---

# 18. 后续每次修复任务的 Codex 模板

```text
这是 RUNEW 的一个受控修复任务，不是重构整个项目。

问题：
<填写问题>

事实源：
- PRD: <章节>
- UI Spec: <章节/Frame>
- Tech Design: <章节>
- Implementation milestone: <Mx>

要求：
1. 先定位根因；
2. 只修改必要范围；
3. 不改变无关产品行为；
4. 如果涉及 DB，必须 migration；
5. 如果涉及 API，更新 contract；
6. 如果涉及权限，增加 negative test；
7. 如果涉及 Offline/Media/Timer/Gem/Backup，必须增加 failure test；
8. 运行 typecheck/lint/tests/build；
9. 更新 DEVELOPMENT_LOG；
10. 报告实际结果。

不要用“临时绕过”代替根因修复。
```

---

# 19. UI 视觉回归 Task 模板

```text
请对当前完成的 RUNEW 模块做 Design-to-Code Regression，不增加新功能。

事实源：
- Figma `11 R6.2 Mobile Complete`
- docs/UI_IMPLEMENTATION_SPEC.md

检查宽度：
375 / 390 / 430

逐页检查：
- Page background
- Warm Glass surface
- blur/fallback
- spacing
- typography
- icon size/stroke/optical center
- button/icon/text center
- CTA hierarchy
- selected state
- card hierarchy
- safe area
- bottom nav
- sheet/dialog
- long text
- font scaling
- loading/empty/error/offline
- night mode
- reduce motion

原则：
不要把设计“优化”为普通白色 dashboard；
不要新增说明性 UI 文案；
不要用系统 emoji 替代正式业务 icon；
不要因为截图相似而牺牲真实点击热区。

修复后重新截图并给出 before/after 差异。
```

---

# 20. Security Review Task 模板

```text
请只对 RUNEW 做 Security Review，不改产品功能。

重点：
1. Authentication；
2. Session token storage；
3. CSRF；
4. CORS；
5. IDOR；
6. family/baby ownership；
7. PRIVATE diary/search/media；
8. Admin session separation；
9. Admin reauth；
10. SQL injection；
11. XSS；
12. media path traversal/MIME；
13. upload size；
14. audit/log secrets；
15. backup secrets；
16. rate limit。

请为发现的每个真实问题给：
- severity；
- path/code；
- exploit condition；
- fix；
- regression test。

优先修复 P0/P1。
不要输出泛化安全清单代替代码审查。
```

---

# 21. Offline Reliability Review Task 模板

```text
请对 RUNEW 的 Offline/Sync 做故障注入式复查。

必须真实验证：
- offline create；
- app restart；
- reconnect；
- duplicate request；
- conflicting edits；
- delete vs edit；
- pending retry；
- cursor；
- full resync；
- restore sync_epoch；
- expired session while pending；
- 503/SQLite busy；
- realtime disconnected。

每一个场景记录：
Given
When
Then
实际测试
结果

发现问题必须补 integration/e2e test 后再修复。
```

---

# 22. Media Reliability Review Task 模板

```text
请对 RUNEW Photo/Audio/Video 存储链路做 Reliability Review。

必须验证：
1. 系统 temp file 是否先持久化；
2. local persisted 后杀 App 是否还在；
3. upload chunk retry；
4. upload resume after restart；
5. hash mismatch；
6. complete size mismatch；
7. server processing failure；
8. original preserved；
9. thumbnail missing；
10. Range audio；
11. delete；
12. restore；
13. physical purge grace；
14. backup；
15. restore 后媒体可播放。

任何要求用户重新拍摄/录音的路径都视为 P0。
```

---

# 23. Backup/Restore Review Task 模板

```text
请审查 RUNEW Backup/Restore 的“可恢复性”，不是只看 backup command 是否成功。

验证：
- SQLite WAL consistent snapshot；
- quick_check/integrity_check；
- manifest；
- hashes；
- media；
- retention；
- local backup disk independence；
- offsite encryption；
- secrets recovery；
- pre-restore snapshot；
- staging restore；
- atomic activation；
- migration；
- smoke；
- sync_epoch；
- client full resync；
- restore audit。

请实际恢复到隔离临时目录并验证数据。
只存在备份文件而从未恢复验证，不算通过。
```

---

# 24. 每个 Milestone 开始前的人工确认点

建议负责人只确认三个问题：

1. 上一 Milestone 的 Exit Gate 是否全部通过；
2. 是否有未解决 P0/P1；
3. 是否有新的 PRD/Figma 变更。

如果没有，直接执行下一 Task；不需要每次重新让 Codex“理解整个产品并提出新方案”。

---

# 25. 最终 Codex 工作模式

正确：

```text
Read
→ Inspect
→ Plan
→ Implement one milestone
→ Test
→ Screenshot/Verify
→ Log
→ Stop
```

错误：

```text
Read PRD
→ 一次生成整个项目
→ 大量 Mock
→ 页面能打开
→ 宣称完成
```

RUNEW 的开发验收单位不是“生成了多少代码”，而是：

> **这个 Milestone 是否形成了可运行、可测试、可恢复、可继续扩展的真实闭环。**
