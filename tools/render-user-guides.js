// 将两份使用说明生成为独立 HTML，可离线阅读和使用浏览器打印。
const fs = require('node:fs')
const path = require('node:path')
const docs = path.resolve(__dirname, '../docs')
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const inline = (value) => escape(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

function render(source) {
  const lines = source.split(/\r?\n/)
  const body = []
  const contents = []
  let title = ''
  let section = 0
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim()
    if (!line) continue
    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      if (level === 1) { title = heading[2]; body.push('<h1>' + inline(title) + '</h1>'); continue }
      const id = 'section-' + (++section)
      if (level === 2) contents.push('<a href="#' + id + '">' + inline(heading[2]) + '</a>')
      body.push('<h' + level + ' id="' + id + '">' + inline(heading[2]) + '</h' + level + '>')
      continue
    }
    if (line.startsWith('|')) {
      const rows = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().slice(1, -1).split('|').map((cell) => cell.trim())
        if (!cells.every((cell) => /^:?-+:?$/.test(cell))) rows.push(cells)
        i += 1
      }
      i -= 1
      body.push('<div class="table-wrap"><table><thead><tr>' + rows[0].map((cell) => '<th>' + inline(cell) + '</th>').join('') + '</tr></thead><tbody>' + rows.slice(1).map((row) => '<tr>' + row.map((cell) => '<td>' + inline(cell) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>')
      continue
    }
    if (/^\d+\.\s/.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push('<li>' + inline(lines[i].trim().replace(/^\d+\.\s/, '')) + '</li>')
        i += 1
      }
      i -= 1
      body.push('<ol>' + items.join('') + '</ol>')
      continue
    }
    body.push('<p>' + inline(line) + '</p>')
  }
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title>
<style>
:root{color-scheme:light;--ink:#20251f;--red:#c7452d;--paper:#f5f4ef}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font-family:"Microsoft YaHei","PingFang SC",system-ui,sans-serif;font-size:16px;line-height:1.85}.brand{background:var(--ink);color:white;padding:24px max(24px,calc((100vw - 1120px)/2));display:flex;align-items:center;justify-content:space-between;gap:20px}.brand-name{font-size:24px;font-weight:800;letter-spacing:3px}.brand-sub{color:#c4c9bd;font-size:12px;letter-spacing:2px}.print-button{border:1px solid #707864;background:transparent;color:white;padding:10px 16px;border-radius:8px;font:inherit;font-size:14px;cursor:pointer}.layout{display:grid;grid-template-columns:240px minmax(0,1fr);gap:32px;max-width:1120px;margin:32px auto;padding:0 24px 48px}nav{position:sticky;top:24px;align-self:start;font-size:14px}nav summary{font-weight:700;cursor:pointer;margin-bottom:12px}nav a{display:block;color:#626b56;text-decoration:none;padding:7px 10px;border-left:2px solid #dce0d3;line-height:1.6}nav a:hover{color:var(--red);border-color:var(--red);background:#fcece5}article{background:white;padding:36px 40px;border:1px solid #e6e7df;border-radius:16px;min-width:0}h1{font-size:29px;line-height:1.5;margin:0 0 18px;letter-spacing:-.4px}h2{font-size:23px;line-height:1.5;border-top:1px solid #e6e7df;padding-top:28px;margin:36px 0 16px;scroll-margin-top:24px}h3{font-size:18px;color:var(--red);margin:24px 0 12px}p{margin:12px 0}article>p:first-of-type{color:#7c8076;font-size:13px}ol{padding-left:26px;margin:14px 0}li{padding:4px 0 4px 4px}strong{color:var(--red)}.table-wrap{overflow-x:auto;margin:18px 0}table{width:100%;border-collapse:collapse;font-size:14px;line-height:1.7}th,td{text-align:left;vertical-align:top;padding:12px 14px;border:1px solid #dfe3d7}th{background:#eaece4;font-weight:700}td:first-child{width:27%;font-weight:600}tbody tr:nth-child(even){background:#fafbf7}footer{font-size:12px;color:#7c8076;border-top:1px solid #e6e7df;margin-top:36px;padding-top:16px}@media(max-width:760px){body{font-size:15px}.layout{display:block;padding:0 16px 32px;margin-top:20px}nav{position:static;margin-bottom:20px}nav a{padding:6px 10px}article{padding:24px 20px}h1{font-size:24px}h2{font-size:21px}.brand{padding:20px}.print-button{font-size:12px;padding:8px 10px}th,td{padding:10px}.brand-sub{font-size:10px}}@media print{@page{size:A4;margin:18mm}body{background:white;font-size:11pt;line-height:1.65}.brand{background:white;color:var(--ink);padding:0 0 12px;border-bottom:2px solid var(--red)}.brand-sub{color:#626b56}nav,.print-button{display:none}.layout{display:block;margin:0;padding:0;max-width:none}article{padding:20px 0 0;border:0;border-radius:0}h1{font-size:22pt}h2{font-size:16pt;break-after:avoid;page-break-after:avoid;padding-top:18px;margin-top:24px}h3{font-size:13pt;break-after:avoid;page-break-after:avoid}table{font-size:9pt}.table-wrap{overflow:visible}tr{break-inside:avoid;page-break-inside:avoid}thead{display:table-header-group}p,li{orphans:2;widows:2}footer{font-size:9pt}a{color:inherit;text-decoration:none}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body><header class="brand"><div><div class="brand-name">ONE</div><div class="brand-sub">MUAY THAI / 使用说明</div></div><button class="print-button" onclick="window.print()">打印 / 保存为 PDF</button></header><div class="layout"><nav aria-label="说明书目录"><details open><summary>操作目录</summary>${contents.join('')}</details></nav><article>${body.join('\n')}<footer>ONE 泰拳格斗馆 · 使用说明 · 2026-10-08</footer></article></div></body></html>`
}

if (require.main === module) {
  for (const name of ['管理员使用说明', '客户使用说明']) {
    const target = path.join(docs, name + '.html')
    fs.writeFileSync(target, render(fs.readFileSync(path.join(docs, name + '.md'), 'utf8')), 'utf8')
    console.log(target)
  }
}

module.exports = { render }
