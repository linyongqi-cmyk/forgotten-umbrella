# 集合标点编辑与交互实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Each task uses the test-first workflow and should be checked before moving on.

**Goal:** 让集合展开互不残留、普通记录与集合设置各有独立编辑区，并让所有集合共用的标点颜色能在现有标点样式编辑系统里修改。

**Architecture:** 在 `marker-groups.mjs` 明确集合展开状态的转换规则，由 `app.js` 的地图和标点事件统一调用。右侧编辑区域分成互斥的普通记录模式和集合模式；聚焦参数只在集合模式。集合颜色作为现有标点样式设置中的独立配置项，复用现有编辑器颜色输入、预览与保存流程，不增加记录类别筛选。

**Tech Stack:** 原生 JavaScript ES modules、Google Maps Marker、HTML/CSS、Node.js `node:test`。

**Spec:** `docs/superpowers/specs/2026-10-03-marker-group-editing-design.md`

## Global Constraints

- 集合颜色默认值为 `#d95d42`，所有集合共用一个颜色。
- 集合聚焦参数仍按 `markerGroupId` 存入 `data/site-settings.json`；集合颜色走 `data/marker-settings.json` 的现有保存接口。
- 不改伞记录、`data/umbrellas.json` 或现有用户站点设置；不增加依赖，不推送。
- 前端缓存版本从 v223 升至 v224，并同步改动四处版本号。
- 保留当前集合数字标签、标点形状、颜色设置以外的样式和普通标点类别颜色。

## Review Focus

- 连续点开两个集合不得留下两个展开组：Task 1 用状态转换测试验证。
- 点击当前集合成员保留展开，点其他记录则收起：Task 1 分别测试这两个分支。
- 地图相机程序动画不得误当成用户拖动/缩放：Task 1 保留相机动画保护并做回归验证。
- 编辑模式点集合只开集合编辑区、不能误开成员记录或播放浏览展开动画：Task 2 用浏览器验证。
- 集合颜色修改不能污染五种普通标点类别，刷新后仍保留：Task 3 测试独立配置默认/保存值，并浏览器重载验证。

---

### Task 1: 统一集合展开状态与收起入口

**Files:**
- Modify: `marker-groups.mjs`
- Test: `scripts/marker-groups.test.mjs`
- Modify: `app.js`（`renderMapMarkers`、普通/集合标点 click、地图交互与视图/筛选切换）

**Interfaces:**
- Produces: `nextExpandedMarkerGroup(currentGroupId, action) -> string | null`，由集合与地图事件共同调用。
- `action.type` 至少支持 `group-click`、`member-click`、`other-marker-click`、`map-interaction`、`filter-change`、`view-change`；`group-click` 接收 `groupId` 和 `editMode`，`member-click` 接收成员的 `groupId`。

- [x] **Step 1: 写状态转换失败测试**

  覆盖：点另一个集合时返回新集合 ID；再次点当前展开集合时返回 `null`；当前集合成员点击保留当前 ID；点无关标点、地图空白/拖动/缩放、筛选或视图切换返回 `null`；编辑模式点集合不产生浏览展开 ID。

- [x] **Step 2: 运行测试并确认因缺少状态函数而失败**

  Run: `node --test scripts/marker-groups.test.mjs`
  Expected: 新增断言失败，指出状态转换函数缺失或结果不符，而非测试环境错误。

- [x] **Step 3: 实现纯状态转换函数并接入统一收起流程**

  用该函数更新 `state.markerGroupExpanded`，保证其最多含一个 ID；地图拖动/缩放、地图点击、其他普通标点点击、筛选变化和视图切换都清理展开状态与集合模糊；点当前集合成员按设计保留展开；切换到另一个集合先结束旧状态再处理新点击。保留相机动画期间的保护。

- [x] **Step 4: 重跑集合单测**

  Run: `node --test scripts/marker-groups.test.mjs`
  Expected: 新增状态转换测试和既有集合测试全部通过。

### Task 2: 分离普通记录编辑与集合编辑

**Files:**
- Modify: `app.js`（编辑栏生成/切换、`syncEditorMarkerGroupControl`、集合聚焦输入、编辑模式集合标点 click）
- Modify: `styles.css`（集合选择折叠控件与集合编辑内容布局）

