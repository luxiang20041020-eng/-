// 本地布局预览：渲染项目实际 WXML / WXSS，使用独立示例数据，不连接微信云环境。
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const root = path.resolve(__dirname, '..')
const mini = path.join(root, 'miniprogram')
const localizedText = require('../miniprogram/utils/i18n-text')
const languageOptions = ['简体中文', 'English', 'Français', 'ไทย', 'Deutsch', '日本語', 'हिन्दी']
const languageCodes = ['zh', 'en', 'fr', 'th', 'de', 'ja', 'hi']
const i18n = { t: localizedText.translate, f: localizedText.format, list: localizedText.list }
const pageNames = ['bookings', 'coach', 'coach/edit', 'home', 'booking', 'profile', 'points', 'login', 'workspace', 'admin', 'admin/users', 'admin/packages', 'admin/stores', 'admin/reports', 'workspace/distribute', 'workspace/schedule', 'workspace/class', 'workspace/manual', 'workspace/adjust']
const escape = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const imageCache = new Map()
function previewImageSource(source) {
  if (!source.startsWith('/images/')) return source
  if (imageCache.has(source)) return imageCache.get(source)
  const folder = path.resolve(mini, 'images'), file = path.resolve(mini, '.' + source)
  if (!file.startsWith(folder + path.sep) || !fs.existsSync(file)) return source
  const types = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' }
  const mime = types[path.extname(file)]
  if (!mime) return source
  const result = 'data:' + mime + ';base64,' + fs.readFileSync(file).toString('base64')
  imageCache.set(source, result)
  return result
}

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
  if (node.tag === 'wxs') return ''
  if (node.tag === 'map') return '<div class="store-detail-map preview-store-map"><span>◉</span><small>MAP · ' + escape(i18n.t('门店位置', data.language)) + '</small></div>'
  if (node.tag === 'media-privacy') return renderChildren(parseWxml(fs.readFileSync(path.join(mini, 'components/media-privacy/index.wxml'), 'utf8')).children, { i18n, language: data.language, visible: data.mediaPrivacyVisible, contractName: '用户隐私保护协议' })
  if (node.tag === 'block') return renderChildren(node.children, data)
  if (node.tag === 'language-setting') {
    return renderChildren(parseWxml(fs.readFileSync(path.join(mini, 'components/language-setting/index.wxml'), 'utf8')).children, { i18n, language: data.language, options: languageOptions, index: Math.max(0, languageCodes.indexOf(data.language)) })
  }
  if (node.tag === 'page-feedback') {
    return renderChildren(parse(fs.readFileSync(path.join(mini, 'components/page-feedback/index.wxml'), 'utf8')).children, {
      loading: expression(node.attrs.loading, data), error: expression(node.attrs.error, data), i18n, language: data.language,
    })
  }
  if (node.tag === 'app-tabbar') {
    return renderChildren(parse(fs.readFileSync(path.join(mini, 'components/app-tabbar/index.wxml'), 'utf8')).children, { tabs: data.runtime.tabItems.map(item => ({ ...item, label: i18n.t(item.label, data.language) })), current: node.attrs.current })
  }
  const tags = { view: 'div', text: 'span', 'scroll-view': 'div', image: 'img', navigator: 'a', picker: 'div', switch: 'input' }
  const tag = tags[node.tag] || node.tag
  // 基础库给 button 添加尺寸类；普通 HTML 按钮缺少这层默认样式。
  const renderAttrs = { ...node.attrs }
  if (node.tag === 'button') renderAttrs.class = (renderAttrs.class || '') + (renderAttrs.size === 'mini' ? ' wx-button-size-mini' : ' wx-button-size-normal')
  const attrs = Object.entries(renderAttrs).filter(([key]) => ['class', 'style', 'id', 'src', 'placeholder', 'maxlength', 'value', 'size'].includes(key))
    .map(([key, value]) => `${key}="${escape(key === 'src' ? previewImageSource(bind(value, data)) : bind(value, data))}"`).join(' ')
  const disabled = node.attrs.disabled && expression(node.attrs.disabled, data) ? ' disabled' : ''
  const handler = node.attrs.bindtap || node.attrs.catchtap || ''
  const dataset = Object.entries(node.attrs).filter(([key]) => key.startsWith('data-')).map(([key, value]) => `${key}="${escape(bind(value, data))}"`).join(' ')
  const event = handler ? ` data-preview-action="${handler}" ${dataset}` : ''
  const switchType = node.tag === 'switch' ? ' type="checkbox"' + (expression(node.attrs.checked, data) ? ' checked' : '') : ''
  return `<${tag} ${attrs}${disabled}${event}${switchType}>` + (['img', 'input'].includes(tag) ? '' : (node.tag === 'textarea' ? escape(bind(node.attrs.value, data)) : renderChildren(node.children, data)) + `</${tag}>`)
}

