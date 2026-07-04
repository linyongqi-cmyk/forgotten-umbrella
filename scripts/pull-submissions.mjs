// 投稿导入（命令行版）。核心逻辑都在 scripts/submissions-core.mjs（和编辑器收件箱共用）。
//
// 用法：
//   node scripts/pull-submissions.mjs            正式导入所有还没导入的投稿
//   node scripts/pull-submissions.mjs --dry-run  只看会导入哪些，不写文件
//   node scripts/pull-submissions.mjs --sheet=ID 临时用别的表格
//
// 说明见「投稿导入-使用说明.md」。日常也可以改用编辑器里的「收件箱」按钮（图形界面）。

import {
  loadConfig,
  loadState,
  saveState,
  getClients,
  listSubmissions,
  importSubmission,
  markImported,
  nextSourceIndexStart,
  runBuild,
} from "./submissions-core.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
const sheetArg = (() => {
  const a = process.argv.find((x) => x.startsWith("--sheet="));
  return a ? a.slice("--sheet=".length).trim() : "";
})();

async function main() {
  const config = await loadConfig(sheetArg);
  const state = await loadState();
  const clients = await getClients();
  const { submissions } = await listSubmissions(clients, config, state);

  const pending = submissions.filter((s) => !s.imported);
  console.log(`表格里共 ${submissions.length} 条投稿，其中未导入 ${pending.length} 条。`);
  if (pending.length === 0) {
    console.log("没有新投稿要导入。");
    return;
  }

  const usedThisRun = new Set();
  let sourceIndex = await nextSourceIndexStart();
  let created = 0;

  for (const sub of pending) {
    console.log(
      `\n${DRY_RUN ? "[试跑] " : ""}${sub.submitter || "(匿名)"}  ` +
        `时间：${sub.dateFound || "?"}  地点：${sub.location || "?"}  ` +
        `照片：${sub.mainPhotoIds.length + sub.additionalPhotoIds.length} 张`,
    );
    if (DRY_RUN) {
      continue;
    }
    const meta = await importSubmission(clients, sub, {}, { usedThisRun, sourceIndex: sourceIndex++ });
    markImported(state, sub, meta);
    created += 1;
    console.log(`   → 生成 ${meta.id}` + (meta.heicCount ? `（${meta.heicCount} 张 HEIC，待手动转 jpg）` : ""));
  }

  if (DRY_RUN) {
    console.log(`\n[试跑] 会导入 ${pending.length} 条。没有改动任何文件。去掉 --dry-run 才真正导入。`);
    return;
  }

  await saveState(state);
  console.log(`\n完成：新导入 ${created} 条。重建 data/umbrellas.json …`);
  await runBuild();
  console.log("重建完成。打开本地编辑器核对这些新投稿即可。");
}

main().catch((e) => {
  console.error("\n出错了：", e.message);
  process.exit(1);
});
