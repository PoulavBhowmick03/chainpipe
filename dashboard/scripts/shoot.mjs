import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";

const BASE = process.env.SHOOT_BASE ?? "http://localhost:3000";
const OUT = process.env.SHOOT_OUT ?? "/private/tmp/claude-501/-Users-odinson-Developer-ledgerforge-solana/57ff48ee-b8df-47ca-8a47-0c5d9684478b/scratchpad/shots";
mkdirSync(OUT, { recursive: true });

const AGENT = process.env.SHOOT_AGENT ?? "87iLbbnkDXn5fdNiJfdEY3b4Kgz3XGx6z7F2o4zZhN5s";
const PIPE = process.env.SHOOT_PIPE ?? "3mQgZ1FXjs7q3aWVoaabxweJpoxCKbpYJWJnxyfMFhXF";
const routes = [
  ["home", "/"], ["bazaar", "/bazaar"], ["create", "/pipeline/create"],
  ["work", "/work"], ["my-pipelines", "/my/pipelines"], ["my-stake", "/my/stake"],
  ["agent", `/agent/${AGENT}`], ["pipeline", `/pipeline/${PIPE}`],
];
const viewports = [["d", 1440, 900], ["m", 390, 844]];
const console_log = [];

const browser = await chromium.launch();
for (const [name, path] of routes) {
  for (const [tag, w, h] of viewports) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console_log.push({ route: path, tag, type: m.type(), text: m.text().slice(0, 300) }); });
    page.on("pageerror", (e) => console_log.push({ route: path, tag, type: "pageerror", text: String(e).slice(0, 300) }));
    try {
      await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(1300);
      await page.screenshot({ path: `${OUT}/${name}-${tag}.png` });
    } catch (e) { console_log.push({ route: path, tag, type: "shoot-error", text: String(e).slice(0, 200) }); }
    await ctx.close();
  }
}

// Landing extras: mid-scroll + pointer-move (prove parallax), and wallet-modal click.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.mouse.move(400, 300); await page.mouse.move(1000, 500); await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/home-pointer.png` });
  await page.evaluate(() => window.scrollTo(0, 500)); await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/home-scroll.png` });
  // click connect wallet
  try {
    const btn = page.getByText(/connect wallet/i).first();
    await btn.click({ timeout: 4000 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/wallet-after-click.png` });
    const modal = await page.locator(".wallet-adapter-modal, [class*=wallet-adapter-modal]").count();
    console_log.push({ route: "/", tag: "wallet", type: "info", text: `wallet modal nodes after click: ${modal}` });
  } catch (e) { console_log.push({ route: "/", tag: "wallet", type: "wallet-click-error", text: String(e).slice(0, 200) }); }
  await ctx.close();
}

writeFileSync(`${OUT}/console.json`, JSON.stringify(console_log, null, 2));
await browser.close();
console.log("shot", routes.length * 2 + 3, "frames;", console_log.length, "console entries");
