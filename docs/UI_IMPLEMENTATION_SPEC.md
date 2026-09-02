# 🌱 润芽 · RUNEW — UI_IMPLEMENTATION_SPEC.md

> **文档类型：** UI 实现规格说明书 / Design-to-Code Specification  
> **产品事实源：** `PRD_RUNEW_V3.0.md`  
> **UI 事实源：** Figma `11 R6.2 Mobile Complete`  
> **Figma：** https://www.figma.com/design/DB4flfcS0pWbJuMgDigRuF  
> **当前目标端：** Mobile  
> **设计基准：** 390 × 844  
> **兼容宽度：** 375 / 390 / 430  
> **目标技术栈：** Taro + React + TypeScript + Zustand + TanStack Query + ECharts + SCSS/CSS Modules  
> **文档目的：** 将 PRD 与 Figma 翻译为 Cursor / Codex 可直接执行的 UI、组件、交互、状态与视觉规范。

---

# 0. 文档治理与实现原则

## 0.1 事实源优先级

开发实现遇到冲突时，严格按以下优先级处理：

1. `PRD_RUNEW_V3.0.md`：业务规则、权限、功能边界、状态机最高事实源。
2. Figma `11 R6.2 Mobile Complete`：视觉、布局、页面结构、控件位置、交互入口的最高事实源。
3. 本文档：负责把 PRD + Figma 翻译为可复用组件、Route、Sheet、Dialog、State 和 CSS Token。
4. `TECHNICAL_DESIGN.md`：数据、API、离线、媒体、权限、备份等技术实现事实源。
5. 代码。

**禁止开发者或 AI 在上述文档存在明确规则时自行创造新的产品逻辑。**

如出现冲突：

- 业务行为冲突：PRD 优先；
- 视觉冲突：Figma 优先；
- 技术不可行：记录 Design/Tech Issue，不得静默降级；
- Figma Frame 只是某个状态时，不得为了“一稿一页”机械创建新路由。

## 0.2 关键原则：Figma Frame ≠ Route

当前 Figma 有 **268 张顶层 Mobile Frame**，但它们不是 268 个路由。

必须区分：

| 类型 | 定义 | 示例 |
|---|---|---|
| `ROUTE` | 独立业务页面，可通过导航/深链进入 | 今天、成长、知识详情 |
| `SUBROUTE` | 一级模块下的详情/列表/编辑页 | 日记详情、家庭任务、照片详情 |
| `SHEET` | 不改变主任务上下文的底部弹层 | 记录筛选、更多操作、选择日期 |
| `DIALOG` | 高风险或确认行为 | 删除确认、兑换确认、恢复确认 |
| `INLINE_STATE` | 同一路由内部状态变化 | 睡眠进行中、上传中、保存成功 |
| `LIST_VARIANT` | 同一列表的筛选结果 | 仅喂奶、健康·疫苗、睡眠分类 |
| `PERMISSION` | Just-in-time 权限解释层 | 麦克风、相机、通知 |
| `SYSTEM_NATIVE` | 调用微信/iOS/浏览器系统能力 | 拍照、相册、系统分享、系统权限 |

开发时应优先保持业务上下文连续，不为了匹配 Frame 数量制造路由。

## 0.3 当前 UI 实际基线

Figma 当前 Page 已核验：

- 顶层业务 Frame：**268**
- 每张主要移动端稿：**390×844**
- 页面背景：当前设计实际为约 `#FBF7F0`
- 主要视觉：Warm Glass + Cute Accent
- 字体设计稿：Noto Sans SC
- 当前常用圆角分布：R22 / R18 / R30 / R16 / R24 / R20 / R26 / R28
- 当前常用 Background Blur：12 / 14 / 10 / 18 / 22
- 当前常用控件尺寸：350×64、350×52、350×48、40×40、64×36、354×56
- 当前主要文本色：`#4A392F`
- 当前次级文本色：`#8D7D70`
- 当前暖杏强调：`#F3A05B` / `#E87D38`
- 语义辅助：Sage / Lavender / Sky / Blush

## 0.4 绝对禁止事项

实现中禁止：

- 把 Warm Glass 简化为普通纯白卡片；
- 所有按钮都使用同一个高饱和实橙色；
- 页面内随意新造颜色、圆角和阴影；
- 用 Emoji 大量替代设计图标；
- 用 Ant Design / 企业后台默认视觉替代管理员设计；
- 页面出现“HTTP 500”“暂无数据”“打卡失败”等机械文案；
- 把“仅家人可见”等设计说明当成所有页面常驻 UI；
- 删除 Figma 中的重要状态以“先做 Demo”；
- 把妈妈 PRIVATE 内容仅在前端隐藏；
- 上传失败后要求重新录音/重新拍照；
- 计时依赖前端 `setInterval` 维持业务真相；
- 将 268 张 Frame 逐一变成 268 个路由。

---

# 1. 交付目标与代码组织

## 1.1 本轮 UI 开发交付目标

当前开发范围只覆盖 Mobile：

- 微信小程序；
- H5 Mobile；
- 同一套 Taro React 代码；
- 375 / 390 / 430 宽度均可正常使用。

UI 开发完成的定义不是“页面能显示”，而是：

1. 视觉和 Figma 高度一致；
2. 所有主要按钮存在真实行为；
3. Route / Sheet / Dialog / Inline State 类型正确；
4. Loading / Empty / Error / Offline / Uploading / Success 状态齐全；
5. 草稿、计时、离线、上传等 UI 不因路由切换丢失；
6. 触摸热区符合规范；
7. 夜间模式、系统字体、Reduce Motion 可用；
8. 截图回归通过 375 / 390 / 430。

## 1.2 推荐前端目录

```text
src/
├── app.tsx
├── app.config.ts
├── styles/
│   ├── tokens.scss
│   ├── glass.scss
│   ├── typography.scss
│   ├── motion.scss
│   └── globals.scss
│
├── components/
│   ├── foundation/
│   ├── navigation/
│   ├── feedback/
│   ├── forms/
│   ├── records/
│   ├── growth/
│   ├── knowledge/
│   ├── health/
│   ├── memories/
│   ├── mom/
│   ├── gems/
│   ├── family/
│   ├── baby/
│   └── admin/
│
├── pages/
│   ├── auth/
│   ├── onboarding/
│   ├── today/
│   ├── records/
│   ├── growth/
│   ├── knowledge/
│   ├── health/
│   ├── memories/
│   ├── mom/
│   ├── gems/
│   ├── family/
│   ├── baby/
│   ├── settings/
│   └── admin/
│
├── stores/
├── hooks/
├── queries/
├── services/
├── types/
├── assets/
│   ├── icons/
│   ├── illustrations/
│   └── yaya-bear/
└── utils/
```

页面文件只负责组合业务区块和绑定行为；Glass、Button、Chip、Row、Dialog、Sheet 等不能在页面内复制实现。

---

# 2. Mobile 布局系统

## 2.1 Viewport

设计基准：

```text
390 × 844
```

必须截图验证：

```text
375 × 812
390 × 844
430 × 932
```

布局使用响应式宽度，不允许把设计稿中的 `x=20, width=350` 写死为固定 350：

```scss
.page-content {
  width: 100%;
  padding-inline: var(--space-20);
}

.full-card {
  width: 100%;
}
```

390 宽时：

```text
390 - 20 - 20 = 350
```

因此 Figma 中大量 `350px` 卡片应实现为 `width:100%`。

## 2.2 Safe Area

顶部：

```scss
padding-top: max(env(safe-area-inset-top), 0px);
```

底部 Floating Navigation：

```scss
bottom: calc(14px + env(safe-area-inset-bottom));
```

页面滚动区必须给 Bottom Nav 预留：

```scss
padding-bottom: calc(96px + env(safe-area-inset-bottom));
```

## 2.3 页面水平边距

默认：

| 场景 | 值 |
|---|---:|
| 主页面内容 | 20px |
| 紧凑表单 | 20px |
| Floating Nav | 18px |
| 局部卡片内部 | 14–20px |
| 极窄辅助内容 | 不低于 16px |

不允许页面之间随机出现 12 / 17 / 23px 主边距。

## 2.4 垂直节奏

推荐基础：

```text
4 / 8 / 12 / 16 / 20 / 24 / 28 / 32 / 40
```

主 section：

- Section Title → Content：12–16px
- Card → Card：10–12px
- 大区块 → 大区块：24–32px
- TopBar → 首区：20–28px

---

# 2.5 Route / Overlay Implementation Map

> 本节是 UI 实现级路由建议，不覆盖 `TECHNICAL_DESIGN.md` 的最终分包/路由配置；技术设计如调整路径名，必须保持这里定义的“页面 vs 状态”边界不变。

## 2.5.1 一级 Route

| 模块 | 建议 Route | Bottom Nav | Drawer |
|---|---|---|---|
| 登录 | `/pages/auth/login` | 否 | 否 |
| 注册 | `/pages/auth/register` | 否 | 否 |
| 首次使用 | `/pages/onboarding/index` | 否 | 否 |
| 今天 | `/pages/today/index` | 今天 | 是 |
| 日常记录 | `/pages/records/index` | 记录 | 是 |
| 成长 | `/pages/growth/index` | 无高亮 | 是 |
| 育儿知识 | `/pages/knowledge/index` | 无高亮 | 是 |
| 健康 | `/pages/health/index` | 无高亮 | 是 |
| 宝宝回忆 | `/pages/memories/index` | 回忆 | 是 |
| 妈妈空间 | `/pages/mom/index` | 无高亮 | 是 |
| 宝石商城 | `/pages/gems/index` | 无高亮 | 是 |
| 我们的小家 | `/pages/family/index` | 小家 | 是 |
| 宝宝档案 | `/pages/baby/index` | 无高亮 | 是 |
| 设置 | `/pages/settings/index` | 无高亮 | 是 |
| 管理员验证 | `/pages/admin/auth` | 否 | 否 |
| 管理模式 | `/pages/admin/index` | 否 | 否 |

## 2.5.2 二级 Route 建议

### Records

```text
/pages/records/detail?id=
/pages/records/feeding
/pages/records/breastfeeding
/pages/records/sleep
/pages/records/diaper
/pages/records/food
```

`02.02 筛选记录`、`02.14 选择日期` 不创建 Route，分别为 Sheet / Date Overlay。

### Growth

```text
/pages/growth/index?metric=height|weight|head
/pages/growth/milestones
/pages/growth/milestone-detail?id=
/pages/growth/monthly-story?month=
/pages/growth/record-detail?id=
```

`03.02 / 03.03` 优先通过同一 Route 参数/状态切换，而不是三个独立趋势 Route。

### Knowledge

```text
/pages/knowledge/index?category=
/pages/knowledge/search
/pages/knowledge/detail?id=
/pages/knowledge/library?state=favorite|later|learned
/pages/knowledge/source?id=
```

`04.07 学到了状态`、`04.09 内容有更新` 是内容状态，不独立建 Route。

### Health

```text
/pages/health/index?type=all|checkup|vaccine|visit
/pages/health/detail?id=
/pages/health/edit?id=
/pages/health/timeline
/pages/health/attachment?id=
```

`提醒设置` 可以是 Sheet；日期选择使用系统/Taro Picker。

