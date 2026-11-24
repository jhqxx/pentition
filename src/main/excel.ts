import { COMPLAINT_COLUMNS, projectColumns } from './exportColumns'
import * as XLSX from 'xlsx-js-style'
import {
  complaintsForExport,
  dictCanonicalMap,
  dictLabelMap,
  logsForExport,
  monthlyStats,
  groupStats,
  overviewStats,
  targetsForCodes,
  type ComplaintRow,
  type TargetInput,
  type LogFilter,
  type LogRow,
} from './db'

type Row = Record<string, string | number | null | undefined>

type CellStyle = Record<string, unknown>

const THIN = { style: 'thin', color: { rgb: 'DCE7F1' } }
const CELL_BORDER = { top: THIN, bottom: THIN, left: THIN, right: THIN }

const TITLE_STYLE: CellStyle = {
  font: { name: '微软雅黑', sz: 16, bold: true, color: { rgb: '14212E' } },
  alignment: { horizontal: 'center', vertical: 'center' },
}

const HEADER_STYLE: CellStyle = {
  font: { name: '微软雅黑', sz: 10.5, bold: true, color: { rgb: '14212E' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  fill: { patternType: 'solid', fgColor: { rgb: 'EFF5FB' } },
  border: CELL_BORDER,
}

const BODY_STYLE: CellStyle = {
  font: { name: '微软雅黑', sz: 10.5, color: { rgb: '1B2A38' } },
  alignment: { vertical: 'center', wrapText: false },
  border: CELL_BORDER,
}

/** 中文按 2 个字符宽估算，让列宽不至于把长文本全挤在一起 */
function textWidth(value: string): number {
  let width = 0
  for (const ch of value) width += ch.charCodeAt(0) > 255 ? 2 : 1
  return width
}

function columnWidths(header: string[], rows: Row[]): number[] {
  return header.map((key) => {
    let max = textWidth(key)
    for (const row of rows.slice(0, 200)) {
      const text = String(row[key] ?? '')
      if (!text) continue
      max = Math.max(max, Math.min(textWidth(text.split('\n')[0]), 36))
    }
    return Math.min(40, Math.max(8, max + 2))
  })
}

/** 一张表 = 可选标题行 + 表头行 + 数据行，标题跨列合并、居中加粗 */
function styledSheet(sheet: { name: string; rows: Row[]; header?: string[]; title?: string }): XLSX.WorkSheet {
  const header = sheet.header ?? Object.keys(sheet.rows[0] ?? {})
  const rowsData = sheet.rows.map((row) => header.map((key) => row[key] ?? ''))
  const matrix: Array<Array<string | number>> = []
  if (sheet.title) matrix.push([sheet.title])
  matrix.push(header)
  for (const line of rowsData) matrix.push(line)
  const ws = XLSX.utils.aoa_to_sheet(matrix)
  const titleRows = sheet.title ? 1 : 0
  const lastCol = Math.max(header.length - 1, 0)
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: matrix.length - 1, c: lastCol } })
  if (sheet.title && lastCol > 0) {
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } }]
  }
  for (let r = 0; r < matrix.length; r += 1) {
    for (let c = 0; c <= lastCol; c += 1) {
      const addr = XLSX.utils.encode_cell({ r, c })
      if (!ws[addr]) ws[addr] = { t: 's', v: '' }
      const style = sheet.title && r === 0 ? TITLE_STYLE : r === titleRows ? HEADER_STYLE : BODY_STYLE
      ;(ws[addr] as { s?: CellStyle }).s = style
    }
  }
  ws['!cols'] = columnWidths(header, sheet.rows).map((wch) => ({ wch }))
  ws['!rows'] = matrix.map((_, r) => ({ hpt: r === 0 && sheet.title ? 28 : r === titleRows ? 22 : 18 }))
  return ws
}

function workbook(sheets: Array<{ name: string; rows: Row[]; header?: string[]; title?: string }>): Buffer {
  const wb = XLSX.utils.book_new()
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(wb, styledSheet(sheet), sheet.name.slice(0, 31))
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true }) as Buffer
}

