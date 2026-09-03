# AGENTS.md — 🌱 润芽 · RUNEW

> 本文件是润芽 RUNEW 仓库级的 AI 开发执行规范，适用于 Codex、Cursor 等编码 Agent。
>
> 除非某个子目录存在更具体的 `AGENTS.md`，否则本文件对整个仓库生效。
>
> **任何 Agent 在修改代码前都必须先阅读本文件。**
>
> RUNEW 不是 Demo 项目。请把它当成一个会长期使用的家庭产品，其中最重要的数据可能无法重新获得。

---

# 1. 产品身份

**产品名：** 润芽 · RUNEW  
**副标题：** 润润的家庭成长工作台  
**Slogan：** 把润润长大的每一天，认真收藏起来。🌱

RUNEW 是一个围绕宝宝成长和家庭生活构建的私人家庭成长工作台，主要包含：

- 宝宝日常照护记录；
- 成长趋势；
- 育儿知识；
- 健康事项与提醒；
- 宝宝回忆；
- 妈妈私人空间；
- 家庭奖励；
- 家庭协作；
- 长期家庭档案。

产品应逐步从：

```text
日常育儿工具
→ 成长档案
→ 家庭记忆博物馆
```

整体体验必须长期保持：

```text
温暖
高级
治愈
有生命感
轻松
有趣
可爱但不幼稚
```

不要把 RUNEW 做成：

- 普通后台管理系统；
- 育儿 KPI 打卡工具；
- 母婴电商 App；
- 大量卡片堆砌的 AI 模板；
- 宝宝社交平台；
- 医疗诊断产品；
- 爸爸妈妈贡献排行榜。

---

# 2. 强制事实源优先级

当需求、设计和代码发生冲突时，严格按以下优先级执行：

1. `docs/PRD_RUNEW_V3.0.md`
   - 产品行为；
   - 业务规则；
   - 权限；
   - 状态机；
   - 功能范围。

2. Figma Page `11 R6.2 Mobile Complete`
   - 最终视觉效果；
   - 页面结构；
   - UI 层级；
   - 交互入口。

3. `docs/UI_IMPLEMENTATION_SPEC.md`
   - Design System；
   - Component Spec；
   - Route / Sheet / Dialog / Inline State；
   - Motion；
   - 响应式和视觉实现规范。

4. `docs/TECHNICAL_DESIGN.md`
   - 系统架构；
   - 数据库；
   - API；
   - 认证授权；
   - 离线同步；
   - 媒体；
   - 备份；
   - 管理员安全；
   - 部署。

5. `docs/IMPLEMENTATION_PLAN.md`
   - Milestone 顺序；
   - 依赖关系；
   - 阶段退出条件。

6. `docs/CODEX_TASKS.md`
   - 分阶段 Agent 施工任务。

7. 现有代码。

如果代码与更高优先级事实源冲突，不要因为“已经写好了”而保留错误行为。

如果两个高优先级事实源无法同时满足：

**禁止猜测。**

按本文件的 Change Control 规则建立 Decision 文档。

---

# 3. 每次开发前必须阅读

开始任何非简单任务前，Agent 必须：

1. 阅读本 `AGENTS.md`；
2. 检查仓库中的项目 Skill；
3. 如果存在 `mottpock/SKILL.md`，进行 UI / Design 工作前必须阅读；
4. 阅读当前任务相关的：
   - PRD；
   - UI Implementation Spec；
   - Technical Design；
   - Implementation Plan；
5. 如果当前任务属于某个 Milestone，阅读 `docs/CODEX_TASKS.md` 对应章节；
6. 先检查现有代码，不得假设项目为空；
7. 如果存在 `docs/IMPLEMENTATION_BASELINE.md`，必须阅读；
8. 阅读 `docs/DEVELOPMENT_LOG.md` 中最近与当前模块相关的记录。

禁止直接假设：

```text
这个功能不存在
这个模块需要重写
当前结构全部错误
项目还是空仓
```

先搜索、检查，再判断。

---

# 4. 当前交付范围

当前 P0 只要求：

```text
Mobile
- 微信小程序
- H5 Mobile
```

设计基准：

```text
390 × 844
```

必须验证：

```text
375 × 812
390 × 844
430 × 932
```

服务端和数据模型不能人为阻塞未来 Tablet / Desktop，但除非任务明确要求，否则当前阶段不要主动扩展 Tablet / Desktop。

当前 Figma 中存在大量 Frame，其中很多只是：

```text
状态
筛选结果
弹层
成功态
上传态
错误态
```

**Frame 数量不等于 Route 数量。**

---

# 5. Figma Frame ≠ Route

RUNEW UI 实现必须区分：

```text
ROUTE
SUBROUTE
SHEET
DIALOG
INLINE_STATE
LIST_VARIANT
PERMISSION
SYSTEM_NATIVE
```

例如：

```text
今天                    → ROUTE
育儿知识详情             → SUBROUTE
记录筛选                 → SHEET
删除确认                 → DIALOG
睡眠进行中               → INLINE_STATE
只看喂奶                 → LIST_VARIANT
麦克风使用说明           → PERMISSION
系统相机                 → SYSTEM_NATIVE
```

