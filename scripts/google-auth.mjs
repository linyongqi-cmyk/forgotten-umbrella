// Google 授权（方法 B 用）。
//
// 它干嘛的：让本机脚本能读你自己的 Google 表格（表单回答）和 Google Drive
// （投稿者上传的照片）。第一次运行会弹出浏览器让你点「同意」，之后把登录令牌
// 存在 scripts/.google-token.json，以后就不用再点了。
//
// 需要你先放好一个文件：scripts/google-credentials.json
//   —— 从 Google Cloud 控制台下载的「OAuth 客户端（桌面应用）」密钥。
//   （怎么拿见「投稿导入-使用说明.md」的阶段 0。）
//
// 这里只申请「只读」权限：读表格、读云端硬盘文件。脚本永远不会改/删你的
// Google 里的任何东西。

import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";

const here = path.dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_PATH = path.join(here, "google-credentials.json");
const TOKEN_PATH = path.join(here, ".google-token.json");

// 只读权限：读表格 + 读 Drive 文件（下载投稿照片）。
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
];

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function readInstalledCreds(json) {
  // 桌面应用密钥的字段在 installed（有的旧版在 web）里。
  const block = json.installed || json.web;
  if (!block) {
    throw new Error(
      "google-credentials.json 格式不对：找不到 installed/web 字段。请确认下载的是「桌面应用」类型的 OAuth 客户端。",
    );
  }
  return {
    clientId: block.client_id,
    clientSecret: block.client_secret,
  };
}

// 起一个临时本地网页服务器接住 Google 授权后的跳转，拿到 code。
function waitForAuthCode(oAuth2Client, redirectPort) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, `http://127.0.0.1:${redirectPort}`);
        const code = url.searchParams.get("code");
        const err = url.searchParams.get("error");
        if (err) {
          res.end("授权被拒绝，可以关掉这个页面回到终端。");
          server.close();
          reject(new Error(`Google 返回错误：${err}`));
          return;
        }
        if (!code) {
          // 忽略 favicon 之类的杂请求。
          res.statusCode = 404;
          res.end("");
          return;
        }
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(
          "<h2>授权成功 ✅</h2><p>可以关掉这个页面，回到终端，脚本会继续。</p>",
        );
        server.close();
        resolve(code);
      } catch (e) {
        server.close();
        reject(e);
      }
    });
    server.on("error", reject);
    server.listen(redirectPort, "127.0.0.1");
  });
}

async function runConsentFlow(clientId, clientSecret) {
  // 桌面应用允许用 127.0.0.1 回环地址做跳转（任意端口）。
  const redirectPort = 4179;
  const redirectUri = `http://127.0.0.1:${redirectPort}`;
  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline", // 拿 refresh_token，避免以后频繁重新登录
    prompt: "consent",
    scope: SCOPES,
  });

  console.log("\n请在浏览器里打开下面这个网址，用你的 Google 账号点「同意」：\n");
  console.log(authUrl + "\n");
  console.log("（如果浏览器没自动打开，就手动复制上面这行网址。等你点完，脚本会自己继续。）\n");

  // 尽力自动打开浏览器（Mac 上是 open）；失败也没关系，用户手动开。
  try {
    const { exec } = await import("node:child_process");
    exec(`open "${authUrl}"`);
  } catch {
    /* 自动打开失败就靠手动 */
  }

  const code = await waitForAuthCode(oAuth2Client, redirectPort);
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2), "utf8");
  console.log("已保存登录令牌到 scripts/.google-token.json，下次不用再登录。\n");
  return oAuth2Client;
}

// 对外主函数：返回一个已授权、可直接用的 OAuth2 客户端。
export async function getAuthorizedClient() {
  if (!(await pathExists(CREDENTIALS_PATH))) {
    throw new Error(
      `缺少 scripts/google-credentials.json。请先按「投稿导入-使用说明.md」的阶段 0 从 Google Cloud 下载 OAuth 客户端密钥，改名成 google-credentials.json 放进 scripts/ 文件夹。`,
    );
  }
  const creds = readInstalledCreds(JSON.parse(await fs.readFile(CREDENTIALS_PATH, "utf8")));

  // 已有令牌就直接用。
  if (await pathExists(TOKEN_PATH)) {
    const redirectUri = "http://127.0.0.1:4179";
    const oAuth2Client = new google.auth.OAuth2(creds.clientId, creds.clientSecret, redirectUri);
    const tokens = JSON.parse(await fs.readFile(TOKEN_PATH, "utf8"));
    oAuth2Client.setCredentials(tokens);
    // token 过期时 googleapis 会用 refresh_token 自动续；顺手把新 token 存回。
    oAuth2Client.on("tokens", async (t) => {
      try {
        const merged = { ...tokens, ...t };
        await fs.writeFile(TOKEN_PATH, JSON.stringify(merged, null, 2), "utf8");
      } catch {
        /* 存不回也不影响本次运行 */
      }
    });
    return oAuth2Client;
  }

  // 第一次：走同意流程。
  return runConsentFlow(creds.clientId, creds.clientSecret);
}

// 允许单独跑 `node scripts/google-auth.mjs` 只做一次登录测试。
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  getAuthorizedClient()
    .then(() => console.log("授权 OK。"))
    .catch((e) => {
      console.error("授权失败：", e.message);
      process.exit(1);
    });
}
