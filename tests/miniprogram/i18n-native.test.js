const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const vm = require('node:vm')
const { execFileSync } = require('node:child_process')
const { fixtures, pageNames } = require('../../tools/preview-miniprogram')
const text = require('../../miniprogram/utils/i18n-text')
const root = path.resolve(__dirname, '../..')
const wcc = process.env.WCC_PATH || 'D:/soft/微信web开发者工具/resources/app.asar.unpacked/node_modules/wcc-exec/wcc.exe'
const languages = ['zh', 'en', 'fr', 'th', 'de', 'ja', 'hi']

function compiledRuntime(files, cwd) {
  const source = execFileSync(wcc, files, { cwd, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
  const errors = []
  const context = vm.createContext({ window: {}, console: { log: (...args) => errors.push(args.join(' ')), warn: (...args) => errors.push(args.join(' ')) } })
  vm.runInContext(source, context)
  return { context, errors }
}
function contents(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  return (node.children || []).map(contents).join('')
}

test('微信原生 WXS 运行时完整显示七种语言的静态文本、参数、状态和选择项', { skip: !fs.existsSync(wcc) }, () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'one-i18n-native-'))
  try {
    fs.copyFileSync(path.join(root, 'miniprogram/utils/i18n.wxs'), path.join(folder, 'i18n.wxs'))
    fs.writeFileSync(path.join(folder, 'fixture.wxml'), '<wxs module="i18n" src="./i18n.wxs" /><view wx:for="{{cases}}" wx:key="source">{{i18n.f(item.source, item.values, language)}}</view><view>{{i18n.t(status, language)}}</view><view wx:for="{{i18n.list(options, \'label\', language)}}" wx:key="value">{{item.label}}</view>')
    const { context, errors } = compiledRuntime(['fixture.wxml', 'i18n.wxs'], folder)
    const render = context.$gwx('fixture.wxml')
    const sources = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/locales/zh-ui.json'), 'utf8'))
    for (const language of languages) {
      // 创建数据于编译器同一上下文，模拟小程序的数据桥接。
      context.input = JSON.stringify({ language, cases: sources.map(source => ({ source, values: [19, '陈客户', '测试课程', '门店原名'] })), status: '已预约', options: [{ label: '现金', value: 'cash' }, { label: '微信', value: 'wechat' }] })
      const data = vm.runInContext('JSON.parse(input)', context)
      const tree = render(data, {})
      const expected = sources.map(source => text.format(source, [19, '陈客户', '测试课程', '门店原名'], language)).join('') + text.translate('已预约', language) + text.translate('现金', language) + text.translate('微信', language)
      assert.equal(contents(tree), expected, language)
      assert.deepEqual(errors, [], '微信原生渲染不应吞掉翻译异常')
    }
  } finally {
    for (const file of ['fixture.wxml', 'i18n.wxs']) fs.unlinkSync(path.join(folder, file))
    fs.rmdirSync(folder)
  }
})

test('所有页面的实际微信编译渲染在七种语言及表单状态下不发生文字渲染异常', { skip: !fs.existsSync(wcc) }, () => {
  const files = pageNames.map(page => 'miniprogram/pages/' + page + '/index.wxml')
  files.push('miniprogram/utils/i18n.wxs')
  const { context, errors } = compiledRuntime(files, root)
  for (const page of pageNames) for (const language of languages) for (const query of ['', 'popup=1&expanded=1&invite=form', 'state=guest', 'popup=assets']) {
    const data = fixtures(page, new URLSearchParams(query))
    data.language = language
    context.input = JSON.stringify(data)
    const nativeData = vm.runInContext('JSON.parse(input)', context)
    const tree = context.$gwx('miniprogram/pages/' + page + '/index.wxml')(nativeData, {})
    assert.ok(contents(tree).length > 0, page + ' ' + language)
    assert.deepEqual(errors, [], page + ' ' + language + ' ' + query)
  }
})