/** 报表标题里的年份：按导出记录的接收时间归年，跨年写成 2025-2026 */
function reportYear(rows: Row[]): string {
  const years = new Set<string>()
  for (const row of rows) {
    const text = String(row['接收时间'] ?? '').slice(0, 4)
    if (/^\d{4}$/.test(text)) years.add(text)
  }
  if (!years.size) return String(new Date().getFullYear())
  const sorted = [...years].sort()
  return sorted.length === 1 ? sorted[0] : `${sorted[0]}-${sorted[sorted.length - 1]}`
}

function shortTime(value: unknown): string {
  return value === null || value === undefined || value === '' ? '' : String(value).slice(0, 19)
}

/** 把存储键翻译成显示值；找不到时保留原值 */
function translator(): (className: string, value: unknown) => string {
  const maps: Record<string, Record<string, string>> = {
    信访类别: dictLabelMap('信访类别'),
    线索来源: dictLabelMap('线索来源'),
    举报形式: dictLabelMap('举报形式'),
    性别: dictLabelMap('性别'),
    职位层级: dictLabelMap('职位层级'),
    政治面貌: dictLabelMap('政治面貌'),
    承办形式: dictLabelMap('承办形式'),
    处置方式: dictLabelMap('处置方式'),
    处置形态: dictLabelMap('处置形态'),
    处置结果: dictLabelMap('处置（核实）结果'),
    是否办结: dictLabelMap('是否办结'),
    是否超期: dictLabelMap('是否超期'),
    领导签批: dictLabelMap('领导签批'),
    签批情况: dictLabelMap('签批情况'),
    被反映人类型: { ORG: '单位', IND: '个人' },
  }
  return (className, value) => {
    if (value === null || value === undefined || value === '') return ''
    const key = String(value)
    return maps[className]?.[key] ?? key
  }
}

/** 部室多选：存储为逗号拼接的键值，导出翻译成名称 */
function joinDepts(className: string, raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return ''
  const map = dictLabelMap(className)
  const text = String(raw)
  return text
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean)
    .map((key) => map[key] ?? key)
    .join('、')
}

export function complaintExportRows(
  codes?: string[],
  category?: string,
  filter?: import('./db').ComplaintFilter,
): Row[] {
  const translate = translator()
  const records = complaintsForExport(codes, category, filter)
  const targets = targetsForCodes(records.map((row) => String(row.OriginalCode ?? '')))
  const out: Row[] = []
  for (const row of records) {
    const people = targets[String(row.OriginalCode ?? '')] ?? []
    const list: Array<import('./db').TargetInput | null> = people.length ? people : [null]
    list.forEach((person, index) => {
      const values: Record<string, string | number | null | undefined> = {
        原始编号: row.OriginalCode,
        线索编号: row.NewCode,
        信访编号: row.CategoryCode,
        信访类别: translate('信访类别', row.Category),
        线索来源: translate('线索来源', row.ClueSource),
        接收时间: shortTime(row.ReceiveTime),
        被反映人序号: String(index + 1),
        被反映人类型: translate('被反映人类型', person?.TargetType ?? row.TargetType),
        姓名: person ? person.TargetName : row.TargetName,
        身份证号: person ? person.IdCard : row.IdCard,
        单位名称: person ? person.OrganizationName : row.OrganizationName,
        法定代表人: person ? person.LegalPerson : row.LegalPerson,
        性别: translate('性别', person ? person.Gender : row.Gender),
        职级: translate('职位层级', person ? person.TargetRank : row.TargetRank),
        政治面貌: translate('政治面貌', person ? person.PoliticalStatus : row.PoliticalStatus),
        出生年月: shortTime(person ? person.BirthDate : row.BirthDate),
        单位职务: person ? person.TargetPost : row.TargetPost,
        工作经历: person ? person.WorkExperience : row.WorkExperience,
        联系方式: person ? person.ContactPhone : row.ContactPhone,
        联系地址: person ? person.ContactAddress : row.ContactAddress,
        被反映人数: String(list.length),
        举报形式: translate('举报形式', row.ReportForm),
        举报人: row.ReportName,
        举报电话: row.ReportPhone,
        反映问题摘要: row.ProblemSummary,
        问题类型: row.ProblemType,
        分办时间: shortTime(row.AssignTime),
        分办部室: joinDepts('分办部室或片区', row.AssignDept),
        承办形式: translate('承办形式', row.UndertakeForm),
        承办部室: joinDepts('承办部室或片区', row.UndertakeDept),
        处置时间: shortTime(row.DisposeTime),
        处置方式: translate('处置方式', row.DisposeMethod),
        目前处置状态: translate('处置方式', row.DisposeStatus),
        应办结时间: shortTime(row.Deadline),
        处置进度情况: row.DisposeProgress,
        办理情况: row.HandleStatus,
        处置形态: joinDepts('处置形态', row.DisposeForm),
        处置结果: translate('处置结果', row.DisposeResult),
        是否办结: translate('是否办结', row.IsCompleted),
        办结时间: shortTime(row.CompleteTime),
        是否超期: translate('是否超期', row.IsOverdue),
        超期办结: row.IsLateCompleted === '是' ? '是' : '否',
        超期原因: row.OverdueReason,
        主办人: row.MainHandler,
        协办人: row.AssistantHandler,
        审核人: row.AuditHandler,
        领导签批: translate('领导签批', row.LeaderApproval),
        签批情况: translate('签批情况', row.ApprovalStatus),
        实名举报反馈情况: row.RealNameReport,
        备注: row.Remark,
        创建时间: shortTime(row.CreateTime),
        更新时间: shortTime(row.UpdateTime),
      }
      const ordered: Row = {}
      for (const name of COMPLAINT_COLUMNS) ordered[name] = values[name] ?? ''
      out.push(ordered)
    })
  }
  return out
}