### Memories

```text
/pages/memories/index
/pages/memories/photos
/pages/memories/photo-detail?id=
/pages/memories/quotes
/pages/memories/quote-detail?id=
/pages/memories/audio
/pages/memories/audio-detail?id=
/pages/memories/firsts
/pages/memories/first-detail?id=
/pages/memories/capsules
/pages/memories/capsule-detail?id=
/pages/memories/favorites
/pages/memories/on-this-day
/pages/memories/annual-review?year=
```

录音中、播放器播放/暂停、胶囊封存动画是状态，不创建 Route。

### Mom

```text
/pages/mom/index
/pages/mom/diaries
/pages/mom/diary-detail?id=
/pages/mom/diary-edit?id=
/pages/mom/mood-calendar
```

心情选择/可见范围优先 Inline / Sheet。

### Gems

```text
/pages/gems/index
/pages/gems/reward-detail?id=
/pages/gems/orders
/pages/gems/ledger
/pages/gems/custom-wish?id=
```

兑换确认、取消确认均为 Dialog。

### Family

```text
/pages/family/index
/pages/family/members
/pages/family/member-detail?id=
/pages/family/tasks
/pages/family/task-detail?id=
/pages/family/achievements
/pages/family/achievement-detail?id=
/pages/family/anniversaries
/pages/family/anniversary-detail?id=
/pages/family/join
```

创建/加入家庭可复用同一 `join` 流程的 mode。

### Baby

```text
/pages/baby/index
/pages/baby/edit
/pages/baby/preferences?type=like|dislike
/pages/baby/changes
/pages/baby/switch
```

一个宝宝时不要创建“切换宝宝”入口。

### Settings

```text
/pages/settings/index
/pages/settings/account
/pages/settings/notifications
/pages/settings/dnd
/pages/settings/appearance
/pages/settings/night
/pages/settings/privacy
/pages/settings/backup
/pages/settings/storage
/pages/settings/export
/pages/settings/backup-history
/pages/settings/deleted
/pages/settings/about
```

### Admin

```text
/pages/admin/auth
/pages/admin/index
/pages/admin/gems
/pages/admin/gem-rules
/pages/admin/rewards
/pages/admin/knowledge
/pages/admin/content
/pages/admin/members
/pages/admin/data
/pages/admin/system
/pages/admin/audit
```

新增/编辑管理对象可选择二级 Route 或全屏 Sheet，但同一类资源必须保持一致。

## 2.5.3 Overlay Registry

以下默认不创建业务 Route：

| UI | 容器 |
|---|---|
| `00.10 留下这一刻` | Bottom Sheet |
| `02.02 筛选记录` | Bottom Sheet |
| `02.12 删除确认` | Confirm Dialog |
| `02.13 重复记录` | Decision Dialog |
| `02.14 选择日期` | Date Sheet / Picker |
| `04.08 更多操作` | Action Sheet |
| `05.06 提醒设置` | Bottom Sheet |
| `06.19 封存确认` | Confirm Dialog |
| `07.08 可见范围` | Bottom Sheet |
| `08.03 兑换确认` | Confirm Dialog |
| `08.09 取消兑换` | Confirm Dialog |
| `11.18 恢复确认` | Confirm Dialog |
| `12.28 危险操作二次认证` | Secure Dialog / Full-screen Overlay |
| `13.30 相机权限` | Permission Sheet → System Permission |
| `13.31 通知权限` | Permission Sheet → System Permission |
| `15.04 选择媒体来源` | Action Sheet → System Native |

## 2.5.4 Inline State Registry

以下状态应由同一页面状态机渲染：

```text
Today: Default / SleepRunning / FeedingRunning / Finish feedback
Records: Filter / Running / Paused / Pending Sync
Knowledge: Learned / Saved / Later / Updated
Upload: Uploading / Failed / Retry / Synced
Diary: Draft Restored
Delete: Undo
Admin: Session Remaining / Session Expired
```

## 2.5.5 小程序分包建议（UI 加载层面）

为了避免首包被 268 张设计对应资源拖大，UI 资源建议按业务分包：

```text
Main package:
  auth / onboarding / today / records / shared design system

subpackage-growth:
  growth / knowledge / health

subpackage-memories:
  memories / mom

subpackage-family:
  gems / family / baby / settings

subpackage-admin:
  admin
```

最终分包体积与路径由 `TECHNICAL_DESIGN.md` 决定，但**Illustration 和 Audio/Photo 示例资源不得全部进入首包**。

---

# 3. Design System

## 3.1 Color Tokens

以下为当前 Figma 的开发标准化 Token。视觉微调以截图回归为准，不允许页面私自改色。

```scss
:root {
  // Background
  --color-bg-page: #FBF7F0;
  --color-bg-page-alt: #FAF8F4;
  --color-surface-cream: #FFFCF7;

  // Text
  --color-text-primary: #4A392F;
  --color-text-primary-admin: #473830;
  --color-text-secondary: #8D7D70;
  --color-text-secondary-admin: #8A786B;
  --color-text-tertiary: #8E8177;
  --color-text-inverse: #FFFFFF;

  // Warm Apricot
  --color-apricot: #F3A05B;
  --color-apricot-strong: #E87D38;
  --color-apricot-soft: #F7E0C7;
  --color-apricot-pale: #F8E5D0;

  // Sage
  --color-sage: #9BC4A3;
  --color-sage-strong: #5C9466;
  --color-sage-soft: #E8F1E8;

  // Lavender
  --color-lavender: #C7B9E8;
  --color-lavender-strong: #8C73C7;
  --color-lavender-soft: #EEE8FA;

  // Sky
  --color-sky: #A9CCE8;
  --color-sky-strong: #619EC2;
  --color-sky-soft: #E8F3F9;

  // Blush
  --color-blush: #F5C2B8;
  --color-blush-strong: #DF827D;
  --color-blush-soft: #F8E7E7;

  // Danger
  --color-danger-bg: #F7E3E0;
  --color-danger-text: #D97C73;

  // Lines
  --color-border-warm: rgba(238, 226, 215, .86);
  --color-border-white: rgba(255, 255, 255, .62);
}
```

## 3.2 模块语义色

语义色用于 Icon Chip、选中态、弱背景染色、CTA 图标，不用于整页大面积铺色。

| 模块/动作 | 主语义 |
|---|---|
| 日常 / 通用新增 / 宝石 / 管理 | Warm Apricot |
| 成长 / 健康 / 小家 / 数据备份 | Sage |
| 睡眠 / 宝宝声音 / 夜间 | Lavender |
| 回忆 / 照片 / 宝宝档案 | Sky |
| 妈妈 / 心情 / 日记 | Blush |
| Danger | Danger Blush/Red |

禁止“为了可爱”让每张卡随机取不同颜色。

## 3.3 Glass Surface Tokens

### `glass-page`

页面不是玻璃层，本身为暖奶油底：

```scss
background: var(--color-bg-page);
```

允许非常轻的装饰渐变 / 低透明矢量光斑，不承载业务信息。

### `glass-control`

用于：

- TopBar 圆按钮；
- 小图标按钮；
- 紧凑选择器。

```scss
background: rgba(255, 252, 247, .94);
border: 1px solid rgba(238, 226, 215, .86);
backdrop-filter: blur(14px);
box-shadow:
  0 5px 16px rgba(92, 69, 51, .10),
  inset 0 1px 1px rgba(255, 255, 255, .42);
```

典型尺寸：40×40，R20。

### `glass-card`

用于普通内容卡、列表行：

```scss
background: rgba(255, 255, 255, .76);
border: 1px solid rgba(255, 255, 255, .62);
backdrop-filter: blur(12px);
box-shadow:
  0 5px 14px rgba(87, 64, 46, .07),
  inset 0 1px 1px rgba(255, 255, 255, .24);
```

默认 R22。

### `glass-hero`

用于宝宝卡、知识主推荐、家庭 Hero、管理分区 Hero：

```scss
background: rgba(255, 252, 247, .74);
border: 1px solid rgba(255, 255, 255, .58);
backdrop-filter: blur(18px);
box-shadow:
  0 8px 24px rgba(125, 96, 64, .09),
  inset 0 1px 1px rgba(255, 255, 255, .34);
```

默认 R24–28。

### `glass-floating`

用于 Bottom Nav / 强悬浮面板：

```scss
background: rgba(255, 255, 255, .90);
border: 1px solid rgba(255, 255, 255, .90);
backdrop-filter: blur(22px);
box-shadow: 0 8px 22px rgba(97, 69, 46, .12);
```

Bottom Nav：R28。

### `glass-tinted`

语义染色不要覆盖 Glass，而是叠加 8–16% 色层：

```scss
background:
  linear-gradient(var(--semantic-tint), var(--semantic-tint)),
  rgba(255, 252, 247, .74);
```

建议：

```text
Apricot  8–14%
Sage     8–14%
Lavender 8–14%
Sky      8–14%
Blush    8–14%
```

## 3.4 Backdrop Filter 降级策略

微信小程序/H5 对 `backdrop-filter` 支持差异必须预案。

当不支持 Blur 时：

1. 保留半透明/偏实的暖白填充；
2. 保留 Border；
3. 保留顶部 Inner Highlight；
4. 保留 Soft Shadow；
5. 不允许直接退化为无层次纯白块。

建议增加：

```scss
@supports not (backdrop-filter: blur(10px)) {
  .glass-card {
    background: rgba(255, 252, 247, .96);
  }
}
```

截图验收必须同时验证微信真机。

## 3.5 Radius

当前 Figma 高频值已核验，代码收敛成以下 Token：

```scss
--radius-control: 20px;
--radius-chip: 16px;
--radius-quick: 18px;
--radius-card: 22px;
--radius-hero: 24px;
--radius-hero-lg: 26px;
--radius-floating: 28px;
--radius-page-preview: 30px; // 仅设计稿容器，不用于真实浏览器 body
```

## 3.6 Shadow

```scss
--shadow-control: 0 5px 16px rgba(92,69,51,.10);
--shadow-card: 0 5px 14px rgba(87,64,46,.07);
--shadow-soft-card: 0 7px 16px rgba(115,82,51,.07);
--shadow-hero: 0 8px 24px rgba(125,96,64,.09);
--shadow-floating: 0 8px 22px rgba(97,69,46,.12);
```

任何新阴影必须来自 Token。

## 3.7 Typography

Figma 主要使用 Noto Sans SC；生产端不要求打包字体文件。使用系统中文字体栈：

```scss
font-family:
  -apple-system,
  BlinkMacSystemFont,
  "PingFang SC",
  "Noto Sans SC",
  "Microsoft YaHei",
  sans-serif;
```

建议 Token：

| Token | Size | Weight | 用途 |
|---|---:|---:|---|
| `status` | 9 | 500 | 状态栏模拟/极小辅助 |
| `navLabel` | 9 | 400–700 | Bottom Nav |
| `micro` | 10 | 400–500 | 时间、极小辅助 |
| `caption` | 11 | 400–500 | 副信息 |
| `bodySm` | 12 | 400–500 | 辅助正文 |
| `body` | 13 | 400–500 | 列表正文 |
| `bodyLg` | 14 | 500 | 设置/管理员列表标题 |
| `cardTitle` | 16 | 600–700 | 重点卡标题 |
| `sectionTitle` | 18 | 700 | 模块 Section |
| `pageTitle` | 24 | 700 | 页面标题 |
| `metric` | 28–42 | 700 | 成长/计时核心数字 |