**Interfaces:**
- 普通记录栏继续用现有 `openEditor(id)`、`saveEditor()`、`closeEditor()`。
- 新增独立集合编辑模式，接收 `markerGroupId`；右侧同一编辑区域同一时间只展示普通记录表单或集合表单。
- 集合表单读取/更新现有 `siteMarkerGroupSettingsFor` / `updateSiteMarkerGroupSettings`，并复用聚焦预览入口。

- [x] **Step 1: 明确两个编辑模式的可观察行为**

  先以浏览器检查现有模式作为基准，记录普通栏要保留的集合勾选/选择/新建，以及需迁移的聚焦倍率、模糊、半径、羽化、白雾和预览。

- [x] **Step 2: 实现普通记录栏简化和“集合”折叠按钮**

  移除普通栏里的集合聚焦设置；保留勾选与现有/新建选项。将“集合”文字做成独立可访问的展开/收起按钮，点击不触发 checkbox，不改变记录集合关系。

- [x] **Step 3: 在现有右侧编辑区域加入独立集合模式**

  编辑模式下保留集合数量标点可点击；点击进入集合编辑模式，不展开成员或执行聚焦动画。将集合名作为标题/只读说明，聚焦参数与预览放进集合表单。普通标点仍由 `openEditor(id)` 编辑；开一种模式前关闭另一种，普通记录未保存时遵守现有确认与保存保护。

- [x] **Step 4: 浏览器验证两种编辑模式和折叠行为**

  检查编辑模式点击集合标点打开集合栏；普通成员标点进入原记录栏；集合栏内各参数实时预览且写回该组设置；普通栏文字折叠/展开选择区但不改变勾选和成员关系。

### Task 3: 把集合颜色接入现有标点样式编辑系统

**Files:**
- Modify: `app.js`（标点设置默认值/清理、集合标点 SVG 颜色、样式编辑面板/实时预览）
- Modify: `marker-groups.mjs`（若需增加纯色值读取/验证 helper）
- Test: `scripts/marker-groups.test.mjs`
- Modify: `styles.css`（集合标点预览样式，如需要）

**Interfaces:**
- Produces: 集合标点颜色默认 `#d95d42`，从当前标点样式设置读取；使用现有标点设置保存流程写入 `data/marker-settings.json`。
- 普通标点的五种类别配色和地图筛选类别不变。

- [x] **Step 1: 为集合颜色默认值和独立性写失败测试**

  验证无设置时为 `#d95d42`，合法自定义颜色可恢复，非法值回退默认，并且普通类别颜色不随集合颜色变化。

- [x] **Step 2: 运行测试确认测试能捕获缺失/错误行为**

  Run: `node --test scripts/marker-groups.test.mjs`
  Expected: 新增颜色设置测试在未实现时失败。

- [x] **Step 3: 将集合颜色加入现有样式面板**

  在现有“标点样式修改”编辑器中增加集合标点预览及同一套取色器/文字颜色输入；通过现有实时应用和保存函数处理，不新增独立保存按钮。数字标签继续白色。

- [x] **Step 4: 验证默认/合法/非法颜色、保存接口接线和样式编辑预览**

  Run: `node --test scripts/marker-groups.test.mjs`
  Expected: 默认、自定义、无效值与类别隔离测试全部通过。浏览器中改色后集合标点立即变色，保存并刷新后颜色保留，五类普通标点颜色未变。

### Task 4: 全面验证、缓存更新与交接存档

**Files:**
- Modify: `index.html`（两个 `?v=`）
- Modify: `app.js`（service worker `?v=`）
- Modify: `sw.js`（cache name）
- Modify: `修改记录.md`
- Rewrite: `交接.md`

- [x] **Step 1: 同步前端缓存版本至 v224**

  确认 index 两处、app 的 service worker 查询和 sw cache name 四处均为 v224。

- [x] **Step 2: 执行完整自动测试与静态检查**

  Run: `node --test && node --check app.js && node --check marker-groups.mjs && git diff --check`
  Expected: 所有测试通过、语法检查和空白检查无错误。

- [x] **Step 3: 完成本地浏览器回归检查**

  验证浏览模式的展开/收起、当前成员例外、切换集合；编辑模式的两类编辑栏；集合样式改色和刷新保留。确认 `http://127.0.0.1:4173/` 可打开。

- [x] **Step 4: 更新说明、核对只暂存本轮代码、提交本地存档**

  只暂存本计划相关的代码、测试和说明文件；排除已有 `data/site-settings.json`、`data/umbrellas.json` 及 `filebox/records/**` 用户数据改动。提交到当前 `main`，不 push。
