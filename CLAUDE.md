# CLAUDE.md — Forgotten Umbrella 项目说明（给 AI 的常驻指南）

> 这个文件会被 Claude Code 自动读取。新会话**先读这里**，再看 `交接.md`（当前进度/待办，每次交接**重写**、只留最近 5 轮）。`修改记录.md`（改动历史）**只在确实要查历史时才读**，平时不用读。`未来可能需要注意的事.md` 记「现在不用做、但以后可能要」的想法/坑，做相关功能前可翻一下。
> 用户是**非技术小白**，请用最普通易懂的中文沟通，解释任何文件/命令先说"它是干嘛的"。

## 这是什么项目
「被遗忘的伞 / Forgotten Umbrella」——记录城市公共空间里被遗忘雨伞的**艺术地图网站 + 可安装 PWA**。纯前端静态站，Google Maps 标点，中/日/英三语，GitHub Pages 发布。**当前处于原型阶段**。

## 怎么跑 / 预览 / 构建
- 必须用本地服务器（不能 `file://`）：`npm start` → http://127.0.0.1:4173/ 。需 Node 20+。**依赖 sharp（图片分级生成用，只本机后端跑，不影响线上静态站）——新克隆/新机器要先 `npm install`。**
- 改了 `filebox/records/**/record.json` 后要重建：`npm run records:build`（输出 `data/umbrellas.json`）。
- **图片分级（提速）**：每张原图旁自动生成 `NAME.thumb.webp`(400px 缩略图)+`NAME.web.webp`(1280px 网页版)，前端小图用 thumb、详情展示用 web、放大先 web 再后台下原图替换。存量批量补齐：`npm run images:build`（只新增、不动原图；`--force` 强制重生）。编辑器上传/新建图片时后端 `editor-api.mjs` 会自动生成。生成/尺寸逻辑在 `scripts/image-derivatives.mjs`（THUMB=400 q70 / WEB=1280 q78）。**注意 `.thumb.webp`/`.web.webp` 是生成物，`record-utils.mjs` 扫描文件夹时靠 `isDerivativeFile` 排除，别让它们进 media。**
- 把所有 record.json 规范化成带中文注释格式：`npm run records:format`。
- **本地编辑器通过 API 保存时会自动重建**，只有手改 record.json 才需要手动 build。
- 预览用 Claude Preview MCP 的 `preview_*` 工具。`.claude/launch.json` 已配置；**Mac 上 node 写的是绝对路径**（`/Users/eiki/.local/node-vXX/bin/node`，不能用符号链接，否则预览报 spawn 失败），以后升级 Node 换了目录要回来改这行。改了 `scripts/editor-api.mjs` 后要**杀掉 node 进程重启**（它是动态 import，有缓存）——Mac 上：`pkill -f "node server.js"`。

## 架构与数据流
- 前端：`index.html` + `app.js`(~11000行) + `styles.css`；PWA：`sw.js` + `manifest.json`。
- 真源：`filebox/records/<category>(<group>)/<id>/record.json`（139 条）→ `scripts/build-umbrellas.mjs` 聚合成 `data/umbrellas.json`（前端读取，**自动生成物，勿手改**）。
- **本地编辑器**：只在 `127.0.0.1`（本机）出现（`IS_LOCAL`），线上完全不渲染。后端 = `server.js` + `scripts/editor-api.mjs`，提供只对本机生效的 `/api/*` 接口（save-record / upload-image / delete-image / create-record / delete-record / move-record / save-texts）。
- `data/japan-areas.json`：全日本地址数据（47 都道府县→市→区，日英双语，英文已译后缀：Kyoto / Kyoto City / Minami Ward），用于编辑器地址级联下拉。来源是用户的 KEN_ALL_ROME xlsx。
- `data/texts.json`：可编辑的 UI 文案（双语 ja/en）——9 个类型说明文 + 统计页说明文。前端启动 fetch 读取（不是 record 生成物，**直接改它就是源**，不需 build）。本地「文 文案編集」面板（左上，仅 127.0.0.1）改完走 `/api/save-texts` 写回。**不要再在 app.js 里硬编码这些文案**。

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
- `media`：`[{id, file, role, title, photoTime, story, legacyThumb, weather, showWeather}]`，role ∈ primary/supplement/detail/illustration。`weather/showWeather` 是每张图自己的天气显示数据：主图通常是拍摄前 24 小时，补充/细节图通常只抓拍摄当时 1 点。（旧的灯箱准星 `crosshair` 字段已于 v82 删除。）

## 公开展示规则
- 详情页（点标记的聚焦页）：**固定头部**（id(title)/地点/时间）+ **可滚动文章**（封面图 + INFORMATION 网格 + blocks 图文流）。
- INFORMATION 用"标签在左、值左对齐"网格：type / object / state；不同颜色或类型的伞各占一行（相同的合并成 `two ...`），每把伞状态各占一行。
- `object` 文本 = 数量+颜色+种类拼接（如 `two blue long umbrella`；count=1 不显示 "one"；没填颜色种类则不显示）。
- 地址英文罗马音；类型直接显示文件夹名（如 `transit(place)`）。
- 详情页字体/行距可在 `styles.css` 搜 "详情页字体设置" 改变量数字。

