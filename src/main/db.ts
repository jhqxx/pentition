import { app } from 'electron'
import { readSettings, resolvePath, toRelative } from './settings'
import fs from 'node:fs'
import path from 'node:path'
import { hashPassword, isHashed, verifyPassword } from './password'
import { openDatabase, type DriverName, type SqliteHandle } from './sqlite-driver'
import { COMPLAINT_TABLE_DDL, TARGET_FIELDS, createComplaintAllView, createSchema, seedIfEmpty } from './schema'

export interface SessionUser {
  id: number
  username: string
  realName: string
  role: string
  department: string
}

export interface UserRow {
  Id: number
  Username: string
  Password: string
  RealName: string | null
  Role: string
  Department: string | null
  Email: string | null
  Phone: string | null
  IsActive: number
  CreateTime: string
  LastLoginTime: string | null
  LastLoginIP: string | null
}

export type ComplaintRow = Record<string, string | number | null> & { Id: number; TargetCount?: number }

export interface ComplaintFilter {
  category?: string
  /** none = 未归并到线索，any = 已归并 */
  parent?: string
  /** 只看某条线索下的信访件 */
  clue?: string
  /** 只看指定编号的那一条（点编号跳转过来时用） */
  code?: string
  isOverdue?: string
  reportForm?: string
  isCompleted?: string
  disposeForm?: string
  /** '1' = 只看超期办结 */
  late?: string
  keyword?: string
  tab?: string
  /** true = 只查看回收站（已逻辑删除）中的记录 */
  deleted?: boolean
  page?: number
  pageSize?: number
  /** 指定编号集合（导出/打印选中用） */
  codes?: string[]
}

/** 两张业务表：Clue=问题线索，Complaint=信访件 */
export type RecordKind = 'clue' | 'letter'
export const KIND_TABLE: Record<RecordKind, string> = { clue: 'Clue', letter: 'Complaint' }
/** ComplaintAll 是两表 UNION 视图，所有只读查询都走它 */
const ALL_TABLE = 'ComplaintAll'

/** Category 可能是字典代码（0/1）或显示值（问题线索/信访件） */
export function kindOfCategory(category?: string | null): RecordKind {
  const v = String(category ?? '').trim()
  return v === '0' || v === '问题线索' ? 'clue' : 'letter'
}

function tableExists(handle: SqliteHandle, name: string): boolean {
  const row = handle
    .prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = @name")
    .get({ name }) as { x: number } | undefined
  return !!row
}

function tableOfCode(code: string): RecordKind | null {
  const c = conn()
  if (c.prepare('SELECT 1 AS x FROM Clue WHERE OriginalCode = @code').get({ code })) return 'clue'
  if (c.prepare('SELECT 1 AS x FROM Complaint WHERE OriginalCode = @code').get({ code })) return 'letter'
  return null
}

export interface DictClassRow {
  Id: number
  ClassName: string
  Description: string | null
  CreateTime: string
  UpdateTime: string
  itemCount?: number
}

export interface DictItemRow {
  Id: number
  ClassId: number
  ParentId: number | null
  ItemKey: string
  ItemValue: string
  SortOrder: number
  Description: string | null
  CreateTime: string
  UpdateTime: string
  children?: DictItemRow[]
}

export interface LogRow {
  Id: number
  UserName: string
  UserRealName: string | null
  UserRole: string | null
  OperationType: string
  OperationModule: string
  OperationContent: string | null
  TargetId: string | null
  TargetName: string | null
  IPAddress: string | null
  OperationTime: string
  Remark: string | null
}

export interface AttachmentRow {
  Id: number
  OriginalCode: string
  FileName: string
  FilePath: string
  FileSize: number | null
  FileType: string | null
  UploadTime: string
  Uploader: string | null
}

let db: SqliteHandle | null = null
let paths: { userData: string; dbFile: string; attachmentsDir: string } | null = null

export function sqliteDriver(): DriverName {
  return db?.driver ?? 'node:sqlite'
}

export function getPaths() {
  if (!paths) {
    const userData = app.getPath('userData')
    const settings = readSettings()
    paths = {
      userData,
      dbFile: resolvePath(settings.dbPath),
      attachmentsDir: resolvePath(settings.attachmentsDir),
    }
  }
  return paths
}

/** 设置变更后重置路径缓存并重连数据库 */
export function reloadDb(): void {
  checkpoint()
  if (db) {
    db.close()
    db = null
  }
  paths = null
  initDb()
}

export function checkpoint(): void {
  try {
    db?.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  } catch (error) {
    console.error('[db] checkpoint 失败：', error)
  }
}

/** 老库补列：ParentCode 承载「线索（主）→ 信访件（子）」，ParentId 承载字典项的三级结构 */
function ensureColumns(handle: SqliteHandle): string[] {
  const added: string[] = []
  const add = (table: string, column: string, ddl: string): void => {
    if (!tableExists(handle, table)) return
    const columns = handle.prepare(`PRAGMA table_info('${table}')`).all() as unknown as Array<{ name: string }>
    if (!columns.some((item) => item.name === column)) {
      handle.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
      added.push(`${table}.${column}`)
    }
  }
  add('Complaint', 'ParentCode', 'ParentCode TEXT')
  add('Clue', 'ParentCode', 'ParentCode TEXT')
  add('Complaint', 'ConvertedTime', 'ConvertedTime TEXT')
  add('Clue', 'ConvertedTime', 'ConvertedTime TEXT')
  add('Complaint', 'IdCard', 'IdCard TEXT')
  add('Clue', 'IdCard', 'IdCard TEXT')
  add('Complaint', 'ProblemType', 'ProblemType TEXT')
  add('Clue', 'ProblemType', 'ProblemType TEXT')
  add('Complaint', 'DisposeStatus', 'DisposeStatus TEXT')
  add('Complaint', 'IsLateCompleted', 'IsLateCompleted TEXT')
  add('Clue', 'IsLateCompleted', 'IsLateCompleted TEXT')
  add('Clue', 'DisposeStatus', 'DisposeStatus TEXT')
  add('DictionaryItem', 'ParentId', 'ParentId INTEGER')
  for (const table of ['Complaint', 'Clue', 'Users', 'DictionaryClass', 'DictionaryItem']) {
    add(table, 'IsDeleted', 'IsDeleted INTEGER DEFAULT 0')
    add(table, 'DeleteTime', 'DeleteTime DATETIME')
  }
  // 首次加 ConvertedTime 时，把历史上已经存在的关联一律视为「转化生成」——之前只有转化会产生关联
  if (added.includes('Complaint.ConvertedTime')) {
    handle
      .prepare(
        "UPDATE Complaint SET ConvertedTime = COALESCE(UpdateTime, CreateTime) WHERE COALESCE(ParentCode, '') <> '' AND COALESCE(ConvertedTime, '') = ''",
      )
      .run()
  }
  // 补列后视图里的列还是旧的，重建一次
  createComplaintAllView(handle)
  return added
}

/** 把 Complaint 里各字典列的「代码」就地改写成「显示值」（幂等，可反复执行） */
const DICT_COLUMN_MAP: Array<{ column: string; className: string; multi?: boolean }> = [
  { column: 'Category', className: '信访类别' },
  { column: 'ClueSource', className: '线索来源' },
  { column: 'TargetType', className: '被反映人类型' },
  { column: 'Gender', className: '性别' },
  { column: 'TargetRank', className: '职位层级' },
  { column: 'PoliticalStatus', className: '政治面貌' },
  { column: 'ReportForm', className: '举报形式' },
  { column: 'AssignDept', className: '分办部室或片区', multi: true },
  { column: 'UndertakeDept', className: '承办部室或片区', multi: true },
  { column: 'UndertakeForm', className: '承办形式' },
  { column: 'DisposeMethod', className: '处置方式' },
  { column: 'DisposeStatus', className: '处置方式' },
  { column: 'DisposeForm', className: '处置形态', multi: true },
  { column: 'DisposeResult', className: '处置（核实）结果' },
  { column: 'IsCompleted', className: '是否办结' },
  { column: 'IsOverdue', className: '是否超期' },
  { column: 'LeaderApproval', className: '领导签批' },
  { column: 'ApprovalStatus', className: '签批情况' },
]

export function normalizeDictStoredValues(): number {
  const c = conn()
  let changed = 0
  for (const table of ['Complaint', 'Clue']) {
    if (!tableExists(c, table)) continue
    for (const { column, className, multi } of DICT_COLUMN_MAP) {
      const rows = c.prepare(`SELECT Id, "${column}" AS v FROM ${table}`).all() as unknown as Array<{
        Id: number
        v: string | null
      }>
      const update = c.prepare(`UPDATE ${table} SET "${column}" = @next WHERE Id = @id`)
      for (const row of rows) {
        if (row.v === null || row.v === undefined || row.v === '') continue
        const next = multi
          ? row.v
              .split(',')
              .map((part) => dictValueOf(className, part.trim()))
              .join(',')
          : dictValueOf(className, row.v)
        if (next !== row.v) {
          update.run({ next, id: row.Id })
          changed += 1
        }
      }
    }
  }
  return changed
}

/**
 * 一次性迁移：把老的单表 Complaint（信访件 + 问题线索混存）拆成
 * Complaint（信访件）+ Clue（问题线索）两张物理表。
 * 幂等：只要 Clue 已存在就跳过。
 */
function dropStaleViews(handle: SqliteHandle): string[] {
  const views = handle.prepare("SELECT name FROM sqlite_master WHERE type = 'view'").all() as unknown as Array<{ name: string }>
  const dropped: string[] = []
  for (const item of views) {
    try {
      handle.exec(`DROP VIEW IF EXISTS "${item.name}"`)
      dropped.push(item.name)
    } catch (error) {
      console.warn(`[db] 删除视图 ${item.name} 失败：`, error)
    }
  }
  return dropped
}

