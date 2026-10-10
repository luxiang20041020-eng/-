// 压缩部署资源；保留生成原图，不改写源图。
const fs = require('node:fs'), path = require('node:path')
const sharp = require('C:/Users/LENOVO/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')
const generated = 'C:/Users/LENOVO/.codex/generated_images/01a11a91-376c-77f3-9fcd-ebb634b2da00'
const files = [['gym-header', 'exec-76f36ac1-bbf2-422b-94b8-f1e0a840f918.png'], ['training-group', 'exec-bfad9a77-bfde-4073-92b2-ed3bc34540c2.png'], ['training-private', 'exec-4924de83-3647-42ff-adcd-7368f4d90272.png']]
async function main() {
  const output = path.resolve(__dirname, '../../miniprogram/images/backgrounds')
  fs.mkdirSync(output, { recursive: true })
  const manifest = []
  for (const [name, source] of files) {
    const original = path.join(__dirname, name + '-original.png')
    if (!fs.existsSync(original)) fs.copyFileSync(path.join(generated, source), original)
    let buffer, quality = 74
    do {
      buffer = await sharp(original).resize({ width: 768, withoutEnlargement: true }).jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:2:0' }).toBuffer()
      if (buffer.length <= 64 * 1024 || quality <= 54) break
      quality -= 4
    } while (true)
    const file = path.join(output, name + '.jpg')
    fs.writeFileSync(file, buffer)
    manifest.push({ name, file, original, quality, bytes: buffer.length, width: 768, height: 512 })
  }
  fs.writeFileSync(path.join(__dirname, 'assets.json'), JSON.stringify(manifest, null, 2))
  console.log(JSON.stringify(manifest))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
