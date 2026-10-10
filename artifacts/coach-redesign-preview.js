const fs = require('node:fs'), path = require('node:path')
const { chromium } = require('C:/Users/LENOVO/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const { html } = require('../tools/preview-miniprogram')
async function main() {
  const folder = path.join(__dirname, 'design/coach-profile')
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
  for (const [name, query, file] of [['booking', 'type=private&coach=coach', 'booking-zh.png'], ['coach/edit', '', 'coach-edit-zh.png']]) {
    await page.setContent(html(name, new URLSearchParams(query)))
    await page.screenshot({ path: path.join(folder, file), fullPage: true })
  }
  const quote = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  await page.setViewportSize({ width: 774, height: 870 })
  await page.setContent('<style>body{margin:0;background:#e9e9e2;font:14px Arial;color:#50594b}header{padding:14px 20px}main{display:flex;gap:12px;padding:0 6px}iframe{border:0;width:375px;height:812px;border-radius:16px}</style><header>新版页面 · 本地布局预览（示例数据）</header><main><iframe srcdoc="' + quote(html('booking', new URLSearchParams('type=private&many=1'))) + '"></iframe><iframe srcdoc="' + quote(html('coach/edit')) + '"></iframe></main>')
  await page.screenshot({ path: path.join(folder, 'coach-redesign-preview.png') })
  await browser.close()
}
main().catch(error => { console.error(error); process.exitCode = 1 })