/**
 * 修复「迁移做到一半」的库：老版本崩溃/断电可能留下 Complaint_legacy、ComplaintAttachment_new 或
 * 指向不存在表的视图。新版启动时先把它修回可用状态，避免一次失败让新旧版本都打不开。
 */
function repairBrokenSchema(handle: SqliteHandle): void {
  const views = handle.prepare("SELECT name FROM sqlite_master WHERE type = 'view'").all() as unknown as Array<{ name: string }>
  for (const item of views) {
    try {
      handle.prepare(`SELECT 1 FROM "${item.name}" LIMIT 1`).get()
    } catch {
      console.warn(`[db] 视图 ${item.name} 已失效（引用的表不存在），删除后重建`)
      handle.exec(`DROP VIEW IF EXISTS "${item.name}"`)
    }
  }
  // 老表还挂在旁边、正式表不见了：先改名回来，再走正常拆表流程
  if (!tableExists(handle, 'Complaint') && tableExists(handle, 'Complaint_legacy')) {
    console.warn('[db] 发现未完成的拆分（Complaint 缺失、Complaint_legacy 存在），先恢复原表')
    handle.exec('ALTER TABLE Complaint_legacy RENAME TO Complaint')
  }
  // 附件表临时表残留
  if (tableExists(handle, 'ComplaintAttachment_new')) {
    if (!tableExists(handle, 'ComplaintAttachment')) {
      handle.exec('ALTER TABLE ComplaintAttachment_new RENAME TO ComplaintAttachment')
    } else {
      handle.exec('DROP TABLE ComplaintAttachment_new')
    }
    console.warn('[db] 清理残留的 ComplaintAttachment_new')
  }
}

function migrateSplitComplaint(handle: SqliteHandle): void {
  if (!tableExists(handle, 'Complaint') || tableExists(handle, 'Clue')) return
  const columns = handle.prepare("PRAGMA table_info('Complaint')").all() as unknown as Array<{ name: string }>
  if (!columns.some((item) => item.name === 'Category')) return
  console.log('[db] 检测到单表结构，开始拆分：Complaint(信访件) + Clue(问题线索)')
  handle.pragma('foreign_keys = OFF')
  try {
    handle.transaction(() => {
      // 关键：视图里引用了 Clue，若先 RENAME 会让 SQLite 重新解析视图而报
      // 「error in view ComplaintAll: no such table: main.Clue」，必须先拆视图
      dropStaleViews(handle)
      handle.exec(`CREATE TABLE ComplaintAttachment_new (
        Id INTEGER PRIMARY KEY AUTOINCREMENT,
        OriginalCode TEXT NOT NULL,
        FileName TEXT NOT NULL,
        FilePath TEXT NOT NULL,
        FileSize INTEGER,
        FileType TEXT,
        UploadTime DATETIME NOT NULL,
        Uploader TEXT
      )`)
      if (tableExists(handle, 'ComplaintAttachment')) {
        handle.exec(`INSERT INTO ComplaintAttachment_new (Id, OriginalCode, FileName, FilePath, FileSize, FileType, UploadTime, Uploader)
          SELECT Id, OriginalCode, FileName, FilePath, FileSize, FileType, UploadTime, Uploader FROM ComplaintAttachment`)
        handle.exec('DROP TABLE ComplaintAttachment')
      }
      handle.exec('ALTER TABLE ComplaintAttachment_new RENAME TO ComplaintAttachment')
      handle.exec('ALTER TABLE Complaint RENAME TO Complaint_legacy')
      handle.exec(COMPLAINT_TABLE_DDL('Complaint'))
      handle.exec(COMPLAINT_TABLE_DDL('Clue'))
      const isClue = "Category IN ('0', '问题线索')"
      // 老库的列顺序可能和新表不同（IsDeleted/DeleteTime 是后加的），按名字取交集，别用 SELECT *
      const newCols = (handle.prepare("PRAGMA table_info('Clue')").all() as unknown as Array<{ name: string }>).map((c) => c.name)
      const legacyCols = new Set(
        (handle.prepare("PRAGMA table_info('Complaint_legacy')").all() as unknown as Array<{ name: string }>).map((c) => c.name),
      )
      const shared = newCols.filter((name) => legacyCols.has(name))
      const colList = shared.map((name) => `"${name}"`).join(', ')
      handle.exec(`INSERT INTO Clue (${colList}) SELECT ${colList} FROM Complaint_legacy WHERE ${isClue}`)
      handle.exec(`INSERT INTO Complaint (${colList}) SELECT ${colList} FROM Complaint_legacy WHERE NOT (${isClue})`)
      handle.exec('DROP TABLE Complaint_legacy')
    })
    const clue = (handle.prepare('SELECT COUNT(*) AS n FROM Clue').get() as { n: number }).n
    const letter = (handle.prepare('SELECT COUNT(*) AS n FROM Complaint').get() as { n: number }).n
    console.log(`[db] 拆分完成：问题线索 ${clue} 条 / 信访件 ${letter} 条`)
  } finally {
    handle.pragma('foreign_keys = ON')
  }
}

export function initDb(): void {
  const p = getPaths()
  fs.mkdirSync(p.attachmentsDir, { recursive: true })
  db = openDatabase(p.dbFile)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  db.pragma('foreign_keys = ON')
  repairBrokenSchema(db)
  // 老库先补列，再拆表；新库直接建表
  if (tableExists(db, 'Complaint') && !tableExists(db, 'Clue')) ensureColumns(db)
  migrateSplitComplaint(db)
  createSchema(db)
  ensureColumns(db)
  try {
    seedIfEmpty(db)
  } catch (error) {
    console.error('[db] 种子数据导入失败：', error)
  }
  const targetsMoved = migrateTargets(db)
  if (targetsMoved > 0) console.log(`[db] 已把 ${targetsMoved} 条记录的被反映人迁入子表 ComplaintTarget`)
  const dictNormalized = normalizeDictStoredValues()
  if (dictNormalized > 0) console.log(`[db] 已将 ${dictNormalized} 个字典字段值由代码改为显示值`)
  const normalized = normalizeAttachmentPaths()
  if (normalized > 0) console.log(`[db] 已将 ${normalized} 条附件路径改为相对路径`)
  const organized = organizeAttachments()
  if (organized > 0) console.log(`[db] 已将 ${organized} 个附件按原始编号归入子目录`)
  const overdueSynced = syncOverdueFlags(db)
  if (overdueSynced > 0) console.log(`[db] 已自动校正 ${overdueSynced} 条记录的是否超期`)
  const upgraded = upgradePlainPasswords()
  if (upgraded > 0) console.log(`[db] 已将 ${upgraded} 个明文密码升级为 scrypt 哈希`)
}

function conn(): SqliteHandle {
  if (!db) throw new Error('数据库尚未初始化')
  return db
}

