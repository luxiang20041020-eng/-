const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname, '../../miniprogram')
const text = require('../../miniprogram/utils/i18n-text')
const languages = ['zh', 'en', 'fr', 'th', 'de', 'ja', 'hi']

test('词库保留开发者工具原有路径，源文件不打包且运行代码不依赖被排除文件', () => {
  for (const name of ['feedback-aliases.js', 'messages.tsv', 'ui-translations.tsv', 'zh-ui.json']) {
    assert.ok(fs.existsSync(path.join(root, 'locales', name)), name)
  }
  const project = JSON.parse(fs.readFileSync(path.join(root, '../project.config.json'), 'utf8'))
  assert.ok(project.packOptions.ignore.some(item => item.type === 'folder' && item.value === 'locales'))
  function check(folder) {
    for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, item.name)
      if (item.isDirectory()) { if (file !== path.join(root, 'locales')) check(file); continue }
      if (!item.name.endsWith('.js')) continue
      for (const match of fs.readFileSync(file, 'utf8').matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
        if (!match[1].startsWith('.')) continue
        assert.ok(!path.resolve(folder, match[1]).startsWith(path.join(root, 'locales') + path.sep), file)
      }
    }
  }
  check(root)
})

function loadLocale(storage = new Map(), system = 'zh_CN') {
  const module = { exports: {} }
  const wx = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value), getAppBaseInfo: () => ({ language: system }) }
  vm.runInNewContext(fs.readFileSync(path.join(root, 'utils/i18n.js'), 'utf8'), { module, wx, require: () => text, Set })
  return { locale: module.exports, wx, storage }
}

test('七种语言选择优先使用已保存设置，未设置时识别系统语言，未知语言回退中文', () => {
  for (const code of languages) {
    const first = loadLocale(new Map(), code + '_XX')
    assert.equal(first.locale.getLanguage(), code)
    first.locale.setLanguage('fr')
    const next = loadLocale(first.storage, 'de')
    assert.equal(next.locale.getLanguage(), 'fr')
  }
  assert.equal(loadLocale(new Map(), 'es').locale.getLanguage(), 'zh')
})

test('语言保存失败保留原选择；切换通知订阅者，卸载后不再通知', () => {
  const { locale, wx } = loadLocale()
  let changes = 0
  const stop = locale.subscribe(() => changes++)
  locale.setLanguage('th')
  assert.equal(changes, 1)
  wx.setStorageSync = () => { throw new Error('storage full') }
  assert.throws(() => locale.setLanguage('de'))
  assert.equal(locale.getLanguage(), 'th')
  assert.equal(changes, 1)
  stop()
  wx.setStorageSync = () => {}
  locale.setLanguage('hi')
  assert.equal(changes, 1)
})

test('切换立即更新已打开页面，再次进入同步语言与导航标题，卸载后停止监听', () => {
  const { locale, wx } = loadLocale(new Map([['one.language', 'en']]))
  const titles = []
  wx.setNavigationBarTitle = options => titles.push(options.title)
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(path.join(root, 'utils/with-i18n.js'), 'utf8'), { module, wx, require: () => locale })
  let observed
  const definition = module.exports({ data: { rawStatus: '已预约' }, onShow() { observed = this.data.language } })
  const page = { ...definition, route: 'pages/profile/index', data: { ...definition.data }, setData(patch) { Object.assign(this.data, patch) } }
  page.onLoad()
  assert.equal(page.data.language, 'en')
  assert.equal(titles.at(-1), 'My account')
  locale.setLanguage('fr')
  assert.equal(page.data.language, 'fr')
  assert.equal(page.data.rawStatus, '已预约')
  page.onShow()
  assert.equal(observed, 'fr')
  assert.equal(titles.at(-1), 'Mon compte')
  page.onUnload()
  locale.setLanguage('hi')
  assert.equal(page.data.language, 'fr')
})

test('静态页面词条在六种外语中都有完整译文且参数保持原文', () => {
  const sources = JSON.parse(fs.readFileSync(path.join(root, 'locales/zh-ui.json'), 'utf8'))
  for (const language of languages.slice(1)) {
    for (const source of sources) {
      const translated = text.format(source, ['王教练', '高新旗舰店', '测试课程', '张客户'], language)
      if (language !== 'ja') assert.doesNotMatch(translated.replace(/王教练|高新旗舰店|测试课程|张客户/g, ''), /[\u3400-\u9fff]/, source + ' ' + language)
      if (language !== 'ja') assert.notEqual(translated, source)
      if (source.includes('{0}')) assert.match(translated, /王教练/)
    }
    assert.ok(text.format('{0} 的工作台', ['客户自填的课程名称'], language).includes('客户自填的课程名称'))
  }
})

test('原始业务状态和用户输入不被修改，付款选择显示翻译但事件仍按原数组下标处理', () => {
  const records = [{ label: '现金', value: 'cash' }, { label: '微信', value: 'wechat' }]
  const translated = text.list(records, 'label', 'en')
  assert.equal(translated[0].label, 'Cash')
  assert.equal(translated[0].value, 'cash')
  assert.equal(records[0].label, '现金')
})

test('WXS 与 JavaScript 翻译结果一致，中文版本保持原文', () => {
  const module = { exports: {} }
  // WXS 没有 JavaScript 的全局 String 构造器，不能借 Node 内置对象掩盖运行差异。
  vm.runInNewContext(fs.readFileSync(path.join(root, 'utils/i18n.wxs'), 'utf8'), { module, String: undefined })
  for (const language of languages) for (const source of ['我的积分', '周五', '已预约', '网络连接中断，请检查网络后重试', '该类型课时已用完，请联系场馆续课']) {
    assert.equal(module.exports.t(source, language), text.translate(source, language))
    if (language === 'zh') assert.equal(text.translate(source, language), source)
  }
  for (const language of languages) {
    assert.equal(module.exports.f('可用权益：团课 {0} 次 · 专属 {1} 次', [0, 12], language), text.format('可用权益：团课 {0} 次 · 专属 {1} 次', [0, 12], language))
    assert.equal(module.exports.t(0, language), '0')
    assert.equal(module.exports.t(null, language), '')
  }
})

test('共享错误提示都可翻译，保留超时结果未确认的处理建议', () => {
  const feedback = fs.readFileSync(path.join(root, 'utils/user-feedback.js'), 'utf8')
  const sources = [...feedback.matchAll(/[A-Z_]+:\s*'([^']+)'/g)].map(match => match[1])
  for (const language of languages.slice(1)) for (const source of sources) {
    assert.notEqual(text.translate(source, language), source)
    if (language !== 'ja') assert.doesNotMatch(text.translate(source, language), /[\u3400-\u9fff]/, source + ' ' + language)
  }
  const message = '请求超时，请检查网络后重试；结果尚未确认，请先刷新记录核对，勿重复提交'
  assert.match(text.translate(message, 'en'), /outcome unconfirmed/)
})

test('全部页面接入WXS并传递语言，语言设置对游客可用，登录不新增邀请码输入', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  for (const name of config.pages) {
    const source = fs.readFileSync(path.join(root, name + '.wxml'), 'utf8')
    assert.match(source, /<wxs module="i18n"/)
    if (name !== 'pages/login/index') assert.match(source, /page-feedback language="\{\{language\}\}"/)
  }
  const profile = fs.readFileSync(path.join(root, 'pages/profile/index.wxml'), 'utf8')
  assert.ok(profile.indexOf('<language-setting') < profile.indexOf('runtime.isAuthenticated'))
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'pages/login/index.wxml'), 'utf8'), /invite-input|onBindInvite/)
})