function parseWxml(source) {
  // wx:else 在 WXML 中是无值属性。
  return parse(source.replace(/wx:else(?=[\s>])/g, 'wx:else="true"'))
}

function fixtures(page, search) {
  const stores = [{ id: 'gaoxin', name: '高新旗舰店', address: '高新区唐延路 88 号' }, { id: 'jingkai', name: '经开实战店', address: '经开区凤城八路 18 号' }]
  const roles = page.startsWith('admin') || (page === 'workspace/adjust' && search.get('mode') === 'records') || search.get('role') === 'admin' ? 'admin' : (search.get('role') === 'coach' || page === 'coach/edit') ? 'coach' : page.startsWith('workspace') ? 'coach' : 'client'
  const tabs = [{ key: 'home', label: '首页', path: '/pages/home/index' }, { key: 'booking', label: '预约', path: '/pages/booking/index' }, ...(roles === 'coach' ? [{ key: 'workspace', label: '工作台', path: '/pages/workspace/index' }] : roles === 'admin' ? [{ key: 'admin', label: '看板', path: '/pages/admin/index' }] : []), { key: 'profile', label: '我的', path: '/pages/profile/index' }]
  const runtime = { isAuthenticated: search.get('state') !== 'guest', role: roles, roleLabel: roles === 'admin' ? '管理员' : roles === 'coach' ? '场馆人员' : '会员', userProfile: { id: 'sample-user', nickname: '陈一', phone: '13812345678', levelText: '每一次坚持，都算数。' }, currentStore: stores[0], stores, tabItems: tabs }
  let config
  const file = path.join(mini, 'pages', page, 'index.js')
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { require: createRequire(file), Page: (value) => { config = value }, wx: { env: { USER_DATA_PATH: '' } }, setInterval, clearInterval })
  const assets = { ...(search.has('unlimited') ? { groupUnlimited: true, privateUnlimited: true, groupUnlimitedExpiry: '2027-03-30', privateUnlimitedExpiry: '2027-09-30' } : {}), groupCount: 8, privateCount: 12, groupExpiry: '2027-03-30', privateExpiry: '2027-09-30' }
  const packages = [{ id: 'p1', name: '30 次专属训练', type: 'private', typeLabel: '专属训练', lessons: 30, price: 6000, priceText: '6000.00', status: 1, statusLabel: '已上架', actionText: '下架套餐' }, { id: 'p2', name: '新人体验训练', type: 'private', typeLabel: '专属训练', lessons: 1, price: 99, priceText: '99.00', status: 1, statusLabel: '已上架', actionText: '下架套餐' }]
  const today = new Date()
  const dateKey = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0')
  const schedules = [{ id: 's1', title: '泰拳基础 · 步法与发力', type: 'group', typeLabel: '团体训练', coachName: '李教练', venue: stores[0].name, timeStart: '19:00', timeEnd: '20:30', timeRange: '19:00 - 20:30', dateLabel: '09/30', bookedCount: 6, capacity: 12, progressText: '6 / 12 人', progressPercent: 50, checkedCount: 2, absentCount: 0 }, { id: 's2', title: '拳腿衔接 · 进阶训练', type: 'group', typeLabel: '团体训练', coachName: '王教练', venue: stores[0].name, timeStart: '20:30', timeEnd: '22:00', timeRange: '20:30 - 22:00', dateLabel: '09/30', bookedCount: 12, capacity: 12, progressText: '12 / 12 人', progressPercent: 100, isFull: true }]
  const dates = Array.from({ length: 7 }, (_, index) => ({ key: index ? 'day' + index : dateKey, displayWeekday: ['今日', '周四', '周五', '周六', '周日', '周一', '周二'][index], displayMonthDay: index ? '10/' + String(index).padStart(2, '0') : '09/30' }))
  const data = { ...config.data, runtime, mediaPrivacyVisible: search.has('privacy'), hasPermission: true, avatarText: '陈', maskedPhone: '138****5678', checkingSession: false, identityExpanded: false, selectedStoreName: stores[0].name, selectedStoreAddress: stores[0].address, visibleUsers: [{ id: 'u1', name: '陈一', avatarText: '陈', roleLabel: '客户', phone: '138****5678', statusLabel: '正常', homeStoreName: stores[0].name }], visiblePackages: packages }
  data.pageData = { ...data.pageData, currentStore: stores[0], stores, heroNotice: '开课前 2 小时可取消，权益自动退回。', notices: ['训练预约须知'], galleryList: ['拳台训练区', '力量与体能区', '沙袋训练区'], packages, assets, schedules, dates, selectedCoachName: '全部人员', resultCount: 2, filters: { type: search.get('type') || 'group', coachId: 'all', dateKey }, myBookings: [{ id: 'b1', title: '泰拳基础 · 步法与发力', dateDay: '30', dateText: '09/30', timeRange: '19:00 - 20:30', status: '待到店', canCancel: true }], trainingStats: { monthLessons: 6, streakDays: 18, totalLessons: 24 }, todayClasses: [schedules[0]], summary: { bookedCount: 6, pendingCount: 4 }, quickActions: [{ id: 'distribute', title: '权益派发', desc: '记录收款，为学员补充权益' }, { id: 'class', title: '到场核销', desc: '确认学员出勤与缺席' }, { id: 'schedule', title: '训练排课', desc: '安排下一次训练' }], dateLabel: dateKey, auditOverview: { incomeText: '￥1,280.00', writeOffCount: 12, addedPrivateLessons: 8, addedGroupLessons: 24 }, auditLogs: [], stats: { total: 2, activeCount: 2, inactiveCount: 0 }, users: data.visibleUsers, members: [{ id: 'u1', nickname: '陈一', avatarText: '陈', phone: '138****5678', groupCount: 8, privateCount: 12 }], packageOptions: packages, plans: [{ id: 's1', title: schedules[0].title, weekLabel: '周三', dateLabel: '09/30', timeRange: '19:00 - 20:30', venue: stores[0].name, status: '已发布', type: 'group' }], classInfo: { ...schedules[0], dateLabel: '09/30' }, roster: [{ bookingId: 'b1', userName: '陈一', phone: '138****5678', status: '待核销' }] }
  if (page === 'coach' || page === 'coach/edit') {
    data.coach = { id: 'coach', name: '李教练', title: '泰拳与体能教练', levelLabel: '十年执教经验', avatarUrl: '', version: 0, specialties: ['泰拳', '拳击', '体能训练'], bio: '用扎实的基础，建立属于你的训练节奏。\n擅长拳腿衔接与实战步法，针对不同训练阶段制定教学计划。', honors: ['全国泰拳公开赛冠军', '专业体能训练认证'], photos: [] }
    if (search.has('photos')) { const image = 'data:image/jpeg;base64,' + fs.readFileSync('miniprogram/images/gym-interior-1.jpg').toString('base64'); data.coach.avatarUrl = image; data.coach.photos = [image, image] }
    if (search.get('photos') === 'single') data.coach.photos = data.coach.photos.slice(0, 1)
    if (search.get('state') === 'short') { data.coach.name = '卢翔'; data.coach.title = '测试'; data.coach.levelLabel = '测试'; data.coach.bio = '测试'; data.coach.specialties = ['测试']; data.coach.honors = ['测试'] }
    if (search.get('state') === 'long') { data.coach.name = 'Alexandre · International Muay Thai Coach'; data.coach.title = '专项拳击、泰拳与体能训练教练'; data.coach.levelLabel = '十年以上教学经验与综合体能训练认证'; data.coach.specialties = ['拳击与泰拳实战训练', '步法移动与拳腿组合', '核心力量与综合体能']; data.coach.bio = (data.coach.bio + '\n').repeat(8); data.coach.honors = ['全国泰拳公开赛冠军与最佳技术奖，专项教学及综合体能训练认证'.repeat(2), '专业训练认证'] }
    data.avatarText = data.coach.name.slice(0, 1); data.ready = true; data.canEdit = true
    data.editSection = search.get('section') || (search.has('photos') ? 'photos' : 'basic')
    data.draft = { ...data.coach, specialties: data.coach.specialties.join('\n'), honors: data.coach.honors.join('\n') }
    if (search.get('state') === 'empty') { data.coach.bio = ''; data.coach.honors = []; data.coach.specialties = [] }
    if (search.get('state') === 'guest' && page === 'coach/edit') { data.canEdit = false; data.ready = false }
    if (search.get('state') === 'uploading') data.uploading = true
  }
  if (page === 'home') {
    const gallery = require('../miniprogram/utils/store-gallery').defaultGallery()
    const venues = stores.map((store, index) => ({ ...store, introduction: '以泰拳、拳击和专项体能为核心，提供团体训练与一对一指导。场馆配备沙袋、拳台和力量训练区，欢迎到店体验。', businessHours: '周一至周日 10:00–22:00', phone: '029-88886666', arrivalTips: '地铁出口步行约5分钟，入口位于商业楼二层。', latitude: 34.235 + index * .08, longitude: 108.895 + index * .025, gallery }))
    if (search.get('state') === 'missing') { venues[0].latitude = null; venues[0].longitude = null; venues[0].introduction = ''; venues[0].businessHours = ''; venues[0].phone = ''; venues[0].arrivalTips = ''; venues[0].gallery = [] }
    if (search.get('state') === 'long') { venues[0].name = 'ONE International Muay Thai & Boxing Training Centre'; venues[0].introduction = (venues[0].introduction + '\n').repeat(8); venues[0].address = '门店详细地址、国际社区运动中心、商业楼二层，入口位于主楼东侧。'.repeat(3) }
    if (search.get('many')) for (let i = 2; i < 30; i++) venues.push({ ...venues[1], id: 'store' + i, name: '训练门店 ' + (i + 1) })
    data.runtime = { ...runtime, stores: venues, currentStore: venues[0] }; data.pageData = { ...data.pageData, stores: venues, currentStore: venues[0], galleryList: gallery }
    const origin = search.get('distance') ? { latitude: 34.236, longitude: 108.894 } : null
    data.storeOptions = require('../miniprogram/utils/store-location').decorateStores(venues, origin); data.locationReady = Boolean(origin)
    data.storePickerVisible = ['stores', 'store-detail'].includes(search.get('popup'))
    if (search.get('popup') === 'store-detail') data.storeDetail = data.storeOptions.find(store => store.id === venues[0].id)
    if (search.get('state') === 'denied') { data.locationDenied = true; data.locationError = '定位权限未开启，可在设置中开启后查看距离' }
    if (search.get('state') === 'locating') data.locating = true
  }
  if (page === 'admin/stores') {
    const gallery = require('../miniprogram/utils/store-gallery').defaultGallery()
    data.pageData.stores = stores.map(store => ({ ...store, status: 1, statusLabel: '营业中', userCount: 48, scheduleCount: 16, longitude: '', latitude: '', gallery, galleryVersion: 0 }))
    if (search.get('popup') === '1') data.storeForm = { name: stores[0].name, address: stores[0].address, longitude: '108.895', latitude: '34.235', introduction: '泰拳、拳击与体能训练空间', businessHours: '周一至周日 10:00–22:00', phone: '029-88886666', arrivalTips: '地铁出口步行5分钟，入口在二层。', status: 1 }
    if (search.get('popup') === 'gallery') {
      data.showStorePopup = false; data.showGalleryPopup = true; data.galleryStoreName = stores[0].name; data.galleryStoreId = stores[0].id
      data.galleryDraft = search.get('state') === 'empty' ? [] : gallery
      if (search.get('state') === 'error') data.galleryError = '照片上传失败，请检查网络后重试'
      if (search.get('state') === 'uploading') data.galleryBusy = true
    }
  }
  if (page === 'bookings') {
    data.records = Array.from({ length: 20 }, (_, index) => ({ id: 'record' + index, title: index % 2 ? '一对一专属训练' : schedules[0].title, fullDate: '2026-10-09', timeRange: '19:00 - 20:30', status: ['待到店', '已核销', '已取消', '已缺席'][index % 4], canCancel: index % 4 === 0, cancelReason: index % 4 === 2 ? '客户调整训练安排' : '' }))
    data.records = data.records.map(item => ({ ...item, status: item.status === '已核销' ? '已完成' : item.status }))
    data.hasMore = true
    if (search.get('state') === 'empty') { data.records = []; data.hasMore = false }
    if (search.get('state') === 'end') data.hasMore = false
    if (search.get('state') === 'more-error') data.moreError = '预约记录暂时无法读取，请稍后重试'
  }
  if (page === 'points') {
    data.pageData = { balance: 200, inviteCode: 'ON12AB34CD56EF', bound: true, boundCode: 'ON98AB76CD54EF', records: [{ id: '1', amount: 100, title: '邀请好友奖励', dateLabel: '2026-10-09' }, { id: '2', amount: 100, title: '填写邀请码奖励', dateLabel: '2026-10-09' }] }
    if (search.get('state') === 'empty') data.pageData = { ...data.pageData, balance: 0, records: [] }
    if (['error', 'loading', 'guest'].includes(search.get('state'))) data.pageData = null
    if (search.get('state') === 'loading') data.pageBusy = true
  }
  if (page === 'profile' && search.get('invite')) {
    data.inviteExpanded = true
    data.inviteStateReady = true
    data.inviteBound = search.get('invite') === 'bound'
    data.inviteBoundCode = 'ON98AB76CD54EF'
    if (search.get('invite') === 'error') data.inviteError = '邀请码不存在，请向好友确认后重新输入'
    if (search.get('invite') === 'loading') { data.inviteLoading = true; data.inviteStateReady = false }
  }
  if (page === 'workspace/manual') {
    data.keyword = '陈一'
    data.selectedMember = data.pageData.members[0]
    data.pageData.classInfo = search.get('class') ? { ...schedules[0], classType: 1 } : null
    data.classId = search.get('class') ? 's1' : ''
    data.pendingRetry = search.get('state') === 'pending'
  }
  if (search.get('state') === 'empty' && page !== 'points') { for (const key of ['schedules', 'myBookings', 'todayClasses', 'members', 'plans', 'roster']) data.pageData[key] = []; data.pageData.resultCount = 0 }
  if (search.get('state') === 'error') data.pageError = '服务暂时无法连接，请检查网络后重试'
  if (search.get('popup') && search.get('popup') !== 'gallery') { data.showCreatePopup = true; data.showStorePopup = true; data.showNicknameEditor = true }
  if (search.get('expanded')) { data.pricingExpanded = true; data.filtersExpanded = true; data.auditLogsExpanded = true; data.coachPickerVisible = true }
  if (page === 'booking') {
    const state = search.get('state')
    data.filters = { ...data.filters, type: search.get('type') || 'group', coachId: search.get('coach') || 'all', dateKey }
    data.pageData.filters = data.filters
    data.pageData.selectedCoachName = '李教练'
    data.pageData.coaches = state === 'empty' ? [] : [{ id: 'coach', name: '李教练', title: '教练', avatarText: '李', summaryText: '泰拳 · 体能' }, { id: 'coach2', name: '王教练', title: '教练', avatarText: '王', summaryText: '拳击 · 步法' }]
    if (search.has('many')) data.pageData.coaches = Array.from({ length: 80 }, (_, index) => ({ id: index ? 'coach' + (index + 1) : 'coach', name: ['李教练', '王教练', '陈教练', '张教练'][index % 4] + (index > 3 ? ' ' + (index + 1) : ''), title: index % 2 ? '拳击与专项体能教练' : '泰拳与体能教练', avatarText: ['李', '王', '陈', '张'][index % 4], summaryText: '泰拳 · 体能 · 步法' }))
    data.pageData.privateCoachPreview = data.pageData.coaches.slice(0, 3)
    data.pageData.selectedCoach = data.pageData.coaches.find(coach => coach.id === data.filters.coachId) || null
    data.pageData.filteredCoachOptions = data.pageData.coaches
    data.pageData.visibleCoachOptions = data.pageData.coaches.slice(0, 20)
    data.pageData.hasMoreCoachOptions = data.pageData.coaches.length > 20
    data.pageData.privateBusyTimes = [{ id: 'busy', timeRange: '14:00 - 15:30' }]
    if (search.has('unlimited')) data.pageData.assets = { ...assets, groupUnlimited: true, privateUnlimited: true, groupUnlimitedExpiry: '2027-03-30', privateUnlimitedExpiry: '2027-09-30' }
    if (state === 'pending') data.privatePending = { requestId: 'pending-private', date: dateKey, start: '10:15', end: '11:45' }
    data.pageData.schedules = data.pageData.schedules.map((item) => ({ ...item,
      type: search.get('type') === 'private' ? 'private' : 'group',
      typeLabel: search.get('type') === 'private' ? '专属训练' : '团体训练',
      isBooked: state === 'booked',
    }))
    if (state === 'single') {
      data.pageData.schedules = [{ ...data.pageData.schedules[0], title: '测试', coachName: '卢翔', venue: stores[1].name, bookedCount: 0, capacity: 15, progressText: '0 / 15 人' }]
    }
    if (state === 'long') data.pageData.schedules[0] = { ...data.pageData.schedules[0], title: '泰拳基础与核心体能专项训练 · 步法和拳腿衔接', coachName: '李教练（专项训练负责人）', venue: '高新旗舰店 · 拳台及综合体能训练区' }
    if (state === 'submitting') data.bookingId = 's1'
    if (state === 'loading') data.pageBusy = true
    data.pageData.resultCount = data.pageData.schedules.length
  }
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
  if (page === 'admin/users') {
    data.pageData.currentUserId = 'sample-user'
    data.pageData.users = [
      { id: 'sample-user', name: '陈一', phone: '13812345678', role: 3, roleKey: 'admin', roleLabel: '管理员', status: 1, statusLabel: '正常', homeStoreName: stores[0].name },
      { id: 'coach', name: '李教练', phone: '13912345678', role: 2, roleKey: 'coach', roleLabel: '教练', status: 1, statusLabel: '正常', homeStoreName: stores[1].name },
      { id: 'member', name: '张同学', phone: '13612345678', role: 1, roleKey: 'client', roleLabel: '客户', status: 1, statusLabel: '正常', homeStoreName: stores[0].name, assets },
    ]
    data.roleCounts = { all: 3, admin: 1, coach: 1, client: 1 }
    data.visibleUsers = search.get('state') === 'empty' ? [] : data.pageData.users.map((user) => ({ ...user, avatarText: user.name[0], permissionSummary: data.pageData.roleOptions.find((role) => role.value === user.role).description }))
    if (search.get('popup') === 'assets') {
      data.showCreatePopup = false
      data.assetsUser = data.pageData.users[2]
      const state = search.get('state')
      data.assetsLoading = state === 'loading'
      data.assetsError = state === 'error' ? '请求超时，请检查网络后重试' : ''
      if (state === 'disabled') data.assetsUser = { ...data.assetsUser, status: 0 }
      if (!data.assetsLoading && !data.assetsError) data.assetsDetail = {
        user: data.assetsUser,
        balances: [
          { type: 'group', label: '团课', available: state === 'empty' ? 0 : 8, recordedBalance: 8, expiryLabel: state === 'empty' ? '尚未派发' : '2027-03-30', statusLabel: state === 'empty' ? '未购课' : '可用' },
          { type: 'private', label: '私教', available: state === 'expired' || state === 'empty' ? 0 : 12, recordedBalance: 12, expired: state === 'expired', expiryLabel: state === 'empty' ? '尚未派发' : state === 'expired' ? '2026-09-30' : '2027-09-30', statusLabel: state === 'empty' ? '未购课' : state === 'expired' ? '已过期' : '可用' },
        ],
        records: state === 'empty' ? [] : Array.from({ length: 8 }, (_, i) => ({ id: 'record' + i, packageName: i ? '新人体验训练' : '30 次专属训练', typeLabel: '私教', lessons: i ? 1 : 30, time: '2026-09-30', amount: i ? '99.00' : '6000.00', payType: '微信转账', expiry: '2027-09-30' })),
        note: '同类型套餐的课时合并使用，下方派发记录展示原套餐和增加课时。',
      }
    } else if (search.get('popup') === 'role') {
      data.showCreatePopup = false
      data.roleEditorUser = data.pageData.users[1]
      data.nextRole = 3
      data.selectedRole = data.pageData.roleOptions[2]
    } else if (search.get('popup')) {
      data.createForm = { name: '新学员', phone: '13911112222', storeId: stores[0].id }
      data.createStoreIndex = 0
      data.createStoreName = stores[0].name
      if (search.get('state') === 'duplicate') data.createError = '该手机号已建档，请在人员列表查找'
    }
  }
  if (page === 'admin/packages') {
    data.visiblePackages = search.get('state') === 'empty' ? [] : packages.map((item, i) => ({ ...item, validDays: i ? 90 : 365, status: i ? 0 : 1, statusLabel: i ? '已下架' : '已上架', actionText: i ? '重新上架' : '下架套餐', actionMode: i ? 'on' : 'off' }))
    if (search.get('popup')) data.createForm = { name: '12 节私教入门卡', type: 'private', usageMode: 'count', lessons: '12', price: '2400', validDays: '180', status: search.get('active') ? 1 : 0 }
    if (search.has('unlimited')) { data.createForm = { ...data.createForm, usageMode: 'unlimited', name: '30天专属畅练卡' }; data.visiblePackages[0] = { ...data.visiblePackages[0], unlimited: true } }
  }
  if (page === 'workspace/distribute' && search.has('unlimited')) {
    data.visiblePackages = data.visiblePackages.map(p => ({ ...p, unlimited: true }))
    if (data.selectedPackage) data.selectedPackage = { ...data.selectedPackage, unlimited: true }
    if (data.receipt) data.receipt = { ...data.receipt, unlimited: true }
  }
  if (page === 'workspace/adjust') {
    const cancelled = search.get('state') === 'cancelled'
    data.mode = search.get('mode') === 'records' ? 'records' : 'schedule'
    data.classId = 'example-class'
    const record = { id: 'grant', kind: 'distribution', userName: '陈一', title: '团体训练套餐', operatorName: '李教练', time: '2026-10-09', balance: 12, projectedBalance: 4, amount: 8, eligible: true, version: 0, hint: '撤销将扣回本次派发的课时，线下款项需另行核对' }
    data.pageData = { schedule: { id: 'example-class', title: '泰拳基础训练', storeName: '高新旗舰店', start_time: '2026-10-10 19:00:00', end_time: '2026-10-10 20:30:00', classType: 1, max_capacity: 15, coach_id: 'coach', cancelled, remaining: cancelled ? 3 : 0, version: 'version' }, affected: [{ id: 'client', name: '陈一', phone: '13812345678', status: '待核销' }], coaches: [{ id: 'coach', name: '李教练' }], records: [record], history: data.mode === 'records' ? [{ id: 'audit', userName: '陈一', operatorName: '王管理员', time: '2026-10-09', title: '撤销派发', beforeBalance: 20, afterBalance: 12, reason: '选错套餐' }] : [] }
    Object.assign(data, { title: '泰拳基础训练', date: '2026-10-10', startTime: '19:00', endTime: '20:30', capacity: '15', coachId: 'coach', reason: cancelled ? '教练临时请假' : '' })
    if (search.get('popup')) data.selectedRecord = record
  }
  if (page === 'admin/reports') {
    data.mode = search.get('mode') === 'report' ? 'report' : 'followup'
    data.settingsOpen = search.has('expanded')
    const customers = [{ id: 'u1', name: '陈一', phone: '13812345678', expiring: true, low: true, inactive: true, lastVisit: '2026-08-20', daysInactive: 50, types: [{ type: 1, label: '团课', owned: true, balance: 2, expiry: '2026-10-15' }, { type: 2, label: '私教', owned: false, balance: 0, expiry: '' }] }]
    data.followup = { store: stores[0], today: dateKey, thresholds: { expiryDays: 7, lowBalance: 2, inactiveDays: 30 }, counts: { all: 25, expiring: 3, low: 5, inactive: 4, needs: 8 }, customers, total: 1 }
    const payments = [{ id: 'pay', userName: '陈一', packageName: '30 次专属训练', amountText: '6000.00', date: dateKey, payType: '微信', purchaseLabel: '续费', operatorName: '王管理员' }]
    data.report = { store: stores[0], startDate: data.startDate, endDate: data.endDate, incompleteRecords: 0, summary: { incomeText: '6800.00', payments: 3, renewals: 1, renewalText: '6000.00', checkins: 18, taught: 3 }, daily: [{ date: dateKey, incomeText: '6800.00', renewals: 1, checkins: 18, absences: 2, taught: 3 }], coaches: [{ id: 'coach', name: '李教练', scheduled: 4, cancelled: 1, taught: 3, checkins: 18, absences: 2, manualCheckins: 1, minutes: 270 }], payments }
    if (search.get('state') === 'empty') { data.followup.customers = []; data.followup.total = 0; data.report.coaches = []; data.report.payments = [] }
    data.visibleCustomers = data.followup.customers; data.visiblePayments = data.report.payments
  }
  if (search.has('unlimited') && data.assetsDetail) data.assetsDetail.balances = data.assetsDetail.balances.map(a => ({ ...a, unlimited: true, unlimitedExpiry: '2027-03-30' }))
  return data
}

