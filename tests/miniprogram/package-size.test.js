const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { audit, ignored } = require('../../tools/check-package-size')
const mini = path.resolve(__dirname, '../../miniprogram')

test('上传包保留业务页面和场馆照片，排除示例资源并留出编译体积余量', () => {
  const result = audit()
  assert.ok(result.bytes < 1.8 * 1024 * 1024, '上传源文件体积：' + result.bytes)
  const app = JSON.parse(fs.readFileSync(path.join(mini, 'app.json'), 'utf8'))
  for (const page of app.pages) for (const ext of ['js', 'json', 'wxml', 'wxss']) {
    assert.ok(result.files.some(item => item.file === page + '.' + ext), page + '.' + ext)
  }
  for (const name of ['gym-interior-1.jpg', 'gym-interior-2.jpg', 'gym-interior-3.jpg']) {
    assert.ok(result.files.some(item => item.file === 'images/' + name), name)
  }
  for (const name of ['pages/example/index.js', 'components/cloudTipModal/index.js', 'images/create_cbr.png', 'images/ai_example1.png', 'locales/feedback-aliases.js']) assert.ok(ignored(name), name)
  for (const item of result.files.filter(item => /\.(js|json|wxml)$/.test(item.file))) {
    const source = fs.readFileSync(path.join(mini, item.file), 'utf8')
    for (const resource of result.excluded) {
      assert.ok(!source.includes('/' + resource.file), item.file + ' 引用了被排除的 ' + resource.file)
    }
  }
})