export function complaintExportPreview(
  codes?: string[],
  category?: string,
  filter?: import('./db').ComplaintFilter,
): { title: string; columns: string[]; rows: Row[]; total: number } {
  const rows = complaintExportRows(codes, category, filter)
  return {
    title: `${reportYear(rows)}年信访件、问题线索登记表`,
    columns: [...COMPLAINT_COLUMNS],
    rows: rows.slice(0, 5),
    total: rows.length,
  }
}

export function buildComplaintWorkbook(
  codes?: string[],
  category?: string,
  filter?: import('./db').ComplaintFilter,
  columns?: string[],
): Buffer {
  const rows = complaintExportRows(codes, category, filter)
  const projected = projectColumns(rows, columns)
  const header = Object.keys(projected[0] ?? rows[0] ?? {})
  return workbook([
    {
      name: '登记表',
      rows: projected,
      header,
      title: `${reportYear(rows)}年信访件、问题线索登记表`,
    },
  ])
}

export function buildLogWorkbook(filter: LogFilter): Buffer {
  const rows = logsForExport(filter).map((row: LogRow) => ({
    操作时间: shortTime(row.OperationTime),
    操作人: row.UserRealName || row.UserName,
    账号: row.UserName,
    角色: row.UserRole === 'Admin' ? '管理员' : '普通用户',
    操作类型: row.OperationType,
    操作模块: row.OperationModule,
    操作内容: row.OperationContent,
    操作对象: row.TargetName,
    对象编号: row.TargetId,
    IP地址: row.IPAddress,
    备注: row.Remark,
  }))
  return workbook([{ name: '操作日志', rows }])
}

export function buildStatsWorkbook(): Buffer {
  const overview = overviewStats()
  const summary = Object.entries({
    问题线索总数: overview.xsTotal,
    信访件总数: overview.xfTotal,
    实名举报: overview.reportCount,
    匿名举报: overview.accusationCount,
    已办结: overview.completed,
    办理中: overview.processing,
    已超期: overview.overdue,
    办结率: `${overview.completionRate}%`,
  }).map(([指标, 数值]) => ({ 指标, 数值 }))
  const monthly = monthlyStats().map((row) => ({
    月份: row.monthName,
    接收数量: row.count,
    已办结: row.completedCount,
    已超期: row.overdueCount,
    办结率: `${row.completionRate}%`,
  }))
  const source = groupStats('ClueSource').map((row) => ({ 线索来源: row.name, 数量: row.count, 占比: `${row.percentage}%` }))
  const form = groupStats('DisposeForm').map((row) => ({ 处置形态: row.name, 数量: row.count, 占比: `${row.percentage}%` }))
  const dept = groupStats('UndertakeDept').map((row) => ({ 承办部室: row.name, 数量: row.count }))
  return workbook([
    { name: '总体统计', rows: summary },
    { name: '月度趋势', rows: monthly },
    { name: '线索来源', rows: source },
    { name: '处置形态', rows: form },
    { name: '承办部室', rows: dept },
  ])
}