禁止因为 Figma 有不同 Frame，就给每个状态新建 Route。

优先保证用户当前任务上下文连续。

---

# 6. 当前技术栈基线

前端：

```text
Taro
React
TypeScript
Zustand
TanStack Query
ECharts
SCSS / CSS Modules
```

后端：

```text
Node.js
Fastify
TypeScript
Drizzle ORM
REST API
```

数据库：

```text
SQLite
WAL Mode
```

媒体：

```text
本地文件系统
Binary 不写入 SQLite
```

部署：

```text
Docker Compose

runew-app
cloudflared
runew-backup
```

P0 明确不需要：

```text
Redis
Kafka
Elasticsearch
Kubernetes
微服务
分布式数据库
GraphQL
```

除非有通过评审的架构变更，否则禁止主动引入。

---

# 7. 架构原则

当前采用模块化单体。

前端正常调用路径：

```text
Page
↓
Feature Hook
↓
Domain Store / Query Hook
↓
Repository / API Client
↓
Local Driver + Remote API
```

后端正常调用路径：

```text
Fastify Route
↓
Auth / Policy
↓
Domain Service
↓
Repository
↓
SQLite / Media Storage
```

禁止随意绕层。

Page 负责组合业务，不负责实现基础设施。

---

# 8. 推荐仓库方向

目标结构：

```text
runew/
├── apps/
│   ├── client/
│   └── server/
├── packages/
│   ├── contracts/
│   ├── domain-types/
│   ├── validation/
│   └── shared-utils/
├── db/
│   ├── schema/
│   ├── migrations/
│   ├── seed/
│   └── scripts/
├── deploy/
│   ├── docker/
│   ├── cloudflared/
│   └── backup/
├── docs/
├── docker-compose.yml
├── .env.example
├── AGENTS.md
└── package.json
```

如果当前仓库已有兼容结构，不要为了“完全一致”做无意义目录搬迁。

优先渐进式调整。

---

# 9. 每个任务的标准执行流程

任何非简单任务都使用以下流程。

## Step 1 — Inspect

先确认：

- 当前实现；
- 受影响 Domain；
- 受影响 Figma Frames；
- 受影响 API / Contract；
- 受影响 Schema；
- 受影响测试。

## Step 2 — Plan

修改前给出简短实施计划：

```text
要改哪些模块/文件
业务行为是什么
是否影响 DB/API
准备怎么测试
```

不要先输出大段没有落地价值的架构论文。

## Step 3 — Implement

优先按 Vertical Slice 实现：

```text
Schema
→ Migration
→ Repository
→ Domain Service
→ API
→ Client Repository / Query
→ UI
→ State
→ Test
```

## Step 4 — Verify

运行仓库真实命令。

至少在项目已有对应命令时执行：

```text
typecheck
lint
unit / integration tests
build
```

如果某个命令不存在：

- 检查 `package.json`；
- 真实说明缺失；
- 不得编造“已通过”。

## Step 5 — 更新文档

阶段任务完成后更新：

```text
docs/DEVELOPMENT_LOG.md
```

如果某个已批准决策改变了产品或架构，也要同步更新对应事实源文档。

## Step 6 — 真实汇报

必须汇报：

```text
Changed
Migrations
API / Contracts
UI / States
实际执行的测试
Build / Typecheck / Lint
Known Issues
Ready / Not Ready
```

测试失败时禁止写“已完成”。

---

# 10. Scope 控制

一个任务只允许修改：

```text
当前目标模块
+
当前目标真正依赖的公共能力
```

禁止：

- 做一个功能顺便重构整个仓库；
- 修改大量无关模块；
- 没有必要就整体改 API；
- 因个人偏好替换技术栈；
- P0 开发时顺便实现大量 P1/P2。

发现 Scope 外问题：

```text
记录
分类
不擅自扩大任务
```

例外：

如果发现真实 P0：

```text
数据丢失
权限泄露
管理员越权
宝石账目错误
```

必须立即修复或明确阻断后续发布。

---

# 11. 产品不可违反规则

以下属于硬约束。

## 11.1 用户中途退出不能丢数据

以下场景不得导致数据消失：

```text
小程序切后台
H5 刷新
手机锁屏
电话打断
断网
页面关闭
应用异常关闭
上传中离开页面
```

## 11.2 核心数据必须可恢复

核心记录根据业务需要至少支持：

```text
查看
编辑
删除
撤销 / 恢复
created_by
updated_at
```

最近删除默认：

```text
30 天
```

照片、录音、时光胶囊等高价值数据采用更强保护策略。

## 11.3 禁止制造育儿焦虑

不要新增：

```text
今天还没记录
连续打卡要断了
挑战失败
记录不足红色 KPI
爸爸妈妈贡献排名
按宝宝表现奖惩
```

## 11.4 宝石奖励“留下记录”

不要奖励：

```text
宝宝睡得更好
宝宝吃得更多
妈妈选择开心心情
所谓“优秀育儿”
```

---

# 12. UI / 设计语言

当前设计语言：

```text
R6.2 / Warm Glass + Cute Accent
```

