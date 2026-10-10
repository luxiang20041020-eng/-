const fs = require('fs'), path = require('path')
const { chromium } = require('C:/Users/LENOVO/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const { html } = require('../tools/preview-miniprogram')
async function main() {
  const folder = path.join(__dirname, 'design/coach-profile'); fs.mkdirSync(folder, { recursive: true })
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage(), failures = []; let count = 0
  const cases = [['booking', 'type=private&coach=coach'], ['booking', 'type=private&many=1'], ['booking', 'type=private&many=1&expanded=1'], ['booking', 'type=private&state=empty'], ['coach', ''], ['coach', 'state=empty'], ['coach', 'photos=1'], ['coach', 'state=short&photos=single'], ['coach', 'state=long&photos=single'], ['coach/edit', ''], ['coach/edit', 'state=short'], ['coach/edit', 'state=long'], ['coach/edit', 'section=intro'], ['coach/edit', 'state=long&section=intro'], ['coach/edit', 'section=photos'], ['coach/edit', 'photos=1'], ['profile', 'role=coach'], ['profile', 'role=coach&privacy=1'], ['coach/edit', 'privacy=1']]
  for (const width of [320, 375, 430]) for (const lang of ['zh', 'en', 'fr', 'th', 'de', 'ja', 'hi']) for (const [name, query] of cases) {
    await page.setViewportSize({ width, height: 812 })
    await page.setContent(html(name, new URLSearchParams(query + '&lang=' + lang)))
    const errors = await page.evaluate(() => {
      const result = []
      if (document.documentElement.scrollWidth > innerWidth + 1) result.push('horizontal overflow: ' + document.documentElement.scrollWidth)
      for (const button of document.querySelectorAll('.private-coach-select,.private-coach-all,.coach-choose,.edit-save,.edit-tab,.edit-add,.edit-avatar-action,.edit-photo button,.avatar-upload-button,.media-privacy-actions button')) {
        const box = button.getBoundingClientRect()
        if (box.width && (box.left < -1 || box.right > innerWidth + 1)) result.push('button outside screen: ' + button.className)
        const range = document.createRange(); range.selectNodeContents(button); const text = range.getBoundingClientRect()
        if (text.width && (text.left < box.left - 1 || text.right > box.right + 1 || text.top < box.top - 1 || text.bottom > box.bottom + 1)) result.push('text outside button: ' + button.className)
      }
      for (const shell of document.querySelectorAll('.edit-input-shell')) {
        const field = shell.querySelector('input'), box = shell.getBoundingClientRect(), inner = field.getBoundingClientRect(), style = getComputedStyle(field)
        if (Math.abs((box.top + box.bottom) / 2 - (inner.top + inner.bottom) / 2) > 1) result.push('input not centered')
        if (parseFloat(style.paddingTop) || parseFloat(style.paddingBottom)) result.push('native input contains vertical padding')
      }
      for (const shell of document.querySelectorAll('.edit-textarea-shell')) {
        const field = shell.querySelector('textarea'), box = shell.getBoundingClientRect(), inner = field.getBoundingClientRect(), style = getComputedStyle(field)
        if (inner.top < box.top || inner.bottom > box.bottom || inner.right > box.right + 1) result.push('textarea outside wrapper')
        if (parseFloat(style.paddingTop) || parseFloat(style.paddingBottom)) result.push('native textarea contains vertical padding')
      }
      for (const heading of document.querySelectorAll('.coach-section-title')) {
        const content = heading.nextElementSibling
        if (content && content.getBoundingClientRect().top - heading.getBoundingClientRect().bottom < 8) result.push('coach heading too close to content')
      }
      return result
    })
    if (errors.length) failures.push({ width, lang, name, query, errors })
    if (width === 375 && ['zh', 'en', 'hi'].includes(lang) && !query.includes('state=empty')) await page.screenshot({ path: path.join(folder, name.replaceAll('/', '-') + '-' + lang + (query.includes('state=short') ? '-short' : query.includes('state=long') ? '-long' : query.includes('privacy') ? '-privacy' : query.includes('expanded') ? '-drawer' : query.includes('many') ? '-many' : query.includes('section=intro') ? '-intro' : query.includes('section=photos') ? '-empty-photos' : query.includes('photos') ? '-photos' : '') + '.png'), fullPage: true })
    count++
  }
  await browser.close()
  fs.writeFileSync(path.join(__dirname, 'coach-profile-layout-results.json'), JSON.stringify({ count, failures }, null, 2))
  console.log(JSON.stringify({ count, failures })); if (failures.length) process.exitCode = 1
}
main().catch(error => { console.error(error); process.exitCode = 1 })