**原则：不要为了“完全复刻”把正文大量做成 9–10px。** Figma 中 9px 主要用于 Nav/时间/状态；业务正文最小应优先 11–12px，并验证系统字体放大。

## 3.8 Icon System

一级功能图标不得直接使用 Emoji 作为最终实现。

统一组件：

```tsx
<CuteIconChip
  tone="sage"
  icon="growth"
/>
```

规范：

- 外层 48×48；
- 内层约 28–30；
- 双层 Glass Bubble；
- 图标光学居中；
- 可有 1–2 个 2–4px Sparkle / Sprout Accent；
- 业务图标统一 Stroke / Weight；
- 触摸热区不小于 48；
- 可爱来自圆润、层次、轻贴纸感，不来自堆 emoji。

## 3.9 Illustration / Cute Background Art

高情绪价值 Hero 可以使用低透明矢量背景插画：

- Today：宝宝 / 小芽；
- Growth：嫩芽 / 小尺子；
- Knowledge：书本 + 小芽；
- Health：柔和健康符号；
- Memories：相机 / 星星 / 录音；
- Mom：小花 / 心形；
- Gems：宝石 / 礼物 / 奶茶 / 花；
- Family：小屋 / 植物；
- Baby Profile：宝宝与小芽。

要求：

- SVG / 可编辑矢量优先；
- 不使用大尺寸摄影图当纯背景；
- 不遮挡文字；
- 默认 opacity 12–30%；
- `aria-hidden=true`；
- 资源放入 `assets/illustrations/`；
- 芽芽熊是品牌陪伴 IP，但真正主角始终是宝宝。

---

# 4. Button / Chip / Control System

## 4.1 主按钮 `PrimaryActionButton`

目标：清晰可点击，但不使用厚重实橙抢视觉。

默认：

```text
height: 52px
min touch target: 52px
radius: 24px
horizontal padding: 20px
icon gap: 8px
```

Warm Apricot 示例：

```scss
background: rgba(247, 224, 199, .92);
color: #E87D38;
border: 1px solid rgba(243, 167, 100, .28);
box-shadow: 0 6px 16px rgba(97,69,46,.09);
```

语义 Variant：

```ts
tone: 'apricot' | 'sage' | 'lavender' | 'sky' | 'blush'
```

按钮图标与文字整体居中，不允许“图标居中、文字偏右”。

## 4.2 次级按钮 `SecondaryGlassButton`

```scss
background: rgba(255, 252, 247, .86);
border: 1px solid rgba(238, 226, 215, .86);
color: var(--color-text-primary);
```

高度：

- 普通：48px；
- 紧凑：40px，但外部热区仍应 ≥48px。

## 4.3 Tertiary / Ghost

用于：

- 取消；
- 轻量“查看全部”；
- 非主要文本操作。

不使用大面积背景，但必须保证可识别为操作。

## 4.4 Danger

仅用于：

- 删除；
- 清空；
- 下架；
- 关闭备份；
- 删除宝宝档案；
- 删除全部照片；
- 其他不可逆/高风险动作。

```scss
background: #F7E3E0;
color: #D97C73;
```

危险操作必须与确认 Dialog / 管理员二次认证配套。

## 4.5 Filter Chip

状态：

```ts
'default' | 'selected' | 'disabled'
```

默认浅 Glass，选中使用语义 tint + 语义文本，不用纯实心深色。

## 4.6 SegmentedControl

用于成长指标、健康类型等。

要求：

- 选中态明显；
- 不仅靠颜色，需增加背景/字体 weight/indicator；
- 单个 Segment 热区 ≥44，高度不足时扩展透明 hit area。

---

# 5. Component Spec

## 5.1 Foundation Components

### `<PageShell />`

Props：

```ts
interface PageShellProps {
  children: React.ReactNode;
  bottomNav?: boolean;
  night?: boolean;
  scroll?: boolean;
  className?: string;
}
```

职责：

- 页面背景；
- Safe Area；
- 滚动；
- Bottom Nav 空间；
- 全局主题；
- 禁止承载业务数据。

### `<GlassSurface />`

```ts
type GlassLevel =
  | 'control'
  | 'card'
  | 'hero'
  | 'floating'
  | 'tinted';

interface GlassSurfaceProps {
  level: GlassLevel;
  tone?: SemanticTone;
  radius?: 'control'|'chip'|'quick'|'card'|'hero'|'floating';
  interactive?: boolean;
}
```

这是整个 RUNEW UI 的基础组件，禁止页面重复写一套 glass CSS。

### `<SectionHeader />`

Props：

```ts
title
actionLabel?
onAction?
caption?
```

标题默认 18px Bold。

## 5.2 Navigation Components

### `<AppTopBar />`

Variants：

```text
home
standard
admin
```

Home：

- 左 40×40 MenuButton；
- 中间 Page Greeting / title；
- 右侧 GemBadge / optional notification。

Standard：

- 左 Back；
- 中 Title；
- 右 Action。

Admin：

- Back；
- 管理图标 Chip；
- Title / caption；
- SessionRemaining。

### `<RoundIconButton />`

40×40 Glass Control，实际触摸热区 ≥48。

### `<GemBadge />`

典型视觉：64×36 / R18 / Apricot tint。

### `<BottomNav />`

固定 5 个等分区域：

```text
今天 / 记录 / + / 回忆 / 小家
```

当前 Figma：354×56，R28。

组件必须创建真实五等分点击区域，不得只让图标文字可点。

```ts
active: 'today' | 'records' | 'memories' | 'family' | null
```

中央 `+`：

- 52×52；
- 高于背景一层；
- 进入 `AddMomentSheet`；
- 不作为一个 Tab Route。

### `<AppDrawer />`

组成：

- Brand Header Glass Hero；
- 宝宝/宝石上下文；
- 11 个菜单；
- 管理模式独立入口。

菜单 Row 统一：

```text
height 52–56
icon chip 48×48
title
chevron
```

禁止每一行不同高度。

## 5.3 Button Components

必须实现：

```tsx
<PrimaryActionButton />
<SecondaryGlassButton />
<IconActionButton />
<DangerButton />
<TextAction />
```

通用状态：

```text
default
pressed
loading
disabled
success
```

Loading 时保留按钮宽度，避免 Layout Shift。

## 5.4 Form Components

必须统一：

```text
GlassInput
GlassTextArea
FormRow
FormSection
NumberStepper
UnitInput
DateTrigger
TimeTrigger
DateTimeTrigger
OptionChip
SegmentedControl
SwitchRow
RadioRow
VisibilitySelector
MediaPicker
```

表单原则：

- 日期/时间不要求用户纯文本输入；
- 数字与单位基线对齐；
- Keyboard 类型正确；
- 保存前不要求填写非必要字段；
- 长文本自动草稿；
- 错误信息放在字段附近，不用全屏错误。

## 5.5 Feedback Components

```text
Skeleton
EmptyState
ErrorState
OfflineBanner
SyncBadge
UploadProgress
Toast
SuccessMoment
UndoToast
PermissionSheet
ConfirmDialog
BottomSheet
```

### `<EmptyState />`

结构：

- 小型品牌插画/芽芽熊；
- 一句温柔标题；
- 一句说明；
- 可选 CTA。

禁止“暂无数据”。

### `<ErrorState />`

网络错误：

- 明确“刚刚的内容已安全保存在本机”；
- 可重试；
- 不暴露 HTTP 状态码。

### `<UndoToast />`

删除成功后：

```text
已移到最近删除    撤销
```

默认可撤销时间由技术设计定义；数据本身进入 30 天最近删除。

## 5.6 业务组件

### Records

```text
RecordTimeline
RecordTimelineItem
RecordTypeIcon
RunningTimerCard
FeedingAmountPicker
BreastSideTimer
DiaperSelector
FoodAmountSelector
DuplicateRecordDialog
```

### Growth

```text
GrowthMetricHero
GrowthTrendChart
GrowthMetricTabs
MilestoneCard
MonthlyStoryCard
```

Chart 必须：

- ECharts；
- 有数值详情；
- 不只靠曲线颜色表达指标；
- Tooltip 对触摸友好。

### Knowledge

```text
KnowledgeHeroCard
KnowledgeCard
KnowledgeCategoryTabs
KnowledgeMeta
KnowledgeUserActions
LearnedTransition
```

每张知识内容至少支持：

- why recommended；
- age range；
- source；
- reviewed/updated time；
- version；
- learned state。

### Health

```text
HealthCalendar
HealthNextEventCard
HealthEventRow
HealthEventForm
ReminderEditor
AttachmentPreview
```

健康 UI 是信息提醒，不做诊断判断。

### Memories

```text
MemoryHero
PhotoMemoryCard
QuoteCard
AudioMemoryCard
AudioPlayer
Waveform
FirstTimeCard
TimeCapsuleCard
TimeCapsuleSealDialog
AnnualReviewCard
```

AudioPlayer：

- Play/Pause 是 Inline Action；
- Waveform/Progress；
- Current time / duration；
- 不为 Pause 新建 Route。

### Mom

```text
MoodPicker
MoodOption
MoodCalendar
DiaryCard
DiaryEditor
VisibilitySelector
```

妈妈空间不得出现：

- 连续天数 KPI；
- 平均心情分；
- 未完成提示；
- 与其他家人对比。

### Gems

```text
GemBalanceHero
RewardCard
RewardDetail
GemLedgerItem
RewardOrderStatus
CustomWishEditor
```

### Family

```text
FamilyHero
FamilyMemberCard
FamilyTaskCard
AchievementCard
AnniversaryCard
InviteFamilyPanel
```

禁止贡献排行榜。

### Baby

```text
BabyProfileHero
BabyBasicInfo
PreferenceTag
RecentChangeItem
BabySwitcher
```

宝宝档案是“人物页”，不是医院表单。

### Settings/Admin

```text
SettingRow
SettingSection
BackupStatusCard
StorageUsageCard
AdminMenuRow
AdminSessionBadge
AdminDataStatusCard
AuditLogRow
DangerZone
```

管理员列表当前 Figma 典型：

```text
350×56
R22
48×48 双层 Glass Icon Chip
Title 14
Caption 11
Chevron
```

---

# 6. Interaction Spec

## 6.1 Press Feedback

可点击 Card / Button：

```text
press down: 100–140ms
scale: 0.985–0.99 或 translateY(1px)
shadow: 略收紧
opacity: 不低于 .92
release: 140–180ms
```

禁止夸张 bounce。

## 6.2 页面导航

普通 push：

```text
220–300ms
```

建议：

- H5：轻微 horizontal / fade；
- 小程序：优先使用平台自然 transition；
- 不为了动效破坏返回手势和性能。

## 6.3 Bottom Sheet

进入：

```text
backdrop fade 160–220ms
sheet translateY 260–320ms
```

退出：

```text
220–280ms
```

支持点击遮罩/关闭按钮；存在未保存内容时遵循草稿/确认规则。