const IMPORT_HEADERS: Array<[string, string]> = [
  ['原始编号', 'OriginalCode'],
  ['线索编号', 'NewCode'],
  ['信访编号', 'CategoryCode'],
  ['信访类别', 'Category'],
  ['线索来源', 'ClueSource'],
  ['接收时间', 'ReceiveTime'],
  ['被反映人类型', 'TargetType'],
  ['姓名', 'TargetName'],
  ['身份证号', 'IdCard'],
  ['单位名称', 'OrganizationName'],
  ['法定代表人', 'LegalPerson'],
  ['性别', 'Gender'],
  ['职级', 'TargetRank'],
  ['政治面貌', 'PoliticalStatus'],
  ['出生年月', 'BirthDate'],
  ['单位职务', 'TargetPost'],
  ['工作经历', 'WorkExperience'],
  ['联系方式', 'ContactPhone'],
  ['联系地址', 'ContactAddress'],
  ['举报形式', 'ReportForm'],
  ['举报人', 'ReportName'],
  ['举报电话', 'ReportPhone'],
  ['反映问题摘要', 'ProblemSummary'],
  ['问题类型', 'ProblemType'],
  ['分办时间', 'AssignTime'],
  ['分办部室', 'AssignDept'],
  ['承办形式', 'UndertakeForm'],
  ['承办部室', 'UndertakeDept'],
  ['处置时间', 'DisposeTime'],
  ['处置方式', 'DisposeMethod'],
  ['目前处置状态', 'DisposeStatus'],
  ['应办结时间', 'Deadline'],
  ['处置进度情况', 'DisposeProgress'],
  ['办理情况', 'HandleStatus'],
  ['处置形态', 'DisposeForm'],
  ['处置结果', 'DisposeResult'],
  ['是否办结', 'IsCompleted'],
  ['办结时间', 'CompleteTime'],
  ['是否超期', 'IsOverdue'],
  ['超期原因', 'OverdueReason'],
  ['主办人', 'MainHandler'],
  ['协办人', 'AssistantHandler'],
  ['审核人', 'AuditHandler'],
  ['领导签批', 'LeaderApproval'],
  ['签批情况', 'ApprovalStatus'],
  ['实名举报反馈情况', 'RealNameReport'],
  ['备注', 'Remark'],
]

/** 生成导入模板：一行表头 + 个人/单位两条示例 + 填写说明 */
export function buildImportTemplate(): Buffer {
  const header = IMPORT_HEADERS.map(([h]) => h)
  const person: Row = {
    信访类别: '问题线索',
    线索来源: '自收信访举报',
    接收时间: '2026-01-05 09:30:00',
    被反映人类型: '个人',
    姓名: '张某某',
    身份证号: '110101199001011234',
    性别: '男',
    职级: '科级',
    政治面貌: '中共党员',
    出生年月: '1990-01',
    单位职务: '某某局科长',
    联系方式: '13800000000',
    举报形式: '实名',
    举报人: '李某某',
    举报电话: '13900000000',
    反映问题摘要: '示例：反映某单位违规发放津补贴问题（导入前请删除本行）',
    问题类型: '违反廉洁纪律',
    处置方式: '谈话函询',
    目前处置状态: '谈话函询',
    应办结时间: '2026-03-06',
    处置形态: '第一种形态',
    处置结果: '第一种形态：谈话提醒',
    是否办结: '否',
    是否超期: '否',
    主办人: '王某某',
  }
  const unit: Row = {
    信访类别: '信访件',
    线索来源: '上级交办',
    接收时间: '2026-01-06 10:00:00',
    被反映人类型: '单位',
    单位名称: '某某建设集团有限公司',
    法定代表人: '赵某某',
    联系方式: '0518-88888888',
    联系地址: '连云港市某某路 1 号',
    举报形式: '匿名',
    反映问题摘要: '示例：反映某公司串通投标问题（导入前请删除本行）',
    是否办结: '否',
    主办人: '王某某',
  }
  const help: Row[] = [
    { 项目: '表头', 说明: '第一行表头请勿改名、勿增删列；可直接在本文件上填写。' },
    { 项目: '必填', 说明: '信访类别、线索来源、接收时间、被反映人类型、反映问题摘要。' },
    { 项目: '信访类别', 说明: '填「问题线索」或「信访件」，决定这条数据导入线索表还是信访表。' },
    { 项目: '被反映人类型', 说明: '填「个人」或「单位」；填个人时「姓名」和「身份证号」必填（18 位，末位可为 X；或 15 位旧号）。' },
    { 项目: '字典类字段', 说明: '填显示值，例如 实名/匿名、是/否、科级、中共党员、谈话函询、第一种形态；必须与「基础字典」里的显示值一致。' },
    { 项目: '时间格式', 说明: '接收时间/分办时间/处置时间/办结时间用 YYYY-MM-DD HH:mm:ss；应办结时间用 YYYY-MM-DD。' },
    { 项目: '原始编号', 说明: '留空由系统自动生成（线索 XS+日期+流水、信访件 XF+日期+流水）；填了已存在的编号会整行跳过。' },
    { 项目: '是否办结 / 是否超期', 说明: '填「是」或「否」；留空按「否」处理。' },
    { 项目: '多位被反映人', 说明: '一个编号一行；同一条记录若要登记多人，请导入后在编辑页用「添加被反映人」补录。' },
  ]
  return workbook([
    { name: '导入数据', rows: [person, unit], header },
    { name: '填写说明', rows: help, header: ['项目', '说明'] },
  ])
}

