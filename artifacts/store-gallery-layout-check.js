const fs = require('node:fs'), path = require('node:path')
const { chromium } = require('C:/Users/LENOVO/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const { html } = require('../tools/preview-miniprogram')
async function main() {
  const folder = path.join(__dirname, 'design/store-gallery'); fs.mkdirSync(folder, { recursive: true })
  const browser = await chromium.launch({ channel: 'msedge', headless: true }), page = await browser.newPage(), failures = []
  let count = 0
  const cases = [['home', 'home', ''], ['admin/stores', 'list', ''], ['admin/stores', 'editor', 'popup=gallery'], ['admin/stores', 'empty', 'popup=gallery&state=empty'], ['admin/stores', 'error', 'popup=gallery&state=error'], ['admin/stores', 'uploading', 'popup=gallery&state=uploading']]
  for (const width of [320, 375, 430]) for (const language of ['zh', 'en', 'fr', 'th', 'de', 'ja', 'hi']) for (const [name, label, query] of cases) {
    await page.setViewportSize({ width, height: 812 }); await page.setContent(html(name, new URLSearchParams(query + '&lang=' + language)))
    await page.evaluate(() => Promise.all(Array.from(document.images, image => image.decode().catch(() => {}))))
    const errors = await page.evaluate(() => {
      const errors = []
      if (document.documentElement.scrollWidth > innerWidth + 1) errors.push('horizontal overflow')
      for (const image of document.querySelectorAll('.gallery-photo,.store-gallery-cover,.facility-image')) if (!image.naturalWidth) errors.push('photo failed to load')
      const panel = document.querySelector('.gallery-panel')
      if (panel) {
        const box = panel.getBoundingClientRect()
        if (box.top < -1 || box.bottom > innerHeight + 1) errors.push('editor outside viewport')
        for (const selector of ['.gallery-save', '.gallery-hint', '.gallery-error', '.gallery-scroll']) {
          const element = panel.querySelector(selector); if (!element) continue
          const b = element.getBoundingClientRect(); if (b.top < box.top - 1 || b.bottom > box.bottom + 1 || b.left < box.left - 1 || b.right > box.right + 1) errors.push('editor content outside panel: ' + selector)
        }
        const scroll = panel.querySelector('.gallery-scroll'), save = panel.querySelector('.gallery-save')
        if (scroll.getBoundingClientRect().bottom > save.getBoundingClientRect().top) errors.push('save overlaps gallery')
        if (getComputedStyle(scroll).overflowY !== 'auto') errors.push('gallery does not scroll')
        if (save.getBoundingClientRect().width < box.width - 40) errors.push('save does not fill footer')
      }
      for (const button of document.querySelectorAll('.gallery-panel button,.store-actions button')) {
        const b = button.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(button); const text = range.getBoundingClientRect()
        if (text.width && (text.left < b.left - 1 || text.right > b.right + 1 || text.top < b.top - 1 || text.bottom > b.bottom + 1)) errors.push('button text clipped: ' + button.className)
      }
      return errors
    })
    if (errors.length) failures.push({ width, language, label, errors })
    if (width === 375 && ['zh', 'en', 'hi'].includes(language)) await page.screenshot({ path: path.join(folder, label + '-' + language + '.png'), fullPage: !query.includes('popup=gallery') })
    count++
  }
  await browser.close(); fs.writeFileSync(path.join(__dirname, 'store-gallery-layout-results.json'), JSON.stringify({ count, failures }, null, 2))
  console.log(JSON.stringify({ count, failures })); if (failures.length) process.exitCode = 1
}
main().catch(error => { console.error(error); process.exitCode = 1 })
