// 本地布局预览：渲染项目实际 WXML / WXSS，使用独立示例数据，不连接微信云环境。
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const root = path.resolve(__dirname, '..')
const mini = path.join(root, 'miniprogram')
const pageNames = ['home', 'booking', 'profile', 'login', 'workspace', 'admin', 'admin/users', 'admin/packages', 'admin/stores', 'workspace/distribute', 'workspace/schedule', 'workspace/class', 'workspace/manual']
const escape = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

function parse(source) {
  const document = { tag: 'block', attrs: {}, children: [] }
  const stack = [document]
  const tokens = source.match(/<!--[\s\S]*?-->|<\/?[\w-]+(?:"[^"]*"|'[^']*'|[^'">])*>|[^<]+/g) || []
  for (const token of tokens) {
    if (token.startsWith('<!--')) continue
    if (token.startsWith('</')) { stack.pop(); continue }
    if (!token.startsWith('<')) { stack.at(-1).children.push(token); continue }
    const tag = token.match(/^<([\w-]+)/)[1]
    const attrs = {}
    for (const match of token.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) attrs[match[1]] = match[2]
    const node = { tag, attrs, children: [] }
    stack.at(-1).children.push(node)
    if (!token.endsWith('/>')) stack.push(node)
  }
  return document
}

function expression(value, data) {
  const code = String(value).replace(/^\{\{|\}\}$/g, '')
  try { return vm.runInNewContext(code, data, { timeout: 50 }) } catch { return '' }
}

const bind = (value, data) => String(value || '').replace(/\{\{([\s\S]*?)\}\}/g, (_, code) => expression(code, data))

function renderChildren(children, data) {
  let previous = false
  return children.map((node) => {
    if (typeof node === 'string') return bind(node, data)
    const attrs = node.attrs
    if (attrs['wx:if']) { previous = Boolean(expression(attrs['wx:if'], data)); if (!previous) return '' }
    else if (attrs['wx:elif']) { if (previous) return ''; previous = Boolean(expression(attrs['wx:elif'], data)); if (!previous) return '' }
    else if ('wx:else' in attrs || node.elseFlag) { if (previous) return ''; previous = true }
    else previous = false
    if (attrs['wx:for']) {
      const rows = expression(attrs['wx:for'], data) || []
      return Array.from(rows).map((item, index) => renderNode(node, { ...data, [attrs['wx:for-item'] || 'item']: item, [attrs['wx:for-index'] || 'index']: index })).join('')
    }
    return renderNode(node, data)
  }).join('')
}

function renderNode(node, data) {
  if (node.tag === 'block') return renderChildren(node.children, data)
  if (node.tag === 'page-feedback') {
    return renderChildren(parse(fs.readFileSync(path.join(mini, 'components/page-feedback/index.wxml'), 'utf8')).children, {
      loading: expression(node.attrs.loading, data), error: expression(node.attrs.error, data),
    })
  }
  if (node.tag === 'app-tabbar') {
    return renderChildren(parse(fs.readFileSync(path.join(mini, 'components/app-tabbar/index.wxml'), 'utf8')).children, { tabs: data.runtime.tabItems, current: node.attrs.current })
  }
  const tags = { view: 'div', text: 'span', 'scroll-view': 'div', image: 'img', navigator: 'a', picker: 'div', switch: 'input' }
  const tag = tags[node.tag] || node.tag
  const attrs = Object.entries(node.attrs).filter(([key]) => ['class', 'style', 'id', 'src', 'placeholder', 'maxlength', 'value'].includes(key))
    .map(([key, value]) => `${key}="${escape(bind(value, data))}"`).join(' ')
  const disabled = node.attrs.disabled && expression(node.attrs.disabled, data) ? ' disabled' : ''
  const handler = node.attrs.bindtap || node.attrs.catchtap || ''
  const dataset = Object.entries(node.attrs).filter(([key]) => key.startsWith('data-')).map(([key, value]) => `${key}="${escape(bind(value, data))}"`).join(' ')
  const event = handler ? ` data-preview-action="${handler}" ${dataset}` : ''
  const switchType = node.tag === 'switch' ? ' type="checkbox"' + (expression(node.attrs.checked, data) ? ' checked' : '') : ''
  return `<${tag} ${attrs}${disabled}${event}${switchType}>` + (['img', 'input'].includes(tag) ? '' : renderChildren(node.children, data) + `</${tag}>`)
}