## 6.4 Dialog

Dialog 不做大幅位移：

```text
opacity + scale .97 → 1
180–240ms
```

危险 Dialog 视觉克制，不使用全红大面积背景。

## 6.5 关键情绪动效

### 普通记录成功

```text
保存
→ “记好啦”
→ 宝石 +N 轻出现
→ 宝石向余额方向移动/淡出
→ Timeline 插入新记录
```

总时长建议 500–700ms。

### 成长记录

```text
新点出现
→ 曲线轻延展
→ 小芽轻轻长高
```

### 知识“学到了”

```text
点击
→ ✓
→ 卡片轻折叠
→ 从推荐流移出
→ 下一张自然补位
```

### 时光胶囊封存

```text
内容收拢
→ 信封/胶囊封存
→ 状态 SEALED
```

属于情绪动效，允许 700–900ms，但不能阻塞保存。

### 开始睡眠

```text
按钮确认
→ 页面切到 Running State
→ 月亮/星点轻进入
→ Timer 由 start_time 推导
```

## 6.6 Reduce Motion

系统开启减少动态效果时：

- 禁止大幅位移；
- 禁止宝石飞行动画；
- 禁止持续呼吸动画；
- 用 100–150ms Fade / State change 代替；
- 业务反馈必须仍然存在。

---

# 7. 全局导航与入口

## 7.1 Drawer

11 个一级菜单：

```text
今天
日常记录
成长
育儿知识
健康
宝宝回忆
妈妈空间
宝石商城
我们的小家
宝宝档案
设置
```

管理模式是独立入口，不算第 12 个普通菜单。

## 7.2 Bottom Nav

固定快捷入口：

```text
今天
记录
+
回忆
小家
```

Growth / Knowledge / Health / Mom / Gems / Baby / Settings 通过 Drawer 进入时，不错误高亮其它 Tab。

## 7.3 `+` 留下这一刻

`00.10 留下这一刻` 应实现为 `BottomSheet` / overlay，而不是独立业务 route。

入口：

```text
喂奶
睡眠
尿布
辅食
成长
照片
宝宝声音
宝宝语录
心情
日记/心得
```

满足：

- 重要入口 ≥56px；
- 最近使用可选增强；
- 关闭不影响当前页面；
- 已开始计时/输入草稿不会被无提示丢弃。

## 7.4 全局搜索

搜索结果必须按权限过滤：

```text
日常
成长
知识
健康
回忆
日记
```

PRIVATE 妈妈日记对于无权限成员：

```text
搜索索引不返回
API 不返回
UI 不出现
```

---

# 8. 状态系统

所有主页面至少考虑：

```text
Default
Loading
Empty
Error
Offline
Success
Disabled
Uploading
Pending Sync
Permission
Draft Restored
Deleted/Undo
```

## 8.1 Loading

优先 Skeleton。

不得用一个大 Spinner 占据整个页面。

Skeleton 形状应接近目标卡片：

- Hero Skeleton；
- List Row Skeleton；
- Grid Skeleton；
- Timeline Skeleton。

## 8.2 Offline

普通记录：

```text
用户点击保存
→ 本地成功
→ UI 立即显示记录
→ 标记“待同步”
→ 网络恢复自动同步
```

UI 不显示“保存失败”。

## 8.3 Uploading

图片/音频：

```text
本地资源先可靠保留
→ 业务记录可显示
→ 上传进度
→ 成功移除 pending 标记
→ 失败显示重试
```

不能要求用户重新录制。

## 8.4 Auto Draft

至少支持：

- 日记；
- 宝宝语录；
- 时光胶囊；
- 医疗备注；
- 长文本知识编辑（管理员）。

恢复时用温和提示，不强制阻断。

## 8.5 Delete / Restore

普通删除：

```text
删除
→ Confirm（必要时）
→ 从当前列表移除
→ Undo
→ 最近删除保留 30 天
```

---

# 9. Auth / Onboarding UI

Figma：

```text
00.01 登录
00.02 注册
00.03 欢迎来到润芽
00.04 创建宝宝档案
00.05 选择家庭身份
00.06 关注主题
```

## 9.1 登录

建议 Route：

```text
/pages/auth/login
```

要求：

- 品牌识别优先于普通后台登录感；
- CTA 使用产品化语言；
- 输入错误为字段级错误；
- Loading 不允许按钮重复提交；
- 登录成功根据 family/baby 初始化状态跳转 Today 或 Onboarding。

## 9.2 Onboarding

Route 可合并为单个 Wizard：

```text
/pages/onboarding/index
```

内部 step：

```text
welcome
baby
identity
topics
```

不建议四个独立小程序路由。

完成后：

```text
进入 Today
```

权限申请不放在 Onboarding 一次性全部请求。

---

# 10. Today 实现规格

**Figma 主 Frame：** `01.01 今天`  
**Node：** `195:437`  
**建议 Route：** `/pages/today/index`

## 10.1 页面结构

从上到下：

1. Safe Area；
2. TopBar；
3. 宝宝 Hero；
4. 快捷入口；
5. 今天记忆；
6. 今日时间线；
7. Floating Bottom Nav。

当前 Figma 关键实测：

- Page：390×844；
- Page bg：`#FBF7F0`；
- 宝宝 Hero：350×96，R24，Warm Cream Glass；
- Quick Tile：78×70，R18；
- Bottom Nav：354×56，R28；
- Menu Button：40×40，R20。

## 10.2 Today 状态

```text
Default
SleepRunning
FeedingRunning
SleepFinished
FeedingFinished
```

`01.02 / 01.03 / 01.06 / 01.07` 都是 Today 的业务状态，不建议创建四个独立主路由。

状态来源必须来自业务 Store/Server，不来自本地 UI 是否曾打开。

## 10.3 快捷入口

```text
日常记录 → Records
成长 → Growth
健康 → Health
宝宝回忆 → Memories
```

Tile 整块可点，不只图标可点。

## 10.4 今日时间线

展示最近关键记录。

点击某条：

```text
→ Record Detail
```

“全部”：

```text
→ 01.05 今天全部记录
```

## 10.5 Today 验收

- 390 下与 Figma 首屏层级一致；
- 375 不挤压；
- 430 不无限拉宽卡片内容；
- Running State 在切后台后恢复正确；
- Bottom Nav 不遮住最后一条 Timeline；
- 宝石 Badge 变化不导致 TopBar 位移。

---

# 11. 日常记录实现规格

**主 Frame：** `02.01 日常记录`  
**Node：** `195:670`  
**Route：** `/pages/records/index`

## 11.1 列表页

必须支持：

- 日期切换；
- 全部；
- 喂奶；
- 睡眠；
- 尿布；
- 辅食；
- Running 状态；
- Timeline；
- Record Detail。

`14.01–14.04` 是同一 Route 的 Filter Variant。

## 11.2 奶瓶

Create 可用独立子页或 Bottom Sheet，推荐：

```text
/pages/records/feeding
```

字段：

```text
amount
time
type
optional note
```

核心字段优先。

## 11.3 母乳计时

状态：

```text
idle
running-left
running-right
paused
finished
```

UI 每秒显示可以刷新，但业务真相：

```text
start_time
pause intervals
end_time
```

页面销毁后可恢复。

## 11.4 睡眠

支持：

- 立即开始；
- 手动补录；
- 调整开始/结束；
- 进行中；
- 结束。

## 11.5 Duplicate

`02.13 重复记录` 必须是业务 Dialog：

```text
可能重复
[合并]
[都保留]
```

绝不静默删除。

## 11.6 Record Detail

统一 Detail Shell：

```text
type
time
value
created_by
updated_at
note
edit
delete
copy
```

不同 Record Type 用配置扩展，而不是复制四套 Detail 页面代码。

---

# 12. Growth 实现规格

**主 Frame：** `03.01 成长`  
**Node：** `195:1176`  
**Route：** `/pages/growth/index`

## 12.1 页面区块

- 当前核心指标；
- 身高/体重/头围 Segment；
- 趋势图；
- 记录成长；
- 里程碑；
- 这个月的润润。

`03.02 / 03.03` 与主页面共用同一 Chart 容器，仅 metric 切换。

## 12.2 Chart

ECharts 配置必须做到：

- Tooltip 显示日期 + 数值 + 单位；
- 可通过 Tab 切指标；
- 不仅靠颜色区分；
- 可访问模式有数值列表；
- 空数据使用 Empty State，不渲染假曲线。

## 12.3 Record Growth

支持：

```text
height
weight
headCircumference
recordedAt
note?
```

至少一个指标有值即可保存。

## 12.4 Milestone

支持：

```text
list
create
detail
edit/delete (通过 detail 的操作)
```

新增后可出现轻量庆祝，但不阻塞返回。

---

# 13. Knowledge 实现规格

**主 Frame：** `04.01 育儿知识`  
**Node：** `197:3`  
**Route：** `/pages/knowledge/index`

## 13.1 推荐

推荐卡必须体现：

```text
标题
摘要
为什么推荐
适用月龄
来源
更新时间/审核时间
版本
```

## 13.2 分类

当前 UI 分类 Variant：

```text
辅食
睡眠
出牙
发育
语言
认知
```

`14.05–14.09 / 14.19` 是同一列表 route 的 category state。

## 13.3 用户状态

每篇知识存在：

```text
default
saved
readLater
learned
dismissed/reduce
updatedAfterLearned
```

“学到了”：

1. 当前 content version 标记 learned；
2. 从推荐流自然移除；
3. 出现在已学；
4. 如果 content version 变化，可显示“内容有更新”。

## 13.4 详情

`04.03`：

- 正文阅读；
- 来源；
- 收藏；
- 稍后看；
- 学到了；
- 更多；
- 反馈。

禁止在 UI 中把知识呈现为诊断。

---

# 14. Health 实现规格

**主 Frame：** `05.01 健康`  
**Node：** `197:302`  
**Route：** `/pages/health/index`

## 14.1 主区块

- Calendar；
- 下一事项；
- 类型筛选；
- Timeline；
- Add Health Event。

## 14.2 Event Type

```text
体检/儿保
疫苗
就诊
牙科
用药提醒
其他
```

## 14.3 Form

新增/编辑：

- 类型；
- 日期；
- 时间；
- 标题；
- 地点；
- 提醒；
- 备注；
- 附件。

必须使用 Date/Time Picker Trigger。

## 14.4 Reminder

提醒是用户主动创建的健康事项提醒。

不得：

- 自动诊断；
- 根据输入症状给疾病结论；
- 用恐吓式红色文案。

---

# 15. Memories 实现规格

**主 Frame：** `06.01 宝宝回忆`  
**Node：** `198:3`  
**Route：** `/pages/memories/index`

## 15.1 页面体验

这是“润润的小小博物馆”，不是文件管理器。

内容：

```text
照片
宝宝语录
宝宝声音
第一次
时光胶囊
珍藏
去年的今天
年度回顾
```

## 15.2 照片

流程：

```text
照片列表
→ 添加
→ 系统相机/相册
→ 本地预览
→ 填故事/日期
→ 保存
→ 上传
→ 详情
→ 编辑/删除
```

选择相机/相册属于 SYSTEM_NATIVE。

## 15.3 Baby Quote

支持：