必须保持：

```text
苹果系统般的高级材质感
暖奶油背景
通透但克制的毛玻璃
柔和的语义色
少量可爱点缀
温馨、不幼稚
```

M0 已校准的液态 Warm Glass（更高 blur / saturate、半透明填充、标题浮雕）是后续所有里程碑的实现基线。详见 `docs/UI_IMPLEMENTATION_SPEC.md` §0.5。禁止 Auth / 新模块退回实心白卡片或高饱和实橙按钮。

禁止把设计简化为：

```text
普通白色卡片
普通后台 Dashboard
大量统一白块
大量高饱和橙色按钮
```

---

# 13. Design System 必须复用

公共组件必须优先复用：

```text
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
TextAction

GlassInput
GlassTextArea
SegmentedControl
FilterChip
BottomSheet
ConfirmDialog

Skeleton
EmptyState
ErrorState
OfflineBanner
UploadProgress
UndoToast
PermissionSheet
```

禁止每个页面复制自己的：

```text
Glass
Button
Chip
Row
Sheet
Dialog
Toast
Navigation
```

如果需要新 Variant：

```text
扩展公共组件
```

而不是复制一个新组件。

---

# 14. 视觉 Token

页面不得随意新增：

```text
颜色
圆角
Blur
Shadow
Border
```

当前视觉体系包括：

```text
Cream
Warm Apricot
Sage
Lavender
Sky
Blush
```

正文主色应为暖深棕，不用纯黑。

主按钮必须清晰可点击，但不得恢复成大面积高饱和橙色实底。

具体 Token 以：

```text
UI_IMPLEMENTATION_SPEC.md
```

为准。

---

# 15. 图标规则

一级业务 Icon 和主要功能 Icon 使用统一的：

```text
圆润
轻量
Outline Icon System
```

禁止使用系统 Emoji 作为主要功能图标。

Emoji 仅允许少量用于：

```text
心情
庆祝
宝宝语录情绪
品牌微文案
```

必须检查光学居中：

```text
Icon Container
Icon Glyph
文字
Chevron
按钮 Icon + Text
数字 + Unit baseline
```

---

# 16. 响应式规则

禁止把 Figma 中大量：

```text
350px
```

直接写成固定宽度。

390px 设计中：

```text
390 - 20 - 20 = 350
```

通常应实现：

```css
width: 100%;
```

外层：

```css
padding-inline: 20px;
```

必须处理：

```text
Safe Area
Bottom Nav
键盘
长中文
系统字体放大
```

必须检查：

```text
375
390
430
```

---

# 17. 触控和可访问性

最低要求：

```text
核心点击区域 >= 48px
关键快速操作约 >= 56px
```

同时支持：

- 系统字体放大；
- Accessible Label；
- 不仅依赖颜色表达状态；
- 图表有数值信息；
- Reduce Motion；
- 足够文字对比度。

不得为了“截图像 Figma”而缩小真实热区。

---

# 18. 动效规则

动画服务于反馈，不是装饰。

动效类型：

```text
Micro
UI Transition
Celebration
Emotional
```

重点动效：

```text
记录保存
宝石获得
成长新数据点
知识“学到了”
时光胶囊封存
睡眠状态切换
```

业务数据保存必须与动画解耦。

动画失败：

```text
不能导致保存失败
```

开启 Reduce Motion 后：

- 去掉大幅位移；
- 去掉飞宝石；
- 去掉连续装饰动画；
- 保留明确状态反馈。

---

# 19. 前端状态职责

Zustand 用于：

```text
Auth Runtime
Current Family
Current Baby
Running Timer 展示
Draft Metadata
Pending Sync Count
Media Queue Summary
UI Overlay
Theme / Night Mode
Realtime Status
```

TanStack Query 用于：

```text
bootstrap
today
records
growth
knowledge
health
memories
gems
family
baby
settings
admin
search
notifications
```

禁止把完整 Server List 再复制进 Zustand。

Mutation 后禁止习惯性：

```text
全局 invalidateQueries()
```

应精准更新或失效对应 Query。

---

# 20. Page 的职责

Page 只负责：

- 页面组合；
- 绑定导航；
- 绑定业务状态；
- 绑定用户行为。

Page 不应该：

- 直接手写 raw `fetch`；
- 直接管理 Upload Queue；
- 直接实现 Storage Format；
- 直接 `Taro.setStorage` 保存业务实体；
- 自己执行服务端权限判断。

---

# 21. Shared Contract

运行时 Schema Validation 是强制要求。

只有 TypeScript 类型：

```text
不够
```

Request / Response 至少验证：

```text
ULID
Enum
数字范围
字符串长度
时间范围
媒体大小
State Transition
```

前后端 Contract 按仓库约定共享。

禁止用：

```ts
any
```

逃避 Contract。

---

# 22. 数据库规则

SQLite 是正式 P0 架构。

