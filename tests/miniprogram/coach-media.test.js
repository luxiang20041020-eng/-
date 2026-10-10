const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')

test('隐私组件只有原生同意成功才放行，取消或卸载结束等待且不操作图片', async () => {
  let config, notices = 0
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../miniprogram/components/media-privacy/index.js'), 'utf8'), {
    Component: value => { config = value }, require: () => ({ showFeedback: () => { notices++ } }), wx: {},
  })
  const component = { ...config.methods, data: {}, setData(value) { Object.assign(this.data, value) } }
  const request = component.authorize({ privacyContractName: '真实协议名称' })
  assert.equal(component.data.contractName, '真实协议名称')
  component.onAgree({ detail: { errMsg: 'agreePrivacyAuthorization:fail' } }); assert.equal(notices, 1); assert.equal(component.data.visible, true)
  component.onAgree({ detail: { errMsg: 'agreePrivacyAuthorization:ok' } }); await request; assert.equal(component.data.visible, false)
  const canceled = assert.rejects(component.authorize({}), /cancel/); component.onCancel(); await canceled
  const unloaded = assert.rejects(component.authorize({}), /cancel/); config.lifetimes.detached.call(component); await unloaded
})