export function now(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function toSessionUser(row: UserRow): SessionUser {
  return {
    id: row.Id,
    username: row.Username,
    realName: row.RealName ?? row.Username,
    role: row.Role || 'User',
    department: row.Department ?? '',
  }
}

export function findUserByLogin(username: string, password: string): UserRow | null {
  const c = conn()
  const row = c
    .prepare('SELECT * FROM Users WHERE Username = @username AND IsActive = 1 AND IsDeleted = 0')
    .get({ username }) as unknown as UserRow | undefined
  if (!row) return null
  const result = verifyPassword(password, row.Password)
  if (!result.ok) return null
  if (result.legacy) {
    c.prepare('UPDATE Users SET Password = @password WHERE Id = @id').run({
      id: row.Id,
      password: hashPassword(password),
    })
  }
  return row
}

/** 把库里遗留的明文密码统一升级为 scrypt 哈希（老库进来自动迁移） */
export function upgradePlainPasswords(): number {
  const c = conn()
  const rows = c.prepare('SELECT Id, Password FROM Users').all() as unknown as Array<{
    Id: number
    Password: string | null
  }>
  let changed = 0
  for (const row of rows) {
    if (isHashed(row.Password)) continue
    c.prepare('UPDATE Users SET Password = @password WHERE Id = @id').run({
      id: row.Id,
      password: hashPassword(row.Password ?? ''),
    })
    changed += 1
  }
  return changed
}

export function restoreUser(id: number): number {
  return conn().prepare('UPDATE Users SET IsDeleted = 0, DeleteTime = NULL, IsActive = 1 WHERE Id = @id AND IsDeleted = 1').run({ id }).changes
}

export function getUserById(id: number): UserRow | null {
  return (conn().prepare('SELECT * FROM Users WHERE Id = @id AND IsDeleted = 0').get({ id }) as unknown as UserRow) ?? null
}

export function touchLogin(id: number, ip: string): void {
  conn()
    .prepare('UPDATE Users SET LastLoginTime = @time, LastLoginIP = @ip WHERE Id = @id')
    .run({ id, time: now(), ip })
}

export function listUsers(deleted = false): UserRow[] {
  return conn()
    .prepare(`SELECT * FROM Users WHERE IsDeleted = ${deleted ? 1 : 0} ORDER BY Id`)
    .all() as unknown as UserRow[]
}

export interface UserInput {
  id?: number
  username: string
  password?: string
  realName: string
  role: string
  department: string
  email: string
  phone: string
  isActive: number
}

export function saveUser(input: UserInput): number {
  const c = conn()
  const time = now()
  if (input.id) {
    const sets = [
      'RealName = @realName',
      'Role = @role',
      'Department = @department',
      'Email = @email',
      'Phone = @phone',
      'IsActive = @isActive',
    ]
    const params: Record<string, unknown> = {
      id: input.id,
      realName: input.realName,
      role: input.role,
      department: input.department,
      email: input.email,
      phone: input.phone,
      isActive: input.isActive,
    }
    if (input.password) {
      sets.push('Password = @password')
      params.password = hashPassword(input.password)
    }
    c.prepare(`UPDATE Users SET ${sets.join(', ')} WHERE Id = @id`).run(params)
    return input.id
  }
  const info = c
    .prepare(
      `INSERT INTO Users (Username, Password, RealName, Role, Department, Email, Phone, IsActive, CreateTime)
       VALUES (@username, @password, @realName, @role, @department, @email, @phone, @isActive, @createTime)`,
    )
    .run({
      username: input.username,
      password: hashPassword(input.password ?? ''),
      realName: input.realName,
      role: input.role,
      department: input.department,
      email: input.email,
      phone: input.phone,
      isActive: input.isActive,
      createTime: time,
    })
  return Number(info.lastInsertRowid)
}

export interface ProfileInput {
  id: number
  realName: string
  department: string
  email: string
  phone: string
}

/** 登录用户维护自己的基本信息（不含用户名、角色、启用状态） */
export function updateProfile(input: ProfileInput): void {
  conn()
    .prepare(
      `UPDATE Users
       SET RealName = @realName, Department = @department, Email = @email, Phone = @phone
       WHERE Id = @id AND IsDeleted = 0`,
    )
    .run({ ...input })
}

export function deleteUser(id: number): void {
  conn()
    .prepare('UPDATE Users SET IsDeleted = 1, DeleteTime = @time, IsActive = 0 WHERE Id = @id')
    .run({ id, time: now() })
}

export function changePassword(id: number, password: string): void {
  conn()
    .prepare('UPDATE Users SET Password = @password WHERE Id = @id')
    .run({ id, password: hashPassword(password) })
}

/**
 * 业务数据里带字典的字段一律存「显示值」(DictionaryItem.ItemValue)，不再存字典代码 (ItemKey)，
 * 以免字典代码在版本之间漂移后旧数据读不出来。早期数据/导入模板里可能仍是代码，
 * 下面几个辅助函数让筛选、统计同时兼容两种写法。
 */
function dictValueOf(className: string, stored: unknown): string {
  const text = stored === null || stored === undefined ? '' : String(stored)
  if (!text) return ''
  const row = conn()
    .prepare(
      `SELECT i.ItemValue AS v FROM DictionaryItem i JOIN DictionaryClass c ON c.Id = i.ClassId
       WHERE c.ClassName = @className AND i.IsDeleted = 0 AND c.IsDeleted = 0
         AND (i.ItemValue = @text OR i.ItemKey = @text)
       ORDER BY CASE WHEN i.ItemValue = @text THEN 0 ELSE 1 END LIMIT 1`,
    )
    .get({ className, text }) as { v: string } | undefined
  return row?.v ?? text
}

/** 存储值是否等于某个字典代码（写代码或写显示值都算命中） */
export function dictIs(className: string, stored: unknown, code: string): boolean {
  const text = stored === null || stored === undefined ? '' : String(stored)
  if (!text) return false
  return text === code || text === dictValueOf(className, code)
}

/** 生成 `字段 IN (代码, 显示值)` 的 SQL 片段，参数写入 params */
function dictIn(
  field: string,
  className: string,
  code: string,
  prefix: string,
  params: Record<string, string>,
): string {
  params[`${prefix}Key`] = code
  params[`${prefix}Value`] = dictValueOf(className, code)
  return `${field} IN (@${prefix}Key, @${prefix}Value)`
}

const TAB_DICTS: Record<string, { field: string; className: string; code: string }> = {
  real: { field: 'ReportForm', className: '举报形式', code: 'JB1001' },
  anonymous: { field: 'ReportForm', className: '举报形式', code: 'JB1002' },
  processing: { field: 'IsCompleted', className: '是否办结', code: 'BJ1002' },
  completed: { field: 'IsCompleted', className: '是否办结', code: 'BJ1001' },
  overdue: { field: 'IsOverdue', className: '是否超期', code: 'CQ1001' },
}

function buildComplaintWhere(filter: ComplaintFilter): { where: string; params: Record<string, string> } {
  const clauses: string[] = []
  const params: Record<string, string> = {}
  if (filter.deleted) {
    clauses.push('IsDeleted = 1')
    return { where: `WHERE ${clauses.join(' AND ')}`, params }
  }
  clauses.push('IsDeleted = 0')
  const tab = filter.tab === 'overdue' ? undefined : filter.tab ? TAB_DICTS[filter.tab] : undefined
  if (filter.tab === 'overdue') clauses.push(overdueClause())
  else if (tab) clauses.push(dictIn(tab.field, tab.className, tab.code, 'tab', params))
  if (filter.category) {
    clauses.push(dictIn('Category', '信访类别', filter.category, 'cat', params))
  }
  if (filter.parent === 'none') {
    clauses.push("(ParentCode IS NULL OR ParentCode = '')")
  } else if (filter.parent === 'any') {
    clauses.push("(ParentCode IS NOT NULL AND ParentCode <> '')")
  }
  if (filter.clue) {
    clauses.push('ParentCode = @clue')
    params.clue = filter.clue
  }
  if (filter.code) {
    clauses.push('OriginalCode = @fcode')
    params.fcode = filter.code
  }
  if (filter.isOverdue) {
    clauses.push(dictIn('IsOverdue', '是否超期', filter.isOverdue, 'fov', params))
  }
  if (filter.reportForm) {
    clauses.push(dictIn('ReportForm', '举报形式', filter.reportForm, 'frf', params))
  }
  if (filter.isCompleted) {
    clauses.push(dictIn('IsCompleted', '是否办结', filter.isCompleted, 'fic', params))
  }
  if (filter.disposeForm) {
    clauses.push(dictIn('DisposeForm', '处置形态', filter.disposeForm, 'fdf', params))
  }
  if (filter.late === '1') {
    clauses.push(`IsLateCompleted = '是'`)
  }
  const keyword = filter.keyword?.trim()
  if (keyword) {
    clauses.push(
      "(OriginalCode LIKE @kw OR NewCode LIKE @kw OR CategoryCode LIKE @kw OR TargetName LIKE @kw OR ProblemSummary LIKE @kw OR MainHandler LIKE @kw)",
    )
    params.kw = `%${keyword}%`
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

export function listComplaints(filter: ComplaintFilter): {
  rows: ComplaintRow[]
  total: number
  tabs: Record<string, number>
  childCounts: Record<string, number>
} {
  const pageSize = Math.max(1, Math.min(200, filter.pageSize ?? 20))
  const page = Math.max(1, filter.page ?? 1)
  const { where, params } = buildComplaintWhere(filter)
  const total = (
    conn().prepare(`SELECT COUNT(*) AS n FROM ComplaintAll ${where}`).get(params) as { n: number }
  ).n
  const rows = conn()
    .prepare(
      `SELECT * FROM ComplaintAll ${where} ORDER BY ${urgencyOrder()} LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize }) as unknown as ComplaintRow[]
  // 被反映人数量（列表显示「等 N 人」，详情用 listTargets 取明细）
  const counts = conn()
    .prepare(
      `SELECT RecordCode, COUNT(*) AS n FROM ComplaintTarget
       WHERE RecordCode IN (${rows.map(() => '?').join(', ') || "''"}) GROUP BY RecordCode`,
    )
    .all(...rows.map((r) => String(r.OriginalCode))) as unknown as Array<{ RecordCode: string; n: number }>
  const countMap = new Map(counts.map((item) => [item.RecordCode, item.n]))
  for (const row of rows) row.TargetCount = countMap.get(String(row.OriginalCode)) ?? 0
  return { rows, total, tabs: tabCounts(filter), childCounts: childCounts(rows) }
}

/**
 * 列表默认排序：越紧急越靠前
 * 0 超期 → 1 临期 → 2 办理中 → 3 已办结；同组内按「期限近→远」，无期限的排后，再按接收时间新→旧。
 * 信访件没填 Deadline 时，按 接收时间 + 设置里的默认办结期 推算（与界面状态色同一套规则）。
 */
function urgencyOrder(): string {
  const settings = readSettings()
  const letterSla = Number.isFinite(settings.letterSlaDays) ? settings.letterSlaDays : 60
  const clueSla = Number.isFinite(settings.clueSlaDays) ? settings.clueSlaDays : 60
  const soon = Number.isFinite(settings.soonDays) ? settings.soonDays : 30
  const eff = `COALESCE(NULLIF(Deadline, ''), CASE WHEN Category IN ('1', '信访件') THEN datetime(ReceiveTime, '+${letterSla} days') WHEN Category IN ('0', '问题线索') THEN datetime(ReceiveTime, '+${clueSla} days') ELSE NULL END)`
  const rank = `CASE
      WHEN IsOverdue IN ('是', 'CQ1001') THEN 0
      WHEN IsCompleted NOT IN ('是', 'BJ1001') AND ${eff} IS NOT NULL AND julianday(${eff}) < julianday('now') THEN 0
      WHEN IsCompleted NOT IN ('是', 'BJ1001') AND ${eff} IS NOT NULL AND julianday(${eff}) - julianday('now') <= ${soon} THEN 1
      WHEN IsCompleted IN ('是', 'BJ1001') THEN 3
      ELSE 2
    END`
  return `${rank} ASC,
    CASE WHEN ${rank} = 3 THEN 0 ELSE COALESCE(julianday(${eff}), 1e12) END ASC,
    ReceiveTime DESC,
    Id DESC`
}

/** 线索 → 名下信访件数量（只统计当前页出现的线索，避免整表扫描） */
function childCounts(rows: ComplaintRow[]): Record<string, number> {
  const codes = rows.filter((row) => dictIs('信访类别', row.Category, '0')).map((row) => String(row.OriginalCode))
  if (!codes.length) return {}
  const params: Record<string, string> = {}
  const holes = codes.map((code, index) => {
    params[`p${index}`] = code
    return `@p${index}`
  })
  const list = conn()
    .prepare(
      `SELECT ParentCode, COUNT(*) AS n FROM ComplaintAll WHERE IsDeleted = 0 AND ParentCode IN (${holes.join(',')}) GROUP BY ParentCode`,
    )
    .all(params) as unknown as Array<{ ParentCode: string; n: number }>
  const map: Record<string, number> = {}
  for (const item of list) map[item.ParentCode] = item.n
  return map
}

/** 线索下拉（归并信访件时选主单） */
export function clueOptions(): Array<{ code: string; name: string; summary: string }> {
  const rows = conn()
    .prepare(
      `SELECT OriginalCode, TargetName, OrganizationName, ProblemSummary FROM ComplaintAll WHERE Category IN (@key, @value) ORDER BY ReceiveTime DESC, Id DESC LIMIT 500`,
    )
    .all({ key: '0', value: dictValueOf('信访类别', '0') }) as unknown as Array<Record<string, string | null>>
  return rows.map((row) => ({
    code: String(row.OriginalCode),
    name: String(row.TargetName || row.OrganizationName || '未填写被反映人'),
    summary: String(row.ProblemSummary || ''),
  }))
}

/** 线索名下的信访件 */
export function lettersOfClue(clueCode: string): ComplaintRow[] {
  return conn()
    .prepare('SELECT * FROM ComplaintAll WHERE IsDeleted = 0 AND ParentCode = @clue ORDER BY ReceiveTime DESC, Id DESC')
    .all({ clue: clueCode }) as unknown as ComplaintRow[]
}

/** 把信访件归并到线索（clueCode 为空表示移出） */
export function assignToClue(codes: string[], clueCode: string | null): number {
  if (!codes.length) return 0
  if (clueCode) {
    const clue = conn()
      .prepare("SELECT Category FROM ComplaintAll WHERE OriginalCode = @code")
      .get({ code: clueCode }) as { Category: string } | undefined
    if (!clue) throw new Error('线索不存在')
    if (!dictIs('信访类别', clue.Category, '0')) throw new Error('只能归并到问题线索')
  }
  const c = conn()
  const time = now()
  const params: Record<string, string | null> = { parent: clueCode, time, catKey: '1', catValue: dictValueOf('信访类别', '1') }
  const holes = codes.map((code, index) => {
    params[`c${index}`] = code
    return `@c${index}`
  })
  const info = c
    .prepare(
      `UPDATE ${KIND_TABLE.letter} SET ParentCode = @parent, ConvertedTime = CASE WHEN @parent IS NULL THEN NULL ELSE ConvertedTime END, UpdateTime = @time WHERE OriginalCode IN (${holes.join(',')}) AND Category IN (@catKey, @catValue)`,
    )
    .run(params)
  return Number(info.changes ?? 0)
}

/** 取给定信访件里「由转化产生关联」的那些编号（常规手工关联不返回） */
export function convertedCodes(codes: string[]): string[] {
  if (!codes.length) return []
  const params: Record<string, string> = {}
  const holes = codes.map((code, index) => {
    params[`c${index}`] = code
    return `@c${index}`
  })
  const rows = conn()
    .prepare(
      `SELECT OriginalCode FROM ${KIND_TABLE.letter} WHERE OriginalCode IN (${holes.join(',')}) AND COALESCE(ConvertedTime, '') <> ''`,
    )
    .all(params) as Array<{ OriginalCode: string }>
  return rows.map((row) => row.OriginalCode)
}

export function complaintsForExport(
  codes?: string[],
  category?: string,
  filter?: ComplaintFilter,
): ComplaintRow[] {
  if (codes?.length) {
    const params: Record<string, string> = {}
    const holes = codes.map((code, index) => {
      params[`c${index}`] = code
      return `@c${index}`
    })
    return conn()
      .prepare(
        `SELECT * FROM ComplaintAll WHERE IsDeleted = 0 AND OriginalCode IN (${holes.join(',')}) ORDER BY ReceiveTime DESC, Id DESC`,
      )
      .all(params) as unknown as ComplaintRow[]
  }
  if (filter) {
    const { where, params } = buildComplaintWhere(filter)
    return conn()
      .prepare(`SELECT * FROM ComplaintAll ${where} ORDER BY ${urgencyOrder()} LIMIT 5000`)
      .all(params) as unknown as ComplaintRow[]
  }
  if (category) {
    return conn()
      .prepare(
        'SELECT * FROM ComplaintAll WHERE IsDeleted = 0 AND Category IN (@key, @value) ORDER BY ReceiveTime DESC, Id DESC',
      )
      .all({ key: category, value: dictValueOf('信访类别', category) }) as unknown as ComplaintRow[]
  }
  return conn()
    .prepare('SELECT * FROM ComplaintAll WHERE IsDeleted = 0 ORDER BY ReceiveTime DESC, Id DESC')
    .all() as unknown as ComplaintRow[]
}

/** 超期口径：显式标记超期，或未办结且到期时间已过（与列表行状态保持一致） */
/** JS 侧同口径判断（概览/月度统计是逐行算的，别和 SQL 那份走偏） */
function overdueOf(row: ComplaintRow, letterSla: number, clueSla: number): boolean {
  if (dictIs('是否超期', row.IsOverdue, 'CQ1001')) return true
  if (dictIs('是否办结', row.IsCompleted, 'BJ1001')) return false
  const raw = String(row.Deadline ?? '').trim()
  const base = raw || String(row.ReceiveTime ?? '').trim()
  if (!base) return false
  const start = new Date(base.replace(' ', 'T')).getTime()
  if (Number.isNaN(start)) return false
  const due = raw
    ? start
    : dictIs('信访类别', row.Category, '1')
      ? start + letterSla * 86400000
      : dictIs('信访类别', row.Category, '0')
        ? start + clueSla * 86400000
        : NaN
  return Number.isNaN(due) ? false : due < Date.now()
}

/** 把「是否超期」列按到期日与办结状态自动校正（写入库，保证与其他页面口径一致） */
/** 仅按「办结时间晚于到期日」判「超期办结」（写回用） */
function lateCompletedWriteClause(): string {
  const cfg = readSettings()
  return `(IsCompleted IN ('是', 'BJ1001') AND COALESCE(NULLIF(CompleteTime, ''), '') <> '' AND COALESCE(NULLIF(Deadline, ''), CASE WHEN Category IN ('1', '信访件') THEN datetime(ReceiveTime, '+${cfg.letterSlaDays} days') WHEN Category IN ('0', '问题线索') THEN datetime(ReceiveTime, '+${cfg.clueSlaDays} days') ELSE NULL END) < datetime(CompleteTime))`
}

/** 仅按日期与办结状态判超期（写回时用；不能带 IsOverdue 自身，否则永远为真、无法回退） */
function overdueWriteClause(): string {
  const cfg = readSettings()
  return `(IsCompleted NOT IN ('是', 'BJ1001') AND COALESCE(NULLIF(Deadline, ''), CASE WHEN Category IN ('1', '信访件') THEN datetime(ReceiveTime, '+${cfg.letterSlaDays} days') WHEN Category IN ('0', '问题线索') THEN datetime(ReceiveTime, '+${cfg.clueSlaDays} days') ELSE NULL END) < datetime('now'))`
}

export function syncOverdueFlags(handle: SqliteHandle): number {
  const clause = overdueWriteClause()
  const late = lateCompletedWriteClause()
  let changed = 0
  for (const table of ['Clue', 'Complaint']) {
    changed += handle
      .prepare(`UPDATE ${table} SET IsOverdue = '是' WHERE ${clause} AND COALESCE(IsOverdue, '') <> '是'`)
      .run().changes
    changed += handle
      .prepare(`UPDATE ${table} SET IsOverdue = '否' WHERE NOT ${clause} AND COALESCE(IsOverdue, '') <> '否'`)
      .run().changes
    changed += handle
      .prepare(`UPDATE ${table} SET IsLateCompleted = '是' WHERE ${late} AND COALESCE(IsLateCompleted, '') <> '是'`)
      .run().changes
    changed += handle
      .prepare(`UPDATE ${table} SET IsLateCompleted = '否' WHERE NOT ${late} AND COALESCE(IsLateCompleted, '') <> '否'`)
      .run().changes
  }
  return changed
}

/** 供主进程定时调用：用当前连接校正一次「是否超期 / 超期办结」 */
export function syncTimelinessNow(): number {
  if (!db) return 0
  return syncOverdueFlags(db)
}

export function overdueClause(): string {
  const settings = readSettings()
  const letterSla = settings.letterSlaDays
  const clueSla = settings.clueSlaDays
  return `(IsOverdue IN ('是', 'CQ1001') OR (IsCompleted NOT IN ('是', 'BJ1001') AND COALESCE(NULLIF(Deadline, ''), CASE WHEN Category IN ('1', '信访件') THEN datetime(ReceiveTime, '+${letterSla} days') WHEN Category IN ('0', '问题线索') THEN datetime(ReceiveTime, '+${clueSla} days') ELSE NULL END) < datetime('now')))`
}

export function tabCounts(filter: ComplaintFilter = {}): Record<string, number> {
  const c = conn()
  const base = buildComplaintWhere({ ...filter, tab: undefined })
  const inner = base.where.replace(/^WHERE /, '')
  const count = (clause?: string, extra?: Record<string, string>): number => {
    const parts = [inner, clause].filter(Boolean).join(' AND ')
    const sql = `SELECT COUNT(*) AS n FROM ComplaintAll ${parts ? `WHERE ${parts}` : ''}`
    return (c.prepare(sql).get({ ...base.params, ...extra }) as { n: number }).n
  }
  const bucket = (field: string, className: string, code: string): number => {
    const params: Record<string, string> = {}
    const clause = dictIn(field, className, code, field, params)
    return count(clause, params)
  }
  return {
    all: count(),
    real: bucket('ReportForm', '举报形式', 'JB1001'),
    anonymous: bucket('ReportForm', '举报形式', 'JB1002'),
    processing: bucket('IsCompleted', '是否办结', 'BJ1002'),
    completed: bucket('IsCompleted', '是否办结', 'BJ1001'),
    overdue: count(overdueClause()),
  }
}

export type ComplaintDetail = ComplaintRow & { Targets?: TargetInput[] }

export function getComplaint(originalCode: string): ComplaintDetail | null {
  const row =
    (conn()
      .prepare('SELECT * FROM ComplaintAll WHERE OriginalCode = @code')
      .get({ code: originalCode }) as unknown as ComplaintRow) ?? null
  if (!row) return null
  const targets = listTargets(originalCode)
  return { ...row, Targets: targets.length ? targets : undefined } as unknown as ComplaintDetail
}

/** 原始编号按表各自成流水：线索用 Clue 的号段，信访件用 Complaint 的号段，互不占号 */
/** 原始编号前缀：信访件 XF、问题线索 XS，一眼区分类型 */
export const CODE_PREFIX: Record<RecordKind, string> = { letter: 'XF', clue: 'XS' }

export function nextOriginalCode(kind: RecordKind = 'letter'): string {
  const head = CODE_PREFIX[kind] + now().slice(0, 10).replace(/-/g, '')
  const seqAt = head.length + 1
  const table = KIND_TABLE[kind]
  const row = conn()
    .prepare(
      `SELECT MAX(CAST(SUBSTR(OriginalCode, ${seqAt}) AS INTEGER)) AS seq FROM ${table} WHERE OriginalCode LIKE @p`
    )
    .get({ p: `${head}%` }) as { seq: number | null }
  const seq = (row.seq ?? 0) + 1
  return `${head}${String(seq).padStart(3, '0')}`
}

/** 转为线索时只带走的登记类字段（办理/分办/处置/签批留在原信访件上） */
const CLUE_BASIC_FIELDS = [
  'ClueSource',
  'ReceiveTime',
  'TargetType',
  'TargetName',
  'IdCard',
  'BirthDate',
  'Gender',
  'WorkExperience',
  'OrganizationName',
  'LegalPerson',
  'ContactPhone',
  'ContactAddress',
  'TargetPost',
  'TargetRank',
  'PoliticalStatus',
  'ProblemSummary',
  'ReportForm',
  'ReportName',
  'ReportPhone',
  'RealNameReport',
  'Remark',
]

/**
 * 信访件 → 线索：新建一条线索（取 Clue 自己的流水号），原信访件原样保留，并把它的 ParentCode 指向新线索。
 * mode='basic' 只复制登记信息；mode='full' 连办理结果一起复制。
 */
export function convertLetterToClue(letterCode: string, mode: 'basic' | 'full'): string {
  const c = conn()
  const row = c.prepare('SELECT * FROM Complaint WHERE OriginalCode = @code').get({ code: letterCode }) as
    | Record<string, string | null>
    | undefined
  if (!row) throw new Error('信访件不存在')
  if (row.ParentCode) throw new Error(`该信访件已关联线索 ${row.ParentCode}，如需再次转化请先移出`)
  const code = nextOriginalCode('clue')
  const time = now()
  const data: Record<string, string | null> = {}
  if (mode === 'full') {
    for (const [k, v] of Object.entries(row)) {
      if (k === 'Id') continue
      data[k] = v === null || v === undefined ? null : String(v)
    }
  } else {
    for (const k of CLUE_BASIC_FIELDS) if (k in row) data[k] = row[k]
    data.IsCompleted = '否'
    data.IsOverdue = '否'
  }
  data.OriginalCode = code
  data.Category = '问题线索'
  data.ParentCode = null
  data.IsDeleted = '0'
  data.DeleteTime = null
  data.CreateTime = time
  data.UpdateTime = time
  const cols = Object.keys(data)
  c.transaction(() => {
    c.prepare(
      `INSERT INTO Clue (${cols.map((k) => `"${k}"`).join(', ')}) VALUES (${cols.map((k) => `@${k}`).join(', ')})`,
    ).run(data)
    // ConvertedTime 标记「这条关联是转化生成的」，用来区分常规手工关联
    c.prepare(
      'UPDATE Complaint SET ParentCode = @code, ConvertedTime = @time, UpdateTime = @time WHERE OriginalCode = @letter',
    ).run({
      code,
      time,
      letter: letterCode,
    })
    // 被反映人整份搬到新线索（basic 模式下主表字段是从信访件复制过来的，子表同理）
    const fields = TARGET_FIELDS.map((f) => `"${f}"`).join(', ')
    c.prepare(
      `INSERT INTO ComplaintTarget (RecordCode, SortOrder, ${fields}, CreateTime, UpdateTime)
       SELECT @code, SortOrder, ${fields}, @time, @time FROM ComplaintTarget WHERE RecordCode = @letter ORDER BY SortOrder, Id`,
    ).run({ code, time, letter: letterCode })
  })
  return code
}

const tableColumnCache = new Map<string, string[]>()
function tableColumns(table: string): string[] {
  const cached = tableColumnCache.get(table)
  if (cached) return cached
  const cols = (conn().prepare(`PRAGMA table_info('${table}')`).all() as unknown as Array<{ name: string }>).map((c) => c.name)
  tableColumnCache.set(table, cols)
  return cols
}

export interface TargetInput {
  TargetType?: string | null
  TargetName?: string | null
  IdCard?: string | null
  BirthDate?: string | null
  Gender?: string | null
  WorkExperience?: string | null
  OrganizationName?: string | null
  LegalPerson?: string | null
  ContactPhone?: string | null
  ContactAddress?: string | null
  TargetPost?: string | null
  TargetRank?: string | null
  PoliticalStatus?: string | null
}

/** 一条记录的全部被反映人（按 SortOrder） */
/** 批量取被反映人，按 RecordCode 分组（导出时一人一行用） */
export function targetsForCodes(codes: string[]): Record<string, TargetInput[]> {
  const out: Record<string, TargetInput[]> = {}
  if (!codes.length) return out
  const marks = codes.map((_, i) => `@c${i}`).join(', ')
  const params: Record<string, string> = {}
  codes.forEach((code, i) => (params[`c${i}`] = code))
  const rows = conn()
    .prepare(
      `SELECT * FROM ComplaintTarget WHERE RecordCode IN (${marks}) ORDER BY RecordCode, SortOrder, Id`,
    )
    .all(params) as unknown as Array<Record<string, string | null>>
  for (const row of rows) {
    const code = String(row.RecordCode ?? '')
    const item: Record<string, string> = {}
    for (const f of TARGET_FIELDS) item[f] = row[f] === null || row[f] === undefined ? '' : String(row[f])
    ;(out[code] ??= []).push(item as unknown as TargetInput)
  }
  return out
}

export function listTargets(recordCode: string): TargetInput[] {
  return conn()
    .prepare(
      `SELECT ${TARGET_FIELDS.map((f) => `"${f}"`).join(', ')} FROM ComplaintTarget WHERE RecordCode = @code ORDER BY SortOrder, Id`,
    )
    .all({ code: recordCode }) as unknown as TargetInput[]
}

/** 用前端传的数组整体替换某条记录的被反映人；同时把第一位镜像回主表的老字段，保证列表/导出/搜索兼容 */
function replaceTargets(code: string, targets: TargetInput[], time: string): void {
  const c = conn()
  c.prepare('DELETE FROM ComplaintTarget WHERE RecordCode = @code').run({ code })
  const cols = TARGET_FIELDS
  const stmt = c.prepare(
    `INSERT INTO ComplaintTarget (RecordCode, SortOrder, ${cols.map((f) => `"${f}"`).join(', ')}, CreateTime, UpdateTime)
     VALUES (@code, @sort, ${cols.map((f) => `@${f}`).join(', ')}, @time, @time)`,
  )
  targets.forEach((item, index) => {
    const row: Record<string, string | number | null> = { code, sort: index, time }
    for (const field of cols) row[field] = item[field as keyof TargetInput] ?? null
    stmt.run(row)
  })
}

/** 老库升级：主表里有被反映人但子表空的记录，补一条子表记录 */
export function migrateTargets(handle: SqliteHandle): number {
  let moved = 0
  for (const table of ['Complaint', 'Clue']) {
    const rows = handle
      .prepare(
        `SELECT OriginalCode FROM ${table} t
         WHERE (COALESCE(t.TargetName, '') <> '' OR COALESCE(t.OrganizationName, '') <> '')
           AND NOT EXISTS (SELECT 1 FROM ComplaintTarget ct WHERE ct.RecordCode = t.OriginalCode)`,
      )
      .all() as unknown as Array<{ OriginalCode: string }>
    for (const row of rows) {
      const source = handle
        .prepare(`SELECT ${TARGET_FIELDS.map((f) => `"${f}"`).join(', ')} FROM ${table} WHERE OriginalCode = @code`)
        .get({ code: row.OriginalCode }) as Record<string, unknown>
      const bind: Record<string, unknown> = { code: row.OriginalCode, sort: 0, time: now() }
      for (const field of TARGET_FIELDS) bind[field] = source[field] ?? null
      handle
        .prepare(
          `INSERT INTO ComplaintTarget (RecordCode, SortOrder, ${TARGET_FIELDS.map((f) => `"${f}"`).join(', ')}, CreateTime, UpdateTime)
           VALUES (@code, @sort, ${TARGET_FIELDS.map((f) => `@${f}`).join(', ')}, @time, @time)`,
        )
        .run(bind)
      moved += 1
    }
  }
  return moved
}

/** 单条记录保存后立即按到期日校正「是否超期」，避免手工值与颜色不一致 */
function syncOneOverdue(handle: SqliteHandle, table: string, code: string): void {
  handle
    .prepare(`UPDATE ${table} SET IsOverdue = CASE WHEN ${overdueWriteClause()} THEN '是' ELSE '否' END WHERE OriginalCode = @code`)
    .run({ code })
  handle
    .prepare(`UPDATE ${table} SET IsLateCompleted = CASE WHEN ${lateCompletedWriteClause()} THEN '是' ELSE '否' END WHERE OriginalCode = @code`)
    .run({ code })
}

export function saveComplaint(input: Record<string, string | null>, isNew: boolean): string {
  const c = conn()
  const time = now()
  const data: Record<string, string | null> = { ...input }
  delete data.Id // 自增主键不参与写入，也不要当成具名参数
  delete (data as Record<string, unknown>).Targets // 被反映人是子表，不能当主表列
  const targets = Array.isArray((input as Record<string, unknown>).Targets)
    ? ((input as Record<string, unknown>).Targets as TargetInput[])
    : null
  if (targets) {
    const invalid = targets.find(
      (item) => dictIs('被反映人类型', item.TargetType, 'IND') && !String(item.IdCard ?? '').trim(),
    )
    if (invalid) throw new Error('被反映人为个人时，身份证号必填')
    // 第一位镜像回主表老字段
    const primary = targets[0]
    if (primary) for (const field of TARGET_FIELDS) data[field] = (primary[field as keyof TargetInput] as string | null) ?? null
  }
  if (dictIs('信访类别', data.Category, '0')) data.ParentCode = null
  data.CreateTime = isNew ? time : ((input.CreateTime as string) ?? time)
  data.UpdateTime = time
  const code = String(data.OriginalCode)
  const target = KIND_TABLE[kindOfCategory(data.Category)]
  if (dictIs('被反映人类型', data.TargetType, 'IND') && !String(data.IdCard ?? '').trim()) {
    throw new Error('被反映人为个人时，身份证号必填')
  }
  // 只保留目标表真实存在的列，避免外部多传字段导致 Unknown named parameter
  const allowed = new Set(tableColumns(target))
  const columns = Object.keys(data).filter((k) => allowed.has(k))
  const bind: Record<string, string | null> = { OriginalCode: data.OriginalCode }
  for (const k of columns) bind[k] = data[k]
  const current = tableOfCode(code)
  const currentTable = current ? KIND_TABLE[current] : null
  const sets = columns.filter((k) => k !== 'OriginalCode').map((k) => `"${k}" = @${k}`)

  // 两张表各自独立：不允许靠改类别把记录搬走（信访件要保留），转线索请用「转为线索」
  if (currentTable && currentTable !== target) {
    throw new Error('信访件与线索不能直接改类别，请使用「转为线索」')
  }
  const sameTable = currentTable === target
  if (sameTable) {
    const existing = c
      .prepare(`SELECT IsDeleted FROM ${target} WHERE OriginalCode = @code`)
      .get({ code }) as unknown as { IsDeleted: number } | undefined
    if (existing && isNew) {
      c.prepare(`UPDATE ${target} SET ${sets.join(', ')}, IsDeleted = 0, DeleteTime = NULL WHERE OriginalCode = @OriginalCode`).run(bind)
      if (targets) replaceTargets(code, targets, time)
      syncOneOverdue(c, target, code)
      return code
    }
    if (existing && !isNew) {
      c.prepare(`UPDATE ${target} SET ${sets.join(', ')} WHERE OriginalCode = @OriginalCode`).run(bind)
      if (targets) replaceTargets(code, targets, time)
      syncOneOverdue(c, target, code)
      return code
    }
  }
  const sql = `INSERT INTO ${target} (${columns.map((k) => `"${k}"`).join(', ')}) VALUES (${columns
    .map((k) => `@${k}`)
    .join(', ')})`
  c.prepare(sql).run(bind)
  if (targets) replaceTargets(code, targets, time)
  syncOneOverdue(c, target, code)
  return code
}

export function deleteComplaints(codes: string[]): void {
  if (!codes.length) return
  const c = conn()
  const time = now()
  c.transaction(() => {
    for (const code of codes) {
      const kind = tableOfCode(code)
      if (!kind) continue
      c.prepare(`UPDATE ${KIND_TABLE[kind]} SET IsDeleted = 1, DeleteTime = @time WHERE OriginalCode = @code`).run({ code, time })
    }
  })
}

export function restoreComplaints(codes: string[]): number {
  if (!codes.length) return 0
  const c = conn()
  let changed = 0
  c.transaction(() => {
    for (const code of codes) {
      const kind = tableOfCode(code)
      if (!kind) continue
      changed += c
        .prepare(`UPDATE ${KIND_TABLE[kind]} SET IsDeleted = 0, DeleteTime = NULL WHERE OriginalCode = @code AND IsDeleted = 1`)
        .run({ code }).changes
    }
  })
  return changed
}

export function listAttachments(originalCode: string): AttachmentRow[] {
  return conn()
    .prepare('SELECT * FROM ComplaintAttachment WHERE OriginalCode = @code ORDER BY UploadTime DESC')
    .all({ code: originalCode }) as unknown as AttachmentRow[]
}

/** 库里存的附件路径（相对数据目录）→ 绝对路径 */
export function resolveStoredPath(stored: string): string {
  return resolvePath(stored || '')
}

export function getAttachment(id: number): AttachmentRow | null {
  return (
    (conn().prepare('SELECT * FROM ComplaintAttachment WHERE Id = @id').get({ id }) as unknown as AttachmentRow) ??
    null
  )
}

export function addAttachment(row: Omit<AttachmentRow, 'Id'>): number {
  const exists = conn()
    .prepare('SELECT 1 AS x FROM ComplaintAll WHERE OriginalCode = @code')
    .get({ code: row.OriginalCode })
  if (!exists) throw new Error('案件编号不存在，无法添加附件')
  const info = conn()
    .prepare(
      `INSERT INTO ComplaintAttachment (OriginalCode, FileName, FilePath, FileSize, FileType, UploadTime, Uploader)
       VALUES (@OriginalCode, @FileName, @FilePath, @FileSize, @FileType, @UploadTime, @Uploader)`,
    )
    .run({ ...row, FilePath: toRelative(row.FilePath) })
  return Number(info.lastInsertRowid)
}

export function deleteAttachments(ids: number[]): void {
  if (!ids.length) return
  const c = conn()
  c.transaction(() => {
    for (const id of ids) c.prepare('DELETE FROM ComplaintAttachment WHERE Id = @id').run({ id })
  })
}

export interface StatsOverview {
  xfTotal: number
  xsTotal: number
  pending: number
  processing: number
  completed: number
  archived: number
  overdue: number
  overdueRate: number
  completionRate: number
  reportCount: number
  accusationCount: number
  unconverted: number
}

export function overviewStats(): StatsOverview {
  const all = conn().prepare('SELECT * FROM ComplaintAll WHERE IsDeleted = 0').all() as unknown as ComplaintRow[]
  const xs = all.filter((r) => dictIs('信访类别', r.Category, '0'))
  const count = (rows: ComplaintRow[], fn: (r: ComplaintRow) => boolean) => rows.filter(fn).length
  const xsTotal = xs.length
  const completed = count(xs, (r) => dictIs('是否办结', r.IsCompleted, 'BJ1001'))
  const cfg = readSettings()
  const overdue = count(xs, (r) => overdueOf(r, cfg.letterSlaDays, cfg.clueSlaDays))
  const letters = all.filter((r) => dictIs('信访类别', r.Category, '1'))
  return {
    xfTotal: count(all, (r) => dictIs('信访类别', r.Category, '1')),
    xsTotal,
    pending: count(xs, (r) => String(r.DisposeForm ?? '') === '0'),
    processing: count(xs, (r) => dictIs('是否办结', r.IsCompleted, 'BJ1002')),
    completed,
    archived: count(xs, (r) => String(r.DisposeForm ?? '') === '3'),
    overdue,
    overdueRate: xsTotal ? Math.round((overdue / xsTotal) * 10000) / 100 : 0,
    completionRate: xsTotal ? Math.round((completed / xsTotal) * 10000) / 100 : 0,
    reportCount: count(all, (r) => dictIs('举报形式', r.ReportForm, 'JB1001')),
    accusationCount: count(all, (r) => dictIs('举报形式', r.ReportForm, 'JB1002')),
    unconverted: count(letters, (r) => !String(r.ParentCode ?? '').trim()),
  }
}

export interface DashboardExtra {
  statusMix: Array<{ name: string; value: number }>
  durationBuckets: Array<{ name: string; value: number }>
  handlers: Array<{ name: string; value: number }>
  heatmap: Array<{ month: string; days: number[] }>
  targetMix: Array<{ name: string; value: number }>
  funnel: Array<{ name: string; value: number }>
  matrix: { sources: string[]; forms: string[]; values: number[][] }
  monthlyRate: Array<{ month: string; rate: number; count: number }>
}

/** 首页可视化补充统计：状态构成、办理时长、主办人、日历热力、被反映人构成、转化漏斗、来源×形态矩阵 */
export function dashboardStats(): DashboardExtra {
  const cfg = readSettings()
  const all = conn().prepare('SELECT * FROM ComplaintAll WHERE IsDeleted = 0').all() as unknown as ComplaintRow[]
  const day = 86400000
  const nowMs = Date.now()
  const eff = (r: ComplaintRow): number | null => {
    const raw = String(r.Deadline ?? '').trim()
    if (raw) return new Date(raw).getTime()
    if (!r.ReceiveTime) return null
    const isLetter = String(r.Category ?? '').includes('信访')
    const days = isLetter ? cfg.letterSlaDays : cfg.clueSlaDays
    return new Date(r.ReceiveTime).getTime() + days * day
  }
  const done = (r: ComplaintRow): boolean => ['是', 'BJ1001'].includes(String(r.IsCompleted ?? ''))
  const overdue = (r: ComplaintRow): boolean => overdueOf(r, cfg.letterSlaDays, cfg.clueSlaDays)

  const isSoon = (r: ComplaintRow): boolean => {
    if (done(r)) return false
    const t = eff(r)
    return t !== null && t >= nowMs && (t - nowMs) / day <= cfg.soonDays
  }
  const statusMix = [
    { name: '已超期', value: all.filter((r) => !done(r) && overdue(r)).length },
    { name: '临期', value: all.filter((r) => isSoon(r)).length },
    {
      name: '正常办理中',
      value: all.filter((r) => !done(r) && !overdue(r) && !isSoon(r)).length
    },
    { name: '已办结', value: all.filter((r) => done(r)).length }
  ]

  const buckets = [
    { name: '30 天内', from: 0, to: 30 },
    { name: '31–60 天', from: 30, to: 60 },
    { name: '61–90 天', from: 60, to: 90 },
    { name: '90 天以上', from: 90, to: 1e9 }
  ]
  const durationBuckets = buckets.map((b) => ({ name: b.name, value: 0 }))
  for (const r of all) {
    if (!done(r) || !r.ReceiveTime) continue
    const end = String(r.CompleteTime ?? '').trim() || r.UpdateTime
    if (!end) continue
    const days = Math.max(0, Math.round((new Date(end).getTime() - new Date(r.ReceiveTime).getTime()) / day))
    const idx = buckets.findIndex((b) => days > b.from && days <= b.to)
    durationBuckets[idx < 0 ? 3 : idx].value += 1
  }

  const handlerMap = new Map<string, number>()
  for (const r of all) {
    const key = String(r.MainHandler ?? '').trim() || '未指定'
    handlerMap.set(key, (handlerMap.get(key) ?? 0) + 1)
  }
  const handlers = [...handlerMap.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  const heatmap: Array<{ month: string; days: number[] }> = []
  const base = new Date()
  for (let i = 11; i >= 0; i -= 1) {
    const first = new Date(base.getFullYear(), base.getMonth() - i, 1)
    const y = first.getFullYear()
    const m = first.getMonth()
    const total = new Date(y, m + 1, 0).getDate()
    const days = new Array<number>(total).fill(0)
    for (const r of all) {
      if (!r.ReceiveTime) continue
      const d = new Date(r.ReceiveTime)
      if (d.getFullYear() !== y || d.getMonth() !== m) continue
      const idx = d.getDate() - 1
      if (idx >= 0 && idx < total) days[idx] += 1
    }
    heatmap.push({ month: `${y}年${m + 1}月`, days })
  }

  const targetMix = [
    { name: '个人', value: Number((conn().prepare("SELECT COUNT(*) AS n FROM ComplaintTarget WHERE TargetType LIKE '%个人%' AND RecordCode IN (SELECT OriginalCode FROM ComplaintAll WHERE IsDeleted = 0)").get() as { n: number }).n) },
    { name: '单位', value: Number((conn().prepare("SELECT COUNT(*) AS n FROM ComplaintTarget WHERE TargetType LIKE '%单位%' AND RecordCode IN (SELECT OriginalCode FROM ComplaintAll WHERE IsDeleted = 0)").get() as { n: number }).n) }
  ]

  const letters = all.filter((r) => String(r.Category ?? '').includes('信访'))
  const converted = letters.filter((r) => String(r.ParentCode ?? '').trim()).length
  const convertedDone = letters.filter((r) => String(r.ParentCode ?? '').trim() && done(r)).length
  const funnel = [
    { name: '信访件', value: letters.length },
    { name: '已转线索', value: converted },
    { name: '已办结', value: convertedDone }
  ]

  const clueRows = all.filter((r) => !String(r.Category ?? '').includes('信访'))
  const sourceMap = new Map<string, number>()
  const formMap = new Map<string, number>()
  for (const r of clueRows) {
    sourceMap.set(String(r.ClueSource ?? '') || '未填写', (sourceMap.get(String(r.ClueSource ?? '') || '未填写') ?? 0) + 1)
    const f = String(r.DisposeForm ?? '').trim() || '未填写'
    formMap.set(f, (formMap.get(f) ?? 0) + 1)
  }
  const sources = [...sourceMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k)
  const forms = [...formMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k)
  const values = sources.map((src) =>
    forms.map((f) => clueRows.filter((r) => (String(r.ClueSource ?? '') || '未填写') === src && ((String(r.DisposeForm ?? '').trim() || '未填写') === f)).length)
  )

  const monthlyRate: Array<{ month: string; rate: number; count: number }> = heatmap.map((h) => {
    const [y, m] = h.month.replace('月', '').split('年').map((v) => Number(v))
    const inMonth = all.filter((r) => {
      if (!r.ReceiveTime) return false
      const d = new Date(r.ReceiveTime)
      return d.getFullYear() === y && d.getMonth() + 1 === m
    })
    const c = inMonth.length
    const dn = inMonth.filter((r) => done(r)).length
    return { month: h.month, rate: c ? Math.round((dn / c) * 1000) / 10 : 0, count: c }
  })

  return { statusMix, durationBuckets, handlers, heatmap, targetMix, funnel, matrix: { sources, forms, values }, monthlyRate }
}

export function monthlyStats(): Array<{
  monthName: string
  count: number
  completedCount: number
  overdueCount: number
  completionRate: number
}> {
  const cfg = readSettings()
  const all = conn().prepare('SELECT * FROM ComplaintAll WHERE IsDeleted = 0').all() as unknown as ComplaintRow[]
  const out: Array<{
    monthName: string
    count: number
    completedCount: number
    overdueCount: number
    completionRate: number
  }> = []
  const base = new Date()
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1)
    const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const rows = all.filter((r) => String(r.ReceiveTime ?? '').startsWith(prefix))
    const completedCount = rows.filter((r) => dictIs('是否办结', r.IsCompleted, 'BJ1001')).length
    out.push({
      monthName: `${d.getFullYear()}年${d.getMonth() + 1}月`,
      count: rows.length,
      completedCount,
      overdueCount: rows.filter((r) => overdueOf(r, cfg.letterSlaDays, cfg.clueSlaDays)).length,
      completionRate: rows.length ? Math.round((completedCount / rows.length) * 1000) / 10 : 0,
    })
  }
  return out
}

export function groupStats(field: 'ClueSource' | 'DisposeForm' | 'UndertakeDept') {
  const all = conn().prepare('SELECT * FROM ComplaintAll WHERE IsDeleted = 0').all() as unknown as ComplaintRow[]
  const xs = all.filter((r) => dictIs('信访类别', r.Category, '0'))
  const map = new Map<string, number>()
  for (const row of xs) {
    const key = String(row[field] ?? '')
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  const dict = field === 'ClueSource' ? dictOptions('线索来源') : field === 'DisposeForm' ? dictOptions('处置形态') : []
  const label = (key: string) => dict.find((d) => d.value === key)?.label ?? (key || '未填写')
  return [...map.entries()]
    .map(([key, count]) => ({
      key,
      name: label(key),
      count,
      percentage: xs.length ? Math.round((count / xs.length) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count)
}

export function listDictClasses(): DictClassRow[] {
  return conn()
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM DictionaryItem i WHERE i.ClassId = c.Id AND i.IsDeleted = 0) AS itemCount
       FROM DictionaryClass c WHERE c.IsDeleted = 0 ORDER BY c.Id`,
    )
    .all() as unknown as DictClassRow[]
}

export function listDictItems(classId: number): DictItemRow[] {
  const rows = conn()
    .prepare('SELECT * FROM DictionaryItem WHERE IsDeleted = 0 AND ClassId = @classId ORDER BY SortOrder, Id')
    .all({ classId }) as unknown as DictItemRow[]
  return buildDictTree(rows)
}

function buildDictTree(rows: DictItemRow[]): DictItemRow[] {
  const map = new Map<number, DictItemRow>()
  for (const row of rows) map.set(row.Id, { ...row, children: [] })
  const roots: DictItemRow[] = []
  for (const row of map.values()) {
    const parent = row.ParentId ? map.get(row.ParentId) : undefined
    if (parent) parent.children!.push(row)
    else roots.push(row)
  }
  for (const row of map.values()) if (!row.children?.length) delete row.children
  return roots
}

export function dictOptions(className: string): Array<{ label: string; value: string }> {
  const rows = conn()
    .prepare(
      `SELECT i.Id, i.ParentId, i.ItemValue AS ItemValue, i.ItemKey AS ItemKey
       FROM DictionaryItem i JOIN DictionaryClass c ON c.Id = i.ClassId
       WHERE c.ClassName = @className AND i.IsDeleted = 0 AND c.IsDeleted = 0 ORDER BY i.SortOrder, i.Id`,
    )
    .all({ className }) as unknown as Array<{ Id: number; ParentId: number | null; ItemKey: string; ItemValue: string }>
  const childrenOf = new Map<number, typeof rows>()
  const roots: typeof rows = []
  for (const row of rows) {
    if (!row.ParentId) {
      roots.push(row)
      continue
    }
    const list = childrenOf.get(row.ParentId) ?? []
    list.push(row)
    childrenOf.set(row.ParentId, list)
  }
  const flat: Array<{ label: string; value: string }> = []
  for (const root of roots) {
    flat.push({ label: root.ItemValue, value: root.ItemValue })
    for (const child of childrenOf.get(root.Id) ?? []) {
      flat.push({ label: `　${child.ItemValue}`, value: child.ItemValue })
    }
  }
  return flat
}

/** 字典的任一写法（代码或显示值）→ 统一显示值 */
export function dictCanonicalMap(className: string): Record<string, string> {
  const map: Record<string, string> = {}
  const rows = conn()
    .prepare(
      `SELECT i.ItemKey AS ItemKey, i.ItemValue AS ItemValue FROM DictionaryItem i
       JOIN DictionaryClass c ON c.Id = i.ClassId
       WHERE c.ClassName = @className AND i.IsDeleted = 0 AND c.IsDeleted = 0`,
    )
    .all({ className }) as unknown as Array<{ ItemKey: string; ItemValue: string }>
  for (const row of rows) {
    map[row.ItemKey] = row.ItemValue
    map[row.ItemValue] = row.ItemValue
  }
  return map
}

export function dictLabelMap(className: string): Record<string, string> {
  return dictCanonicalMap(className)
}

export function saveDictClass(input: { id?: number; className: string; description: string }): number {
  const c = conn()
  const time = now()
  if (input.id) {
    c.prepare('UPDATE DictionaryClass SET ClassName = @className, Description = @description, UpdateTime = @time WHERE Id = @id').run(
      { id: input.id, className: input.className, description: input.description, time },
    )
    return input.id
  }
  const info = c
    .prepare('INSERT INTO DictionaryClass (ClassName, Description, CreateTime, UpdateTime) VALUES (@className, @description, @time, @time)')
    .run({ className: input.className, description: input.description, time })
  return Number(info.lastInsertRowid)
}

export function deleteDictClass(id: number): void {
  const c = conn()
  c.transaction(() => {
    c.prepare('UPDATE DictionaryItem SET IsDeleted = 1, DeleteTime = @time WHERE ClassId = @id').run({ id, time: now() })
    c.prepare('UPDATE DictionaryClass SET IsDeleted = 1, DeleteTime = @time WHERE Id = @id').run({ id, time: now() })
  })
}

export function saveDictItem(input: {
  id?: number
  classId: number
  parentId: number | null
  itemKey: string
  itemValue: string
  sortOrder: number
  description: string
}): number {
  const c = conn()
  const time = now()
  if (input.id) {
    // node:sqlite 对多余具名参数会直接抛错，更新语句只传它用到的列
    c.prepare(
      `UPDATE DictionaryItem SET ParentId = @parentId, ItemKey = @itemKey, ItemValue = @itemValue,
       SortOrder = @sortOrder, Description = @description, UpdateTime = @time WHERE Id = @id`,
    ).run({
      id: input.id,
      parentId: input.parentId,
      itemKey: input.itemKey,
      itemValue: input.itemValue,
      sortOrder: input.sortOrder,
      description: input.description,
      time,
    })
    return input.id
  }
  // 新增语句用不到 id，带上去会被 node:sqlite 当成未知具名参数直接抛错
  const { id: _id, ...rest } = input
  const info = c
    .prepare(
      `INSERT INTO DictionaryItem (ClassId, ParentId, ItemKey, ItemValue, SortOrder, Description, CreateTime, UpdateTime)
       VALUES (@classId, @parentId, @itemKey, @itemValue, @sortOrder, @description, @time, @time)`,
    )
    .run({ ...rest, time })
  return Number(info.lastInsertRowid)
}

export function deleteDictItem(id: number): void {
  const c = conn()
  c.transaction(() => {
    const time = now()
    c.prepare('UPDATE DictionaryItem SET IsDeleted = 1, DeleteTime = @time WHERE ParentId = @id').run({ id, time })
    c.prepare('UPDATE DictionaryItem SET IsDeleted = 1, DeleteTime = @time WHERE Id = @id').run({ id, time })
  })
}

export function getDictItem(id: number): DictItemRow | null {
  const row = conn().prepare('SELECT * FROM DictionaryItem WHERE Id = @id AND IsDeleted = 0').get({ id }) as unknown as DictItemRow
  return row ?? null
}

export interface LogFilter {
  keyword?: string
  module?: string
  type?: string
  user?: string
  /** 起始日期（含），YYYY-MM-DD */
  from?: string
  /** 结束日期（含），YYYY-MM-DD；查询时按 < 次日零点 处理 */
  to?: string
  page?: number
  pageSize?: number
}

export function addLog(entry: {
  userName: string
  userRealName: string
  userRole: string
  operationType: string
  operationModule: string
  operationContent: string
  targetId?: string
  targetName?: string
  ipAddress?: string
  remark?: string
}): void {
  conn()
    .prepare(
      `INSERT INTO OperationLog (UserName, UserRealName, UserRole, OperationType, OperationModule,
        OperationContent, TargetId, TargetName, IPAddress, OperationTime, Remark)
       VALUES (@userName, @userRealName, @userRole, @operationType, @operationModule,
        @operationContent, @targetId, @targetName, @ipAddress, @time, @remark)`,
    )
    .run({
      ...entry,
      targetId: entry.targetId ?? '',
      targetName: entry.targetName ?? '',
      ipAddress: entry.ipAddress ?? '127.0.0.1',
      remark: entry.remark ?? '',
      time: now(),
    })
}

function buildLogWhere(filter: LogFilter): { where: string; params: Record<string, string> } {
  const clauses: string[] = []
  const params: Record<string, string> = {}
  if (filter.module) {
    clauses.push('OperationModule = @module')
    params.module = filter.module
  }
  if (filter.type) {
    clauses.push('OperationType = @type')
    params.type = filter.type
  }
  if (filter.user) {
    clauses.push('(UserName LIKE @user OR UserRealName LIKE @user)')
    params.user = `%${filter.user}%`
  }
  const keyword = filter.keyword?.trim()
  if (keyword) {
    clauses.push('(OperationContent LIKE @kw OR TargetName LIKE @kw OR TargetId LIKE @kw)')
    params.kw = `%${keyword}%`
  }
  const from = filter.from?.trim()
  if (from) {
    clauses.push('date(OperationTime) >= date(@from)')
    params.from = from
  }
  const to = filter.to?.trim()
  if (to) {
    clauses.push('date(OperationTime) <= date(@to)')
    params.to = to
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

export function logsForExport(filter: LogFilter): LogRow[] {
  const { where, params } = buildLogWhere(filter)
  return conn()
    .prepare(`SELECT * FROM OperationLog ${where} ORDER BY OperationTime DESC, Id DESC`)
    .all(params) as unknown as LogRow[]
}

export function listLogs(filter: LogFilter): { rows: LogRow[]; total: number } {
  const { where, params } = buildLogWhere(filter)
  const pageSize = Math.max(1, Math.min(200, filter.pageSize ?? 20))
  const page = Math.max(1, filter.page ?? 1)
  const total = (
    conn().prepare(`SELECT COUNT(*) AS n FROM OperationLog ${where}`).get(params) as { n: number }
  ).n
  const rows = conn()
    .prepare(`SELECT * FROM OperationLog ${where} ORDER BY OperationTime DESC, Id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize }) as unknown as LogRow[]
  return { rows, total }
}

export function logFacets(): { modules: string[]; types: string[] } {
  const c = conn()
  const modules = (c.prepare('SELECT DISTINCT OperationModule AS v FROM OperationLog ORDER BY v').all() as Array<{ v: string }>).map((r) => r.v)
  const types = (c.prepare('SELECT DISTINCT OperationType AS v FROM OperationLog ORDER BY v').all() as Array<{ v: string }>).map((r) => r.v)
  return { modules, types }
}

/** 附件按「原始编号」分目录存放：<附件目录>/<原始编号>/<时间戳>_<随机>.<ext> */
export function attachmentDir(code: string): string {
  const safe = String(code || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_')
  const dir = path.join(getPaths().attachmentsDir, safe)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function copyAttachmentTo(source: string, targetDir: string): string {
  const stamp = now().replace(/[-: ]/g, '')
  const rand = Math.random().toString(16).slice(2, 10)
  const ext = path.extname(source) || ''
  const dest = path.join(targetDir, `${stamp}_${rand}${ext}`)
  fs.copyFileSync(source, dest)
  return dest
}

/**
 * 历史数据里存的是绝对路径（含早期 .NET 版写进来的 Windows 路径），
 * 统一改写成相对数据目录的路径，保证整个 data 目录搬到 U 盘也能用。
 */
export function normalizeAttachmentPaths(): number {
  const rows = conn().prepare('SELECT Id, FilePath FROM ComplaintAttachment').all() as unknown as Array<{
    Id: number
    FilePath: string
  }>
  const attachmentsBase = path.resolve(getPaths().attachmentsDir)
  let updated = 0
  for (const row of rows) {
    const stored = String(row.FilePath || '')
    if (!stored) continue
    if (!path.isAbsolute(stored) && !path.win32.isAbsolute(stored)) continue // 已经是相对路径
    const absolute = path.isAbsolute(stored) ? stored : ''
    const base = path.basename(stored.replace(/\\/g, '/'))
    let next = ''
    if (absolute && path.resolve(path.dirname(absolute)) === attachmentsBase) {
      next = toRelative(absolute)
    } else if (path.win32.isAbsolute(stored)) {
      // 早期 Windows 版把附件放在它自己的 Attachments 目录，这里按文件名归到本程序的附件目录
      next = toRelative(path.join(attachmentsBase, base))
    } else if (path.resolve(path.dirname(absolute)).startsWith(attachmentsBase + path.sep)) {
      next = toRelative(absolute)
    } else {
      continue // 用户自己指定的外部目录，保持原样
    }
    if (!next || next === stored) continue
    conn().prepare('UPDATE ComplaintAttachment SET FilePath = @rel WHERE Id = @id').run({ rel: next, id: row.Id })
    updated += 1
  }
  return updated
}

/** 老数据整理：把平铺在附件目录里的文件按原始编号搬进子目录 */
export function organizeAttachments(): number {
  const rows = conn()
    .prepare('SELECT Id, OriginalCode, FilePath FROM ComplaintAttachment')
    .all() as unknown as Array<{ Id: number; OriginalCode: string; FilePath: string }>
  let moved = 0
  for (const row of rows) {
    const current = resolvePath(row.FilePath)
    if (!fs.existsSync(current)) continue
    const dir = attachmentDir(row.OriginalCode)
    if (path.dirname(current) === dir) continue
    const target = path.join(dir, path.basename(current))
    try {
      if (!fs.existsSync(target)) fs.renameSync(current, target)
      conn()
        .prepare('UPDATE ComplaintAttachment SET FilePath = @target WHERE Id = @id')
        .run({ target: toRelative(target), id: row.Id })
      moved += 1
    } catch (error) {
      console.error('[db] 附件归位失败：', current, error)
    }
  }
  return moved
}
