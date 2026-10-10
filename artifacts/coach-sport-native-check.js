const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), { execFileSync } = require('node:child_process')
const { fixtures } = require('../tools/preview-miniprogram')
const source = execFileSync('D:/soft/微信web开发者工具/resources/app.asar.unpacked/node_modules/wcc-exec/wcc.exe', ['miniprogram/pages/coach/index.wxml', 'miniprogram/utils/i18n.wxs'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
const errors = [], context = vm.createContext({ window: {}, console: { log: (...args) => errors.push(args.join(' ')), warn: (...args) => errors.push(args.join(' ')) } })
vm.runInContext(source, context)
const contents = node => typeof node === 'string' || typeof node === 'number' ? String(node) : (node.children || []).map(contents).join('')
let count = 0
for (const language of ['zh', 'en', 'fr', 'th', 'de', 'ja', 'hi']) for (const query of ['', 'state=empty', 'state=short&photos=single', 'state=long&photos=single']) {
  const data = fixtures('coach', new URLSearchParams(query)); data.language = language
  context.input = JSON.stringify(data)
  const text = contents(context.$gwx('miniprogram/pages/coach/index.wxml')(vm.runInContext('JSON.parse(input)', context), {}))
  assert.ok(text.includes(data.coach.name)); assert.ok(text.includes(data.coach.title)); assert.ok(text.includes(data.coach.levelLabel))
  for (const [index, honor] of data.coach.honors.entries()) assert.ok(text.includes(String(index + 1).padStart(2, '0') + honor), 'honor number/text ' + language)
  assert.equal(text.includes('{{'), false); assert.deepEqual(errors, []); count++
}
fs.writeFileSync('artifacts/coach-sport-native-results.json', JSON.stringify({ count, errors }, null, 2)); console.log(JSON.stringify({ count, errors }))
