import type { SqliteHandle } from './sqlite-driver'
import { hashPassword } from './password'
import seed from './seed/petition-seed.json'

/** 两行业务表（Complaint=信访件、Clue=问题线索）字段完全相同，只是分表存放 */
export function COMPLAINT_TABLE_DDL(name: string): string {
  return `CREATE TABLE IF NOT EXISTS ${name} (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    OriginalCode TEXT UNIQUE,
    NewCode TEXT,
    CategoryCode TEXT,
    Category TEXT,
    ParentCode TEXT,
    ConvertedTime TEXT,
    IsDeleted INTEGER DEFAULT 0,
    DeleteTime DATETIME,
    ClueSource TEXT,
    ReceiveTime DATETIME NOT NULL,
    TargetType TEXT,
    TargetName TEXT,
    IdCard TEXT,
    BirthDate DATETIME,
    Gender TEXT,
    WorkExperience TEXT,
    OrganizationName TEXT,
    LegalPerson TEXT,
    ContactPhone TEXT,
    ContactAddress TEXT,
    TargetPost TEXT,
    TargetRank TEXT,
    PoliticalStatus TEXT,
    ProblemSummary TEXT,
    ProblemType TEXT,
    ReportForm TEXT,
    ReportName TEXT,
    ReportPhone TEXT,
    AssignTime DATETIME,
    AssignDept TEXT,
    UndertakeDept TEXT,
    UndertakeForm TEXT,
    DisposeTime DATETIME,
    DisposeMethod TEXT,
    DisposeStatus TEXT,
    Deadline DATETIME,
    DisposeProgress TEXT,
    HandleStatus TEXT,
    DisposeForm TEXT,
    DisposeResult TEXT,
    IsCompleted TEXT,
    CompleteTime DATETIME,
    IsOverdue TEXT,
    IsLateCompleted TEXT,
    OverdueReason TEXT,
    MainHandler TEXT,
    AssistantHandler TEXT,
    AuditHandler TEXT,
    LeaderApproval TEXT,
    ApprovalStatus TEXT,
    RealNameReport TEXT,
    Remark TEXT,
    CreateTime DATETIME NOT NULL,
    UpdateTime DATETIME NOT NULL
  )`
}

