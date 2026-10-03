# 集合名称与聚焦环绕文字实施计划

> **For agentic workers:** 采用本会话内连续实现，按测试先行逐项完成。

**Goal:** 集合可使用日英双语名称，并在聚焦时按各自设置显示可调的圆形环绕文字。

**Architecture:** 每个集合的日英名称和环绕文字参数放入现有 `data/site-settings.json` 集合配置，避免迁移记录。共享 `marker-groups.mjs` 清理名称和参数；前端复用模糊标点圆形文字渲染器与两个调节项；翻译扫描器同时识别配置文件里的集合名称。

**Tech Stack:** 原生 JavaScript ES modules、Node.js `node:test`、现有本地设置 API。

**Spec:** `docs/superpowers/specs/2026-10-03-marker-group-name-and-ring-text.md`

## Global Constraints

- 保留 `markerGroupName` 旧字段作为兼容回退，不迁移记录数据。
- 集合名称提供 ja/en；名称缺失时依次回退到另一语言、旧集合名和集合编号。
- 新合集环绕文字参数继承现有全局模糊标点文字距离和角度。
- 不覆盖、不提交工作区已有用户记录或站点设置改动；不推送。
- 前端缓存版本从 v225 增至 v226，四处一致。
- 最后确认本地预览 `http://127.0.0.1:4173/` 可访问。

## Review Focus

- 旧配置没有双语名称时，集合仍以记录中的旧名称显示。
- 日英空值/只填一种语言时，名称回退稳定，翻译扫描只报告缺少英文而不误报空组。
- 每组调整环绕文字参数不改变其他集合或全局模糊标点的数值。
- 地图移除/重新显示集合文字时不得遗留在下一个集合聚焦页。
- 保存时保留已有站点设置结构，用户未提交的记录与设置改动不进入本次提交。

---

### Task 1: 集合名称和环绕参数的数据契约

**Files:** `marker-groups.mjs`, `scripts/marker-groups.test.mjs`, `scripts/editor-api.mjs`

- [x] 先为双语名称清理、显示回退、每组环绕参数默认/隔离/范围写失败测试。
- [x] 运行 `node --test scripts/marker-groups.test.mjs`，确认新增测试因缺少行为而失败。
- [x] 实现共享集合设置函数，并保证本地设置 API 保存名称和两个新参数。
- [x] 重跑目标测试。

### Task 2: 编辑和聚焦显示

**Files:** `app.js`, `styles.css`, `scripts/marker-groups.test.mjs`

- [x] 浏览器先确认当前模糊标点环绕文字效果作为复用基准。
- [x] 添加双语名称输入，以及距离/角度两个与模糊标点一致的调节项；新集合默认读取全局值。
- [x] 集合聚焦复用现有 SVG 圆形标签，显示当前语言名称，并正确清理结束状态。
- [x] 自动化单测通过，浏览器检查编辑栏、实时预览和旧集合回退。

### Task 3: 翻译扫描、版本、验证与存档

**Files:** `scripts/scan-untranslated.mjs`（及新增测试，如适合）, `index.html`, `app.js`, `sw.js`, `修改记录.md`, `交接.md`

- [x] 为集合名称缺少英文的翻译扫描结果加失败测试，随后扩展改动扫描和全库扫描。
- [x] 缓存版本四处从 v225 同步到 v226。
- [x] 运行所有 Node 测试、语法检查、`git diff --check` 并检查页面。
- [x] 更新修改记录和最近五轮交接；确认 4173 服务可用（HTTP 200）。
- [x] 只 stage 本任务代码/文档，提交 main，不 push。