- text；
- optional audio；
- date；
- tags；
- edit；
- delete；
- auto draft。

## 15.4 Baby Audio

录音流程：

```text
点击录音
→ JIT 麦克风权限
→ Recording
→ 停止
→ 本地文件可靠保存
→ 填标题
→ 保存业务记录
→ 后台上传
```

离开页面不能丢录音。

## 15.5 Audio Player

Inline：

```text
play/pause
progress/waveform
duration
seek
favorite
```

不要为 Pause 创建页面。

## 15.6 Time Capsule

状态机：

```text
DRAFT
  ↓ seal
SEALED
  ↓ open_at reached + user opens
OPENED
```

规则：

- Draft 可编辑；
- Seal 后不可普通编辑；
- 封存有确认；
- 倒计时属于展示；
- Open 后保留原内容；
- 媒体可包含 text/photo/audio/video。

---

# 16. Mom Space 实现规格

**主 Frame：** `07.01 妈妈空间`  
**Node：** `199:3`  
**Route：** `/pages/mom/index`

## 16.1 视觉

全产品节奏最安静：

- Blush / Lavender / Cream；
- 更多留白；
- 动效更弱；
- 不使用任务进度 KPI。

## 16.2 Mood

统一选项：

```text
很好
不错
一般
有点累
需要抱抱
```

每个状态必须图形 + 文字，不只用颜色。

## 16.3 Diary

流程：

```text
列表
→ 写日记
→ 自动草稿
→ 保存
→ 详情
→ 编辑
→ 删除
→ 最近删除
```

## 16.4 Visibility

默认：

```text
PRIVATE
```

用户主动调整后可共享。

后端权限是最终边界；UI 仅表现状态。

---

# 17. Gem Store 实现规格

**主 Frame：** `08.01 宝石商城`  
**Node：** `199:327`  
**Route：** `/pages/gems/index`

## 17.1 页面语义

这不是电商商城。

避免：

```text
秒杀
抢购
库存告急
猜你喜欢
立即下单
```

采用：

```text
小愿望
兑换
等待兑现
已完成
```

## 17.2 Reward Card

每张 Reward 可有独立小插画：

- 花；
- 奶茶；
- 休息；
- 晚餐；
- 玩具；
- 写真。

Card 视觉差异来自 Illustration + Tint，不复制六种结构。

## 17.3 Redeem

```text
Reward Detail
→ Confirm
→ Gem transaction
→ Order WAITING_FULFILLMENT
→ Fulfill
→ COMPLETED
→ optional photo/memory
```

余额不足：

- 禁止按钮；
- 说明还差多少；
- 不使用焦虑文案。

## 17.4 Gem Ledger

每笔必须可追溯：

```text
amount
reason
createdAt
actor
relatedEntity
```

---

# 18. Family 实现规格

**主 Frame：** `09.01 我们的小家`  
**Node：** `199:578`  
**Route：** `/pages/family/index`

## 18.1 Home

展示：

- 家庭 Hero；
- 成员；
- 家庭任务；
- 成就；
- 纪念日。

不做贡献排行榜。

## 18.2 Family Join

未加入：

```text
创建小家
加入小家
```

创建/加入完成后返回 Family Home。

## 18.3 Task

状态：

```text
open
completed
deleted
```

Task 可以奖励固定宝石，但不能变成家长绩效。

## 18.4 Invitation

邀请可：

- QR；
- link；
- system share。

系统分享属于 SYSTEM_NATIVE。

---

# 19. Baby Profile 实现规格

**主 Frame：** `10.01 宝宝档案`  
**Node：** `200:3`  
**Route：** `/pages/baby/index`

## 19.1 信息结构

优先人物感：

- 宝宝照片/头像；
- 名字；
- 月龄；
- 最近成长；
- 喜欢；
- 不喜欢；
- 最近变化；
- 基础资料。

不要把首屏做成医疗登记表。

## 19.2 Multiple Babies

当仅 1 个宝宝：

```text
不展示切换器
```

多宝宝：

```text
BabySwitcher
```

切换后：

- Records；
- Growth；
- Health；
- Knowledge；
- Memories

全部刷新对应 baby context。

---

# 20. Settings 实现规格

**主 Frame：** `11.01 设置`  
**Node：** `200:289`  
**Route：** `/pages/settings/index`

入口：

```text
账号与安全
家庭成员管理
通知设置
外观与主题
隐私与权限
数据与备份
数据导出
夜间育儿模式
关于
管理模式
```

## 20.1 Night Mode

不是 CSS invert。

要求：

- 暖深色；
- 降低白面积；
- 减少装饰动画；
- 核心按钮更大；
- 简化夜间首页；
- 完整 Drawer 仍可进入。

## 20.2 Notification

允许：

```text
健康提醒
家庭任务
兑换
备份异常
时光胶囊
家庭纪念日
```

禁止通过通知制造打卡压力。

## 20.3 Backup

设置直接显示：

```text
最近备份
状态
异常
```

用户能进入历史、存储、导出。

---

# 21. Admin 实现规格

**Admin Menu Frame：** `12.02 管理员菜单`  
**Node：** `201:20`  
**入口：** Drawer → 管理模式 → Admin Verify

管理员仍然是 RUNEW 视觉，不引入企业后台 UI Kit。

## 21.1 Admin Verify

必须：

- 密码输入；
- Loading；
- 错误；
- 限流反馈；
- Session 创建；
- 30 分钟倒计时；
- Session 过期返回 Verify。

UI 不保存管理员密码。

## 21.2 Admin Menu

当前 Figma 典型：

- page bg `#FBF7F0`
- row 350×56 / R22
- row `rgba(255,255,255,.76)`
- 48×48 双层 Cute Icon Chip
- title 14
- caption 11
- chevron
- session badge

菜单：

```text
宝石管理
宝石规则
宝石商城
育儿知识库
内容管理
家庭成员
数据与备份
系统设置
操作日志
```

## 21.3 Danger Zone

危险操作：

```text
恢复历史备份
删除全部照片
删除宝宝档案
关闭备份
```

UI 流程：

```text
点击危险操作
→ 解释影响
→ 二次管理员认证
→ 再次确认
→ 执行中
→ 结果
→ Audit Log
```

绝不一个按钮直接执行。

---

# 22. 权限 UI

## 22.1 Just-in-time

不在首次启动同时请求：

```text
相机
相册
麦克风
通知
```

例：

```text
点击“录一段声音”
→ PermissionSheet 解释用途
→ 用户继续
→ 系统权限
```

## 22.2 Denied

拒绝后：

- 保留当前上下文；
- 不反复弹；
- 必要时提供“去系统设置”；
- 不把拒绝当错误。

---

# 23. System Native Boundary

以下不设计 RUNEW 内部伪页面：

```text
系统相机
系统相册
视频选择器
系统分享
保存到相册
操作系统权限 Dialog
系统地图/导航（如启用）
```

Figma 中 `选择媒体来源` 是 RUNEW Sheet；点击“拍照/相册”后进入系统原生能力。

---

# 24. 文案规范

正式 UI 文案必须像真实产品。

禁止：

```text
HTTP 500
暂无数据
保存成功
提交成功
挑战失败
今天还没打卡
连续打卡即将中断
```

推荐：

```text
记好啦。
今天还没有留下记录。
润润睡着啦。
润润醒啦。
一个小愿望兑换啦。
好像暂时没有连上。
刚刚的内容已经安全保存在手机里。
```

设计说明文案不得进入正式页面。

---

# 25. Accessibility

必须：

- 核心 Touch Target ≥48×48；
- 快速操作 ≥56；
- 支持系统字体放大；
- 不仅靠颜色表达状态；
- 图标有 `aria-label` / Accessible Label；
- Chart 有数字替代；
- 支持 Reduce Motion；
- 可点击 Card 语义为 button/link；
- Disabled 与 Enabled 在明度、文字、交互上都可区分；
- 对比度不足时优先提高文字/边界，不用加黑整块背景。

---

# 26. UI State 与数据状态解耦

UI 不直接以 API 请求状态代替业务状态。

示例：

```ts
type RecordSyncState =
  | 'local'
  | 'pending'
  | 'syncing'
  | 'synced'
  | 'failed';
```

界面可同时：

```text
业务记录 = 已创建
同步状态 = pending
```

不能因为 API 暂时失败就把用户刚记的内容从界面删除。

---

# 27. 推荐的状态管理边界

Zustand：

```text
auth/session
family context
current baby
running timers
drafts
pending sync status
UI overlays
theme/night mode
```

TanStack Query：

```text
server lists
details
knowledge
health
memories
gems
family
admin data
```

Local persistent storage：

```text
running timer truth hints
drafts
pending operations
media pending references
last-used quick actions
```

具体持久化结构由 `TECHNICAL_DESIGN.md` 定义。

---

# 28. 截图回归标准

每个主模块至少截图：

```text
375×812
390×844
430×932
```

检查：

- TopBar；
- Hero；
- Section；
- 主 CTA；
- Bottom Nav；
- Safe Area；
- 长文案；
- Empty；
- Error；
- Running；
- Keyboard 弹出后的表单。

视觉差异优先级：

### P0

- 结构错；
- 按钮不可见；
- 点击热区错；
- 文本重叠；
- Glass 完全丢失；
- Bottom Nav 遮内容。

### P1

- 圆角/间距明显不一致；
- 语义色错误；
- Icon 不居中；
- CTA 与背景融在一起；
- 文字层级错误。

### P2

- 1–2px 微差；
- 非关键装饰 Sparkle 位置；
- 极轻 Shadow 差异。

---

# 29. Component Acceptance Checklist

所有公共组件合入前检查：

```text
[ ] Default
[ ] Pressed
[ ] Disabled
[ ] Loading（如适用）
[ ] Long text
[ ] 375px
[ ] 430px
[ ] Night Mode
[ ] Font Scale
[ ] Reduce Motion
[ ] Accessible Label
[ ] Touch target
```

---

# 30. Module Acceptance Checklist

## Today

```text
[ ] Default
[ ] Sleep Running
[ ] Feeding Running
[ ] Background Resume
[ ] Timeline Detail
[ ] Bottom Nav
```

## Records

```text
[ ] 4 filters
[ ] Create all types
[ ] Edit
[ ] Detail
[ ] Delete
[ ] Undo
[ ] Duplicate
[ ] Offline
```

## Growth

```text
[ ] 3 metrics
[ ] Empty chart
[ ] Add
[ ] Milestone
[ ] Monthly story
```

## Knowledge

```text
[ ] Recommendation
[ ] Categories
[ ] Search
[ ] Favorite
[ ] Later
[ ] Learned
[ ] Version update
[ ] Feedback
```

## Health

```text
[ ] Calendar
[ ] Type filters
[ ] Next event
[ ] Add/Edit
[ ] Reminder
[ ] Attachment
```

## Memories

```text
[ ] Photos
[ ] Quotes
[ ] Audio record
[ ] Audio upload retry
[ ] Firsts
[ ] Capsule all states
[ ] Favorites
[ ] Annual review
```

## Mom

```text
[ ] Mood
[ ] Diary draft
[ ] Visibility
[ ] Private permission
[ ] Calendar
```

## Gems

