---
name: 氢擎 Agent 工作台
description: 氢能产业关系与商机 Agent 的研判台，明亮会议室与投影下可读的证据优先界面
colors:
  ink: "oklch(24% 0.02 235)"
  ink-muted: "oklch(46% 0.018 232)"
  ink-subtle: "oklch(54% 0.016 230)"
  surface: "oklch(99.2% 0.002 225)"
  surface-sunken: "oklch(96.8% 0.006 225)"
  surface-inset: "oklch(97.8% 0.005 225)"
  line: "oklch(90% 0.008 225)"
  line-strong: "oklch(84% 0.01 225)"
  border-control: "oklch(64% 0.014 225)"
  action: "oklch(46% 0.085 190)"
  action-strong: "oklch(40% 0.08 190)"
  action-soft: "oklch(95.5% 0.025 190)"
  action-border: "oklch(85% 0.04 190)"
  confirm: "oklch(48% 0.12 48)"
  confirm-soft: "oklch(96% 0.03 55)"
  confirm-border: "oklch(86% 0.06 55)"
  danger: "oklch(47% 0.16 25)"
  danger-soft: "oklch(96% 0.03 25)"
  danger-border: "oklch(86% 0.07 25)"
  focus-surface: "oklch(26% 0.032 234)"
  focus-deep: "oklch(21% 0.028 236)"
  on-focus: "oklch(93% 0.01 225)"
  on-focus-muted: "oklch(76% 0.016 222)"
  role-supplier: "oklch(46% 0.09 245)"
  role-partner: "oklch(47% 0.11 300)"
typography:
  display:
    fontFamily: "Manrope, 'Noto Sans SC', system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Manrope, 'Noto Sans SC', system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Manrope, 'Noto Sans SC', system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.45
    letterSpacing: "normal"
  body:
    fontFamily: "Manrope, 'Noto Sans SC', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: "normal"
  label:
    fontFamily: "Manrope, 'Noto Sans SC', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "0.01em"
  eyebrow:
    fontFamily: "Manrope, 'Noto Sans SC', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.12em"
  metric:
    fontFamily: "Manrope, 'Noto Sans SC', system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
    fontVariation: "tabular-nums"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  full: "999px"
spacing:
  "2xs": "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  "2xl": "32px"
  "3xl": "40px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "40px"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.action-strong}"
  button-secondary:
    backgroundColor: "{colors.action-soft}"
    textColor: "{colors.action-strong}"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "40px"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "40px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "40px"
    typography: "{typography.body}"
  badge-status:
    backgroundColor: "{colors.surface-inset}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
    typography: "{typography.label}"
  badge-confirm:
    backgroundColor: "{colors.confirm-soft}"
    textColor: "{colors.confirm}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  nav-item:
    backgroundColor: "{colors.focus-surface}"
    textColor: "{colors.on-focus-muted}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "44px"
  nav-item-active:
    textColor: "{colors.on-focus}"
---

# Design System: 氢擎 Agent 工作台

## 1. Overview

**Creative North Star: "研判台 / The Analyst's Desk"**

这是一张摆满证据的工作桌，不是一块发光的仪表屏。桌面本身安静、明亮、无装饰，所有视觉重量都给到摊开的材料：维度得分、来源出处、资料时间、风险提示。用户在这张桌上做的事是「核对后决定」，所以界面的每一处都要经得起被追问一句「这个数字哪来的」。

系统的物理场景是硬约束：明亮会议室里的投影或大屏，观看距离两到三米。这决定了主表面必须是亮色、高对比，正文不得低于 12 px，柔和阴影不承担任何结构职责（它在投影上根本不存在）。深色只作为**焦点表面**出现在侧边导航和结论区，用来把「这是系统的骨架」和「这是待核对的材料」分开，绝不铺满全屏。

系统明确拒绝三样东西：**环保绿能源官网**那套绿刷满、渐变按钮、叶子图标的公关观感；**通用 SaaS 落地页**的渐变文字与大数字 hero 指标区；**旧式 ERP 后台**的低对比密表格。青色是既有识别，但它在这套系统里被降级为一种职责，不是一种装饰。

**Key Characteristics:**

- 亮色主表面，深色仅用于焦点表面（侧栏、结论区）
- 平面优先：结构靠 1 px 边框和三级明度分层，不靠阴影
- 双语义色：青 = 可以推进，铜橙 = 需要人确认
- 12 px 字号地板，舒展行高，两米外可读优先于信息密度
- 数字一律 `tabular-nums`，同列数字必须对齐
- 任何状态都有文字或形状标识，颜色只是第二通道

## 2. Colors