export const TABLE_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS Users (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    Username TEXT NOT NULL UNIQUE,
    Password TEXT NOT NULL,
    RealName TEXT,
    Role TEXT DEFAULT 'User',
    Department TEXT,
    Email TEXT,
    Phone TEXT,
    IsActive INTEGER DEFAULT 1,
    IsDeleted INTEGER DEFAULT 0,
    DeleteTime DATETIME,
    CreateTime DATETIME NOT NULL,
    LastLoginTime DATETIME,
    LastLoginIP TEXT
  )`,
  COMPLAINT_TABLE_DDL('Complaint'),
  COMPLAINT_TABLE_DDL('Clue'),
  `CREATE TABLE IF NOT EXISTS ComplaintAttachment (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    OriginalCode TEXT NOT NULL,
    FileName TEXT NOT NULL,
    FilePath TEXT NOT NULL,
    FileSize INTEGER,
    FileType TEXT,
    UploadTime DATETIME NOT NULL,
    Uploader TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS DictionaryClass (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    ClassName TEXT NOT NULL UNIQUE,
    Description TEXT,
    IsDeleted INTEGER DEFAULT 0,
    DeleteTime DATETIME,
    CreateTime DATETIME NOT NULL,
    UpdateTime DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS DictionaryItem (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    ClassId INTEGER NOT NULL,
    ParentId INTEGER,
    ItemKey TEXT NOT NULL,
    ItemValue TEXT NOT NULL,
    SortOrder INTEGER DEFAULT 0,
    Description TEXT,
    CreateTime DATETIME NOT NULL,
    UpdateTime DATETIME NOT NULL,
    IsDeleted INTEGER DEFAULT 0,
    DeleteTime DATETIME,
    FOREIGN KEY(ClassId) REFERENCES DictionaryClass(Id),
    UNIQUE(ClassId, ItemKey)
  )`,
  `CREATE TABLE IF NOT EXISTS ComplaintTarget (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    RecordCode TEXT NOT NULL,
    SortOrder INTEGER DEFAULT 0,
    TargetType TEXT,
    TargetName TEXT,
    IdCard TEXT,
    BirthDate DATETIME,
    Gender TEXT,
    WorkExperience TEXT,
    OrganizationName TEXT,
    LegalPerson TEXT,
    ContactPhone TEXT,
    ContactAddress TEXT,
    TargetPost TEXT,
    TargetRank TEXT,
    PoliticalStatus TEXT,
    CreateTime DATETIME NOT NULL,
    UpdateTime DATETIME NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_target_record ON ComplaintTarget(RecordCode)`,
  `CREATE TABLE IF NOT EXISTS OperationLog (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    UserName TEXT NOT NULL,
    UserRealName TEXT,
    UserRole TEXT,
    OperationType TEXT NOT NULL,
    OperationModule TEXT NOT NULL,
    OperationContent TEXT,
    TargetId TEXT,
    TargetName TEXT,
    IPAddress TEXT,
    OperationTime DATETIME NOT NULL,
    Remark TEXT
  )`,
]

/** 视图会在创建时展开 *，给表补列后必须重建，否则新列在 ComplaintAll 里看不到 */
export function createComplaintAllView(handle: SqliteHandle): void {
  handle.exec('DROP VIEW IF EXISTS ComplaintAll')
  handle.exec('CREATE VIEW ComplaintAll AS SELECT * FROM Complaint UNION ALL SELECT * FROM Clue')
}


/** 被反映人可能多人：每人一条记录，字段与主表里的被反映人字段一一对应 */
export const TARGET_FIELDS = [
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
]

export const COMPLAINT_COLUMNS = [
  'OriginalCode',
  'NewCode',
  'CategoryCode',
  'Category',
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
  'ProblemType',
  'ReportForm',
  'ReportName',
  'ReportPhone',
  'AssignTime',
  'AssignDept',
  'UndertakeDept',
  'UndertakeForm',
  'DisposeTime',
  'DisposeMethod',
  'DisposeStatus',
  'Deadline',
  'DisposeProgress',
  'HandleStatus',
  'DisposeForm',
  'DisposeResult',
  'IsCompleted',
  'CompleteTime',
  'IsOverdue',
  'IsLateCompleted',
  'OverdueReason',
  'MainHandler',
  'AssistantHandler',
  'AuditHandler',
  'LeaderApproval',
  'ApprovalStatus',
  'RealNameReport',
  'Remark',
  'CreateTime',
  'UpdateTime',
] as const

type SeedRow = Record<string, unknown>

const INSERT_ORDER = [
  ['Users', seed.users],
  ['DictionaryClass', seed.dictClasses],
  ['DictionaryItem', seed.dictItems],
  ['ComplaintAttachment', seed.attachments],
  ['OperationLog', seed.logs],
] as const

/** 种子里的信访/线索按 Category 落到各自的表：0=问题线索 → Clue，其余 → Complaint */
function isClueSeed(row: SeedRow): boolean {
  const category = String(row.Category ?? '').trim()
  return category === '0' || category === '问题线索'
}

export function createSchema(conn: SqliteHandle): void {
  for (const ddl of TABLE_DDL) conn.exec(ddl)
  // ComplaintAll：纪检监察业务读操作的统一入口（信访件 ∪ 问题线索）
  createComplaintAllView(conn)
}

export function countRows(conn: SqliteHandle, table: string): number {
  const row = conn.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }
  return row.n
}

export function seedIfEmpty(conn: SqliteHandle): void {
  if (countRows(conn, 'Users') > 0) return
  // 原库存在 2 条指向不存在案件的附件（OriginalCode='asda'），灌种子时关掉外键以原样保留
  conn.pragma('foreign_keys = OFF')
  try {
    conn.transaction(() => {
      for (const [table, rows] of INSERT_ORDER) {
        for (const row of rows as SeedRow[]) {
          const data = table === 'Users' ? { ...row, Password: hashPassword(String(row.Password ?? '')) } : row
          insertRow(conn, table, data)
        }
      }
      for (const row of seed.complaints as SeedRow[]) {
        insertRow(conn, isClueSeed(row) ? 'Clue' : 'Complaint', row)
      }
    })
  } finally {
    conn.pragma('foreign_keys = ON')
  }
}

function insertRow(conn: SqliteHandle, table: string, row: SeedRow): void {
  const cols = Object.keys(row)
  const sql = `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols
    .map((c) => `@${c}`)
    .join(', ')})`
  conn.prepare(sql).run(row)
}
