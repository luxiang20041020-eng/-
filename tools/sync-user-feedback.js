const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
fs.copyFileSync(path.join(root, 'cloudfunctions/businessCore/user-feedback.js'), path.join(root, 'miniprogram/utils/user-feedback.js'))
