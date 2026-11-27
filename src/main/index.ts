import { app, BrowserWindow, dialog, nativeTheme, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { initDb, syncTimelinessNow } from './db'
import { logoutCurrentUser, registerIpc } from './ipc'
import { LOGIN_MIN, LOGIN_SIZE } from './windowSizes'

import { canWriteDir, migrateLegacyData, portableDataDir } from './portable'
import { installLogging, logPath } from './logger'

// 数据目录跟着程序走：<程序目录>/data。整个目录复制到 U 盘/另一台机器即可继续用。
// MALL_USER_DATA 仅用于自动化冒烟测试时临时指定数据目录。
const legacyUserData = app.getPath('userData')
// 项目改名（petition-desktop → petition）后，老的 userData 目录还在旧名字下，迁移时两个都找一遍
const previousUserData = path.join(app.getPath('appData'), 'petition-desktop')
const envUserData = process.env['MALL_USER_DATA']
const portableDir = portableDataDir({
  isPackaged: app.isPackaged,
  exePath: app.getPath('exe'),
  appPath: app.getAppPath(),
  platform: process.platform,
})

let dataDir = envUserData ? path.resolve(envUserData) : portableDir
if (!canWriteDir(dataDir)) {
  console.warn(`[portable] ${dataDir} 不可写，回退到系统数据目录 ${legacyUserData}`)
  dataDir = legacyUserData
}
app.setPath('userData', dataDir)

// 首次切到便携目录时，把老版本系统目录里的库/附件复制过来（原目录保留，便于回退）
if (!envUserData) {
  const migrated = migrateLegacyData(legacyUserData, dataDir)
  if (migrated.length) console.log(`[portable] 已从 ${legacyUserData} 迁移：${migrated.join(', ')}`)
  else {
    const older = migrateLegacyData(previousUserData, dataDir)
    if (older.length) console.log(`[portable] 已从旧目录 ${previousUserData} 迁移：${older.join(', ')}`)
  }
}
installLogging(dataDir)
console.log(`[portable] 数据目录：${dataDir}`)

// 全新安装（既没有旧版本数据、data 里也还没有库）时，把随包发布的示例库带过去，
// 保证打开就能看到数据，而不是一张空表。
if (!envUserData && !fs.existsSync(path.join(dataDir, 'petition.db'))) {
  const seedCandidates = [
    path.join(process.resourcesPath ?? '', 'seed', 'petition.db'),
    path.join(__dirname, '../../resources/seed/petition.db'),
  ]
  const seed = seedCandidates.find((item) => item && fs.existsSync(item))
  if (seed) {
    try {
      fs.copyFileSync(seed, path.join(dataDir, 'petition.db'))
      console.log(`[portable] 已复制随包示例数据：${seed}`)
    } catch (error) {
      console.error('[portable] 复制示例数据失败：', error)
    }
  }
}

process.on('uncaughtException', (error) => {
  console.error('[fatal] 未捕获异常：', error)
  try {
    dialog.showErrorBox('程序出错', `${String(error?.message ?? error)}\n\n日志：${logPath()}`)
  } catch {
    /* 放弃弹窗 */
  }
})
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] 未处理的 Promise 拒绝：', reason)
})

// 标题栏跟随品牌浅色界面，避免 Windows 深色模式下标题栏变黑
nativeTheme.themeSource = 'light'

// 开发/预览态的图标；打包后图标已写进可执行文件与 .app，运行时不再需要
const devIconPath = path.join(__dirname, '../../build/icon.png')
const devIcon = fs.existsSync(devIconPath) ? devIconPath : undefined

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let isQuitting = false
let closePromptOpen = false

function createWindow(): void {
  mainWindow = new BrowserWindow({
    // 登录页用紧凑窗口，登录成功后再放大到工作尺寸，避免大片空白
    width: LOGIN_SIZE.width,
    height: LOGIN_SIZE.height,
    minWidth: LOGIN_MIN.width,
    minHeight: LOGIN_MIN.height,
    show: false,
    title: '审查调查工作平台',
    icon: devIcon,
    autoHideMenuBar: true,
    // 自绘标题栏：窗口按钮收进应用内部（L8 设计）
    frame: false,
    backgroundColor: '#eef5fa',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // 点叉号不直接退出：问一句「退出登录，还是最小化」
  mainWindow.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    void promptClose()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

async function promptClose(): Promise<void> {
  if (!mainWindow || closePromptOpen) return
  closePromptOpen = true
  try {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: '关闭窗口',
      message: '要退出登录，还是最小化到后台？',
      detail: '最小化后程序继续在后台运行，点 Dock 图标可以重新打开。',
      buttons: ['最小化', '退出登录', '取消'],
      defaultId: 0,
      cancelId: 2,
      noLink: true
    })
    if (response === 0) {
      mainWindow?.hide()
      return
    }
    if (response === 1) {
      isQuitting = true
      logoutCurrentUser()
      app.quit()
    }
  } finally {
    closePromptOpen = false
  }
}

app.whenReady().then(() => {
  try {
    initDb()
  } catch (error) {
    console.error('[db] 初始化失败：', error)
    const detail = `${String((error as Error)?.message ?? error)}\n\n数据目录：${dataDir}\n日志：${logPath()}`
    dialog.showErrorBox('数据库初始化失败', detail)
    app.quit()
    return
  }
  // 时效状态（是否超期 / 超期办结）每 30 分钟自动重扫一次，跨天不需要重启程序
  const timelinessTimer = setInterval(() => {
    try {
      const changed = syncTimelinessNow()
      if (changed > 0) console.log(`[timeliness] 定时扫描已更新 ${changed} 条记录的时效状态`)
    } catch (error) {
      console.error('[timeliness] 定时扫描失败：', error)
    }
  }, 30 * 60 * 1000)
  timelinessTimer.unref?.()
  if (process.env.MALL_TEST_HOOKS === '1') void exportFixtures()
  registerIpc(() => mainWindow)
  createWindow()

  // macOS 开发态 Dock 图标跟随应用图标，避免显示成 Electron 默认图标
  if (process.platform === 'darwin' && devIcon) app.dock?.setIcon(devIcon)

  async function exportFixtures(): Promise<void> {
  const { mkdirSync, writeFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { app: electronApp } = await import('electron')
  const { buildComplaintWorkbook, buildLogWorkbook, buildStatsWorkbook } = await import('./excel')
  const dir = join(electronApp.getPath('userData'), 'exports')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'complaints.xlsx'), buildComplaintWorkbook())
  writeFileSync(join(dir, 'logs.xlsx'), buildLogWorkbook({}))
  writeFileSync(join(dir, 'stats.xlsx'), buildStatsWorkbook())
  console.log('[test] export fixtures written to', dir)
}

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else if (mainWindow && !mainWindow.isVisible()) mainWindow.show()
  })
})

app.on('second-instance', () => {
  if (mainWindow) {
    if (!mainWindow.isVisible()) mainWindow.show()
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

// Cmd+Q / 系统关机等显式退出不再弹窗
app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// 保证 userData 目录存在（首次启动时 Electron 会在 ready 前创建，这里做兜底）
app.on('will-quit', () => {
  try {
    const dir = app.getPath('userData')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  } catch {
    /* ignore */
  }
})