一张冷灰偏 navy 的桌面，上面只允许出现两种有意义的颜色。

### Primary

- **深潜青 Action Teal** (`oklch(46% 0.085 190)`)：主按钮、当前选中、链接、聚焦环、进度填充。**只表示「可以推进的动作」**。实测白字对比 6.76:1，青字在主表面 6.61:1。
- **深潜青（按压）Action Teal Deep** (`oklch(40% 0.08 190)`)：hover 与 active 状态，以及浅青底上的文字。
- **青雾 Teal Mist** (`oklch(95.5% 0.025 190)`)：次级按钮底、选中标签底、正向语义徽标底。这是青色唯一允许作为背景出现的形式。

### Secondary

- **锻铜 Forged Copper** (`oklch(48% 0.12 48)`)：**只表示「需要人确认」**。人工确认提示、外发/报价/技术承诺的边界、待核实标记、风险条目、演示数据来源标签、潜客角色。它是产品硬边界的视觉载体，滥用会直接摧毁这条边界的可信度。
- **铜雾 Copper Mist** (`oklch(96% 0.03 55)`) 与 **铜线 Copper Line** (`oklch(86% 0.06 55)`)：上述提示的底色与描边。

### Tertiary

- **警示赤 Alert Vermilion** (`oklch(47% 0.16 25)`)：只用于系统错误与失败状态。**它和锻铜不可互换**：铜是「等你确认」，赤是「它坏了」。
- **深井 Focus Surface** (`oklch(26% 0.032 234)`) / **深井底 Focus Deep** (`oklch(21% 0.028 236)`)：焦点表面。侧边导航、研判结论 hero、护栏声明区。配 **井上白 On Focus** (`oklch(93% 0.01 225)`) 与 **井上灰 On Focus Muted** (`oklch(76% 0.016 222)`)，实测 12.61:1 与 7.23:1。
- **关系角色色**：**藏钢蓝 Steel Indigo** (`oklch(46% 0.09 245)`) 表上游厂商，**紫岩 Slate Violet** (`oklch(47% 0.11 300)`) 表生态伙伴，客户用深潜青，潜客用锻铜。四色仅用于角色图标与徽标文字，**每个角色必须同时带图标形状与中文角色名**。

### Neutral

- **墨 Ink** (`oklch(24% 0.02 235)`)：所有标题与主要正文。实测 16.04:1。
- **次墨 Ink Muted** (`oklch(46% 0.018 232)`)：说明文字、表格单元格正文。6.93:1。
- **弱墨 Ink Subtle** (`oklch(54% 0.016 230)`)：元信息、时间戳、占位符。这是明度下限，**再浅一档就跌破 AA**，实测在主表面 4.93:1、在下沉面 4.60:1。
- **纸 Surface** (`oklch(99.2% 0.002 225)`)：卡片与内容表面。
- **下沉面 Surface Sunken** (`oklch(96.8% 0.006 225)`)：页面底色。层次由「页面比卡片深」建立，不靠阴影。
- **嵌入面 Surface Inset** (`oklch(97.8% 0.005 225)`)：表头、代码/引文块、只读字段。
- **界线 Line** (`oklch(90% 0.008 225)`) 与 **重界线 Line Strong** (`oklch(84% 0.01 225)`)：分割线与卡片描边，装饰性，不承担控件识别职责。
- **控件线 Border Control** (`oklch(64% 0.014 225)`)：输入框、下拉、复选等**控件边框专用**。它存在的唯一原因是 WCAG 1.4.11 要求控件边界 ≥ 3:1，实测 3.27:1。装饰线不得使用它，控件线不得降级为界线。

### Named Rules

**The Two Voices Rule.** 这套界面只有两个有意义的颜色：青说「可以推进」，铜说「需要人确认」。任何一个色块出现之前先回答它在说哪一句；两句都不是，它就必须是中性灰。

**The No Decorative Tint Rule.** 禁止把青色当图标底色批量铺开。图标容器默认是中性灰底；只有当图标本身表示动作或语义状态时才染色。青色总面积不超过任一屏的 10%。

**The Never Pure Rule.** 禁止 `#fff` 和 `#000`。所有中性色都向 hue 225 偏移（chroma 0.002 到 0.02），桌面才有统一的冷灰体温。

## 3. Typography

**Display / Body Font:** Manrope（拉丁字母与数字），回退 Noto Sans SC（中文），再回退 system-ui
**Label / Mono:** 同族，数字位一律启用 `font-variant-numeric: tabular-nums`

**Character:** 单字族体系。Manrope 的几何骨架给出工具感和清晰的数字，Noto Sans SC 承担中文正文的可读性。产品 UI 不需要展示字体与正文字体的配对，配对只会制造噪音。

