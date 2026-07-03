// 图片分级生成（缩略图 + 网页展示版），供 build / 编辑器后端 / 批量脚本共用。
// 设计目标：线上不再直接下载几 MB 的原图当小图用。每张原图旁边生成两个 webp：
//   NAME.thumb.webp —— 400px 宽，地图/列表/小图用（~30KB）
//   NAME.web.webp   —— 1280px 宽，详情页展示用（~350KB）
// 原图保留不动（放大时前端渐进式下载原图替换网页版）。
import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";

// 尺寸/质量：按「显示器最多 2K + 手机高清屏」定，用户 2026-07-03 拍板。
export const THUMB_WIDTH = 400;
export const WEB_WIDTH = 1280;
const THUMB_QUALITY = 70;
const WEB_QUALITY = 78;

// 能生成分级图的原图格式（视频不在此列，前端另行处理）。
const IMAGE_RE = /\.(jpe?g|png|webp|tiff?|gif|avif|heic|heif)$/i;

export function isDerivableImage(file) {
  return IMAGE_RE.test(String(file || ""));
}

// 生成物自身（避免把 .thumb.webp / .web.webp 又拿去生成一遍）。
export function isDerivativeFile(file) {
  return /\.(thumb|web)\.webp$/i.test(String(file || ""));
}

// 给定原图文件名 "NAME.ext"，返回同目录下两个生成物的文件名。
export function derivativeNames(file) {
  const base = path.parse(String(file)).name;
  return { thumb: `${base}.thumb.webp`, web: `${base}.web.webp` };
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// 为一张原图生成缩略图 + 网页版（同目录）。已存在则跳过（force=true 时强制重生）。
// 返回 { thumb, web }（文件名，相对其所在目录）。视频/非图片返回 null。
export async function generateDerivatives(srcAbsPath, { force = false } = {}) {
  const file = path.basename(srcAbsPath);
  if (!isDerivableImage(file) || isDerivativeFile(file)) {
    return null;
  }
  const dir = path.dirname(srcAbsPath);
  const names = derivativeNames(file);
  const jobs = [
    { out: path.join(dir, names.web), width: WEB_WIDTH, quality: WEB_QUALITY },
    { out: path.join(dir, names.thumb), width: THUMB_WIDTH, quality: THUMB_QUALITY },
  ];
  for (const job of jobs) {
    if (!force && (await fileExists(job.out))) {
      continue;
    }
    await sharp(srcAbsPath)
      // .rotate() 把 EXIF 方向烘进像素（webp 不留方向标签）。原图靠浏览器读 EXIF
      // 自动转向，两者显示方向一致，裁剪百分比也能对上。
      .rotate()
      .resize({ width: job.width, withoutEnlargement: true })
      .webp({ quality: job.quality })
      .toFile(job.out);
  }
  return names;
}

// 删除一张原图对应的两个生成物（删图片时用）。忽略不存在的。
export async function removeDerivatives(srcAbsPath) {
  const dir = path.dirname(srcAbsPath);
  const names = derivativeNames(path.basename(srcAbsPath));
  await Promise.all([
    fs.rm(path.join(dir, names.thumb), { force: true }),
    fs.rm(path.join(dir, names.web), { force: true }),
  ]);
}
