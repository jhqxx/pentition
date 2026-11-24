import fs from 'node:fs'
import path from 'node:path'

let logFile: string | null = null
let installed = false

function stamp(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 把控制台输出同时落到 <数据目录>/logs/app-YYYY-MM-DD.log，用户出问题时可直接把文件发回来 */
export function installLogging(dataDir: string): string {
  const dir = path.join(dataDir, 'logs')
  try {
    fs.mkdirSync(dir, { recursive: true })
    const day = new Date().toISOString().slice(0, 10)
    logFile = path.join(dir, `app-${day}.log`)
    fs.appendFileSync(logFile, `\n===== ${stamp()} 启动 v${process.env.npm_package_version ?? ''} =====\n`)
  } catch (error) {
    console.warn('[log] 日志文件不可写，仅输出到控制台：', error)
    logFile = null
    return ''
  }
  if (!installed) {
    installed = true
    for (const level of ['log', 'info', 'warn', 'error'] as const) {
      const original = console[level].bind(console)
      console[level] = (...args: unknown[]): void => {
        original(...args)
        if (!logFile) return
        const text = args
          .map((item) => (item instanceof Error ? `${item.name}: ${item.message}\n${item.stack ?? ''}` : typeof item === 'string' ? item : JSON.stringify(item)))
          .join(' ')
        try {
          fs.appendFileSync(logFile, `[${stamp()}] [${level}] ${text}\n`)
        } catch {
          /* 日志写入失败不影响主流程 */
        }
      }
    }
  }
  return logFile
}

export function logPath(): string {
  return logFile ?? ''
}