### Hierarchy

- **Display** (700, 28 px, 1.25, -0.02em)：页面 h1，每页仅一个。**固定字号，禁止 clamp**：产品界面在固定 DPI 下浏览，流体标题在窄栏里只会更难看。
- **Headline** (700, 20 px, 1.35)：抽屉标题、结论区标题、商机详情主标题。
- **Title** (700, 16 px, 1.45)：卡片与区块标题。
- **Body** (400, 14 px, 1.7)：正文与表格单元格。散文行长限制 65 到 75 字符；数据表可放宽。
- **Label** (600, 12 px, 1.5)：字段标签、徽标、元信息、按钮文字。**这是全系统字号地板。**
- **Eyebrow** (700, 12 px, 0.12em, 大写)：区块眉标与导航分组标签。
- **Metric** (700, 28 px, tabular-nums)：指标读数与评分。大评分可到 34 px。

### Named Rules

**The 12px Floor Rule.** 任何文字不得小于 12 px。绝对禁止 6 到 11 px。旧版有 92 处 8 px 及以下的文字，那不是「紧凑」，那是投影上不可读。

**The Tabular Rule.** 所有数字（评分、金额、功率、日期、计数）必须 `tabular-nums`。同列数字不对齐的表格看起来就是不可靠的。

**The One Display Rule.** 每页只有一个 28 px 标题。第二个 28 px 的东西必须是指标读数，不是另一个标题。

## 4. Elevation

**平面优先。** 静止状态下没有阴影。结构完全由三级明度分层（下沉面 → 纸 → 嵌入面）加 1 px 界线建立。这不是审美偏好而是场景推论：投影和大屏会把柔和阴影压成一团看不见的灰，靠阴影分层的界面在演示现场会直接塌掉。

阴影只在元素**真的浮在**桌面之上时出现，且只有两级。旧版 39 处各写一套的手写阴影全部收敛到这两个 token。

### Shadow Vocabulary

- **pop** (`box-shadow: 0 4px 12px oklch(24% 0.02 235 / 0.08)`)：hover 抬起、下拉浮层、可点击行的悬浮反馈。
- **overlay** (`box-shadow: 0 24px 48px oklch(21% 0.028 236 / 0.18)`)：抽屉与模态。这是唯一允许的重阴影，因为它必须切断与背景的关系。

### Named Rules

**The Flat-At-Rest Rule.** 阴影是状态的回应，不是卡片的默认属性。如果一个元素静止时就带阴影，删掉它，改用边框。

**The Projector Test.** 判断层次是否成立：把界面想象成投影在有环境光的墙上，阴影全部消失。如果此时看不出卡片边界或区块归属，层次就是错的。

## 5. Components

### Buttons

- **Shape:** 小圆角（6 px），高 40 px，紧凑档 32 px。
- **Primary:** 深潜青实底配纸色文字（`oklch(46% 0.085 190)` / 白字 6.76:1），12 px 600 字重。**纯色，禁止渐变。**
- **Hover / Focus:** hover 换为按压青（`oklch(40% 0.08 190)`），150 ms 缓出。**不做位移抬起**：工具按钮不需要弹跳。focus-visible 给 3 px 青色聚焦环。
- **Secondary:** 青雾底 + 按压青文字，无边框。**Ghost:** 纸底 + 次墨文字 + 1 px 界线。
- **Danger / Confirm:** 需人工确认的动作用铜色描边 + 铜雾底，绝不做成实底主按钮的样子。它必须看起来像一个需要停顿的动作。

### Chips

- **Style:** 全圆角（999 px），4/10 px 内边距，12 px 600 字重。默认嵌入面底 + 次墨文字。
- **State:** 选中态为青雾底 + 按压青文字；筛选计数用嵌入面小徽标。**每个 chip 都必须有文字**，不存在纯色 chip。

### Cards / Containers

- **Corner Style:** 大圆角（14 px）。
- **Background:** 纸色，页面为下沉面。
- **Shadow Strategy:** 静止无阴影，见 Elevation。
- **Border:** 1 px 界线，始终四边完整。
- **Internal Padding:** 24 px，紧凑区块 20 px，移动端 16 px。禁止卡片嵌套卡片。

### Inputs / Fields

- **Style:** 1 px 控件线（`oklch(64% 0.014 225)`）+ 纸底 + 6 px 圆角，高 40 px，14 px 正文字号。
- **Focus:** 边框转青 + 3 px 青色聚焦环（`oklch(46% 0.085 190 / 0.3)`）。**禁止 `outline: none` 而不给替代。**
- **Error:** 边框转警示赤 + 赤雾底提示块，提示文字 12 px，且必须带图标，不只靠红色。
- **Label:** 12 px 600 字重，次墨色，位于字段上方。

