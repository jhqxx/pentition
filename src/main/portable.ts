import fs from 'node:fs'
import path from 'node:path'

export interface PortableOptions {
  isPackaged: boolean
  exePath: string
  appPath: string
  platform: NodeJS.Platform
}

/**
 * 「随程序一起搬走」的根目录。
 * - 打包后 Windows/Linux：可执行文件所在目录（U 盘里通常就是解压目录）
 * - 打包后 macOS：`.app` 所在目录（exe 在 X.app/Contents/MacOS/ 内，要上退三级）
 * - 开发态：项目根目录
 */
export function portableRoot(options: PortableOptions): string {
  if (!options.isPackaged) return options.appPath
  if (options.platform === 'darwin') {
    return path.resolve(path.dirname(options.exePath), '..', '..', '..')
  }
  return path.dirname(options.exePath)
}

/** 数据目录固定为 `<根目录>/data`，库里不写任何绝对路径，整包复制即可换机器 */
export function portableDataDir(options: PortableOptions): string {
  return path.join(portableRoot(options), 'data')
}

/** 目录可写探测：不能写就退回系统默认位置，避免把应用卡死在只读介质上 */
export function canWriteDir(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true })
    const probe = path.join(dir, `.write-test-${process.pid}`)
    fs.writeFileSync(probe, '')
    fs.rmSync(probe, { force: true })
    return true
  } catch {
    return false
  }
}

const MIGRATE_FILES = ['petition.db', 'petition.db-wal', 'petition.db-shm', 'settings.json', 'login.json']
const MIGRATE_DIRS = ['Attachments']

/**
 * 老版本的数据在系统 userData 下（早期是 petition-desktop，现为 petition）。
 * 首次切到便携目录时整体复制一份，原目录保持不动，随时可以回退。
 */
export function migrateLegacyData(fromDir: string, toDir: string): string[] {
  const moved: string[] = []
  if (!fromDir || path.resolve(fromDir) === path.resolve(toDir)) return moved
  if (!fs.existsSync(fromDir)) return moved
  if (fs.existsSync(path.join(toDir, 'petition.db'))) return moved // 目标已有数据，不覆盖
  try {
    fs.mkdirSync(toDir, { recursive: true })
    for (const name of MIGRATE_FILES) {
      const src = path.join(fromDir, name)
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(toDir, name))
        moved.push(name)
      }
    }
    for (const name of MIGRATE_DIRS) {
      const src = path.join(fromDir, name)
      if (fs.existsSync(src)) {
        fs.cpSync(src, path.join(toDir, name), { recursive: true })
        moved.push(`${name}/`)
      }
    }
  } catch (error) {
    console.error('[portable] 迁移旧数据失败：', error)
  }
  return moved
}