function parseWxml(source) {
  // wx:else 在 WXML 中是无值属性。
  return parse(source.replace(/wx:else(?=[\s>])/g, 'wx:else="true"'))
}

function fixtures(page, search) {
  const stores = [{ id: 'gaoxin', name: '高新旗舰店', address: '高新区唐延路 88 号' }, { id: 'jingkai', name: '经开实战店', address: '经开区凤城八路 18 号' }]
  const roles = page.startsWith('admin') ? 'admin' : page.startsWith('workspace') ? 'coach' : 'client'
  const tabs = [{ key: 'home', label: '首页', path: '/pages/home/index' }, { key: 'booking', label: '预约', path: '/pages/booking/index' }, ...(roles === 'coach' ? [{ key: 'workspace', label: '工作台', path: '/pages/workspace/index' }] : roles === 'admin' ? [{ key: 'admin', label: '看板', path: '/pages/admin/index' }] : []), { key: 'profile', label: '我的', path: '/pages/profile/index' }]
  const runtime = { isAuthenticated: search.get('state') !== 'guest', role: roles, roleLabel: roles === 'admin' ? '管理员' : roles === 'coach' ? '场馆人员' : '会员', userProfile: { id: 'sample-user', nickname: '陈一', phone: '13812345678', levelText: '每一次坚持，都算数。' }, currentStore: stores[0], stores, tabItems: tabs }
  let config
  const file = path.join(mini, 'pages', page, 'index.js')
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { require: createRequire(file), Page: (value) => { config = value }, wx: { env: { USER_DATA_PATH: '' } }, setInterval, clearInterval })
  const assets = { groupCount: 8, privateCount: 12, groupExpiry: '2027-03-30', privateExpiry: '2027-09-30' }
  const packages = [{ id: 'p1', name: '30 次专属训练', type: 'private', typeLabel: '专属训练', lessons: 30, price: 6000, priceText: '6000.00', status: 1, statusLabel: '已上架', actionText: '下架套餐' }, { id: 'p2', name: '新人体验训练', type: 'private', typeLabel: '专属训练', lessons: 1, price: 99, priceText: '99.00', status: 1, statusLabel: '已上架', actionText: '下架套餐' }]
  const today = new Date()
  const dateKey = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0')
  const schedules = [{ id: 's1', title: '泰拳基础 · 步法与发力', type: 'group', typeLabel: '团体训练', coachName: '李教练', venue: stores[0].name, timeStart: '19:00', timeEnd: '20:30', timeRange: '19:00 - 20:30', dateLabel: '09/30', bookedCount: 6, capacity: 12, progressText: '6 / 12 人', progressPercent: 50, checkedCount: 2, absentCount: 0 }, { id: 's2', title: '拳腿衔接 · 进阶训练', type: 'group', typeLabel: '团体训练', coachName: '王教练', venue: stores[0].name, timeStart: '20:30', timeEnd: '22:00', timeRange: '20:30 - 22:00', dateLabel: '09/30', bookedCount: 12, capacity: 12, progressText: '12 / 12 人', progressPercent: 100, isFull: true }]
  const dates = Array.from({ length: 7 }, (_, index) => ({ key: index ? 'day' + index : dateKey, displayWeekday: ['今日', '周四', '周五', '周六', '周日', '周一', '周二'][index], displayMonthDay: index ? '10/' + String(index).padStart(2, '0') : '09/30' }))
  const data = { ...config.data, runtime, hasPermission: true, avatarText: '陈', maskedPhone: '138****5678', checkingSession: false, identityExpanded: false, selectedStoreName: stores[0].name, selectedStoreAddress: stores[0].address, visibleUsers: [{ id: 'u1', name: '陈一', avatarText: '陈', roleLabel: '客户', phone: '138****5678', statusLabel: '正常', homeStoreName: stores[0].name }], visiblePackages: packages }
  data.pageData = { ...data.pageData, currentStore: stores[0], stores, heroNotice: '开课前 2 小时可取消，权益自动退回。', notices: ['训练预约须知'], galleryList: ['拳台训练区', '力量与体能区', '沙袋训练区'], packages, assets, schedules, dates, selectedCoachName: '全部人员', resultCount: 2, filters: { type: search.get('type') || 'group', coachId: 'all', dateKey }, myBookings: [{ id: 'b1', title: '泰拳基础 · 步法与发力', dateDay: '30', dateText: '09/30', timeRange: '19:00 - 20:30', status: '待到店', canCancel: true }], trainingStats: { monthLessons: 6, streakDays: 18, totalLessons: 24 }, todayClasses: [schedules[0]], summary: { bookedCount: 6, pendingCount: 4 }, quickActions: [{ id: 'distribute', title: '权益派发', desc: '记录收款，为学员补充权益' }, { id: 'class', title: '到场核销', desc: '确认学员出勤与缺席' }, { id: 'schedule', title: '训练排课', desc: '安排下一次训练' }], dateLabel: dateKey, auditOverview: { incomeText: '￥1,280.00', writeOffCount: 12, addedPrivateLessons: 8, addedGroupLessons: 24 }, auditLogs: [], stats: { total: 2, activeCount: 2, inactiveCount: 0 }, users: data.visibleUsers, members: [{ id: 'u1', nickname: '陈一', avatarText: '陈', phone: '138****5678', groupCount: 8, privateCount: 12 }], packageOptions: packages, plans: [{ id: 's1', title: schedules[0].title, weekLabel: '周三', dateLabel: '09/30', timeRange: '19:00 - 20:30', venue: stores[0].name, status: '已发布', type: 'group' }], classInfo: { ...schedules[0], dateLabel: '09/30' }, roster: [{ bookingId: 'b1', userName: '陈一', phone: '138****5678', status: '待核销' }] }
  if (page === 'workspace/manual') {
    data.keyword = '陈一'
    data.selectedMember = data.pageData.members[0]
    data.pageData.classInfo = search.get('class') ? { ...schedules[0], classType: 1 } : null
    data.classId = search.get('class') ? 's1' : ''
    data.pendingRetry = search.get('state') === 'pending'
  }
  if (search.get('state') === 'empty') { for (const key of ['schedules', 'myBookings', 'todayClasses', 'members', 'plans', 'roster']) data.pageData[key] = []; data.pageData.resultCount = 0 }
  if (search.get('state') === 'error') data.pageError = '服务暂时无法连接，请检查网络后重试'
  if (search.get('popup')) { data.showCreatePopup = true; data.showStorePopup = true; data.showNicknameEditor = true }
  if (search.get('expanded')) { data.pricingExpanded = true; data.filtersExpanded = true; data.auditLogsExpanded = true; data.coachPickerVisible = true }
  if (page === 'workspace/schedule') {
    const calendar = require('../miniprogram/utils/schedule-calendar')
    data.selectedDate = dateKey
    data.fullDate = dateKey
    data.title = '泰拳基础 · 步法与发力'
    data.editorOpen = Boolean(search.get('popup'))
    data.repeatWeekly = Boolean(search.get('repeat'))
    data.pageData.plans = search.get('state') === 'empty' ? [] : schedules.map((item, i) => ({ ...item, fullDate: dateKey, startTime: item.timeStart, endTime: item.timeEnd, type: i ? 'private' : 'group', status: '已发布' }))
    Object.assign(data, calendar.calendar(data.pageData.plans, dateKey))
    data.repeatDates = calendar.repeatDates(dateKey, data.repeatWeekly)
    data.conflictPlans = search.get('state') === 'conflict' ? data.pageData.plans.slice(0, 1) : []
  }
  if (page === 'workspace/distribute') {
    data.step = Number(search.get('step') || 1)
    data.keyword = data.step === 1 && search.get('state') !== 'empty' ? '陈一' : ''
    data.packageType = search.get('type') || 'all'
    data.pageData.packageOptions = data.pageData.packageOptions.map((item) => ({ ...item, validDays: item.type === 'group' ? 180 : 365 }))
    data.visiblePackages = data.pageData.packageOptions.filter((item) => data.packageType === 'all' || data.packageType === item.type)
    if (data.step > 1) data.selectedMember = { ...data.pageData.members[0], avatarText: '陈', privateExpiry: '2027-09-30' }
    if (data.step === 3) {
      data.selectedPackage = data.pageData.packageOptions[0]
      data.selectedPackageId = data.selectedPackage.id
      data.amount = '5800'
      data.expiryDate = '2027-09-30'
      data.preview = { before: 12, after: 42, amount: '5800.00', expiry: data.expiryDate }
    }
    if (search.get('state') === 'receipt') data.receipt = { name: '陈一', phone: '13812345678', packageName: '30 次专属训练', lessons: 30, typeLabel: '私教', amount: '5800.00', expiry: '2027-09-30', payType: '微信转账' }
  }
  return data
}