### Navigation

侧边导航是**焦点表面**：深井底色，井上灰文字，44 px 行高，10 px 圆角。默认态井上灰；hover 为 7% 井上白叠加；**激活态为 13% 井上白叠加 + 井上白文字 + 青色图标**（叠加色也是带 hue 的井上白，不是纯白）。

**禁止用左侧色条表示激活态。** 旧版用了 `inset 2px 0` 的青色内阴影条，这是被禁的侧边条纹，已改为整块底色变化加图标染色。

移动端：导航抽出为侧滑面板，配纯色顶栏（**不用毛玻璃**）与半透明遮罩。

### Signature Component: 证据行 Evidence Row

研判台的核心组件，也是「证据先行」原则的物理形态。每条证据是一行：左侧 24 px 方形序号章（嵌入面底、墨色数字、`tabular-nums`），右侧是标题、摘要，以及一条**永远存在**的来源脚注（来源名 · 页码/章节 · 资料时间 · 公开/脱敏/模拟标签）。

来源脚注是 12 px 弱墨色。当来源是模拟或待核实时，标签转为铜色。**没有来源的证据行不允许渲染**：宁可显示「待人工核实」的铜色标记，也不显示一条无出处的结论。

### Signature Component: 读数条 Readout Strip

替代旧版的四张相同指标卡。一条纸色容器被 1 px 界线纵向分成等宽格，每格：12 px 眉标 + 28 px `tabular-nums` 读数 + 12 px 弱墨说明。**没有彩色图标底片，没有卡片阴影，没有渐变。** 指标存在的理由是引向下一个动作，所以每格的说明位写「下一步是什么」，不写形容词。

## 6. Do's and Don'ts

### Do:

- **Do** 把所有颜色、字号、间距、圆角、阴影、动效写成 `:root` 上的 token，页面 CSS 只引用 `var(--*)`。旧版 325 个散落 hex 是这次重构的直接起因。
- **Do** 让青色只表示动作、铜色只表示需人工确认（The Two Voices Rule）。
- **Do** 给每个状态配文字或图标，颜色只作第二通道。关系角色、商机阶段、评级、数据来源四类标识全部适用。
- **Do** 用 12 px 作为字号地板，正文 14 px、行高 1.7。
- **Do** 所有数字加 `font-variant-numeric: tabular-nums`。
- **Do** 用 1 px 完整边框加明度分层建立结构，静止态不给阴影（The Flat-At-Rest Rule）。
- **Do** 给每个可交互元素完整的七态：default、hover、focus-visible、active、disabled、loading、error。
- **Do** 用 150 到 220 ms 的缓出曲线（`cubic-bezier(0.25, 1, 0.5, 1)`），并在 `prefers-reduced-motion` 下全部关闭。
- **Do** 用中性灰做图标容器底色，除非图标本身表达语义。

### Don't:

- **Don't** 做成**环保绿能源官网**：不要把青绿刷满、不要渐变按钮、不要叶子或地球图标、不要「清洁未来」式的公关插画。
- **Don't** 做成**通用 SaaS 落地页**：禁止 `background-clip: text` 渐变文字，禁止大数字加小标签的 hero 指标区，禁止一模一样的卡片网格。
- **Don't** 做成**旧式 ERP 后台**：禁止低对比密表格，禁止 11 px 以下正文，禁止把每个元素都包进边框。
- **Don't** 使用超过 1 px 的左/右侧彩色条纹（`border-left: 3px solid ...`、`box-shadow: inset 2px 0 ...`）。旧版引文块和导航激活态都犯过，已改为完整边框加底色。
- **Don't** 用渐变。按钮、聊天气泡、侧栏、hero 区、进度条一律纯色。**审计口径：CSS 里出现 `linear-gradient` 或 `radial-gradient` 就是错的**，没有例外。
- **Don't** 用毛玻璃（`backdrop-filter: blur()`）做粘性头部或遮罩。投影下它只会让文字变糊。
- **Don't** 把模态当第一反应。抽屉与就地展开优先。
- **Don't** 用装饰性动效。位移、弹跳、缩放只在传达状态时使用；按钮 hover 不做 `translateY`。
- **Don't** 把 `--line`（装饰线）用在输入框上，也不要把 `--border-control` 用在分割线上。两者对比度职责不同。
- **Don't** 让任何数字、评级或建议脱离它的来源出现。**审计口径：界面上任何一个分数，两次点击内必须能看到它的维度拆解和资料来源。**
