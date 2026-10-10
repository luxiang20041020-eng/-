const fs = require('node:fs'), path = require('node:path')
const { chromium } = require('C:/Users/LENOVO/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const { html } = require('../tools/preview-miniprogram')
async function main() {
  const folder = path.join(__dirname, 'design/booking-records'); fs.mkdirSync(folder, { recursive: true })
  const browser = await chromium.launch({ channel: 'msedge', headless: true }), page = await browser.newPage(), failures = []
  const cases = [['profile',''],['bookings',''],['bookings','state=empty'],['bookings','state=guest'],['bookings','state=end'],['bookings','state=more-error']]
  let count = 0
  for (const width of [320,375,430]) for (const lang of ['zh','en','fr','th','de','ja','hi']) for (const [name,query] of cases) {
    await page.setViewportSize({ width, height: 812 }); await page.setContent(html(name,new URLSearchParams(query + '&lang=' + lang)))
    await page.evaluate(() => Promise.all(Array.from(document.images, image => image.decode().catch(() => {}))))
    const errors = await page.evaluate(() => {
      const result = [], inside = (b,p,label) => { if (b.left < p.left-1 || b.right > p.right+1 || b.top < p.top-1 || b.bottom > p.bottom+1) result.push(label) }
      if (document.documentElement.scrollWidth > innerWidth+1) result.push('horizontal overflow')
      if (/\{\{|undefined|NaN/.test(document.body.innerText)) result.push('unresolved text')
      for (const image of document.querySelectorAll('.profile-hero-photo,.points-balance-photo,.edit-identity-photo,.art-header-photo')) if (!image.naturalWidth) result.push('background failed')
      for (const selector of ['.profile-hero','.points-balance','.edit-identity','.art-header','.today-class-time']) {
        for (const frame of document.querySelectorAll(selector)) for (const child of frame.children) inside(child.getBoundingClientRect(),frame.getBoundingClientRect(),'content clipped: '+selector)
      }
      for (const button of document.querySelectorAll('button')) {
        const box=button.getBoundingClientRect(); if (!box.width) continue
        inside(box,{left:0,right:innerWidth,top:-Infinity,bottom:Infinity},'button outside viewport')
        const range=document.createRange();range.selectNodeContents(button);if(range.getBoundingClientRect().width)inside(range.getBoundingClientRect(),box,'button text clipped: '+button.className)
        if (button.closest('.profile-hero,.edit-identity') && box.bottom>0 && box.top<innerHeight) {
          const hit=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2)
          if(hit!==button&&!button.contains(hit)&&!(hit&&hit.closest('.nickname-mask')))result.push('decoration blocks button')
        }
      }
      return result
    })
    if(errors.length)failures.push({width,lang,name,query,errors})
    if(width===375 && ['zh','hi'].includes(lang)&&!query)await page.screenshot({path:path.join(folder,name.replaceAll('/','-')+'-'+lang+'.png'),fullPage:true})
    count++
  }
  await browser.close();fs.writeFileSync(path.join(__dirname,'booking-records-layout-results.json'),JSON.stringify({count,failures},null,2));console.log(JSON.stringify({count,failures}));if(failures.length)process.exitCode=1
}
main().catch(error=>{console.error(error);process.exitCode=1})
