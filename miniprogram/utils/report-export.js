const { t } = require('./i18n')

function literal(value) {
  let text = value === null || value === undefined ? '' : String(value)
  // 客户或课程名称可能以公式字符开头，导入表格时按文本处理。
  if (typeof value === 'string' && (/^\s*[=+@-]/.test(text) || /^0\d+$/.test(text))) text = "'" + text
  return text
}
function cell(value) { return '"' + literal(value).replace(/"/g, '""') + '"' }
function csv(rows) { return '\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n' }
const headers = values => values.map(value => t(value))
function followupRows(data) {
  return [headers(['客户跟进', '门店', '统计日期']), ['', data.store.name, data.today],
    headers(['到期提醒天数', '课时不足阈值', '未到店提醒天数']), [data.thresholds.expiryDays, data.thresholds.lowBalance, data.thresholds.inactiveDays], [],
    headers(['姓名', '手机号', '团课余额', '团课到期日', '私教余额', '私教到期日', '最近到店', '距到店或建档天数', '即将到期', '课时不足', '长期未到店']),
    ...data.customers.map(c => [c.name, c.phone, c.types[0].unlimited ? t('期限内无限次') : c.types[0].balance, c.types[0].unlimited ? c.types[0].unlimitedExpiry : c.types[0].expiry, c.types[1].unlimited ? t('期限内无限次') : c.types[1].balance, c.types[1].unlimited ? c.types[1].unlimitedExpiry : c.types[1].expiry, c.lastVisit || t('未到店'), c.daysInactive, t(c.expiring ? '是' : '否'), t(c.low ? '是' : '否'), t(c.inactive ? '是' : '否')])]
}
function reportRows(data) {
  const s = data.summary
  return [headers(['经营报表', '门店', '开始日期', '结束日期']), ['', data.store.name, data.startDate, data.endDate],
    [t('统计说明'), t('收款按登记日期；核销按训练日期；排除已撤销记录。')],
    headers(['登记实收', '收款笔数', '付费客户', '续费笔数', '续费金额', '到场人次', '缺席人次', '已完成场次']),
    [s.incomeText, s.payments, s.paidCustomers, s.renewals, s.renewalText, s.checkins, s.absences, s.taught], [],
    [t('每日经营数据')], headers(['日期', '登记实收', '收款笔数', '续费笔数', '续费金额', '到场人次', '缺席人次', '已完成场次']),
    ...data.daily.map(d => [d.date, d.incomeText, d.payments, d.renewals, d.renewalText, d.checkins, d.absences, d.taught]), [],
    [t('教练上课情况')], headers(['教练', '排课场次', '取消场次', '已完成场次', '到场人次', '缺席人次', '人工核销人次', '排课授课分钟']),
    ...data.coaches.map(c => [c.name, c.scheduled, c.cancelled, c.taught, c.checkins, c.absences, c.manualCheckins, c.minutes]), [],
    [t('收款明细')], headers(['日期', '姓名', '套餐', '课程类型', '课时', '登记实收', '收款方式', '购课类别', '操作人']),
    ...data.payments.map(p => [p.date, p.userName, p.packageName, t(p.type), p.unlimited ? t('期限内无限次') : p.lessons, p.amountText, t(p.payType), t(p.purchaseLabel), p.operatorName])]
}
async function exportCsv(rows, kind) {
  if (!wx.getFileSystemManager || !wx.env || !wx.env.USER_DATA_PATH) throw new Error('当前设备无法生成文件，请复制表格或使用手机微信导出')
  const fileName = kind === 'followup' ? 'ONE-customer-followup.csv' : 'ONE-business-report.csv'
  const filePath = wx.env.USER_DATA_PATH + '/' + fileName
  await new Promise((resolve, reject) => wx.getFileSystemManager().writeFile({ filePath, data: csv(rows), encoding: 'utf8', success: resolve, fail: reject }))
  if (!wx.shareFileMessage) throw new Error('CSV已生成，当前微信不支持文件导出，请复制表格或更新微信')
  await new Promise((resolve, reject) => wx.shareFileMessage({ filePath, fileName, success: resolve, fail: reject }))
  return filePath
}
function tabText(rows) { return rows.map(row => row.map(value => literal(value).replace(/[\t\r\n]/g, ' ')).join('\t')).join('\n') }
module.exports = { cell, csv, followupRows, reportRows, exportCsv, tabText }
