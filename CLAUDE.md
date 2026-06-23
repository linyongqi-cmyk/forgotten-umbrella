# CLAUDE.md — Forgotten Umbrella 项目说明（给 AI 的常驻指南）

> 这个文件会被 Claude Code 自动读取。新会话**先读这里**，再看 `交接.md`（当前进度/待办）和 `修改记录.md`（改动历史）。
> 用户是**非技术小白**，请用最普通易懂的中文沟通，解释任何文件/命令先说"它是干嘛的"。

## 这是什么项目
「被遗忘的伞 / Forgotten Umbrella」——记录城市公共空间里被遗忘雨伞的**艺术地图网站 + 可安装 PWA**。纯前端静态站，Google Maps 标点，中/日/英三语，GitHub Pages 发布。**当前处于原型阶段**。

## 怎么跑 / 预览 / 构建
- 必须用本地服务器（不能 `file://`）：`npm start` → http://127.0.0.1:4173/ 。无第三方依赖，不需要 `npm install`。需 Node 20+。
- 改了 `filebox/records/**/record.json` 后要重建：`npm run records:build`（输出 `data/umbrellas.json`）。
- 把所有 record.json 规范化成带中文注释格式：`npm run records:format`。
- **本地编辑器通过 API 保存时会自动重建**，只有手改 record.json 才需要手动 build。
- 预览用 Claude Preview MCP 的 `preview_*` 工具（`.claude/launch.json` 已配置，启动命令是 `node server.js`）。改了 `scripts/editor-api.mjs` 后要**杀掉 node 进程重启**（它是动态 import，有缓存）。

## 架构与数据流
- 前端：`index.html` + `app.js`(~2800行) + `styles.css`；PWA：`sw.js` + `manifest.json`。
- 真源：`filebox/records/<category>(<group>)/<id>/record.json`（76 条）→ `scripts/build-umbrellas.mjs` 聚合成 `data/umbrellas.json`（前端读取，**自动生成物，勿手改**）。
- **本地编辑器**：只在 `127.0.0.1`（本机）出现（`IS_LOCAL`），线上完全不渲染。后端 = `server.js` + `scripts/editor-api.mjs`，提供只对本机生效的 `/api/*` 接口（save-record / upload-image / delete-image / create-record / delete-record / move-record）。
- `data/japan-areas.json`：全日本地址数据（47 都道府县→市→区，日英双语，英文已译后缀：Kyoto / Kyoto City / Minami Ward），用于编辑器地址级联下拉。来源是用户的 KEN_ALL_ROME xlsx。

## record.json 当前字段（重要！结构演进过）
- `schemaVersion`, `sourceIndex`
- `locationText`（手填显示地址）、`locationLevels`（罗马音数组，由级联下拉生成）
- `photoCoordinates`（EXIF）、`locationCoordinates`（手动覆盖/拖动设定）
- `photoTime`（EXIF）、`time`（手动覆盖）
- `title`（目前单语；用户要改双语 en/ja，**待办**）
- `umbrellaType`/`umbrellaColor`（旧字段，已不用于展示）
- `umbrellaCount`："1"~"5"/"unknown"/""
- `umbrellaUnits`：**每把伞一个对象** `{color, colorDetail, kind, status:[], statusOther}`，随数量增减。这是为**后期统计**铺垫的核心结构。
- `editFlag`："yellow"/"black"/"white"/""（编辑用标记色，仅编辑模式地图显示）
- `story`（由 blocks 的文字段落合并，用于卡片简介）
- `blocks`：详情页图文顺序 `[{type:"text",text} | {type:"photo",file}]`
- `media`：`[{id, file, role, title, photoTime, story, legacyThumb}]`，role ∈ primary/supplement/detail/illustration

## 公开展示规则
- 详情页（点标记的聚焦页）：**固定头部**（id(title)/地点/时间）+ **可滚动文章**（封面图 + INFORMATION 网格 + blocks 图文流）。
- INFORMATION 用"标签在左、值左对齐"网格：type / object / state；不同颜色或类型的伞各占一行（相同的合并成 `two ...`），每把伞状态各占一行。
- `object` 文本 = 数量+颜色+种类拼接（如 `two blue long umbrella`；count=1 不显示 "one"；没填颜色种类则不显示）。
- 地址英文罗马音；类型直接显示文件夹名（如 `transit(place)`）。
- 详情页字体/行距可在 `styles.css` 搜 "详情页字体设置" 改变量数字。

## 版本号（缓存刷新）
改了前端就把版本号一起 +1：`index.html` 的 `styles.css?v=NN` 和 `app.js?v=NN`、`app.js` 里 `sw.js?v=NN`、`sw.js` 里 `CACHE_NAME` 的 vNN。**当前 v61**。

## 工作约定（必须遵守，详见 memory + 仓库 `开发与上线流程.md`）
1. 动手前**先确认+反思**需求（是否合理？有无更好方案？）。
2. 分析**隐藏需求**。
3. 每个任务结束给**小结**。
4. **不用每次都问"是否存档"或"打开预览网址"**（用户 2026-06-23 定）。在合适的检查点（如一批活做完、或要做有风险的数据改动前）**直接 git commit 存档**即可，不必询问；预览链接只在确实需要用户看时再给。
5. **每次改过文件就更新 `修改记录.md`**（最上面追加，绝对日期，大白话，尽量简短）。
- 原型期：**只本地开发**；「存档」=本地 `git commit`（直接提交 main，单人不开分支）；**只有用户说"上线/同步"才 push**。
- `filebox/records` 的图片（~413MB）随仓库；`filebox/choice` 已 gitignore。
- **数据是用户真实录入的，绝不能随意删除/清空**（删前必先核对）。

## 关键文件
- `app.js` 编辑器逻辑在文件后半段（`setupEditor`/`openEditor`/`saveEditor`/`renderFlow` 等）。
- `scripts/editor-api.mjs` 后端保存。`scripts/record-utils.mjs` 序列化（带中文注释）。
- `config.js` Google Maps API Key（浏览器域名限制，用户已配）。