```text
[ ] Balance
[ ] Rewards
[ ] Insufficient balance
[ ] Confirm
[ ] Waiting
[ ] Completed
[ ] Cancel
[ ] Ledger
```

## Family

```text
[ ] Joined
[ ] Not joined
[ ] Invite
[ ] Member permission
[ ] Task CRUD
[ ] Achievement
[ ] Anniversary
```

## Baby

```text
[ ] Profile
[ ] Edit
[ ] Preferences
[ ] Recent change
[ ] One baby
[ ] Multiple babies
```

## Settings

```text
[ ] Account
[ ] Notifications
[ ] DND
[ ] Theme
[ ] Night
[ ] Permissions
[ ] Backup
[ ] Export
[ ] Deleted
```

## Admin

```text
[ ] Verify
[ ] Expire
[ ] Gem
[ ] Rule
[ ] Store
[ ] Knowledge
[ ] Content
[ ] Member
[ ] Data
[ ] Danger reauth
[ ] Audit
```

---

# 31. Cursor / Codex 执行约束

每次开发一个模块前必须：

1. 阅读 `PRD_RUNEW_V3.0.md` 对应模块；
2. 阅读本文档；
3. 打开对应 Figma Frame；
4. 优先使用公共组件；
5. 不新增未经定义的颜色/按钮；
6. 开发 Default + Required States；
7. Typecheck / Lint / Test / Build；
8. 375 / 390 / 430 截图；
9. 与 Figma 对比；
10. 修正后才能把 Screen 标记完成。

禁止一次性让 Agent “把 268 张页面全部实现”。

推荐按：

```text
M0 Foundations
M1 Shell/Auth
M2 Today/Records
M3 Growth
M4 Knowledge
M5 Health
M6 Memories
M7 Mom
M8 Gems
M9 Family
M10 Baby/Settings
M11 Admin
M12 Offline/Recovery/QA
```

---

# 32. Source-of-Truth 代表 Frame

| 模块 | Frame | Node ID |
|---|---|---|
| Drawer | `00.07 全局抽屉` | `195:191` |
| Today | `01.01 今天` | `195:437` |
| Records | `02.01 日常记录` | `195:670` |
| Growth | `03.01 成长` | `195:1176` |
| Knowledge | `04.01 育儿知识` | `197:3` |
| Health | `05.01 健康` | `197:302` |
| Memories | `06.01 宝宝回忆` | `198:3` |
| Mom | `07.01 妈妈空间` | `199:3` |
| Gems | `08.01 宝石商城` | `199:327` |
| Family | `09.01 我们的小家` | `199:578` |
| Baby | `10.01 宝宝档案` | `200:3` |
| Settings | `11.01 设置` | `200:289` |
| Admin Menu | `12.02 管理员菜单` | `201:20` |

---

# 33. 完整 Figma Screen Registry

> 本附录用于防漏设计、测试追踪和任务拆分。  
> **不要把本表机械转成 Route 表。** “实现类型”是建议容器类型，最终应遵守前文规则。

## 00 全局 / 登录 / 首次使用

| Figma Frame | 建议实现类型 | Route/归属 |
|---|---|---|
| `00.01 登录` | `ROUTE_OR_OVERLAY` | `/pages/auth-or-global` |
| `00.02 注册` | `ROUTE_OR_OVERLAY` | `/pages/auth-or-global` |
| `00.03 欢迎来到润芽` | `ROUTE_OR_OVERLAY` | `/pages/auth-or-global` |
| `00.04 创建宝宝档案` | `ROUTE_OR_OVERLAY` | `/pages/auth-or-global` |
| `00.05 选择家庭身份` | `ROUTE_OR_OVERLAY` | `/pages/auth-or-global` |
| `00.06 关注主题` | `ROUTE_OR_OVERLAY` | `/pages/auth-or-global` |
| `00.07 全局抽屉` | `ROUTE_OR_OVERLAY` | `/pages/auth-or-global` |
| `00.08 全局搜索` | `ROUTE_OR_OVERLAY` | `/pages/auth-or-global` |
| `00.09 通知中心` | `ROUTE_OR_OVERLAY` | `/pages/auth-or-global` |
| `00.10 留下这一刻` | `ROUTE_OR_OVERLAY` | `/pages/auth-or-global` |
| `00.11 离线与同步` | `ROUTE_OR_OVERLAY` | `/pages/auth-or-global` |

## 01 今天

| Figma Frame | 建议实现类型 | Route/归属 |
|---|---|---|
| `01.01 今天` | `ROUTE_OR_OVERLAY` | `/pages/today/index` |
| `01.02 睡眠进行中` | `INLINE_STATE` | `/pages/today/index` |
| `01.03 正在喂奶` | `INLINE_STATE` | `/pages/today/index` |
| `01.04 接下来事项` | `SUBROUTE` | `/pages/today/index` |
| `01.05 今天全部记录` | `SUBROUTE` | `/pages/today/index` |
| `01.06 睡眠结束` | `INLINE_STATE` | `/pages/today/index` |
| `01.07 喂奶结束` | `INLINE_STATE` | `/pages/today/index` |

## 02 日常记录

| Figma Frame | 建议实现类型 | Route/归属 |
|---|---|---|
| `02.01 日常记录` | `ROUTE_OR_OVERLAY` | `/pages/records/index` |
| `02.02 筛选记录` | `SHEET` | `/pages/records/index` |
| `02.03 记录奶瓶` | `FORM_OR_FLOW` | `/pages/records/index` |
| `02.04 编辑喂奶记录` | `FORM_OR_FLOW` | `/pages/records/index` |
| `02.05 母乳开始` | `FORM_OR_FLOW` | `/pages/records/index` |
| `02.06 母乳进行中` | `SUBROUTE_OR_STATE` | `/pages/records/index` |
| `02.07 记录睡眠` | `FORM_OR_FLOW` | `/pages/records/index` |
| `02.08 调整睡眠` | `SUBROUTE_OR_STATE` | `/pages/records/index` |
| `02.09 记录尿布` | `FORM_OR_FLOW` | `/pages/records/index` |
| `02.10 记录辅食` | `FORM_OR_FLOW` | `/pages/records/index` |
| `02.11 记录详情` | `SUBROUTE` | `/pages/records/index` |
| `02.12 删除确认` | `DIALOG` | `/pages/records/index` |
| `02.13 重复记录` | `SUBROUTE_OR_STATE` | `/pages/records/index` |
| `02.14 选择日期` | `SHEET` | `/pages/records/index` |

## 03 成长

| Figma Frame | 建议实现类型 | Route/归属 |
|---|---|---|
| `03.01 成长` | `ROUTE_OR_OVERLAY` | `/pages/growth/index` |
| `03.02 体重趋势` | `SUBROUTE` | `/pages/growth/index` |
| `03.03 头围趋势` | `SUBROUTE` | `/pages/growth/index` |
| `03.04 记录成长` | `SUBROUTE_OR_STATE` | `/pages/growth/index` |
| `03.05 成长里程碑` | `SUBROUTE_OR_STATE` | `/pages/growth/index` |
| `03.06 新增里程碑` | `FORM_OR_FLOW` | `/pages/growth/index` |
| `03.07 里程碑详情` | `SUBROUTE` | `/pages/growth/index` |
| `03.08 这个月的润润` | `SUBROUTE` | `/pages/growth/index` |

## 04 育儿知识

| Figma Frame | 建议实现类型 | Route/归属 |
|---|---|---|
| `04.01 育儿知识` | `ROUTE_OR_OVERLAY` | `/pages/knowledge/index` |
| `04.02 知识搜索` | `SUBROUTE` | `/pages/knowledge/index` |
| `04.03 知识详情` | `SUBROUTE` | `/pages/knowledge/index` |
| `04.04 我的收藏` | `SUBROUTE` | `/pages/knowledge/index` |
| `04.05 稍后看` | `SUBROUTE` | `/pages/knowledge/index` |
| `04.06 已学` | `SUBROUTE` | `/pages/knowledge/index` |
| `04.07 学到了状态` | `INLINE_STATE` | `/pages/knowledge/index` |
| `04.08 更多操作` | `SHEET` | `/pages/knowledge/index` |
| `04.09 内容有更新` | `INLINE_STATE` | `/pages/knowledge/index` |
| `04.10 分类页` | `LIST_VARIANT` | `/pages/knowledge/index` |

## 05 健康

| Figma Frame | 建议实现类型 | Route/归属 |
|---|---|---|
| `05.01 健康` | `ROUTE_OR_OVERLAY` | `/pages/health/index` |
| `05.02 当天事项` | `SUBROUTE` | `/pages/health/index` |
| `05.03 健康事项详情` | `SUBROUTE` | `/pages/health/index` |
| `05.04 新增健康事项` | `FORM_OR_FLOW` | `/pages/health/index` |
| `05.05 编辑健康事项` | `FORM_OR_FLOW` | `/pages/health/index` |
| `05.06 提醒设置` | `SHEET` | `/pages/health/index` |
| `05.07 健康时间轴` | `SUBROUTE` | `/pages/health/index` |
| `05.08 附件预览` | `SUBROUTE_OR_STATE` | `/pages/health/index` |

## 06 宝宝回忆

| Figma Frame | 建议实现类型 | Route/归属 |
|---|---|---|
| `06.01 宝宝回忆` | `ROUTE_OR_OVERLAY` | `/pages/memories/index` |
| `06.02 照片列表` | `SUBROUTE` | `/pages/memories/index` |
| `06.03 照片详情` | `SUBROUTE` | `/pages/memories/index` |
| `06.04 添加照片` | `SUBROUTE_OR_STATE` | `/pages/memories/index` |
| `06.05 编辑照片回忆` | `FORM_OR_FLOW` | `/pages/memories/index` |
| `06.06 宝宝语录` | `SUBROUTE` | `/pages/memories/index` |
| `06.07 新增宝宝语录` | `SUBROUTE` | `/pages/memories/index` |
| `06.08 语录详情` | `SUBROUTE` | `/pages/memories/index` |
| `06.09 宝宝声音` | `SUBROUTE` | `/pages/memories/index` |
| `06.10 录音进行中` | `FORM_OR_FLOW` | `/pages/memories/index` |
| `06.11 保存声音` | `FORM_OR_FLOW` | `/pages/memories/index` |
| `06.12 音频播放器` | `SUBROUTE` | `/pages/memories/index` |
| `06.13 声音分类` | `LIST_VARIANT` | `/pages/memories/index` |
| `06.14 第一次` | `SUBROUTE` | `/pages/memories/index` |
| `06.15 第一次详情` | `SUBROUTE` | `/pages/memories/index` |
| `06.16 时光胶囊` | `SUBROUTE` | `/pages/memories/index` |
| `06.17 新建时光胶囊` | `SUBROUTE` | `/pages/memories/index` |
| `06.18 胶囊草稿` | `SUBROUTE_OR_STATE` | `/pages/memories/index` |
| `06.19 封存确认` | `DIALOG` | `/pages/memories/index` |
| `06.20 已封存胶囊` | `SUBROUTE_OR_STATE` | `/pages/memories/index` |
| `06.21 已开启胶囊` | `SUBROUTE_OR_STATE` | `/pages/memories/index` |
| `06.22 润润的珍藏` | `SUBROUTE` | `/pages/memories/index` |
| `06.23 去年的今天` | `SUBROUTE_OR_STATE` | `/pages/memories/index` |
| `06.24 年度回顾` | `SUBROUTE_OR_STATE` | `/pages/memories/index` |

