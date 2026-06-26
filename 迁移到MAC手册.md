# 迁移到 Mac 手册（无痕换电脑指南）

> 给非技术用户的一步步操作。照着做，在新 Mac 上无缝继续「被遗忘的伞」项目。
> 本文件随项目一起复制过去，到 Mac 后第一件事就是打开它。

---

## 一、迁移方式（你选的：直接复制整个文件夹）

**为什么复制整个文件夹最好：**
- 连 `filebox/choice/`（约 400MB 旧素材，没上传 GitHub）一起带过去。
- 连 `.git`（项目存档历史 + 和 GitHub 的连接）一起带过去，到 Mac 能直接继续 commit/push。
- 连还没提交的改动也带过去。

**关键：一定要带上隐藏文件**（以点开头的 `.git`、`.gitignore`、`.nojekyll`、`.claude` 等，平时看不见）。

### 推荐做法：先压缩成 zip 再传
1. 在 Win 上右键整个 `forgotten-umbrella` 文件夹 → 压缩成 zip。压缩包会自动包含所有隐藏文件，不会漏。
2. 用移动硬盘 / U盘 / 网盘把 zip 传到 Mac。
3. 在 Mac 上解压到你想放的位置（比如「文稿」文件夹）。

> 如果不压缩、直接拖文件夹：在 Mac 访达里先按 `Command + Shift + .`（点号）显示隐藏文件，确认 `.git` 文件夹在里面再拷。

---

## 二、到 Mac 后：检查 / 安装环境（按顺序做）

打开 Mac 的「终端」App（聚焦搜索 `Terminal` 回车）。下面每条命令敲完按回车。

### 1. 检查 Node.js（跑本地预览必须，要 20 以上）
```bash
node -v
```
- 显示 `v20.x` 或更高 → ✅ 已就绪，跳到第 2 步。
- 提示 `command not found` 或版本低于 20 → 去 https://nodejs.org 下载 **LTS 版**，双击 `.pkg` 安装，装完重开终端再 `node -v` 确认。

> 本项目**没有第三方依赖**，不需要 `npm install`，装好 Node 就能直接跑。

### 2. 检查 Git（存档 / 上线必须）
```bash
git --version
```
- 显示版本号 → ✅。
- 提示要安装 → 会弹出「安装命令行开发者工具」对话框，点「安装」等它装完；或去 https://git-scm.com 安装。

设置你的署名（**只需设一次**，换电脑要重设）：
```bash
git config --global user.name "linyongqi-cmyk"
git config --global user.email "lilian.yueliang06@gmail.com"
```

### 3. 检查 Claude Code 环境
你说 Mac 刚装好 Claude Code。确认它能用：
```bash
claude --version
```
- 显示版本号 → ✅。第一次用可能要登录（按提示在浏览器登录 Anthropic 账号）。
- 提示 `command not found` → 说明没装好或没加进 PATH，重新按官方指引装一遍。

> Claude Code **不需要**这个项目的任何依赖。它会自动读项目里的 `CLAUDE.md` 和 `交接.md` 接上进度，体验和 Win 上一样。

---

## 三、验证项目能跑（最关键的一步）

在终端进入项目文件夹（把路径换成你解压后的实际位置）：
```bash
cd ~/Documents/forgotten-umbrella
```

### 1. 确认 Git 历史完整（说明隐藏文件没丢）
```bash
git status
git log --oneline -3
```
- 能看到提交历史（最近一条应是「清理无用数据…」）→ ✅ `.git` 带过来了。
- 提示 `not a git repository` → 说明 `.git` 没复制过来，回到第一步用 zip 方式重做。

### 2. 启动本地预览
```bash
npm start
```
浏览器打开 **http://127.0.0.1:4173/** 。
- 能看到落地页、地图页框架、档案、详情页 → ✅ 成功。

> ⚠️ **本地看不到地图是正常的**：Google 地图 Key 限了域名，`127.0.0.1` 上地图不渲染（Win 上也一样）。详情页、图片、统计这些逻辑能测；真实地图效果只在线上（GitHub Pages）看。

### 3.（可选）确认线上发布正常
线上地址：https://linyongqi-cmyk.github.io/forgotten-umbrella/
打开看插图、地图都正常即可。

---

## 四、Mac 上的日常工作流（和 Win 一致）

- **预览**：`npm start` → http://127.0.0.1:4173/
- **改了 `record.json`**（手改）→ 要重建：`npm run records:build`
- **改了 `scripts/editor-api.mjs`** → 杀掉 node 重启预览服务（Mac 上杀进程：`pkill -f "node server.js"` 然后重新 `npm start`）
- **存档**：`git add -A` → `git commit -m "说明"`（直接提交 main，单人不开分支）
- **上线**：只有你说要发布时 → `git fetch` 看远端 → `git push`

> Win 上原来杀 node 用 `taskkill //F //IM node.exe`，Mac 上改用 `pkill -f node` 或 `pkill -f "node server.js"`。这是唯一明显的命令差异。

---

## 五、迁移检查清单（打勾确认）

- [ ] 整个文件夹已压缩成 zip（含隐藏文件）并复制到 Mac
- [ ] Mac 解压后 `git status` 能正常显示（`.git` 完好）
- [ ] `node -v` ≥ 20
- [ ] `git --version` 正常，且设好了 user.name / user.email
- [ ] `claude --version` 正常（必要时已登录）
- [ ] `npm start` 能打开 http://127.0.0.1:4173/
- [ ] 线上 https://linyongqi-cmyk.github.io/forgotten-umbrella/ 正常

全部打勾 = 迁移成功，可以在 Mac 上接着干活了。

---

## 六、关于 GitHub 同步的提醒

- 目前本地有一条「清理无用数据」的提交**还没 push 到 GitHub**（等你确认要不要上线）。
- 你直接复制文件夹的话，这条提交在 `.git` 里会一起过去，到 Mac 后可以正常 `git push`。
- 如果你担心两台电脑都改、怕乱：**原则就一条——同一时间只在一台电脑上改**。在 Mac 开始干活前，先在 Mac 上 `git pull` 一下（如果 Win 那边后来又 push 过），保证是最新的。