## 版本号（缓存刷新）
改了前端就把版本号一起 +1：`index.html` 的 `styles.css?v=NN` 和 `app.js?v=NN`、`app.js` 里 `sw.js?v=NN`、`sw.js` 里 `CACHE_NAME` 的 vNN。**当前 v201**。（四处必须一致；曾出现 sw.js 漏改不一致，bump 后顺手 grep `v=` 核对。）

## 工作约定（必须遵守，详见 memory + 仓库 `开发与上线流程.md`）
1. 动手前**先确认+反思**需求（是否合理？有无更好方案？）。
2. 分析**隐藏需求**。
3. 每个任务结束给**小结**。
4. **存档规则（用户 2026-07-05 更新，覆盖旧规则）**：**只有当改动较大、且会牵连到其他代码时**才自动 `git commit` 存档；**其余每个任务做完都要问一句"要存档吗"**，不要自作主张 commit。（判断：单文件小修/样式微调→做完问一句；跨多文件、迁移字段、改数据结构等大改→直接 commit。）预览链接只在确实需要用户看时再给。
5. **每次改过文件就更新 `修改记录.md`**（最上面追加，绝对日期，大白话，尽量简短）。但 `修改记录.md` **只在需要查历史时才读**，平时别读。
6. **`交接.md` 每次交接时重写**，只保留**最近 5 轮**的修改，更早的不留（历史去 `修改记录.md` 查）。每次写/更新 `交接.md` 必须写明本次任务由哪个智能体完成（例如 codex / Claude Code）。
- 原型期：**只本地开发**；「存档」=本地 `git commit`（直接提交 main，单人不开分支）；**只有用户说"上线/同步"才 push**。
- `filebox/records` 的图片（~413MB）随仓库；`filebox/choice` 已 gitignore。
- **数据是用户真实录入的，绝不能随意删除/清空**（删前必先核对）。

## AI 行为规范（从 2026-07-03 起补充）
- **全程中文大白话**：中间进度、最终小结都用中文。不要用英文工作流句子（如 "Let me..." / "Task done"）糊过去；提到命令、文件、提交、构建时，先用一句话说它是干嘛的。
- **开工前先把需求翻译成人话**：先简短写清楚「我理解你要改什么」「我觉得哪里可能有坑」「我准备动哪些文件/数据」。如果需求里有不合理或更小的方案，要先说出来，不要闷头做。
- **用户说“讨论一下/怎么解决比较好”时先停下来讨论**：给 2-3 个方案和推荐理由，等用户选。只有小到不影响方向的细节，才可以说明默认做法后继续。
- **“推倒重写”不能变成继续打补丁**：先指出要重写的边界（例如只重写详情页图片排布，不动地图/编辑器），删掉或收拢旧逻辑；如果判断不该全量重写、只重写局部更稳，必须先告诉用户原因。
- **大任务分阶段，但别让任务失控**：先拆成 2-4 个阶段，每阶段只解决一类问题；每阶段做完要验证和 commit。不要顺手扩展到用户没要求的新功能。
- **批量改真实数据前要特别说明**：凡是会改很多 `record.json`、迁移字段、批量抓外部数据、重写 `data/umbrellas.json`，先说明影响范围、是否会动原照片/文字、如何回退；先做小样本或 dry-run，再批量跑。绝不删除/清空真实数据。
- **外部数据要可解释**：例如天气、地址、地图 API，必须说明来源、失败条件、跳过条件；不能把没小时的日期硬编成具体时间。
- **验证不能夸大**：只能说自己实际验证过的内容，并写清环境（如本地 1280×860、哪些记录 ID、哪些按钮）。动画/真机/地图加载这类难在无头浏览器完全证明的，要明确写“还需真机确认”。
- **临时代码必须当天清掉**：调试用的 `window.__fu`、临时日志、测试按钮等，提交前必须搜索确认已删除。
- **改 icon 类 UI 必须适配视觉设定**：新增或替换图标时，优先用 lucide 图标/路径；SVG 的 `stroke-width` 必须绑定 `var(--icon-stroke, 1.7)`，让它跟“视觉设定”面板的图标线宽一起变化。做完后最终回复要明确告诉用户“图标线宽已适配视觉设定”。
- **前端任务结束必须确认本地服务器可用**：做完网页/UI/前端相关任务后，要确认 `http://127.0.0.1:4173/` 能打开；如果服务器没开，就运行 `npm start` 启动，并在最终回复里明确给出访问地址。不要让用户自己发现网站进不去。
- **最终回复要短而有用**：按「改了什么 / 验证了什么 / 还需要你看什么」说，不要写成长篇技术报告。涉及用户担心的问题，要直接对应编号回答。
- **交接要记录决策而不是流水账**：`交接.md` 只留最近 5 轮，写清本轮由哪个智能体完成、关键选择、未验证风险、下一步；不要把所有命令过程塞进去。

## 关键文件
- `app.js` 编辑器逻辑在文件后半段（`setupEditor`/`openEditor`/`saveEditor`/`renderFlow` 等）。
- `scripts/editor-api.mjs` 后端保存。`scripts/record-utils.mjs` 序列化（带中文注释）。
- `config.js` Google Maps API Key（浏览器域名限制，用户已配）。