const DICT_COLUMNS: Array<[string, string]> = [
  ['信访类别', '信访类别'],
  ['线索来源', '线索来源'],
  ['举报形式', '举报形式'],
  ['性别', '性别'],
  ['职级', '职位层级'],
  ['政治面貌', '政治面貌'],
  ['承办形式', '承办形式'],
  ['处置方式', '处置方式'],
  ['处置形态', '处置形态'],
  ['处置结果', '处置（核实）结果'],
  ['是否办结', '是否办结'],
  ['是否超期', '是否超期'],
  ['领导签批', '领导签批'],
  ['签批情况', '签批情况'],
]

/** 把导出的显示值反解回存储键，用于导入 */
function reverseMaps(): Record<string, Record<string, string>> {
  // 导入时把「显示值/代码」统一规范成显示值（库里存的是显示值）
  const out: Record<string, Record<string, string>> = {}
  for (const [header, className] of DICT_COLUMNS) out[header] = dictCanonicalMap(className)
  out['被反映人类型'] = { 单位: '单位', 个人: '个人', ORG: '单位', IND: '个人' }
  return out
}

function reverseDepts(className: string, raw: string): string {
  if (!raw) return ''
  const map = dictCanonicalMap(className)
  return raw
    .split(/[、,，;；]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => map[part] ?? part)
    .join(',')
}

export interface ImportRow {
  row: Record<string, string | null>
  line: number
}

/** 解析导入的 Excel；表头缺失或缺少数必填时抛错 */
export function parseComplaintWorkbook(buffer: Buffer): ImportRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) throw new Error('工作簿里没有可用的工作表')
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  if (!raw.length) throw new Error('工作表没有数据行')
  const reverse = reverseMaps()
  const known = new Set(IMPORT_HEADERS.map(([header]) => header))
  const firstKeys = Object.keys(raw[0] ?? {})
  const matched = firstKeys.filter((key) => known.has(key.trim()))
  if (matched.length < 3) {
    throw new Error('表头不匹配：请使用本系统「导出全部」得到的表格作为导入模板')
  }
  return raw.map((item, index) => {
    const row: Record<string, string | null> = {}
    for (const [header, column] of IMPORT_HEADERS) {
      const value = item[header]
      if (value === undefined || value === '') {
        row[column] = null
        continue
      }
      const text = String(value).trim()
      if (reverse[header]) row[column] = reverse[header][text] ?? text
      else if (column === 'AssignDept') row[column] = reverseDepts('分办部室或片区', text)
      else if (column === 'UndertakeDept') row[column] = reverseDepts('承办部室或片区', text)
      else row[column] = text
    }
    return { row, line: index + 2 }
  })
}
