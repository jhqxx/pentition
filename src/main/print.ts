import {
  complaintsForExport,
  dictLabelMap,
  getComplaint,
  listComplaints,
  targetsForCodes,
  type ComplaintFilter,
  type ComplaintRow,
  type TargetInput,
} from './db'
/** 被反映人类型：字典存显示值，兼容老数据里的代码 ORG/IND */
const isUnitType = (value: unknown): boolean => ['单位', 'ORG'].includes(String(value ?? '').trim())

const esc = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const text = (value: unknown): string =>
  value === null || value === undefined || value === '' ? '—' : esc(String(value).slice(0, 19))

function tr(className: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  const map = dictLabelMap(className)
  return esc(map[String(value)] ?? String(value))
}

function depts(className: string, raw: unknown): string {
  if (!raw) return '—'
  const map = dictLabelMap(className)
  return esc(
    String(raw)
      .split(',')
      .map((key) => key.trim())
      .filter(Boolean)
      .map((key) => map[key] ?? key)
      .join('、'),
  )
}

const targetType = (value: unknown): string =>
  value === 'ORG' ? '单位' : value === 'IND' ? '个人' : '—'

function frame(title: string, body: string, extraHead = ''): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 14mm 14mm 16mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
    font-size: 10.5pt;
    color: #14212e;
    background: #f2f6fb;
  }
  .toolbar {
    position: sticky; top: 0; z-index: 9;
    display: flex; justify-content: flex-end; gap: 8px;
    padding: 10px 16px; background: #ffffff; border-bottom: 1px solid #dce7f1;
  }
  .toolbar button {
    font: inherit; padding: 6px 16px; border-radius: 4px; cursor: pointer;
    border: 1px solid #1f6fb2; background: #1f6fb2; color: #fff;
  }
  .toolbar button.ghost { background: #fff; color: #1f6fb2; }
  .sheet {
    width: 210mm; margin: 16px auto; padding: 14mm;
    background: #fff; box-shadow: 0 6px 24px rgba(16, 22, 29, .08);
  }
  h1 { font-size: 15pt; text-align: center; margin: 0 0 2mm; letter-spacing: .08em; }
  .org { text-align: center; font-size: 9pt; color: #5a6b7c; letter-spacing: .12em; margin-bottom: 6mm; }
  h2 { font-size: 10.5pt; margin: 5mm 0 2mm; padding-left: 2mm; border-left: 2.5pt solid #1f6fb2; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: .6pt solid #c2d4e4; padding: 1.6mm 2mm; vertical-align: top; font-size: 9.5pt; }
  th { background: #f2f7fc; font-weight: 500; text-align: left; width: 24mm; white-space: nowrap; }
  td.wide { width: auto; }
  .foot { margin-top: 8mm; display: flex; justify-content: space-between; font-size: 8.5pt; color: #5a6b7c; }
  /* 台账固定列宽：10 列合计必须 ≤ 页面可用宽度（A4 210mm - 左右 14mm = 182mm），否则会溢到纸外被裁掉 */
  .list { table-layout: fixed; }
  .list th { width: auto; }
  .list td { padding: 1.2mm 1mm; font-size: 8.5pt; word-break: break-word; }
  .list th { padding: 1.4mm 1mm; font-size: 8.5pt; }
  .list th:nth-child(1), .list td:nth-child(1) { width: 7mm; }
  .list th:nth-child(2), .list td:nth-child(2) { width: 26mm; }
  .list th:nth-child(3), .list td:nth-child(3) { width: 16mm; }
  .list th:nth-child(4), .list td:nth-child(4) { width: 24mm; }
  .list th:nth-child(5), .list td:nth-child(5) { width: 18mm; }
  .list th:nth-child(6), .list td:nth-child(6) { width: 16mm; }
  .list th:nth-child(7), .list td:nth-child(7) { width: 19mm; }
  .list th:nth-child(8), .list td:nth-child(8) { width: 15mm; }
  .list th:nth-child(9), .list td:nth-child(9) { width: 15mm; }
  .list th:nth-child(10), .list td:nth-child(10) { width: 26mm; }
  .list td { font-size: 8.5pt; }
  .list td[colspan] { text-align: center; color: #5a6b7c; }
  .list tr.rec td { border-top: 1pt solid #a9c2d8; }
  .late { display: inline-block; margin-left: 1mm; padding: 0 1mm; border: 0.5pt solid #e0a3a0; border-radius: 1mm; color: #8a2b25; font-size: 7pt; line-height: 1.35; }
  .list tbody tr:first-child td { border-top: .6pt solid #c2d4e4; }
  .list td[rowspan] { vertical-align: middle; }
  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .sheet { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
  }
${extraHead}
</style>
</head>
<body>
<div class="toolbar">
  <button onclick="window.print()">打印</button>
  <button class="ghost" onclick="window.close()">关闭</button>
</div>
${body}
</body>
</html>`
}

function sheetComplaint(row: ComplaintRow): string {
  const code = String(row.OriginalCode ?? '')
  const rows = (pairs: Array<[string, string]>): string => {
    const filled = pairs.filter(([, value]) => value !== '—')
    const list = filled.length ? filled : pairs.slice(0, 1)
    return list
      .map(
        ([label, value]) =>
          `<tr><th>${esc(label)}</th><td class="wide">${value}</td></tr>`,
      )
      .join('')
  }

  return `<section class="sheet">
  <h1>信访（问题线索）登记表</h1>
  <div class="org">审查调查工作平台</div>

  <h2>基本信息</h2>
  <table>
    ${rows([
      ['原始编号', esc(code)],
      ['线索编号', text(row.NewCode)],
      ['信访编号', text(row.CategoryCode)],
      ['信访类别', tr('信访类别', row.Category)],
      ['线索来源', tr('线索来源', row.ClueSource)],
      ['接收时间', text(row.ReceiveTime)],
    ])}
  </table>

  <h2>被反映对象</h2>
  <table>
    ${rows([
      ['对象类型', targetType(row.TargetType)],
      ['姓名', text(row.TargetName)],
      ['单位名称', text(row.OrganizationName)],
      ['法定代表人', text(row.LegalPerson)],
      ['性别', tr('性别', row.Gender)],
      ['职级', tr('职位层级', row.TargetRank)],
      ['政治面貌', tr('政治面貌', row.PoliticalStatus)],
      ['出生年月', text(row.BirthDate)],
      ['单位职务', text(row.TargetPost)],
      ['联系方式', text(row.ContactPhone)],
      ['联系地址', text(row.ContactAddress)],
    ])}
  </table>

  <h2>信访内容</h2>
  <table>
    ${rows([
      ['举报形式', tr('举报形式', row.ReportForm)],
      ['举报人', text(row.ReportName)],
      ['举报电话', text(row.ReportPhone)],
      ['反映问题摘要', text(row.ProblemSummary)],
    ])}
  </table>

  <h2>办理情况</h2>
  <table>
    ${rows([
      ['分办时间', text(row.AssignTime)],
      ['分办部室', depts('分办部室或片区', row.AssignDept)],
      ['承办形式', tr('承办形式', row.UndertakeForm)],
      ['承办部室', depts('承办部室或片区', row.UndertakeDept)],
      ['处置时间', text(row.DisposeTime)],
      ['处置方式', tr('处置方式', row.DisposeMethod)],
      ['应办结时间', text(row.Deadline)],
      ['处置形态', tr('处置形态', row.DisposeForm)],
      ['处置结果', tr('处置结果', row.DisposeResult)],
      ['是否办结', tr('是否办结', row.IsCompleted) + (row.IsLateCompleted === '是' ? '（超期办结）' : '')],
      ['办结时间', text(row.CompleteTime)],
      ['是否超期', tr('是否超期', row.IsOverdue)],
      ['超期原因', text(row.OverdueReason)],
    ])}
  </table>

  <h2>办案与签批</h2>
  <table>
    ${rows([
      ['主办人', text(row.MainHandler)],
      ['协办人', text(row.AssistantHandler)],
      ['审核人', text(row.AuditHandler)],
      ['领导签批', tr('领导签批', row.LeaderApproval)],
      ['签批情况', tr('签批情况', row.ApprovalStatus)],
      ['实名举报反馈', text(row.RealNameReport)],
      ['备注', text(row.Remark)],
    ])}
  </table>

  <div class="foot">
    <span>编号 ${esc(code)}</span>
    <span>打印时间 ${esc(new Date().toLocaleString('zh-CN'))}</span>
  </div>
</section>`
}

export function complaintPrintHtml(code: string): string {
  const row = getComplaint(code)
  if (!row) throw new Error(`未找到编号为 ${code} 的信访记录`)
  return frame(`信访登记表 ${code}`, sheetComplaint(row as unknown as ComplaintRow))
}

/** 台账标题里的年份：按记录接收时间归年，跨年写 2025-2026 */
function reportYearRange(rows: Array<Record<string, unknown>>): string {
  const years = new Set<string>()
  for (const row of rows) {
    const text = String(row.ReceiveTime ?? '').slice(0, 4)
    if (/^\d{4}$/.test(text)) years.add(text)
  }
  if (!years.size) return String(new Date().getFullYear())
  const sorted = [...years].sort()
  return sorted.length === 1 ? sorted[0] : `${sorted[0]}-${sorted[sorted.length - 1]}`
}

export function listPrintHtml(filter: ComplaintFilter): string {
  const rows = filter.codes?.length
    ? complaintsForExport(filter.codes)
    : listComplaints({ ...filter, page: 1, pageSize: 200 }).rows
  const targets = targetsForCodes(rows.map((row) => String(row.OriginalCode ?? '')))
  // 一个被反映人一行：同一记录的前 3 列与后 6 列用 rowspan 合并成一块，只有「被反映人/单位」逐行
  const groups = rows.map((row, index) => {
    const people = targets[String(row.OriginalCode ?? '')] ?? []
    return { row, people: people.length ? people : [null], no: index + 1 }
  })
  const personName = (row: (typeof rows)[number], person: TargetInput | null): string => {
    if (person) {
      return isUnitType(person.TargetType)
        ? esc(person.OrganizationName || '—')
        : text(person.TargetName)
    }
    return text(row.TargetName) === '—' ? esc(row.OrganizationName ?? '—') : text(row.TargetName)
  }
  const body = groups
    .map(({ row, people, no }) => {
      const span = people.length
      return people
        .map((person, index) => {
          const name = `<td class="person">${personName(row, person)}</td>`
          if (index > 0) return `<tr class="cont">${name}</tr>`
          return `<tr class="rec">
      <td rowspan="${span}">${no}</td>
      <td rowspan="${span}">${esc(row.OriginalCode)}</td>
      <td rowspan="${span}">${tr('信访类别', row.Category)}</td>
      ${name}
      <td rowspan="${span}">${tr('线索来源', row.ClueSource)}</td>
      <td rowspan="${span}">${tr('举报形式', row.ReportForm)}</td>
      <td rowspan="${span}">${tr('处置形态', row.DisposeForm)}</td>
      <td rowspan="${span}">${tr('是否办结', row.IsCompleted)}${row.IsLateCompleted === '是' ? '<span class="late">超期办结</span>' : ''}</td>
      <td rowspan="${span}">${text(row.MainHandler)}</td>
      <td rowspan="${span}">${text(row.ReceiveTime)}</td>
    </tr>`
        })
        .join('')
    })
    .join('')

  const reportTitle = `${reportYearRange(rows)}年信访件、问题线索登记表`
  return frame(
    reportTitle,
    `<section class="sheet">
  <h1>${esc(reportTitle)}</h1>
  <div class="org">审查调查工作平台</div>
  <table class="list">
    <thead>
      <tr>
        <th>序号</th><th>原始编号</th><th>信访类别</th><th>被反映人/单位</th><th>线索来源</th>
        <th>举报形式</th><th>处置形态</th><th>是否办结</th><th>主办人</th><th>接收时间</th>
      </tr>
    </thead>
    <tbody>${body || '<tr><td colspan="10">没有符合条件的记录</td></tr>'}</tbody>
  </table>
  <div class="foot">
    <span>共 ${rows.length} 条${groups.some((g) => g.people.length > 1) ? `（${groups.reduce((n, g) => n + g.people.length, 0)} 位被反映人）` : ''}</span>
    <span>打印时间 ${esc(new Date().toLocaleString('zh-CN'))}</span>
  </div>
</section>`,
  )
}