function html(page, search = new URLSearchParams()) {
  const data = fixtures(page, search)
  const wxml = parseWxml(fs.readFileSync(path.join(mini, 'pages', page, 'index.wxml'), 'utf8'))
  const styles = ['app.wxss', 'components/app-tabbar/index.wxss', 'components/page-feedback/index.wxss', `pages/${page}/index.wxss`].map((file) => fs.readFileSync(path.join(mini, file), 'utf8')).join('\n').replace(/(-?\d+(?:\.\d+)?)rpx/g, 'calc($1 * var(--unit))').replace(/\bpage\s*\{/g, 'body {').replace(/(?<![\w-])view(?![\w-])/g, 'div').replace(/(?<![\w-])text(?![\w-])/g, 'span')
  const menu = pageNames.map((name) => `<a href="/preview/${name}">${name}</a>`).join('')
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ONE · ${escape(page)} 布局预览</title><style>:root{--unit:calc(min(100vw,430px) / 750)}body{margin:0}main{max-width:430px;margin:auto}button{cursor:pointer;font-family:inherit}img{object-fit:cover}a{text-decoration:none;color:inherit}input,textarea{font-family:inherit}input{outline:none}nav{display:none}${styles}\n.tabbar-wrap{width:min(100vw,430px);right:auto;left:50%;transform:translateX(-50%)}.scroll-row,.facility-scroll{overflow-x:auto}.home-hero-cta{width:fit-content} [data-preview-action]{cursor:pointer}</style></head><body><nav>${menu}</nav><main>${renderChildren(wxml.children, data)}</main><script>document.addEventListener('click',function(event){const el=event.target.closest('[data-preview-action]');if(!el)return;const a=el.dataset.previewAction;const routes={goBooking:'/preview/booking?type='+(el.dataset.type||'group'),goMySchedule:'/preview/profile',goIdentityQr:'/preview/profile',goLogin:'/preview/login',goBrowse:'/preview/home',onOpenUserManage:'/preview/admin/users',onOpenPackageManage:'/preview/admin/packages',onOpenStoreManage:'/preview/admin/stores',onOpenOperations:'/preview/workspace',goClassDetail:'/preview/workspace/class'};if(routes[a])location.href=routes[a];else if(a==='onTap')location.href='/preview/'+el.dataset.path.replace('/pages/','').replace('/index','');else if(a==='onTapAction')location.href='/preview/workspace/'+el.dataset.actionId;else if(['onTogglePricing','onToggleFilters','onOpenCoachPicker','onToggleAuditLogs'].includes(a))location.search='?expanded=1';else if(['onOpenCreatePopup','onOpenCreate','onOpenCreateStore','onOpenCreatePopup','openNicknameEditor'].includes(a))location.search='?popup=1';else if(['onCloseCreatePopup','onCloseStorePopup','closeNicknameEditor','onCloseCoachPicker'].includes(a))location.search='';else if(a==='onBook')alert('这是布局预览，不会提交真实预约。');});</script></body></html>`
}

if (require.main === module) {
  const port = Number(process.env.PREVIEW_PORT || 4318)
  http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (url.pathname.startsWith('/images/')) {
      const file = path.resolve(mini, '.' + url.pathname)
      if (!file.startsWith(path.join(mini, 'images') + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return }
      res.setHeader('Content-Type', /\.png$/i.test(file) ? 'image/png' : 'image/jpeg')
      fs.createReadStream(file).pipe(res)
      return
    }
    const page = url.pathname.replace('/preview/', '')
    if (!pageNames.includes(page)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end('<h1>ONE 小程序布局预览</h1><p>实际 WXML / WXSS，独立示例数据，不连接微信云环境。</p>' + pageNames.map((name) => `<p><a href="/preview/${name}">${name}</a></p>`).join(''))
      return
    }
    try { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html(page, url.searchParams)) } catch (error) { res.writeHead(500); res.end(error.stack) }
  }).listen(port, '127.0.0.1', () => console.log(`Layout preview: http://127.0.0.1:${port}`))
}

module.exports = { html, parseWxml, pageNames }