必须：

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
```

其他参数以 Technical Design 为准。

业务表按规范使用：

```text
ULID
UTC Epoch Milliseconds
version
Soft Delete
真实索引
短事务
```

禁止：

- 把媒体 Binary 写 SQLite；
- 一个万能 JSON 表保存所有业务；
- 关闭 FK；
- 在数据库事务里执行图片压缩；
- 在数据库事务里做网络调用；
- 长时间占用写事务。

---

# 23. Migration 规则

任何 Schema 变化都必须：

```text
Schema Change
→ Migration
→ Empty DB Migration Test
→ Previous DB Migration Test
→ Integration Test
```

禁止依赖：

```text
某个开发者本地 DB 已经被手工改好
```

生产环境禁止：

```text
drizzle push --force
```

执行破坏性 Migration 前必须：

```text
已验证 Backup
```

---

# 24. 时间规则

数据库业务真相统一使用 UTC。

展示时转本地时区。

禁止仅保存无时区的本地时间作为唯一业务真相。

设备时区变化时：

```text
不得重写历史 UTC
```

原始记录与统计结果分离。

例如跨午夜睡眠：

```text
Raw Record 仍是一条
统计层按日期拆分
```

---

# 25. Offline / Local-first 硬约束

普通日常记录必须 Local-first。

客户端可以：

```text
生成 ULID
本地持久化
立即展示
加入 Pending Queue
网络恢复后同步
```

但 Server 仍负责：

```text
最终权限
最终业务规则
Version
Conflict
Gem Ledger
Admin
Backup
Audit
```

Offline 不是一个 UI 图标，而是数据持久能力。

---

# 26. Pending Operation

离线操作必须拥有稳定 Operation ID。

支持：

```text
CREATE
UPDATE
DELETE
RESTORE
```

服务端 ACK 安全持久化前：

```text
禁止删除 Pending Operation
```

App 重启后 Pending Queue 必须还在。

Retry 必须幂等。

---

# 27. Conflict 规则

重要内容禁止：

```text
Silent Last-write-wins
```

冲突判断使用：

```text
base snapshot
base version
changed fields
server current state
```

非重叠字段可以 Auto Merge。

重叠字段必须提示 Conflict。

以下高价值正文冲突不得静默覆盖：

```text
Diary
Baby Quote
Time Capsule
Memory Story
```

---

# 28. 重复记录规则

Duplicate Detection 和 Version Conflict 是两件事。

如果两个家庭成员在接近时间记录相似事件：

```text
检测 Candidate
→ Merge
或
→ Keep Both
```

禁止静默删除任何一条。

Merge 必须保留来源信息。

---

# 29. Timer 硬约束

Timer 业务真相：

```text
Timestamp
```

不是 UI Tick。

Sleep：

```text
started_at
ended_at
```

Breast Feeding：

```text
feeding_record
feeding_segments
```

展示：

```text
now - timestamps - paused segments
```

`setInterval` 只能用于刷新界面。

必须正确恢复：

```text
切后台
锁屏
切页面
App 重启
断网
```

异常超长 Timer：

```text
不能擅自自动结束
```

应提示用户处理。

---

# 30. 媒体属于高价值数据

照片、宝宝声音、第一次、时光胶囊等按不可复刻数据处理。

客户端正确链路：

```text
系统临时文件
→ 本地持久副本
→ Local Metadata
→ Business Record
→ Upload Queue
→ Resumable Upload
→ Server Processing
→ READY
```

只有本地持久化成功后才能告诉用户：

```text
已保存
```

---

# 31. 微信小程序媒体规则

微信临时路径不能作为长期存储。

选择/拍摄/录音后：

```text
先保存到 USER_DATA_PATH
```

成功后再写 Local Metadata。

---

# 32. H5 媒体规则

优先：

```text
OPFS
```

Fallback：

```text
IndexedDB Blob
```

禁止依赖：

```text
blob: URL
localStorage Base64
```

作为长期媒体存储。

---

# 33. 媒体上传规则

上传必须支持中断恢复。

遵循 Technical Design：

```text
Upload Init
Parts
Hash
Resume
Complete
Processing
Retry
```

上传失败不得要求用户：

```text
重新拍照
重新录音
```

Server Processing 失败必须保留 Original。

不能信任用户文件扩展名。

必须校验：

```text
Auth
Permission
Size
Magic Bytes
Actual Decode
Hash
Safe Path
```

---

# 34. 媒体存储规则

Binary 保存在文件系统。

Path 必须由服务器生成。

禁止使用用户文件名直接构造路径。

防止：

```text
../
绝对路径
Path Traversal
MIME Spoofing
```

媒体下载必须执行认证授权。

禁止直接公开：

```text
/data/media
```

---

# 35. 妈妈空间隐私

妈妈空间默认：

```text
PRIVATE
```

隐私必须真实落实在：

```text
API
Search
Media Access
Notification（适用）
```

禁止只前端隐藏。

其他家庭成员拿 PRIVATE Diary ID 直接请求 API：

```text
必须拒绝
```

禁止日志记录 PRIVATE Diary 正文。

禁止 Analytics 上传 PRIVATE Diary 正文。

---

# 36. Search 权限

Search 必须在 Query / Service 层进行权限过滤。

禁止：

```text
先返回 PRIVATE Result
→ 前端隐藏
```

Soft Deleted 内容不能出现在普通 Search。

SEALED Time Capsule 的正文不能进入普通家庭 Search。

---

# 37. 育儿知识规则

知识 User State 必须支持 Version。

核心：

```text
learned_version == content_version
→ 当前版本不再普通推荐
```

如果：

```text
content_version > learned_version
```

可显示：

```text
内容有更新
```

知识模块不能变成医疗诊断。

---

# 38. 健康模块边界

健康模块支持：

```text
体检
疫苗
就诊
牙科
用药提醒
附件
健康事项
```

不提供：

```text
疾病诊断
AI 风险判断
医疗结论
```

---

# 39. 宝石账本

`gem_transactions` 是不可变 Ledger。

禁止修改历史流水金额来“修余额”。

纠错使用：

```text
补偿流水
```

Family Gem Balance Cache 必须可以通过：

```text
SUM(gem_transactions.amount)
```

校验。

所有自动奖励必须幂等。

---

# 40. 宝石事务边界

以下必须原子：

```text
记录 + 宝石奖励
Reward Redeem + Gem Debit + Order
Order Cancel + Refund + State
Task Reward（适用）
Admin Manual Adjustment + Ledger
```

严格遵循 Technical Design Transaction Strategy。

业务记录没有正式成功前：

```text
禁止先发宝石
```

---

# 41. 宝石商城产品边界

宝石商城不是电商。

不要新增：

```text
限时秒杀
库存焦虑
猜你喜欢
购物车语言
结算页电商文案
```

Reward Order 必须保留履约状态，让奖励最终可以成为回忆。

---

# 42. 时光胶囊状态机

Server 强制：

```text
DRAFT
  ↓ seal
