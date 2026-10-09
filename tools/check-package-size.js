const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const config = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'))
const mini = path.join(root, config.miniprogramRoot)
const ignores = config.packOptions.ignore
function ignored(file) {
  return ignores.some(rule => rule.type === 'file' ? file === rule.value : rule.type === 'folder' && (file === rule.value || file.startsWith(rule.value + '/')))
}
function audit() {
  const files = [], excluded = []
  function walk(folder) {
    for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, item.name)
      if (item.isDirectory()) { walk(file); continue }
      const relative = path.relative(mini, file).split(path.sep).join('/')
      const record = { file: relative, bytes: fs.statSync(file).size }
      ;(ignored(relative) ? excluded : files).push(record)
    }
  }
  walk(mini)
  return { files, excluded, bytes: files.reduce((total, item) => total + item.bytes, 0), excludedBytes: excluded.reduce((total, item) => total + item.bytes, 0) }
}
if (require.main === module) {
  const result = audit()
  console.log('上传源文件：' + (result.bytes / 1024).toFixed(1) + ' KB；排除资源：' + (result.excludedBytes / 1024).toFixed(1) + ' KB')
  console.log('此为按打包排除规则统计的源文件体积，最终编译包以开发者工具代码包分析为准。')
  if (result.bytes > 1.8 * 1024 * 1024) { console.error('源文件超过 1.8 MB 预算，请检查新增资源。'); process.exitCode = 1 }
}
module.exports = { audit, ignored }