## 07 妈妈空间

| Figma Frame | 建议实现类型 | Route/归属 |
|---|---|---|
| `07.01 妈妈空间` | `ROUTE_OR_OVERLAY` | `/pages/mom/index` |
| `07.02 记录心情` | `SUBROUTE_OR_STATE` | `/pages/mom/index` |
| `07.03 心情已记录` | `INLINE_STATE` | `/pages/mom/index` |
| `07.04 一句话心得` | `SUBROUTE_OR_STATE` | `/pages/mom/index` |
| `07.05 日记列表` | `SUBROUTE_OR_STATE` | `/pages/mom/index` |
| `07.06 写日记` | `FORM_OR_FLOW` | `/pages/mom/index` |
| `07.07 日记详情` | `SUBROUTE` | `/pages/mom/index` |
| `07.08 可见范围` | `SHEET` | `/pages/mom/index` |
| `07.09 心情日历` | `SUBROUTE` | `/pages/mom/index` |

## 08 宝石商城

| Figma Frame | 建议实现类型 | Route/归属 |
|---|---|---|
| `08.01 宝石商城` | `ROUTE_OR_OVERLAY` | `/pages/gems/index` |
| `08.02 愿望详情` | `SUBROUTE` | `/pages/gems/index` |
| `08.03 兑换确认` | `DIALOG` | `/pages/gems/index` |
| `08.04 等待兑现` | `SUBROUTE_OR_STATE` | `/pages/gems/index` |
| `08.05 愿望已完成` | `SUBROUTE_OR_STATE` | `/pages/gems/index` |
| `08.06 我的兑换` | `SUBROUTE` | `/pages/gems/index` |
| `08.07 宝石账本` | `SUBROUTE` | `/pages/gems/index` |
| `08.08 创建自定义愿望` | `FORM_OR_FLOW` | `/pages/gems/index` |
| `08.09 取消兑换` | `DIALOG` | `/pages/gems/index` |

## 09 我们的小家

| Figma Frame | 建议实现类型 | Route/归属 |
|---|---|---|
| `09.01 我们的小家` | `ROUTE_OR_OVERLAY` | `/pages/family/index` |
| `09.02 家庭成员` | `SUBROUTE` | `/pages/family/index` |
| `09.03 成员详情` | `SUBROUTE` | `/pages/family/index` |
| `09.04 修改家庭权限` | `SUBROUTE_OR_STATE` | `/pages/family/index` |
| `09.05 邀请家人` | `SUBROUTE_OR_STATE` | `/pages/family/index` |
| `09.06 家庭任务` | `SUBROUTE` | `/pages/family/index` |
| `09.07 新建家庭任务` | `SUBROUTE` | `/pages/family/index` |
| `09.08 家庭任务详情` | `SUBROUTE` | `/pages/family/index` |
| `09.09 家庭成就` | `SUBROUTE` | `/pages/family/index` |
| `09.10 家庭纪念日` | `SUBROUTE` | `/pages/family/index` |
| `09.11 新增纪念日` | `FORM_OR_FLOW` | `/pages/family/index` |
| `09.12 未加入家庭` | `SUBROUTE` | `/pages/family/index` |
| `09.13 创建小家` | `FORM_OR_FLOW` | `/pages/family/index` |
| `09.14 加入小家` | `FORM_OR_FLOW` | `/pages/family/index` |

## 10 宝宝档案

| Figma Frame | 建议实现类型 | Route/归属 |
|---|---|---|
| `10.01 宝宝档案` | `ROUTE_OR_OVERLAY` | `/pages/baby/index` |
| `10.02 基础资料` | `SUBROUTE` | `/pages/baby/index` |
| `10.03 编辑宝宝资料` | `FORM_OR_FLOW` | `/pages/baby/index` |
| `10.04 最近喜欢` | `SUBROUTE` | `/pages/baby/index` |
| `10.05 添加喜欢` | `FORM_OR_FLOW` | `/pages/baby/index` |
| `10.06 不喜欢` | `SUBROUTE` | `/pages/baby/index` |
| `10.07 最近变化` | `SUBROUTE` | `/pages/baby/index` |
| `10.08 切换宝宝` | `SUBROUTE` | `/pages/baby/index` |
| `10.09 添加宝宝` | `FORM_OR_FLOW` | `/pages/baby/index` |

## 11 设置

| Figma Frame | 建议实现类型 | Route/归属 |
|---|---|---|
| `11.01 设置` | `ROUTE_OR_OVERLAY` | `/pages/settings/index` |
| `11.02 账号与安全` | `SUBROUTE` | `/pages/settings/index` |
| `11.03 修改密码` | `FORM_OR_FLOW` | `/pages/settings/index` |
| `11.04 家庭成员管理` | `SUBROUTE` | `/pages/settings/index` |
| `11.05 通知设置` | `SUBROUTE_OR_STATE` | `/pages/settings/index` |
| `11.06 免打扰` | `SUBROUTE_OR_STATE` | `/pages/settings/index` |
| `11.07 外观与主题` | `SUBROUTE_OR_STATE` | `/pages/settings/index` |
| `11.08 夜间育儿模式` | `SUBROUTE_OR_STATE` | `/pages/settings/index` |
| `11.09 隐私与权限` | `SUBROUTE_OR_STATE` | `/pages/settings/index` |
| `11.10 麦克风权限` | `PERMISSION` | `/pages/settings/index` |
| `11.11 数据与备份` | `SUBROUTE_OR_STATE` | `/pages/settings/index` |
| `11.12 存储空间` | `SUBROUTE` | `/pages/settings/index` |
| `11.13 数据导出` | `FORM_OR_FLOW` | `/pages/settings/index` |
| `11.14 导出进行中` | `INLINE_STATE` | `/pages/settings/index` |
| `11.15 备份失败` | `SUBROUTE_OR_STATE` | `/pages/settings/index` |
| `11.16 备份历史` | `SUBROUTE` | `/pages/settings/index` |
| `11.17 最近删除` | `SUBROUTE` | `/pages/settings/index` |
| `11.18 恢复确认` | `DIALOG` | `/pages/settings/index` |
| `11.19 关于润芽` | `SUBROUTE` | `/pages/settings/index` |

## 12 管理员

| Figma Frame | 建议实现类型 | Route/归属 |
|---|---|---|
| `12.01 管理员验证` | `ROUTE_OR_OVERLAY` | `/pages/admin/index` |
| `12.02 管理员菜单` | `SUBROUTE_OR_STATE` | `/pages/admin/index` |
| `12.03 宝石管理` | `SUBROUTE` | `/pages/admin/index` |
| `12.04 宝石流水` | `SUBROUTE` | `/pages/admin/index` |
| `12.05 人工调整宝石` | `FORM_OR_FLOW` | `/pages/admin/index` |
| `12.06 宝石调整确认` | `DIALOG` | `/pages/admin/index` |
| `12.07 宝石规则` | `SUBROUTE` | `/pages/admin/index` |
| `12.08 新建宝石规则` | `SUBROUTE` | `/pages/admin/index` |
| `12.09 编辑宝石规则` | `SUBROUTE` | `/pages/admin/index` |
| `12.10 宝石商城管理` | `SUBROUTE` | `/pages/admin/index` |
| `12.11 新建商城奖励` | `SUBROUTE_OR_STATE` | `/pages/admin/index` |
| `12.12 编辑商城奖励` | `FORM_OR_FLOW` | `/pages/admin/index` |
| `12.13 商城排序` | `SUBROUTE_OR_STATE` | `/pages/admin/index` |
| `12.14 知识管理` | `SUBROUTE` | `/pages/admin/index` |
| `12.15 新增知识` | `FORM_OR_FLOW` | `/pages/admin/index` |
| `12.16 编辑知识正文` | `FORM_OR_FLOW` | `/pages/admin/index` |
| `12.17 知识详情管理` | `SUBROUTE` | `/pages/admin/index` |
| `12.18 下架知识确认` | `DIALOG` | `/pages/admin/index` |
| `12.19 内容管理` | `SUBROUTE` | `/pages/admin/index` |
| `12.20 新增内容` | `FORM_OR_FLOW` | `/pages/admin/index` |
| `12.21 家庭成员管理` | `SUBROUTE` | `/pages/admin/index` |
| `12.22 管理成员详情` | `SUBROUTE` | `/pages/admin/index` |
| `12.23 管理员调整权限` | `SUBROUTE_OR_STATE` | `/pages/admin/index` |
| `12.24 停用成员确认` | `DIALOG` | `/pages/admin/index` |
| `12.25 数据中心` | `SUBROUTE` | `/pages/admin/index` |
| `12.26 立即备份` | `SUBROUTE_OR_STATE` | `/pages/admin/index` |
| `12.27 恢复备份` | `SUBROUTE_OR_STATE` | `/pages/admin/index` |
| `12.28 危险操作二次认证` | `DIALOG` | `/pages/admin/index` |
| `12.29 恢复确认` | `DIALOG` | `/pages/admin/index` |
| `12.30 恢复进行中` | `INLINE_STATE` | `/pages/admin/index` |
| `12.31 系统设置` | `SUBROUTE` | `/pages/admin/index` |
| `12.32 操作日志` | `SUBROUTE` | `/pages/admin/index` |
| `12.33 日志详情` | `SUBROUTE` | `/pages/admin/index` |
| `12.34 管理员会话过期` | `INLINE_STATE` | `/pages/admin/index` |
| `12.35 管理员密码帮助` | `SUBROUTE_OR_STATE` | `/pages/admin/index` |

## 13 补充分支 / 全局状态

