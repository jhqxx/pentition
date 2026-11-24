import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export interface AppSettings {
  /** 数据库文件路径；相对路径以数据目录为基准，留空表示 petition.db */
  dbPath: string
  /** 附件目录；相对路径以数据目录为基准，留空表示 Attachments */
  attachmentsDir: string
  /** 信访件未填「办理期限」时，按接收时间 + 该天数推算期限 */
  letterSlaDays: number
  /** 问题线索未填「办理期限」时，按接收时间 + 该天数推算期限 */
  clueSlaDays: number
  /** 距期限不足该天数时标记为「临期」 */
  soonDays: number
  /** 新建表单里「应办结时间」= 处置时间 + 该天数 */
  disposeDays: number
  /** 是否允许把已关联的信访件从线索上取消关联 */
  allowUnlinkClue: boolean
}

export const SLA_DEFAULT_DAYS = 60
export const CLUE_SLA_DEFAULT_DAYS = 60
export const SOON_DEFAULT_DAYS = 15
export const DISPOSE_DEFAULT_DAYS = 30
const DAYS_MIN = 1
const DAYS_MAX = 3650

function clampDays(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(DAYS_MAX, Math.max(DAYS_MIN, Math.round(n)))
}

const FILE_NAME = 'settings.json'

/** 数据目录（便携模式下就是 <程序目录>/data） */
export function baseDir(): string {
  return app.getPath('userData')
}

function file(): string {
  return path.join(baseDir(), FILE_NAME)
}

/** 相对路径以数据目录为基准解析成绝对路径；绝对路径原样返回（兼容老配置） */
export function resolvePath(value: string): string {
  if (!value) return ''
  return path.isAbsolute(value) ? value : path.join(baseDir(), value)
}

/** 落在数据目录内的路径一律存相对形式，整包挪走也找得到 */
export function toRelative(value: string): string {
  if (!value) return ''
  const resolved = resolvePath(value)
  const rel = path.relative(baseDir(), resolved)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return value
  return rel.split(path.sep).join('/')
}

export function defaults(): AppSettings {
  return {
    dbPath: 'petition.db',
    attachmentsDir: 'Attachments',
    letterSlaDays: SLA_DEFAULT_DAYS,
    clueSlaDays: CLUE_SLA_DEFAULT_DAYS,
    soonDays: SOON_DEFAULT_DAYS,
    disposeDays: DISPOSE_DEFAULT_DAYS,
    allowUnlinkClue: true,
  }
}

export function readSettings(): AppSettings {
  const fallback = defaults()
  try {
    const raw = fs.readFileSync(file(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      dbPath: parsed.dbPath?.trim() ? toRelative(parsed.dbPath) : fallback.dbPath,
      attachmentsDir: parsed.attachmentsDir?.trim() ? toRelative(parsed.attachmentsDir) : fallback.attachmentsDir,
      letterSlaDays: clampDays(parsed.letterSlaDays, fallback.letterSlaDays),
      clueSlaDays: clampDays(parsed.clueSlaDays, fallback.clueSlaDays),
      soonDays: clampDays(parsed.soonDays, fallback.soonDays),
      disposeDays: clampDays(parsed.disposeDays, fallback.disposeDays),
      allowUnlinkClue: typeof parsed.allowUnlinkClue === 'boolean' ? parsed.allowUnlinkClue : fallback.allowUnlinkClue,
    }
  } catch {
    return fallback
  }
}

export function writeSettings(next: AppSettings): AppSettings {
  const normalized: AppSettings = {
    dbPath: toRelative(next.dbPath.trim() || defaults().dbPath),
    attachmentsDir: toRelative(next.attachmentsDir.trim() || defaults().attachmentsDir),
    letterSlaDays: clampDays(next.letterSlaDays, SLA_DEFAULT_DAYS),
    clueSlaDays: clampDays(next.clueSlaDays, CLUE_SLA_DEFAULT_DAYS),
    soonDays: clampDays(next.soonDays, SOON_DEFAULT_DAYS),
    disposeDays: clampDays(next.disposeDays, DISPOSE_DEFAULT_DAYS),
    allowUnlinkClue: next.allowUnlinkClue !== false,
  }
  fs.mkdirSync(path.dirname(file()), { recursive: true })
  fs.writeFileSync(file(), `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
  return normalized
}

/** 目标数据库不存在时，把当前库整份复制过去（含 WAL 中的已提交数据） */
export function copyDatabase(from: string, to: string): boolean {
  const source = resolvePath(from)
  const target = resolvePath(to)
  if (!fs.existsSync(source) || fs.existsSync(target)) return false
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(source, target)
  return true
}