SEALED
  ↓ 满足 open_at 且用户主动打开
OPENED
```

无效状态转换必须后端拒绝。

不能因为前端发来 PATCH：

```text
就允许修改 SEALED 内容
```

Scheduler 不得自动打开胶囊正文。

---

# 43. 家庭产品原则

家庭模块强调：

```text
一起
陪伴
共同记忆
协作
```

禁止：

```text
妈妈 vs 爸爸
贡献排行榜
家庭绩效
育儿评分
```

Task 是协作工具，不是家庭考核系统。

---

# 44. 多宝宝

数据模型从第一天支持多宝宝。

只有一个宝宝：

```text
隐藏宝宝切换
```

切换宝宝后所有 baby-scoped 数据必须正确切换：

```text
records
growth
health
knowledge state
memories
```

禁止 Baby ID 混用。

---

# 45. Authentication

用户密码：

```text
Argon2id
```

Session 使用 Technical Design 中的 Opaque Session。

数据库保存：

```text
Token Hash
```

禁止日志记录：

```text
Password
Authorization
Session Token
Cookie Secret
```

H5 和小程序可以采用不同传输方式，但后端 Identity / Policy 一致。

---

# 46. Authorization

禁止信任 Client 传来的：

```text
created_by
updated_by
admin user id
family membership
```

Actor 必须来自 Authenticated Request Context。

任何 Family Resource 至少校验：

```text
Authenticated User
Active Family Membership
Resource Family
Role / Permission
Owner / Private Rule
Entity State
```

必须防止 IDOR。

---

# 47. Admin 安全

Admin 是独立安全域。

普通 Family Role：

```text
不等于 Admin
```

Admin 请求必须同时具备：

```text
Normal User Session
+
Valid Admin Session
```

Admin Password：

```text
Server Verify
Argon2id
```

Admin Session：

```text
约 30 分钟 Absolute Lifetime
```

禁止把管理员密码放在：

```text
Frontend Source
Git
LocalStorage
Log
```

---

# 48. 高危 Admin 操作

例如：

```text
Restore Backup
Delete All Photos
Delete Baby
Disable Backup
其他破坏性操作
```

必须：

```text
Valid Admin Session
→ Reauthentication
→ 短期 Single-use Scoped Grant
→ Final Confirmation
→ Execute
→ Audit
```

禁止一个普通按钮请求直接执行高危操作。

---

# 49. Audit

Audit Log 不可变。

必须记录重要管理员操作。

禁止把高价值 PRIVATE 正文写入 Audit：

```text
Diary Body
Audio Content
Photo Binary
Time Capsule Body
Password
Token
```

隐私资源只记录：

```text
Metadata
Permission Changes
Resource ID
Action
```

---

# 50. 删除与恢复

普通核心业务：

```text
Soft Delete
```

UI 最近删除默认：

```text
30 天
```

Restore 必须经过后端 Mutation 和正常权限检查。

高价值媒体 Physical Purge 必须遵循 Technical Design 更严格策略。

用户一次 Delete 不应该立即永久销毁不可复刻媒体。

---

# 51. 通知规则

允许通知：

```text
健康提醒
家庭任务
Reward 状态
Backup Failure
Time Capsule
Anniversary
必要系统通知
```

禁止压力型通知：

```text
你今天还没记录
连续记录要断了
回来完成任务
```

必须遵守 DND / Quiet Hours。

---

# 52. Just-in-Time Permission

首次进入 App 不要一次申请：

```text
Camera
Album
Microphone
Notification
```

应在用户真正触发功能时：

```text
先展示 RUNEW 解释
→ 再调系统权限
```

例如：

```text
点击宝宝录音
→ 麦克风说明
→ 系统麦克风授权
```

Permission Denied 不是系统 Error。

---

# 53. Auto Draft

至少为以下长文本提供 Draft：

```text
Diary
Baby Quote
Time Capsule
Health Note
Admin Knowledge Editor
```

使用本地可靠草稿。

禁止：

```text
每输入一个字符就请求后端
```

Draft 必须处理：

```text
baseVersion 与 Server Version 冲突
```

---

# 54. API Contract

Base API：

```text
/api/v1
```

统一：

```text
Success Envelope
Error Envelope
RequestId
Cursor Pagination
ETag / If-Match
Idempotency-Key
```

禁止向前端泄露：

```text
数据库错误
Stack Trace
内部路径
```

用户可见 Message 必须安全、符合产品语气。

---

# 55. Idempotency

可能 Retry 的 Create / 高价值 Mutation 必须幂等。

包括：

```text
Record Create
Sync Operation
Gem Redeem
Admin Gem Adjust
Media Upload Init
Family Invite
Export
Backup
```

同 Key + 同 Payload：

```text
返回原结果
```

同 Key + 不同 Payload：

```text
Conflict
```

---

# 56. Transaction

涉及多写一致性的业务必须 Transaction。

禁止在 DB Write Transaction 中执行：

```text
网络请求
图片压缩
长时间文件处理
```

SQLite Write Transaction 必须尽量短。

File + DB 不可天然原子时：

```text
使用明确 Lifecycle State + Reconciliation
```

---

# 57. Scheduler

Job 必须幂等。

Scheduler 重启不能导致重复：

```text
Notification
Gem Transaction
Cleanup
Backup
Permanent Delete
```

P0 不为了 Scheduler 引入 Kafka / Redis。

使用 Technical Design 中的：

```text
简单 Scheduler + DB Lock
```

---

# 58. Backup

存在 Backup File：

```text
不代表 Backup 可用
```

Backup 必须包含：

```text
一致 SQLite Snapshot
Media
Manifest
Checksum
Schema/App Version
Verification
```

禁止简单：

```text
cp live runew.db
```

使用 SQLite Online Backup 等正确机制。

---

# 59. Restore

没有实际 Restore Test：

```text
就不能称为完成 Backup
```

Restore 必须包含：

```text
Admin Reauth
Maintenance Mode
Pre-Restore Snapshot
Restore To Staging
Integrity Verification
Manifest / Hash Verification
Atomic Activation
Migration
Smoke Test
Sync Epoch Change
Exit Maintenance
```

---

# 60. 部署

生产结构：

```text
runew-app
cloudflared
runew-backup
```

禁止直接公网暴露：

```text
SQLite
Media Directory
App Internal Port
```

公网入口：

```text
Cloudflare Tunnel
```

Secret 必须在：

```text
Environment / Secret File
```

禁止写源码。

---

# 61. 日志

使用 Structured Logging。

合理包含：

```text
requestId
route
duration
userId
familyId
errorCode
```

必须 Redact：

```text
Authorization
Cookies
Password
Admin Password
Session Token
PRIVATE Body
Media Binary
```

禁止为了 Debug 把 Diary / Time Capsule 正文写日志。

---

# 62. Security

涉及相关模块时必须考虑：

```text
Authentication
Authorization
IDOR
CSRF
CORS
XSS
SQL Injection
Path Traversal
MIME Spoofing
Rate Limit
Secret Leak
PRIVATE Data Leak
```

SQL 使用：

```text
Parameterized Query / Drizzle
```

可渲染富文本必须 Sanitize。

文件名和 MIME 都不可信。

---

# 63. Error Handling

必须区分：

```text
Validation
Authentication
Permission
Not Found
Conflict
Gone
Rate Limit
Retryable Infrastructure
Unexpected Server Error
```

禁止所有错误都变成：

```text
500
```

Offline-capable Record 的 Remote Sync 临时失败：

```text
不能让本地记录消失
```

---

# 64. 测试属于实现的一部分

Feature 没有风险匹配的测试：

```text
就不算完成
```

测试层级：

```text
Unit
DB Integration
API Integration
Sync
Media Reliability
Security Negative Tests
E2E / Smoke
Visual Regression
Backup / Restore
```

禁止把所有测试推迟到最后 RC。

---

# 65. 按风险补测试

## 修改 Auth / Permission

必须增加：

```text
Negative Access Tests
```

## 修改 Offline / Sync

必须测试：

```text
Offline
Restart
Retry
Conflict
Duplicate
```

## 修改 Timer

必须测试：

```text
Background
Restart
Cross Midnight
Pause / Resume
```

## 修改 Media

必须测试：

```text
App Kill
Upload Interrupt
Resume
Processing Failure
Restore
```

## 修改 Gems

必须测试：

```text
Idempotency
Concurrency
Ledger Consistency
```

## 修改 Backup

必须：

```text
Restore Verification
```

---

# 66. 强制 Regression 场景

重点长期回归：

```text
开始睡眠
→ 锁屏/后台
→ 很久后回来
→ Timer 正确