| Figma Frame | 建议实现类型 | Route/归属 |
|---|---|---|
| `13.01 编辑尿布记录` | `ROUTE_OR_OVERLAY` | `复用所属业务页面` |
| `13.02 编辑辅食记录` | `FORM_OR_FLOW` | `复用所属业务页面` |
| `13.03 自定义睡眠时间` | `SUBROUTE_OR_STATE` | `复用所属业务页面` |
| `13.04 复制记录` | `SUBROUTE_OR_STATE` | `复用所属业务页面` |
| `13.05 内容问题反馈` | `SUBROUTE_OR_STATE` | `复用所属业务页面` |
| `13.06 编辑日记` | `FORM_OR_FLOW` | `复用所属业务页面` |
| `13.07 删除日记确认` | `SUBROUTE_OR_STATE` | `复用所属业务页面` |
| `13.08 编辑家庭任务` | `SUBROUTE` | `复用所属业务页面` |
| `13.09 任务完成` | `SUBROUTE_OR_STATE` | `复用所属业务页面` |
| `13.10 家庭成就详情` | `SUBROUTE` | `复用所属业务页面` |
| `13.11 纪念日详情` | `SUBROUTE` | `复用所属业务页面` |
| `13.12 Loading` | `INLINE_STATE` | `复用所属业务页面` |
| `13.13 空状态·日常记录` | `INLINE_STATE` | `复用所属业务页面` |
| `13.14 空状态·成长` | `INLINE_STATE` | `复用所属业务页面` |
| `13.15 空状态·知识` | `INLINE_STATE` | `复用所属业务页面` |
| `13.16 空状态·健康` | `INLINE_STATE` | `复用所属业务页面` |
| `13.17 空状态·回忆` | `INLINE_STATE` | `复用所属业务页面` |
| `13.18 空状态·声音` | `INLINE_STATE` | `复用所属业务页面` |
| `13.19 空状态·妈妈空间` | `INLINE_STATE` | `复用所属业务页面` |
| `13.20 空状态·宝石屋` | `INLINE_STATE` | `复用所属业务页面` |
| `13.21 空状态·小家` | `INLINE_STATE` | `复用所属业务页面` |
| `13.22 离线保存成功` | `INLINE_STATE` | `复用所属业务页面` |
| `13.23 正在同步` | `INLINE_STATE` | `复用所属业务页面` |
| `13.24 上传照片中` | `INLINE_STATE` | `复用所属业务页面` |
| `13.25 上传失败` | `INLINE_STATE` | `复用所属业务页面` |
| `13.26 网络错误` | `INLINE_STATE` | `复用所属业务页面` |
| `13.27 保存成功` | `INLINE_STATE` | `复用所属业务页面` |
| `13.28 自动草稿恢复` | `INLINE_STATE` | `复用所属业务页面` |
| `13.29 撤销删除` | `INLINE_STATE` | `复用所属业务页面` |
| `13.30 相机权限` | `PERMISSION` | `复用所属业务页面` |
| `13.31 通知权限` | `PERMISSION` | `复用所属业务页面` |
| `13.32 备份完成` | `SUBROUTE_OR_STATE` | `复用所属业务页面` |

## 14 筛选状态 / 内容变体

| Figma Frame | 建议实现类型 | Route/归属 |
|---|---|---|
| `14.01 仅喂奶` | `LIST_VARIANT` | `复用所属业务列表页` |
| `14.02 仅睡眠` | `LIST_VARIANT` | `复用所属业务列表页` |
| `14.03 仅尿布` | `LIST_VARIANT` | `复用所属业务列表页` |
| `14.04 仅辅食` | `LIST_VARIANT` | `复用所属业务列表页` |
| `14.05 辅食分类` | `LIST_VARIANT` | `复用所属业务列表页` |
| `14.06 出牙分类` | `LIST_VARIANT` | `复用所属业务列表页` |
| `14.07 发育分类` | `LIST_VARIANT` | `复用所属业务列表页` |
| `14.08 语言分类` | `LIST_VARIANT` | `复用所属业务列表页` |
| `14.09 认知分类` | `LIST_VARIANT` | `复用所属业务列表页` |
| `14.10 健康·体检` | `LIST_VARIANT` | `复用所属业务列表页` |
| `14.11 健康·疫苗` | `LIST_VARIANT` | `复用所属业务列表页` |
| `14.12 健康·就诊` | `LIST_VARIANT` | `复用所属业务列表页` |
| `14.13 愿望详情·奶茶` | `SUBROUTE` | `复用所属业务列表页` |
| `14.14 愿望详情·休息` | `SUBROUTE` | `复用所属业务列表页` |
| `14.15 愿望详情·晚餐` | `SUBROUTE` | `复用所属业务列表页` |
| `14.16 愿望详情·玩具` | `SUBROUTE` | `复用所属业务列表页` |
| `14.17 愿望详情·写真` | `SUBROUTE` | `复用所属业务列表页` |
| `14.18 编辑内容` | `FORM_OR_FLOW` | `复用所属业务列表页` |
| `14.19 睡眠分类` | `LIST_VARIANT` | `复用所属业务列表页` |

## 15 缺口补全 / 详情

| Figma Frame | 建议实现类型 | Route/归属 |
|---|---|---|
| `15.01 添加记录备注` | `ROUTE_OR_OVERLAY` | `复用所属业务详情/管理页` |
| `15.02 计时已暂停` | `INLINE_STATE` | `复用所属业务详情/管理页` |
| `15.03 分享与导出` | `SUBROUTE_OR_STATE` | `复用所属业务详情/管理页` |
| `15.04 选择媒体来源` | `SHEET` | `复用所属业务详情/管理页` |
| `15.05 编辑宝宝语录` | `SUBROUTE` | `复用所属业务详情/管理页` |
| `15.06 删除宝宝语录确认` | `SUBROUTE` | `复用所属业务详情/管理页` |
| `15.07 编辑宝宝声音` | `SUBROUTE` | `复用所属业务详情/管理页` |
| `15.08 删除宝宝声音确认` | `SUBROUTE` | `复用所属业务详情/管理页` |
| `15.09 编辑第一次` | `SUBROUTE` | `复用所属业务详情/管理页` |
| `15.10 删除第一次确认` | `SUBROUTE` | `复用所属业务详情/管理页` |
| `15.11 编辑纪念日` | `FORM_OR_FLOW` | `复用所属业务详情/管理页` |
| `15.12 删除纪念日确认` | `SUBROUTE_OR_STATE` | `复用所属业务详情/管理页` |
| `15.13 删除家庭任务确认` | `SUBROUTE` | `复用所属业务详情/管理页` |
| `15.14 编辑自定义愿望` | `FORM_OR_FLOW` | `复用所属业务详情/管理页` |
| `15.15 删除自定义愿望确认` | `SUBROUTE_OR_STATE` | `复用所属业务详情/管理页` |
| `15.16 知识用户状态统计` | `SUBROUTE_OR_STATE` | `复用所属业务详情/管理页` |
| `15.17 管理员数据导出` | `FORM_OR_FLOW` | `复用所属业务详情/管理页` |
| `15.18 管理员检查备份` | `SUBROUTE_OR_STATE` | `复用所属业务详情/管理页` |
| `15.19 管理员清理缓存确认` | `DIALOG` | `复用所属业务详情/管理页` |
| `15.20 管理员删除全部照片确认` | `DIALOG` | `复用所属业务详情/管理页` |
| `15.21 管理员删除宝宝档案确认` | `DIALOG` | `复用所属业务详情/管理页` |
| `15.22 管理员关闭备份确认` | `DIALOG` | `复用所属业务详情/管理页` |
| `15.23 管理员恢复成员确认` | `DIALOG` | `复用所属业务详情/管理页` |
| `15.24 年度回顾导出` | `FORM_OR_FLOW` | `复用所属业务详情/管理页` |
| `15.25 编辑知识基本信息` | `FORM_OR_FLOW` | `复用所属业务详情/管理页` |
| `15.26 删除照片确认` | `SUBROUTE_OR_STATE` | `复用所属业务详情/管理页` |
| `15.27 退出登录确认` | `DIALOG` | `复用所属业务详情/管理页` |
| `15.28 管理员危险操作` | `SUBROUTE_OR_STATE` | `复用所属业务详情/管理页` |
| `15.29 应用版本详情` | `SUBROUTE` | `复用所属业务详情/管理页` |
| `15.30 数据库状态详情` | `SUBROUTE` | `复用所属业务详情/管理页` |
| `15.31 媒体目录详情` | `SUBROUTE` | `复用所属业务详情/管理页` |
| `15.32 备份任务设置` | `SUBROUTE_OR_STATE` | `复用所属业务详情/管理页` |
| `15.33 Tunnel 状态` | `SUBROUTE_OR_STATE` | `复用所属业务详情/管理页` |
| `15.34 成长记录详情` | `SUBROUTE` | `复用所属业务详情/管理页` |
| `15.35 知识来源详情` | `SUBROUTE` | `复用所属业务详情/管理页` |
| `15.36 健康地点详情` | `SUBROUTE` | `复用所属业务详情/管理页` |
| `15.37 宝石流水详情` | `SUBROUTE` | `复用所属业务详情/管理页` |
| `15.38 登录账号详情` | `SUBROUTE` | `复用所属业务详情/管理页` |
| `15.39 已登录设备` | `SUBROUTE_OR_STATE` | `复用所属业务详情/管理页` |
| `15.40 管理员宝石流水详情` | `SUBROUTE` | `复用所属业务详情/管理页` |

---

# 34. UI 实现完整性审核

## 34.1 视觉闭环

当前 Design System 已具备：

```text
Page Background
Glass Control
Glass Card
Glass Hero
Glass Floating
Semantic Tint
Typography
Radius
Shadow
Icon Chip
Illustration
Button Hierarchy
Bottom Navigation
```

因此不允许页面级重复发明视觉语言。

## 34.2 交互闭环

每个明显可点击元素必须属于以下之一：

```text
Navigate
Open Sheet
Open Dialog
Inline State Change
Trigger Async Action
Invoke System Native
```

不得存在：

```text
看起来能点，但没有行为
```

## 34.3 状态闭环

每个核心 CRUD 至少：

```text
Create
Read
Update
Delete
Undo/Restore（适用）
Loading
Error
Offline/Pending（适用）
```

## 34.4 权限闭环

PRIVATE、Admin、Family Resource：

```text
UI visibility
+
API authorization
+
Search filtering
```

三层必须一致。

## 34.5 媒体闭环

```text
选择/录制
→ 本地可靠保存
→ 创建业务记录
→ 上传
→ 重试
→ 查看
→ 编辑
→ 删除
→ 最近删除/恢复
```

## 34.6 计时闭环

```text
Start
→ Background
→ Resume
→ Pause/Switch（如适用）
→ Finish
→ Edit
→ Detail
```

显示 Timer 不是业务真相，时间戳才是。

---

# 35. Definition of Done — UI

某一个 Figma Screen / State 只有同时满足以下条件才算开发完成：

```text
[ ] 已找到对应 PRD 业务规则
[ ] 已找到对应 Figma Frame
[ ] 使用 Design System Token
[ ] 使用公共组件
[ ] 视觉截图通过
[ ] 点击热区通过
[ ] 所有按钮有行为
[ ] Loading 完成
[ ] Empty 完成（适用）
[ ] Error 完成
[ ] Offline/Pending 完成（适用）
[ ] Permission 完成（适用）
[ ] Draft 完成（适用）
[ ] Delete/Undo 完成（适用）
[ ] Night Mode 完成
[ ] Reduce Motion 完成
[ ] A11y Label 完成
[ ] 375 / 390 / 430 完成
[ ] Typecheck 通过
[ ] Lint 通过
[ ] Tests 通过
[ ] Build 通过
```

---

# 36. 文档结论

本 `UI_IMPLEMENTATION_SPEC.md` 是：

```text
PRD_RUNEW_V3.0
        +
Figma / 11 R6.2 Mobile Complete
        ↓
可执行 UI / Design System / Component / Interaction 规格
```

后续 `TECHNICAL_DESIGN.md` 不应重新定义视觉或产品行为，而应解决：

```text
路由装载
数据模型
API
权限
离线同步
冲突
媒体
备份
搜索
通知
管理员安全
部署
测试
可观测性
```

如果技术方案与本 UI 规格冲突，不应静默改变界面，应建立显式 Issue 并回到 PRD / Figma / UI Spec 共同决策。

# 🌱 润芽 · RUNEW

**把润润长大的每一天，认真收藏起来。**
