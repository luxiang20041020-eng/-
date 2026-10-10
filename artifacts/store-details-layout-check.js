const fs = require('node:fs'), path = require('node:path')
const { chromium } = require('C:/Users/LENOVO/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const { html } = require('../tools/preview-miniprogram')
async function main() {
  const folder = path.join(__dirname, 'design/store-details'); fs.mkdirSync(folder, { recursive: true })
  const browser = await chromium.launch({ channel: 'msedge', headless: true }), page = await browser.newPage(), failures = []
  const cases = [['home', 'list', 'popup=stores'], ['home', 'distance', 'popup=stores&distance=1'], ['home', 'denied', 'popup=stores&state=denied'], ['home', 'many', 'popup=stores&distance=1&many=1'], ['home', 'detail', 'popup=store-detail&distance=1'], ['home', 'missing', 'popup=store-detail&state=missing'], ['home', 'long', 'popup=store-detail&state=long&distance=1'], ['admin/stores', 'edit', 'popup=1']]
  let count = 0
  for (const width of [320, 375, 430]) for (const language of ['zh', 'en', 'fr', 'th', 'de', 'ja', 'hi']) for (const [name, label, query] of cases) {
    await page.setViewportSize({ width, height: 812 }); await page.setContent(html(name, new URLSearchParams(query + '&lang=' + language)))
    await page.addStyleTag({ content: '.preview-store-map{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:repeating-linear-gradient(0deg,transparent 0,transparent 38px,#d3dacb 38px,#d3dacb 44px),repeating-linear-gradient(90deg,#e6eadf 0,#e6eadf 60px,#d3dacb 60px,#d3dacb 67px)}.preview-store-map span{font-size:32px;color:#c7452d}.preview-store-map small{padding:5px;background:#fff;color:#69755d}' })
    await page.evaluate(() => Promise.all(Array.from(document.images, image => image.decode().catch(() => {}))))
    const errors = await page.evaluate(() => {
      const errors = [], inside = (box, parent, message) => { if (box.left < parent.left - 1 || box.right > parent.right + 1 || box.top < parent.top - 1 || box.bottom > parent.bottom + 1) errors.push(message) }
      if (document.documentElement.scrollWidth > innerWidth + 1) errors.push('horizontal overflow')
      if (document.body.innerText.includes('{{')) errors.push('unresolved template')
      const panel = document.querySelector('.store-picker-panel,.store-edit-panel'), scroll = panel.querySelector('.store-sheet-scroll,.store-edit-scroll'), footer = panel.querySelector('.store-picker-footer,.modal-button-row')
      inside(panel.getBoundingClientRect(), { left: 0, right: innerWidth, top: 0, bottom: innerHeight }, 'panel outside viewport')
      inside(scroll.getBoundingClientRect(), panel.getBoundingClientRect(), 'scroll outside panel')
      inside(footer.getBoundingClientRect(), panel.getBoundingClientRect(), 'footer outside panel')
      if (scroll.getBoundingClientRect().bottom > footer.getBoundingClientRect().top + 1) errors.push('scroll overlaps footer')
      if (getComputedStyle(scroll).overflowY !== 'auto') errors.push('content is not scrollable')
      for (const button of panel.querySelectorAll('button')) {
        const box = button.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(button)
        inside(box, { left: 0, right: innerWidth, top: -Infinity, bottom: Infinity }, 'button outside viewport')
        const text = range.getBoundingClientRect(); if (text.width) inside(text, box, 'button text clipped: ' + button.className)
      }
      for (const image of panel.querySelectorAll('img')) if (!image.naturalWidth) errors.push('store photo did not load')
      return errors
    })
    if (errors.length) failures.push({ width, language, label, errors })
    if (width === 375 && ['zh', 'en', 'hi'].includes(language) && !['many', 'long'].includes(label)) {
      await page.screenshot({ path: path.join(folder, label + '-' + language + '.png') })
      if (label === 'detail') {
        await page.locator('.store-sheet-scroll').evaluate(element => { element.scrollTop = 280 })
        await page.screenshot({ path: path.join(folder, 'location-' + language + '.png') })
      }
    }
    count++
  }
  await browser.close(); fs.writeFileSync(path.join(__dirname, 'store-details-layout-results.json'), JSON.stringify({ count, failures }, null, 2))
  console.log(JSON.stringify({ count, failures })); if (failures.length) process.exitCode = 1
}
main().catch(error => { console.error(error); process.exitCode = 1 })