function readStyles(file) {
  return fs.readFileSync(file, 'utf8').replace(/@import\s+["']([^"']+)["'];/g, (_, relative) => readStyles(path.resolve(path.dirname(file), relative)))
}

// 与本地微信基础库 2.32.3 / 3.16.2 的尺寸规则一致，避免漏检默认 184px 宽度。
const nativeButtonStyles = 'button.wx-button-size-normal{margin-left:auto;margin-right:auto;width:184px}button.wx-button-size-mini{display:inline-block;font-size:13px;line-height:2.3;padding:0 1.34em}'

function html(page, search = new URLSearchParams()) {
  const data = fixtures(page, search)
  data.language = languageCodes.includes(search.get('lang')) ? search.get('lang') : 'zh'
  data.i18n = i18n
  const wxml = parseWxml(fs.readFileSync(path.join(mini, 'pages', page, 'index.wxml'), 'utf8'))
  const styles = ['app.wxss', 'components/app-tabbar/index.wxss', 'components/page-feedback/index.wxss', 'components/language-setting/index.wxss', 'components/media-privacy/index.wxss', `pages/${page}/index.wxss`].map((file) => readStyles(path.join(mini, file))).join('\n').replace(/(-?\d+(?:\.\d+)?)rpx/g, 'calc($1 * var(--unit))').replace(/(?<![\w.-])page\s*\{/g, 'body {').replace(/(?<![\w-])view(?![\w-])/g, 'div').replace(/(?<![\w-])text(?![\w-])/g, 'span').replace(/(?<![\w-])image(?![\w-])/g, 'img')
  const menu = pageNames.map((name) => `<a href="/preview/${name}">${name}</a>`).join('')
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ONE · ${escape(page)} 布局预览</title><style>:root{--unit:calc(min(100vw,430px) / 750)}body{margin:0}main{max-width:430px;margin:auto}button{cursor:pointer;font-family:inherit}img{object-fit:cover}a{text-decoration:none;color:inherit}input,textarea{font-family:inherit}input{outline:none}nav{display:none}${nativeButtonStyles}${styles}\n.tabbar-wrap{width:min(100vw,430px);right:auto;left:50%;transform:translateX(-50%)}.scroll-row,.facility-scroll{overflow-x:auto}.sheet-scroll{overflow-y:auto}.home-hero-cta{width:fit-content} [data-preview-action]{cursor:pointer}</style></head><body><nav>${menu}</nav><main>${renderChildren(wxml.children, data)}</main><script>document.addEventListener('click',function(event){const el=event.target.closest('[data-preview-action]');if(!el)return;const a=el.dataset.previewAction;const routes={goPoints:'/preview/points',goBooking:'/preview/booking?type='+(el.dataset.type||'group'),goMySchedule:'/preview/profile',goIdentityQr:'/preview/profile',goLogin:'/preview/login',goBrowse:'/preview/home',onOpenUserManage:'/preview/admin/users',onOpenPackageManage:'/preview/admin/packages',onOpenStoreManage:'/preview/admin/stores',onOpenOperations:'/preview/workspace',goClassDetail:'/preview/workspace/class'};if(routes[a])location.href=routes[a];else if(a==='onTap')location.href='/preview/'+el.dataset.path.replace('/pages/','').replace('/index','');else if(a==='onTapAction')location.href='/preview/workspace/'+el.dataset.actionId;else if(['onTogglePricing','onToggleFilters','onOpenCoachPicker','onToggleAuditLogs'].includes(a))location.search='?expanded=1';else if(['onOpenCreatePopup','onOpenCreate','onOpenCreateStore','onOpenCreatePopup','openNicknameEditor'].includes(a))location.search='?popup=1';else if(['onCloseCreatePopup','onCloseStorePopup','closeNicknameEditor','onCloseCoachPicker'].includes(a))location.search='';else if(a==='onOpenGallery')location.search='?popup=gallery';else if(a==='onCloseGallery')location.search='';else if(a==='onToggleInvite')location.search='?invite=form';else if(a==='onViewAssets')location.search='?popup=assets';else if(a==='onCloseAssets')location.search='';else if(a==='onBook')alert('这是布局预览，不会提交真实预约。');});</script></body></html>`
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

module.exports = { html, parseWxml, pageNames, fixtures }
