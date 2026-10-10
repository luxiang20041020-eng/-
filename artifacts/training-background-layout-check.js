const fs = require('node:fs'), path = require('node:path')
const { chromium } = require('C:/Users/LENOVO/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const { html } = require('../tools/preview-miniprogram')
async function main() {
  const folder = path.join(__dirname, 'design/training-backgrounds'); fs.mkdirSync(folder, { recursive: true })
  const browser = await chromium.launch({ channel: 'msedge', headless: true }), page = await browser.newPage(), failures = []
  const cases = [['booking', 'group', 'state=single'], ['booking', 'group-long', 'state=long'], ['booking', 'group-full', 'state=booked'], ['booking', 'guest', 'state=guest'], ['booking', 'empty', 'state=empty'], ['booking', 'private', 'type=private&coach=coach'], ['booking', 'private-many', 'type=private&many=1'], ['booking', 'private-pending', 'type=private&coach=coach&state=pending'], ['workspace', 'workspace', ''], ['admin', 'admin', '']]
  let count = 0
  for (const width of [320, 375, 430]) for (const lang of ['zh', 'en', 'fr', 'th', 'de', 'ja', 'hi']) for (const [name, label, query] of cases) {
    await page.setViewportSize({ width, height: 812 }); await page.setContent(html(name, new URLSearchParams(query + '&lang=' + lang)))
    await page.evaluate(() => Promise.all(Array.from(document.images, image => image.decode().catch(() => {}))))
    const errors = await page.evaluate(() => {
      const result = [], inside = (box, parent, message) => { if (box.left < parent.left - 1 || box.right > parent.right + 1 || box.top < parent.top - 1 || box.bottom > parent.bottom + 1) result.push(message) }
      if (document.documentElement.scrollWidth > innerWidth + 1) result.push('horizontal overflow')
      for (const image of document.querySelectorAll('.art-header-photo,.booking-cover-photo,.private-feature-photo')) {
        if (!image.complete || !image.naturalWidth) result.push('background did not load')
      }
      for (const frame of document.querySelectorAll('.art-header,.booking-card-cover,.private-training-feature')) {
        for (const text of frame.querySelectorAll('.eyebrow,.page-title,.page-subtitle,.store-badge,.booking-time-range,.booking-card-status,.section-title,.private-section-count')) inside(text.getBoundingClientRect(), frame.getBoundingClientRect(), 'text clipped in ' + frame.className)
      }
      for (const button of document.querySelectorAll('button')) {
        const box = button.getBoundingClientRect(); if (!box.width) continue
        inside(box, { left: 0, right: innerWidth, top: -Infinity, bottom: Infinity }, 'button outside viewport')
        const range = document.createRange(); range.selectNodeContents(button)
        if (range.getBoundingClientRect().width) inside(range.getBoundingClientRect(), box, 'button text clipped: ' + button.className)
      }
      const badge = document.querySelector('.art-header .store-badge')
      if (badge) {
        const box = badge.getBoundingClientRect(), target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
        if (target !== badge && !badge.contains(target)) result.push('image blocks store selection')
      }
      return result
    })
    if (errors.length) failures.push({ width, lang, label, errors })
    if (width === 375 && ['zh', 'en', 'hi'].includes(lang)) await page.screenshot({ path: path.join(folder, label + '-' + lang + '.png'), fullPage: true })
    count++
  }
  const quote = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  await page.setViewportSize({ width: 774, height: 956 })
  await page.setContent('<style>body{margin:0;background:#e9e9e2;font:14px Arial;color:#50594b}header{padding:14px 20px}main{display:flex;gap:12px;padding:0 6px}iframe{border:0;width:375px;height:900px;border-radius:16px}</style><header>生成背景图接入效果 · 示例数据</header><main><iframe srcdoc="' + quote(html('booking', new URLSearchParams('state=single'))) + '"></iframe><iframe srcdoc="' + quote(html('booking', new URLSearchParams('type=private&coach=coach'))) + '"></iframe></main>')
  for (const frame of page.frames()) await frame.evaluate(() => Promise.all(Array.from(document.images, image => image.decode().catch(() => {}))))
  await page.screenshot({ path: path.join(folder, 'booking-background-preview.png') })
  await browser.close(); fs.writeFileSync(path.join(__dirname, 'training-background-layout-results.json'), JSON.stringify({ count, failures }, null, 2))
  console.log(JSON.stringify({ count, failures })); if (failures.length) process.exitCode = 1
}
main().catch(error => { console.error(error); process.exitCode = 1 })