离线记录
→ 杀 App
→ 重启
→ 记录还在
→ 恢复网络
→ Server 只有一条

爸爸妈妈相近时间记录同一事件
→ Duplicate Prompt
→ 不静默丢数据

妈妈 PRIVATE Diary
→ 其他家庭成员直接请求 API
→ 拒绝

录宝宝声音
→ 上传途中关闭 App
→ 本地文件还在
→ 恢复上传

同一 Record Request Retry
→ 不重复发 Gem

Admin Session 过期
→ Admin Action 被拒绝

Restore Backup
→ DB / Media / Search / Sync 正常
```

---

# 67. Visual Regression

UI Task 必须检查：

```text
375
390
430
```

重点：

```text
Layout
Hierarchy
Text Overlap
Icon Alignment
Button Visibility
Glass Material
Safe Area
Bottom Nav
Sheet / Dialog
Long Text
Keyboard
```

如果工具支持截图：

```text
必须实际截图检查
```

不能凭代码猜“应该一致”。

---

# 68. Visual 严重等级

P0：

```text
按钮不可用
文字重叠
Bottom Nav 挡内容
关键按钮看不见
Safe Area 崩坏
```

P1：

```text
层级明显错误
Warm Glass 丢失
Icon/Text 不居中
CTA 与背景融一起
语义色错误
```

P2：

```text
少量 Shadow/Spacing 差异
微小装饰偏差
```

---

# 69. 禁止“假完成”

禁止仅渲染一个静态状态就宣布功能完成。

典型假完成：

```text
有 Upload Success UI，但没有真实 Upload
有 Offline Badge，但数据没有本地持久化
有 Backup History，但没有 Backup
有 Gem Order UI，但没有 Ledger
有 Admin 页面，但没有 Server Admin Auth
有 PRIVATE Icon，但后端没有权限隔离
```

真实产品状态必须有真实底层行为。

---

# 70. Mock Data

Mock / Seed 可以用于：

```text
开发
组件测试
视觉开发
```

但不能作为 Milestone 最终实现。

Milestone Exit 必须走：

```text
真实 API
真实 DB
真实业务路径
```

---

# 71. 编码规范

使用：

- TypeScript Strict；
- 清晰 Domain Naming；
- 小而专一模块；
- Shared Validation；
- 明确 Enum / State；
- 可组合 React Component；
- 稳定 Query Key；
- 明确 Error。

避免：

- Giant File；
- Giant Store；
- Global Mutable Singleton；
- Magic Number；
- Client/Server 重复业务规则；
- `any`；
- 无理由 `@ts-ignore`；
- 吞异常；
- Catch 后假装 Success。

---

# 72. 注释规范

注释说明：

```text
为什么
Invariant
Edge Case
平台特殊行为
```

不要解释明显语法。

关键可靠性逻辑必须有简短注释，说明为什么不能被“简化”。

---

# 73. 命名规范

统一使用 PRD / Technical Design 中的 Domain Name。

例如：

```text
feedingRecord
sleepRecord
growthRecord
knowledgeUserState
timeCapsule
gemTransaction
rewardOrder
familyTask
adminSession
syncOperation
mediaUpload
```

同一 Domain 不要各层发明不同同义词。

---

# 74. 常量与配置

禁止散落 Magic Value。

应该配置化的例子：

```text
Duplicate Window
Upload Size
Chunk Size
Admin Session Lifetime
DND
Retention
Animation Timing
Visual Token
```

必须区分：

```text
产品硬规则
vs
工程默认值 / 部署配置
```

不要把工程默认值误写成不可修改产品规则。

---

# 75. Analytics 隐私

如果有 Analytics，只允许粗粒度事件：

```text
page_view
record_created
record_edited
knowledge_learned
reward_redeemed
memory_created
```

禁止上传：

```text
Diary Body
Audio Content
Photo Content
Time Capsule Body
PRIVATE Text
```

---

# 76. 性能

不要为了“优化”提前引入新基础设施。

但要修复明显问题：

- 一次性加载完整历史；
- Base64 Media；
- 每次 Render 重算大量数据；
- N+1；
- 全局 Query Invalidation；
- 图片处理不限制并发；
- 过大 Bundle。

遵循 Technical Design 性能预算。

---

# 77. Platform Adapter

平台差异封装在 Adapter。

例如：

```text
Storage
FileSystem
Permission
Camera / Media Picker
Share
Network
Safe Area
```

不要把：

```text
if (weapp)
if (h5)
```

散落在大量业务组件中。

---

# 78. SYSTEM_NATIVE 边界

以下应调用系统能力：

```text
系统相机
系统相册
OS Permission Dialog
系统分享
系统文件选择
```

RUNEW 可以先展示自己的温柔说明 Sheet，再调用系统 UI。

不要自己重做系统权限弹窗。

---

# 79. Night Mode

Night Mode 不是：

```text
CSS 反色
```

应该：

- 使用暖深色 Surface；
- 降低大面积亮白；
- 减少动画；
- 保持足够可读性；
- 功能不缩水。

---

# 80. Admin UI

Admin 可以信息密度更高，但必须保持 RUNEW Design Language。

禁止直接替换成企业后台模板。

Mobile Admin 使用：

```text
List + Detail
Warm Glass
清晰层级
Danger Style 仅用于危险操作
```

---

# 81. Change Control

如果发现一个问题无法从已有事实源判断正确行为：

创建：

```text
docs/issues/DECISION-xxx.md
```

包含：

```text
Problem
相关 PRD
相关 Figma / UI Spec
Technical Constraint
Options
Tradeoffs
Recommendation
Decision Needed
```

禁止静默创造新产品逻辑。

普通不影响产品行为的小型工程实现选择不需要 Decision Record。

---

# 82. 文档维护

重要开发完成后更新：

```text
docs/DEVELOPMENT_LOG.md
```

只记录有长期价值的信息：

```text
改了什么
Migration
API
UI
Tests
重要 Decision
Known Issues
Next
```

不要写成聊天流水账。

---

# 83. 正式 Milestone 顺序

当前官方施工顺序：

```text
M0  Foundations
M1  Auth / Family / Baby / App Shell
M2  Today / Daily Records / Timer
M3  Offline Sync / Conflict / Duplicate
M4  Growth
M5  Knowledge
M6  Health / Notification Foundation
M7  Media / Memories
M8  Mom / Privacy / Draft
M9  Gems
M10 Family Collaboration
M11 Baby / Settings / Search / Trash / Export
M12 Admin
M13 Backup / Restore / Docker / Cloudflare
M14 Hardening / Release Candidate
```

不得跨过未完成的基础依赖。

除非：

```text
任务明确要求
+
依赖实际上已经完成
```

---

# 84. Milestone 完成条件

一个 Milestone 必须同时完成需要的：

```text
Schema
Migration
API
Client
UI
States
Tests
Typecheck
Lint
Build
Visual Verification
Documentation
```

如果必须测试失败：

```text
Milestone = 未完成
```

---

# 85. 优先级定义

## P0 Blocker

例如：

```text
数据丢失
PRIVATE 泄露
Gem 重复扣/发
Timer 错误
Media 丢失
Backup 无法恢复
Admin 越权
```

P0 未清零禁止发布。

## P1 Major

例如：

```text
核心流程断裂
严重视觉偏差
缺关键状态
Search 权限错误
Duplicate 处理错误
```

## P2 Minor

例如：

```text
小视觉差异
低频体验优化
非阻断动效
```

---

# 86. Release 定义

RUNEW 不是：

```text
所有 Route 都能打开
```

就算完成。

Release Ready 必须满足：

```text
核心流程可用
Offline 可用
Timer 可恢复
Media 可恢复
PRIVATE 后端隔离
Gem Ledger 正确
Delete 可恢复
Backup 真实可 Restore
Admin 安全
视觉符合 RUNEW
关键测试通过
```

---

# 87. 每次任务结束前自问

### 这个改动会让数据更容易丢吗？

如果会：

```text
重新设计
```

### 其他家庭成员能访问不该访问的内容吗？

如果能：

```text
阻断发布
```

### App 重启会破坏这个流程吗？

如果是持久化相关流程且答案是会：

```text
必须修复
```

### UI 只是看起来完成，行为是假的吗？

如果是：

```text
任务未完成
```

### 是否新增了 PRD 没有定义的产品规则？

如果是：

```text
停止
创建 Decision
```

### 是否把 RUNEW 做成了普通 Dashboard？

如果是：

```text
重新阅读 Figma / UI Spec
```

### 一次失败是否可能永久丢失宝宝不可复刻的照片/声音？

如果会：

```text
数据安全设计未完成
```

---

# 88. Agent 最终汇报格式

每个任务结束时，简洁汇报：

```text
### Changed
- ...

### Database
- Migration，或 none

### API / Contract
- ...

### UI / States
- ...

### Verification
- typecheck:
- lint:
- tests:
- build:
- visual checks:

### Known Issues
- ...

### Documentation
- DEVELOPMENT_LOG updated: yes/no

### Status
Ready for next task / Not ready
```

禁止编造测试结果。

禁止隐藏失败。

---

# 89. 最终产品标准

进行任何工程取舍时都要记住：

RUNEW 未来保存的可能是：

```text
润润第一次叫“妈妈”的声音
一次无法复刻的笑声
第一次站起来的照片
妈妈在某个夜晚写下的日记
几年以后才打开的时光胶囊
```

这些内容可能永远无法重新创建。

因此研发标准不能只是：

```text
页面能打开
```

而应该是：

```text
交互正确
数据正确
权限正确
失败后数据还在
数据可以恢复
体验仍然温暖
```

# 🌱 润芽 · RUNEW

**把润润长大的每一天，认真收藏起来。**

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **runya** (5279 symbols, 9738 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/runya/context` | Codebase overview, check index freshness |
| `gitnexus://repo/runya/clusters` | All functional areas |
| `gitnexus://repo/runya/processes` | All execution flows |
| `gitnexus://repo/runya/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
