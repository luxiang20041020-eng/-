// 将现有模板接入翻译函数；重复执行不会二次包装。
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..', 'miniprogram')
const pages = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).pages
function quote(text) { return "'" + text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '').replace(/\n/g, '\\n') + "'" }
const displayValue = /(?:Error|error|Hint|hint|Label|label|Text|description|desc|note|heading|Heading|levelText|caption|progressText|weekLabel|dayHeading)(?:\b|$)/
function expression(value, page) {
  const text = value.trim()
  if (displayValue.test(text) || /[\u3400-\u9fff]/.test(text) || (page === 'pages/points/index' && text === 'item.title') || (page === 'pages/workspace/index' && text === 'item.title')) return 'i18n.t(' + text + ', language)'
  return text
}
function localizeText(text, page) {
  if (!text.trim()) return text
  const params = []
  const source = text.trim().replace(/\{\{([\s\S]*?)\}\}/g, (_, exp) => { params.push(expression(exp, page)); return '{' + (params.length - 1) + '}' })
  if (/[\u3400-\u9fff]/.test(source)) return '{{i18n.f(' + quote(source) + ', [' + params.join(', ') + '], language)}}'
  return text.replace(/\{\{([\s\S]*?)\}\}/g, (_, exp) => '{{' + expression(exp, page) + '}}')
}
function transform(file, page) {
  let source = fs.readFileSync(file, 'utf8')
  if (source.includes('module="i18n"')) return
  const tokens = source.match(/<!--[\s\S]*?-->|<\/?[\w-]+(?:"[^"]*"|'[^']*'|[^'">])*>|[^<]+/g) || []
  source = tokens.map(token => {
    if (!token.startsWith('<')) return localizeText(token, page)
    if (token.startsWith('<!--')) return token
    token = token.replace(/(placeholder|title|confirm-text)="([^"]*)"/g, (_, key, value) => key + '="' + localizeText(value, page) + '"')
    if (token.startsWith('<page-feedback ')) token = token.replace('<page-feedback ', '<page-feedback language="{{language}}" ')
    if (token.startsWith('<picker ') && !/mode="(?:date|time)"/.test(token)) {
      const field = token.match(/range-key="([^"]*)"/)
      if (!field || field[1] === 'label') token = token.replace(/range="\{\{([^}]+)\}\}"/, (_, exp) => 'range="{{i18n.list(' + exp + ', ' + quote(field ? field[1] : '') + ', language)}}"')
    }
    return token
  }).join('')
  source = source.replace('class="page-shell', 'class="page-shell locale-page locale-{{language}}')
  const relative = path.relative(path.dirname(file), path.join(root, 'utils/i18n.wxs')).replaceAll('\\', '/')
  fs.writeFileSync(file, '<wxs module="i18n" src="' + relative + '" />\n' + source)
}
for (const page of pages) transform(path.join(root, page + '.wxml'), page)
transform(path.join(root, 'components/page-feedback/index.wxml'), 'feedback')
