const fs = require('node:fs'), path = require('node:path')
const { chromium } = require('C:/Users/LENOVO/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const { html } = require('../tools/preview-miniprogram')
async function main() {
  const folder = path.join(__dirname, 'design/coach-sport'); fs.mkdirSync(folder, { recursive: true })
  const browser = await chromium.launch({ channel: 'msedge', headless: true }), page = await browser.newPage(), failures = []
  const cases = [['profile', ''], ['photos', 'photos=1'], ['short', 'state=short&photos=single'], ['long', 'state=long&photos=single'], ['empty', 'state=empty'], ['error', 'state=error']]
  let count = 0
  for (const width of [320, 375, 430]) for (const language of ['zh', 'en', 'fr', 'th', 'de', 'ja', 'hi']) for (const [label, query] of cases) {
    await page.setViewportSize({ width, height: 812 }); await page.setContent(html('coach', new URLSearchParams(query + '&lang=' + language)))
    await page.evaluate(() => Promise.all(Array.from(document.images, image => image.decode().catch(() => {}))))
    const errors = await page.evaluate(() => {
      const errors = [], inside = (box, parent, message) => { if (box.left < parent.left - 1 || box.right > parent.right + 1 || box.top < parent.top - 1 || box.bottom > parent.bottom + 1) errors.push(message) }
      if (document.documentElement.scrollWidth > innerWidth + 1) errors.push('horizontal overflow')
      if (document.body.innerText.includes('{{')) errors.push('unresolved template text')
      const hero = document.querySelector('.coach-hero'), background = document.querySelector('.coach-hero-background')
      if (!background.naturalWidth) errors.push('training background not loaded')
      for (const element of hero.querySelectorAll('.coach-brand,.coach-training-label,.coach-hero-message,.coach-avatar,.coach-name,.coach-title,.coach-level')) inside(element.getBoundingClientRect(), hero.getBoundingClientRect(), 'hero content clipped: ' + element.className)
      for (const heading of document.querySelectorAll('.coach-section-title')) {
        const content = heading.nextElementSibling
        if (content && content.getBoundingClientRect().top - heading.getBoundingClientRect().bottom < 8) errors.push('heading too close to content')
      }
      for (const section of document.querySelectorAll('.coach-section')) for (const element of section.querySelectorAll('.coach-section-title,.coach-honor-text,.coach-photo,.coach-body')) inside(element.getBoundingClientRect(), section.getBoundingClientRect(), 'section content clipped: ' + element.className)
      const footer = document.querySelector('.coach-booking-bar'), button = footer.querySelector('.coach-choose'), box = button.getBoundingClientRect()
      inside(footer.getBoundingClientRect(), { left: 0, right: innerWidth, top: 0, bottom: innerHeight }, 'footer outside viewport')
      inside(box, footer.getBoundingClientRect(), 'button outside footer')
      const range = document.createRange(); range.selectNodeContents(button); inside(range.getBoundingClientRect(), box, 'button text clipped')
      const target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      if (target !== button && !button.contains(target)) errors.push('button covered')
      const hasError = document.querySelector('.page-feedback-error')
      if (hasError && !button.disabled) errors.push('button enabled with read error')
      return errors
    })
    // 滚动到底，最后一段预约说明应完整露出，不能被固定按钮遮住。
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    const obscured = await page.evaluate(() => document.querySelector('.coach-note').getBoundingClientRect().bottom > document.querySelector('.coach-booking-bar').getBoundingClientRect().top + 1)
    if (obscured) errors.push('footer covers final note')
    await page.evaluate(() => window.scrollTo(0, 0))
    if (errors.length) failures.push({ width, language, label, errors })
    if (width === 375 && ['zh', 'en', 'hi'].includes(language) && ['profile', 'short', 'long', 'photos'].includes(label)) {
      await page.screenshot({ path: path.join(folder, label + '-' + language + '.png'), fullPage: true })
      if (label === 'profile') await page.screenshot({ path: path.join(folder, 'screen-' + language + '.png') })
    }
    count++
  }
  await browser.close(); fs.writeFileSync(path.join(__dirname, 'coach-sport-layout-results.json'), JSON.stringify({ count, failures }, null, 2))
  console.log(JSON.stringify({ count, failures })); if (failures.length) process.exitCode = 1
}
main().catch(error => { console.error(error); process.exitCode = 1 })
