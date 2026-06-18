# 被遗忘的伞 / Forgotten Umbrella

一个关于城市街角“被遗忘的伞”的艺术项目地图网站与 PWA 原型。

网站目前用于展示地点、照片、时间、天气、分类和观察记录。当前版本先使用本地静态数据，后期可以迁移到数据库或 API，让网站和 App 共用同一套数据源。

## 本地预览

```bash
npm start
```

然后打开：

```text
http://127.0.0.1:4173/
```

不要直接用 `file://` 打开 `index.html`，否则 Google Maps、GPS 定位和 PWA 缓存可能无法正常工作。

## Google Maps

地图 API key 配置在 `config.js`：

```js
export const GOOGLE_MAPS_API_KEY = "YOUR_GOOGLE_MAPS_API_KEY";
```

发布到 GitHub Pages 后，需要在 Google Cloud Console 中把 GitHub Pages 域名加入 API key 的 Website restrictions。建议同时保留本地开发地址：

```text
http://127.0.0.1:4173/*
http://localhost:4173/*
https://<your-github-user>.github.io/*
```

## 数据同步计划

当前数据先保存在项目文件中，便于快速调整界面和交互。后期制作 App 时，建议迁移到数据库或后台 API，例如 Supabase、Firebase、Cloudflare 或自建 API。

建议长期数据字段包括：

- `title`: 作品标题
- `location`: 拍摄地点
- `time`: 拍摄时间
- `coordinates`: 经纬度
- `weather`: 天气或状态
- `type`: 分类
- `adminArea`: 精确行政区域
- `image`: 图片路径或远程图片 URL
- `note`: 观察记录

## 当前功能

- Google Maps 地图标点
- 标点聚焦图片视图
- GPS 默认定位与京都站兜底
- 档案页排序与分类筛选
- 项目说明页
- PWA manifest 与离线缓存脚本
