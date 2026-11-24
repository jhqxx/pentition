import fs from 'node:fs'
import path from 'node:path'
import { app, safeStorage } from 'electron'

/**
 * 登录凭据「记住密码」。
 *
 * 支持同时记住多个账号：账号列表按最近登录排序，登录页可下拉选择并自动匹配。
 * 密码只在操作系统提供安全存储（macOS 钥匙串 / Windows DPAPI）时才落盘，
 * 落盘内容为 safeStorage 加密后的密文；加密不可用时只记住账号，
 * 绝不把明文密码写进文件。
 */

export interface RememberedAccount {
  username: string
  /** 已记住的明文密码；只记住账号时为空串 */
  password: string
}

export interface RememberedLogin {
  /** 记住密码的账号，最近的排在前面 */
  accounts: RememberedAccount[]
  /** 上次登录成功的账号，用于默认回填 */
  lastUsername: string
}

export interface SaveResult {
  /** 是否成功记住了密码 */
  saved: boolean
  /** 系统是否提供安全存储；false 时只记住了账号 */
  encrypted: boolean
}

interface StoredAccount {
  username: string
  /** safeStorage 加密后的密文（base64） */
  secret?: string
}

interface StoredFile {
  accounts: StoredAccount[]
  lastUsername?: string
}

/** 最多记住的账号数，超出时丢弃最久未登录的 */
const MAX_ACCOUNTS = 6
const FILE_NAME = 'login.json'

function file(): string {
  return path.join(app.getPath('userData'), FILE_NAME)
}

/** Electron 45 起同步版 isEncryptionAvailable 已弃用，优先用异步版 */
async function encryptionAvailable(): Promise<boolean> {
  try {
    const api = safeStorage as unknown as { isAsyncEncryptionAvailable?: () => Promise<boolean> }
    if (typeof api.isAsyncEncryptionAvailable === 'function') {
      return await api.isAsyncEncryptionAvailable()
    }
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function readFile(): StoredFile {
  let raw: unknown
  try {
    raw = JSON.parse(fs.readFileSync(file(), 'utf8'))
  } catch {
    return { accounts: [] }
  }

  // 兼容旧版单账号格式 { username, secret }
  const legacy = raw as StoredAccount & { accounts?: unknown }
  if (typeof legacy?.username === 'string' && !Array.isArray(legacy.accounts)) {
    const username = legacy.username.trim()
    return { accounts: username ? [{ username, secret: legacy.secret }] : [], lastUsername: username }
  }

  const parsed = raw as StoredFile
  const accounts = Array.isArray(parsed?.accounts)
    ? parsed.accounts
        .filter((a) => a && typeof a.username === 'string' && a.username.trim())
        .map((a) => ({ username: a.username.trim(), secret: a.secret }))
    : []
  return { accounts, lastUsername: parsed?.lastUsername?.trim() || accounts[0]?.username || '' }
}

function write(payload: StoredFile | null): void {
  if (!payload || (!payload.accounts.length && !payload.lastUsername)) {
    try {
      fs.rmSync(file(), { force: true })
    } catch {
      /* ignore */
    }
    return
  }
  fs.mkdirSync(path.dirname(file()), { recursive: true })
  fs.writeFileSync(file(), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

/** Electron 45 起同步版 encrypt/decryptString 已弃用，优先用异步版，避免控制台告警 */
async function encryptString(text: string): Promise<string> {
  const api = safeStorage as unknown as {
    // Electron 45 的异步版本返回 { shouldReEncrypt, result }
    encryptStringAsync?: (value: string) => Promise<Buffer | { shouldReEncrypt?: boolean; result?: Buffer }>
  }
  if (typeof api.encryptStringAsync === 'function') {
    const out = await api.encryptStringAsync(text)
    const buffer = Buffer.isBuffer(out) ? out : Buffer.from(out?.result ?? '')
    return buffer.toString('base64')
  }
  return safeStorage.encryptString(text).toString('base64')
}

async function decrypt(secret?: string): Promise<string> {
  if (!secret) return ''
  try {
    const buffer = Buffer.from(secret, 'base64')
    const api = safeStorage as unknown as {
      decryptStringAsync?: (value: Buffer) => Promise<string | { shouldReEncrypt?: boolean; result?: string }>
    }
    if (typeof api.decryptStringAsync === 'function') {
      const out = await api.decryptStringAsync(buffer)
      return typeof out === 'string' ? out : (out?.result ?? '')
    }
    return safeStorage.decryptString(buffer)
  } catch {
    // 密钥丢失 / 换了机器：退回只记账号
    return ''
  }
}

export async function readLogin(): Promise<RememberedLogin> {
  const stored = readFile()
  const accounts = await Promise.all(
    stored.accounts.map(async (a) => ({ username: a.username, password: await decrypt(a.secret) }))
  )
  return {
    accounts,
    lastUsername: stored.lastUsername || stored.accounts[0]?.username || ''
  }
}

export async function saveLogin(input: {
  remember: boolean
  username: string
  password: string
}): Promise<SaveResult> {
  const username = (input.username ?? '').trim()
  if (!username) return { saved: false, encrypted: await encryptionAvailable() }

  const stored = readFile()
  const others = stored.accounts.filter((a) => a.username !== username)
  const available = await encryptionAvailable()

  if (!input.remember) {
    // 取消勾选：只移除这个账号，其他账号的记住状态不受影响
    write({ accounts: others, lastUsername: username })
    return { saved: false, encrypted: available }
  }

  let account: StoredAccount = { username }
  if (available) {
    try {
      account = { username, secret: await encryptString(input.password ?? '') }
    } catch {
      // 有安全存储但加密失败（如钥匙串被拒绝）：只记账号
      account = { username }
    }
  }

  write({ accounts: [account, ...others].slice(0, MAX_ACCOUNTS), lastUsername: username })
  return { saved: Boolean(account.secret), encrypted: Boolean(account.secret) }
}

/** 清空全部记住的账号（保留上次登录账号，便于回填） */
export function clearLogin(): void {
  const stored = readFile()
  write({ accounts: [], lastUsername: stored.lastUsername })
}
