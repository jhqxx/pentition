import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import fs from 'node:fs'
import { COMPLAINT_COLUMNS, EXPORT_COLUMN_GROUPS } from './exportColumns'
import {
  buildComplaintWorkbook, complaintExportPreview,
  buildLogWorkbook,
  buildImportTemplate,
  buildStatsWorkbook,
  parseComplaintWorkbook,
} from './excel'
import { complaintPrintHtml, listPrintHtml } from './print'
import { copyDatabase, defaults, readSettings, writeSettings } from './settings'
import { clearLogin, readLogin, saveLogin } from './credentials'
import { LOGIN_MIN, LOGIN_SIZE, WORK_MIN, WORK_SIZE, resizeTo } from './windowSizes'
import os from 'node:os'
import path from 'node:path'
import {
  addAttachment,
  addLog,
  assignToClue,
  convertedCodes,
  clueOptions,
  lettersOfClue,
  changePassword,
  copyAttachmentTo,
  attachmentDir,
  checkpoint,
  reloadDb,
  deleteAttachments,
  deleteComplaints,
  restoreComplaints,
  restoreUser,
  deleteDictClass,
  deleteDictItem,
  deleteUser,
  dictLabelMap,
  dictOptions,
  getAttachment,
  resolveStoredPath,
  getComplaint,
  getPaths,
  getUserById,
  listAttachments,
  listComplaints,
  listDictClasses,
  listDictItems,
  listLogs,
  listUsers,
  logFacets,
  nextOriginalCode,
  convertLetterToClue,
  kindOfCategory,
  overviewStats,
  monthlyStats,
  groupStats,
  saveComplaint,
  saveDictClass,
  saveDictItem,
  getDictItem,
  saveUser,
  findUserByLogin,
  tabCounts,
  toSessionUser,
  touchLogin,
  updateProfile,
  type ComplaintFilter,
  type SessionUser,
  dashboardStats
} from './db'

let currentUser: SessionUser | null = null

function requireUser(): SessionUser {
  if (!currentUser) throw new Error('请先登录')
  return currentUser
}

function requireAdmin(): SessionUser {
  const user = requireUser()
  if (user.role !== 'Admin') throw new Error('仅管理员可执行该操作')
  return user
}

function ok<T>(data: T) {
  return { ok: true as const, data }
}

function fail(message: string) {
  return { ok: false as const, error: message }
}

function localIp(): string {
  const nets = os.networkInterfaces()
  for (const list of Object.values(nets)) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address
    }
  }
  return '127.0.0.1'
}

function userTag(user: SessionUser): string {
  return `${user.realName}(${user.username})`
}

export function logoutCurrentUser(): void {
  if (currentUser) {
    addLog({
      userName: currentUser.username,
      userRealName: currentUser.realName,
      userRole: currentUser.role,
      operationType: '退出',
      operationModule: '系统登录',
      operationContent: `${userTag(currentUser)} 退出系统`,
      ipAddress: localIp(),
    })
  }
  currentUser = null
}

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  // 自绘标题栏窗口控制（frame:false）
  ipcMain.handle('win:minimize', () => {
    getWindow()?.minimize()
    return ok(true)
  })
  ipcMain.handle('win:toggle-maximize', () => {
    const win = getWindow()
    if (!win) return ok(false)
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return ok(win.isMaximized())
  })
  ipcMain.handle('win:close', () => {
    getWindow()?.close()
    return ok(true)
  })

  ipcMain.handle('auth:login', (_e, payload: { username: string; password: string }) => {
    const username = payload.username?.trim() ?? ''
    const password = payload.password ?? ''
    if (!username || !password) return fail('请输入用户名和密码')
    const row = findUserByLogin(username, password)
    if (!row) {
      addLog({
        userName: username,
        userRealName: username,
        userRole: '',
        operationType: '登录失败',
        operationModule: '系统登录',
        operationContent: `用户名或密码错误：${username}`,
        ipAddress: localIp(),
      })
      return fail('用户名或密码错误，或该账号已被禁用')
    }
    currentUser = toSessionUser(row)
    touchLogin(row.Id, localIp())
    addLog({
      userName: currentUser.username,
      userRealName: currentUser.realName,
      userRole: currentUser.role,
      operationType: '登录',
      operationModule: '系统登录',
      operationContent: `${userTag(currentUser)} 登录系统`,
      ipAddress: localIp(),
    })
    // 登录成功后把紧凑的登录窗口放大到工作尺寸
    resizeTo(getWindow(), WORK_SIZE, WORK_MIN)
    return ok(currentUser)
  })

  ipcMain.handle('auth:current', () => ok(currentUser))

  ipcMain.handle('auth:remember:get', async () => ok(await readLogin()))

  ipcMain.handle(
    'auth:remember:save',
    async (_e, payload: { remember: boolean; username: string; password: string }) =>
      ok(await saveLogin(payload))
  )

  ipcMain.handle('auth:remember:clear', () => {
    clearLogin()
    return ok(true)
  })

  ipcMain.handle('auth:logout', () => {
    logoutCurrentUser()
    // 回到登录页时收回紧凑尺寸
    resizeTo(getWindow(), LOGIN_SIZE, LOGIN_MIN)
    return ok(true)
  })

  ipcMain.handle('profile:get', () => {
    const user = requireUser()
    const row = getUserById(user.id)
    if (!row) return fail('用户不存在')
    const { Password: _password, ...rest } = row
    return ok(rest)
  })

  ipcMain.handle(
    'profile:save',
    (_e, input: { realName: string; department: string; email: string; phone: string }) => {
      const user = requireUser()
      const realName = input?.realName?.trim() ?? ''
      if (!realName) return fail('姓名不能为空')
      const department = input?.department?.trim() ?? ''
      updateProfile({
        id: user.id,
        realName,
        department,
        email: input?.email?.trim() ?? '',
        phone: input?.phone?.trim() ?? '',
      })
      currentUser = { ...user, realName, department }
      addLog({
        userName: currentUser.username,
        userRealName: currentUser.realName,
        userRole: currentUser.role,
        operationType: '修改',
        operationModule: '个人信息',
        operationContent: `${userTag(currentUser)} 修改个人信息`,
        ipAddress: localIp(),
      })
      return ok(currentUser)
    },
  )

  ipcMain.handle('profile:password', (_e, payload: { oldPassword: string; newPassword: string }) => {
    const user = requireUser()
    if (!payload?.oldPassword) return fail('请输入原密码')
    if (!payload?.newPassword || payload.newPassword.length < 6) return fail('新密码至少 6 位')
    const row = findUserByLogin(user.username, payload.oldPassword)
    if (!row) return fail('原密码不正确')
    changePassword(user.id, payload.newPassword)
    addLog({
      userName: user.username,
      userRealName: user.realName,
      userRole: user.role,
      operationType: '修改密码',
      operationModule: '个人信息',
      operationContent: `${userTag(user)} 修改登录密码`,
      ipAddress: localIp(),
    })
    return ok(true)
  })

  ipcMain.handle('complaint:list', (_e, filter: ComplaintFilter) => {
    requireUser()
    return ok(listComplaints(filter))
  })

  ipcMain.handle('complaint:clueOptions', () => {
    requireUser()
    return ok(clueOptions())
  })

  ipcMain.handle('complaint:letters', (_e, clueCode: string) => {
    requireUser()
    return ok(lettersOfClue(clueCode))
  })

  ipcMain.handle('complaint:assign', (_e, payload: { codes: string[]; clueCode: string | null }) => {
    const user = requireUser()
    try {
      // 只限制「信访转线索」生成的关联；常规手工关联始终可以取消
      if (!payload.clueCode && !readSettings().allowUnlinkClue) {
        const blocked = convertedCodes(payload.codes ?? [])
        if (blocked.length) {
          return fail(`系统设置里已禁止取消「信访转线索」生成的关联（${blocked.join('、')}）`)
        }
      }
      const changed = assignToClue(payload.codes ?? [], payload.clueCode ?? null)
      addLog({
        userName: user.username,
        userRealName: user.realName,
        userRole: user.role,
        operationType: payload.clueCode ? '关联线索' : '取消关联',
        operationModule: '线索管理',
        operationContent: payload.clueCode
          ? `将信访件 ${payload.codes.join('、')} 关联到线索 ${payload.clueCode}`
          : `取消信访件 ${payload.codes.join('、')} 与线索的关联`,
        targetId: payload.clueCode ?? payload.codes.join(','),
        ipAddress: localIp(),
      })
      return ok(changed)
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error))
    }
  })

  ipcMain.handle('complaint:get', (_e, code: string) => {
    requireUser()
    const row = getComplaint(code)
    return row ? ok(row) : fail('信访记录不存在')
  })

  ipcMain.handle('complaint:nextCode', (_e, kind?: 'clue' | 'letter') => {
    requireUser()
    return ok(nextOriginalCode(kind === 'clue' ? 'clue' : 'letter'))
  })

  ipcMain.handle('complaint:convert', (_e, payload: { code: string; mode?: 'basic' | 'full' }) => {
    const user = requireUser()
    if (!payload?.code) return fail('信访件编号不能为空')
    try {
      const mode = payload.mode === 'full' ? 'full' : 'basic'
      const newCode = convertLetterToClue(payload.code, mode)
      addLog({
        userName: user.username,
        userRealName: user.realName,
        userRole: user.role,
        operationType: '转化',
        operationModule: '信访管理',
        operationContent: `信访件 ${payload.code} 转为线索 ${newCode}（${mode === 'full' ? '含办理信息' : '仅登记信息'}）`,
        targetId: newCode,
        targetName: '',
        ipAddress: localIp(),
      })
      return ok(newCode)
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error))
    }
  })

  ipcMain.handle('complaint:save', (_e, payload: { isNew: boolean; data: Record<string, string | null> }) => {
    const user = requireUser()
    const data = payload.data
    if (!data.OriginalCode) return fail('原始编号不能为空')
    if (!data.ReceiveTime) return fail('接收时间不能为空')
    try {
      const code = saveComplaint(data, payload.isNew)
      addLog({
        userName: user.username,
        userRealName: user.realName,
        userRole: user.role,
        operationType: payload.isNew ? '新增' : '修改',
        operationModule: String(data.Category) === '0' ? '线索管理' : '信访管理',
        operationContent: `${payload.isNew ? '新增' : '修改'}信访记录 ${code}`,
        targetId: code,
        targetName: String(data.TargetName ?? ''),
        ipAddress: localIp(),
      })
      return ok(code)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('UNIQUE')) return fail('原始编号已存在，请更换编号')
      return fail(message)
    }
  })

  // 独立「办理」：只更新处置/办结这一组字段，不走新增时的必填校验，日志单独记「办理」
  ipcMain.handle('complaint:handle', (_e, payload: { data: Record<string, string | null> }) => {
    const user = requireUser()
    const data = payload.data
    if (!data.OriginalCode) return fail('原始编号不能为空')
    try {
      const code = saveComplaint(data, false)
      addLog({
        userName: user.username,
        userRealName: user.realName,
        userRole: user.role,
        operationType: '办理',
        operationModule: String(data.Category) === '0' ? '线索管理' : '信访管理',
        operationContent: `办理信访记录 ${code}${String(data.IsCompleted) === '是' ? '（已办结）' : '（办理中）'}`,
        targetId: code,
        targetName: String(data.TargetName ?? ''),
        ipAddress: localIp(),
      })
      return ok(code)
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error))
    }
  })

  ipcMain.handle('complaint:delete', (_e, codes: string[]) => {
    const user = requireUser()
    if (!codes?.length) return fail('请选择要删除的记录')
    deleteComplaints(codes)
    addLog({
      userName: user.username,
      userRealName: user.realName,
      userRole: user.role,
      operationType: '删除',
      operationModule: '信访管理',
      operationContent: `删除信访记录 ${codes.join('、')}`,
      targetId: codes.join(','),
      ipAddress: localIp(),
    })
    return ok(true)
  })

  ipcMain.handle('dict:classes', () => {
    requireUser()
    return ok(listDictClasses())
  })

  ipcMain.handle('dict:items', (_e, classId: number) => {
    requireUser()
    return ok(listDictItems(classId))
  })

  ipcMain.handle('dict:options', (_e, className: string) => {
    requireUser()
    return ok(dictOptions(className))
  })

  ipcMain.handle('dict:labels', (_e, className: string) => {
    requireUser()
    return ok(dictLabelMap(className))
  })

  ipcMain.handle('dict:class:save', (_e, input: { id?: number; className: string; description: string }) => {
    const user = requireAdmin()
    if (!input.className?.trim()) return fail('字典名称不能为空')
    try {
      const id = saveDictClass({ ...input, className: input.className.trim() })
      addLog({
        userName: user.username,
        userRealName: user.realName,
        userRole: user.role,
        operationType: input.id ? '修改' : '新增',
        operationModule: '基础字典',
        operationContent: `${input.id ? '修改' : '新增'}字典 ${input.className.trim()}`,
        targetId: String(id),
        ipAddress: localIp(),
      })
      return ok(id)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('UNIQUE')) return fail('该字典名称已存在')
      return fail(message)
    }
  })

  ipcMain.handle('dict:class:delete', (_e, id: number) => {
    const user = requireAdmin()
    deleteDictClass(id)
    addLog({
      userName: user.username,
      userRealName: user.realName,
      userRole: user.role,
      operationType: '删除',
      operationModule: '基础字典',
      operationContent: `删除字典 Id=${id}`,
      targetId: String(id),
      ipAddress: localIp(),
    })
    return ok(true)
  })

  ipcMain.handle(
    'dict:item:save',
    (
      _e,
      input: {
        id?: number
        classId: number
        parentId?: number | null
        itemKey: string
        itemValue: string
        sortOrder: number
        description: string
      },
    ) => {
      const user = requireAdmin()
      if (!input.itemKey?.trim()) return fail('键值不能为空')
      if (!input.itemValue?.trim()) return fail('显示值不能为空')
      const parentId = input.parentId ?? null
      // dictDepth：第一级=1、第二级=2、第三级=3；空 parentId 记为 0
      const dictDepth = (id: number | null): number => {
        let depth = 0
        let cursor = id
        const seen = new Set<number>()
        while (cursor && !seen.has(cursor)) {
          seen.add(cursor)
          const row = getDictItem(cursor)
          if (!row) break
          depth += 1
          cursor = row.ParentId ?? null
        }
        return depth
      }
      if (parentId) {
        const parent = getDictItem(parentId)
        if (!parent) return fail('上级字典项不存在')
        // 字典分类算一级，字典项（ParentId 为空）算二级，其子项算三级；所以父级链长达到 2 就不能再挂
        if (dictDepth(parentId) >= 2) return fail('字典最多三级，三级字典项下不能再挂子项')
      }
      if (parentId && input.id) {
        const self = getDictItem(input.id)
        if (self && self.Id === parentId) return fail('不能把自身设为上级')
        // 不能把某项挂到自己的子孙下面（成环）
        let cursor: number | null = parentId
        const seen = new Set<number>()
        while (cursor && !seen.has(cursor)) {
          if (cursor === input.id) return fail('不能把字典项移动到它自己的下级')
          seen.add(cursor)
          const row = getDictItem(cursor)
          cursor = row?.ParentId ?? null
        }
      }
      try {
        const id = saveDictItem({
          ...input,
          parentId,
          itemKey: input.itemKey.trim(),
          itemValue: input.itemValue.trim(),
        })
        addLog({
          userName: user.username,
          userRealName: user.realName,
          userRole: user.role,
          operationType: input.id ? '修改' : '新增',
          operationModule: '基础字典',
          operationContent: `${input.id ? '修改' : '新增'}字典项 ${input.itemValue.trim()}`,
          targetId: String(id),
          ipAddress: localIp(),
        })
        return ok(id)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (message.includes('UNIQUE')) return fail('同一字典下已存在相同的键值')
        return fail(message)
      }
    },
  )

  ipcMain.handle('dict:item:delete', (_e, id: number) => {
    requireAdmin()
    deleteDictItem(id)
    return ok(true)
  })

  ipcMain.handle('attachment:list', (_e, code: string) => {
    requireUser()
    return ok(listAttachments(code))
  })

  ipcMain.handle('attachment:pick', async () => {
    requireUser()
    const win = getWindow()
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'] })
      : await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] })
    if (result.canceled) return ok([])
    return ok(result.filePaths)
  })

  ipcMain.handle(
    'attachment:add',
    (_e, payload: { code: string; files: Array<{ path: string; name: string; size: number; type: string }> }) => {
      const user = requireUser()
      const dir = attachmentDir(payload.code)
      const stored = payload.files.map((file) => {
        const target = copyAttachmentTo(file.path, dir)
        return {
          OriginalCode: payload.code,
          FileName: file.name,
          FilePath: target,
          FileSize: file.size,
          FileType: file.type,
          UploadTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
          Uploader: userTag(user),
        }
      })
      const ids = stored.map((row) => addAttachment(row))
      if (stored.length) {
        addLog({
          userName: user.username,
          userRealName: user.realName,
          userRole: user.role,
          operationType: '上传附件',
          operationModule: '信访管理',
          operationContent: `为 ${payload.code} 上传 ${stored.length} 个附件`,
          targetId: payload.code,
          ipAddress: localIp(),
        })
      }
      return ok(ids)
    },
  )

  ipcMain.handle('attachment:delete', (_e, ids: number[]) => {
    const user = requireUser()
    const files = ids.map((id) => getAttachment(id)).filter((row): row is NonNullable<typeof row> => Boolean(row))
    deleteAttachments(ids)
    for (const file of files) {
      const absolute = resolveStoredPath(file.FilePath)
      try {
        if (fs.existsSync(absolute)) fs.unlinkSync(absolute)
      } catch {
        // 附件文件可能已不存在
      }
    }
    addLog({
      userName: user.username,
      userRealName: user.realName,
      userRole: user.role,
      operationType: '删除附件',
      operationModule: '信访管理',
      operationContent: `删除 ${ids.length} 个附件`,
      ipAddress: localIp(),
    })
    return ok(true)
  })

  ipcMain.handle('attachment:download', async (_e, ids: number[]) => {
    requireUser()
    const rows = ids.map((id) => getAttachment(id)).filter((row): row is NonNullable<typeof row> => Boolean(row))
    if (!rows.length) return fail('没有可下载的附件')
    const win = getWindow()
    const options: Electron.OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'] }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return ok(0)
    const dir = result.filePaths[0]
    let count = 0
    for (const row of rows) {
      const absolute = resolveStoredPath(row.FilePath)
      if (!fs.existsSync(absolute)) continue
      let target = path.join(dir, row.FileName)
      if (fs.existsSync(target)) {
        const ext = path.extname(row.FileName)
        target = path.join(dir, `${path.basename(row.FileName, ext)}_${row.Id}${ext}`)
      }
      fs.copyFileSync(absolute, target)
      count += 1
    }
    return ok(count)
  })

  ipcMain.handle('attachment:open', async (_e, id: number) => {
    requireUser()
    const row = getAttachment(id)
    const absolute = row ? resolveStoredPath(row.FilePath) : ''
    if (!row || !fs.existsSync(absolute)) return fail('文件不存在')
    await shell.openPath(absolute)
    return ok(true)
  })

  ipcMain.handle('users:list', (_e, options?: { deleted?: boolean }) => {
    requireAdmin()
    return ok(listUsers(Boolean(options?.deleted)).map(({ Password: _password, ...rest }) => rest))
  })

  ipcMain.handle('complaint:restore', (_e, codes: string[]) => {
    const user = requireUser()
    if (!codes?.length) return fail('请选择要恢复的记录')
    const changed = restoreComplaints(codes)
    addLog({
      userName: user.username,
      userRealName: user.realName,
      userRole: user.role,
      operationType: '恢复',
      operationModule: '回收站',
      operationContent: `恢复 ${changed} 条记录：${codes.slice(0, 5).join('、')}`,
      targetId: codes[0],
      ipAddress: localIp(),
    })
    return ok(changed)
  })

  ipcMain.handle('users:restore', (_e, id: number) => {
    const admin = requireAdmin()
    const changed = restoreUser(id)
    if (!changed) return fail('该用户不在回收站中')
    addLog({
      userName: admin.username,
      userRealName: admin.realName,
      userRole: admin.role,
      operationType: '恢复',
      operationModule: '用户管理',
      operationContent: `恢复用户 ${id}`,
      targetId: String(id),
      ipAddress: localIp(),
    })
    return ok(changed)
  })

  ipcMain.handle(
    'users:save',
    (
      _e,
      input: {
        id?: number
        username: string
        password?: string
        realName: string
        role: string
        department: string
        email: string
        phone: string
        isActive: number
      },
    ) => {
      const admin = requireAdmin()
      if (!input.username?.trim()) return fail('用户名不能为空')
      if (!input.id && !input.password) return fail('新增用户必须设置密码')
      if (!input.id && String(input.password).length < 6) return fail('初始密码至少 6 位')
      if (input.id && input.password && String(input.password).length < 6)
        return fail('新密码至少 6 位')
      try {
        const id = saveUser({
          ...input,
          username: input.username.trim(),
          isActive: input.isActive ?? 1,
        })
        addLog({
          userName: admin.username,
          userRealName: admin.realName,
          userRole: admin.role,
          operationType: input.id ? '修改' : '新增',
          operationModule: '用户管理',
          operationContent: `${input.id ? '修改' : '新增'}用户 ${input.username.trim()}`,
          targetId: String(id),
          ipAddress: localIp(),
        })
        return ok(id)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (message.includes('UNIQUE')) return fail('用户名已存在')
        return fail(message)
      }
    },
  )

  ipcMain.handle('users:delete', (_e, id: number) => {
    const admin = requireAdmin()
    const target = getUserById(id)
    if (!target) return fail('用户不存在')
    if (target.Username === 'admin') return fail('不能删除管理员账户')
    deleteUser(id)
    addLog({
      userName: admin.username,
      userRealName: admin.realName,
      userRole: admin.role,
      operationType: '删除',
      operationModule: '用户管理',
      operationContent: `删除用户 ${target.Username}`,
      targetId: String(id),
      ipAddress: localIp(),
    })
    return ok(true)
  })

  ipcMain.handle('users:resetPassword', (_e, payload: { id: number; password: string }) => {
    const admin = requireAdmin()
    if (!payload.password) return fail('新密码不能为空')
    if (String(payload.password).length < 6) return fail('新密码至少 6 位')
    changePassword(payload.id, payload.password)
    addLog({
      userName: admin.username,
      userRealName: admin.realName,
      userRole: admin.role,
      operationType: '重置密码',
      operationModule: '用户管理',
      operationContent: `重置用户 Id=${payload.id} 的密码`,
      targetId: String(payload.id),
      ipAddress: localIp(),
    })
    return ok(true)
  })

  ipcMain.handle('logs:list', (_e, filter) => {
    requireAdmin()
    return ok(listLogs(filter))
  })

  ipcMain.handle('logs:facets', () => {
    requireAdmin()
    return ok(logFacets())
  })

  ipcMain.handle('stats:overview', () => {
    requireUser()
    return ok(overviewStats())
  })

  ipcMain.handle('stats:monthly', () => {
    requireUser()
    return ok(monthlyStats())
  })

  ipcMain.handle('stats:dashboard', () => {
    requireUser()
    return ok(dashboardStats())
  })

  ipcMain.handle('stats:groups', (_e, field: 'ClueSource' | 'DisposeForm' | 'UndertakeDept') => {
    requireUser()
    return ok(groupStats(field))
  })

  ipcMain.handle('import:template', async () => {
    requireUser()
    const stamp = new Date()
      .toISOString()
      .slice(0, 16)
      .replace(/[-:T]/g, '')
    return saveWorkbook(`信访线索导入模板-${stamp}.xlsx`, buildImportTemplate(), {
      module: '信访管理',
      content: '下载 Excel 导入模板',
    })
  })

  ipcMain.handle('import:complaints', async () => {
    const user = requireUser()
    const win = getWindow()
    const options = {
      properties: ['openFile' as const],
      filters: [{ name: 'Excel 工作簿', extensions: ['xlsx', 'xls'] }],
    }
    const override = process.env.MALL_TEST_HOOKS === '1' ? process.env.MALL_IMPORT_FILE : undefined
    const picked = override
      ? { canceled: false, filePaths: [override] }
      : win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
    if (picked.canceled || !picked.filePaths.length) {
      return ok({ imported: 0, skipped: 0, failed: 0, canceled: true, errors: [] as string[] })
    }
    const file = picked.filePaths[0]
    let parsed
    try {
      parsed = parseComplaintWorkbook(fs.readFileSync(file))
    } catch (error) {
      return fail((error as Error).message)
    }
    let imported = 0
    let skipped = 0
    let failed = 0
    const errors: string[] = []
    for (const item of parsed) {
      const data: Record<string, string | null> = { ...item.row }
      if (!data.OriginalCode) data.OriginalCode = nextOriginalCode(kindOfCategory(data.Category))
      if (getComplaint(String(data.OriginalCode))) {
        skipped += 1
        continue
      }
      if (!data.Category) data.Category = '0'
      if (!data.IsCompleted) data.IsCompleted = 'BJ1002'
      if (!data.ReceiveTime) data.ReceiveTime = new Date().toISOString().slice(0, 19).replace('T', ' ')
      try {
        saveComplaint(data, true)
        imported += 1
      } catch (error) {
        failed += 1
        if (errors.length < 5) errors.push(`第 ${item.line} 行：${(error as Error).message}`)
      }
    }
    addLog({
      userName: user.username,
      userRealName: user.realName,
      userRole: user.role,
      operationType: '导入',
      operationModule: '信访管理',
      operationContent: `导入 ${path.basename(file)}：成功 ${imported} 条，跳过 ${skipped} 条，失败 ${failed} 条`,
      targetName: path.basename(file),
      ipAddress: localIp(),
    })
    return ok({ imported, skipped, failed, canceled: false, errors })
  })

  function openPreview(title: string, html: string): void {
    const win = new BrowserWindow({
      width: 960,
      height: 1040,
      title,
      backgroundColor: '#f2f6fb',
      autoHideMenuBar: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    })
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  }

  ipcMain.handle('print:complaint', (_e, code: string) => {
    requireUser()
    try {
      openPreview(`打印预览 ${code}`, complaintPrintHtml(code))
      return ok(true)
    } catch (error) {
      return fail((error as Error).message)
    }
  })

  ipcMain.handle('print:list', (_e, filter) => {
    requireUser()
    try {
      openPreview('打印预览 · 信访台账', listPrintHtml(filter ?? {}))
      return ok(true)
    } catch (error) {
      return fail((error as Error).message)
    }
  })

  async function saveWorkbook(
    filename: string,
    buffer: Buffer,
    meta: { module: string; content: string },
  ): Promise<{ ok: true; data: string | null }> {
    const user = requireUser()
    // 直接写到「下载」目录：原生保存框在部分 macOS 环境下不弹出/被遮挡，用户会以为点击没反应
    const dir = app.getPath('downloads')
    let filePath = path.join(dir, filename)
    const base = filename.replace(/\.xlsx$/i, '')
    for (let i = 2; fs.existsSync(filePath); i += 1) filePath = path.join(dir, `${base} (${i}).xlsx`)
    fs.writeFileSync(filePath, buffer)
    addLog({
      userName: user.username,
      userRealName: user.realName,
      userRole: user.role,
      operationType: '导出',
      operationModule: meta.module,
      operationContent: meta.content,
      targetName: path.basename(filePath),
      ipAddress: localIp(),
    })
    return ok(filePath)
  }

  const stamp = () => {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
  }

  ipcMain.handle('export:columns', () =>
    ok({ columns: [...COMPLAINT_COLUMNS], groups: EXPORT_COLUMN_GROUPS }),
  )

  ipcMain.handle(
    'export:preview',
    async (
      _e,
      payload?: {
        codes?: string[]
        category?: string
        filter?: ComplaintFilter
      },
    ) => {
      const preview = complaintExportPreview(payload?.codes, payload?.category, payload?.filter)
      return ok(preview)
    },
  )

  ipcMain.handle(
    'export:complaints',
    async (
      _e,
      payload?: string[] | {
        codes?: string[]
        category?: string
        filter?: ComplaintFilter
        columns?: string[]
      },
    ) => {
      const codes = Array.isArray(payload) ? payload : payload?.codes
      const category = Array.isArray(payload) ? undefined : payload?.category
      const filter = Array.isArray(payload) ? undefined : payload?.filter
      const columns = Array.isArray(payload) ? undefined : payload?.columns
      const buffer = buildComplaintWorkbook(codes, category, filter, columns)
      const label = category === '0' ? '线索' : '信访记录'
      const scope = columns?.length ? `${columns.length} 列` : '全部列'
      return saveWorkbook(`${label}数据-${stamp()}.xlsx`, buffer, {
        module: category === '0' ? '线索管理' : '信访管理',
        content: codes?.length
          ? `导出选中${label} ${codes.length} 条（${scope}）`
          : `导出${label}（按当前筛选，${scope}）`,
      })
    },
  )

  ipcMain.handle('export:logs', async (_e, filter) => {
    const buffer = buildLogWorkbook(filter ?? {})
    return saveWorkbook(`操作日志-${stamp()}.xlsx`, buffer, {
      module: '操作日志',
      content: '导出操作日志',
    })
  })

  ipcMain.handle('export:stats', async () => {
    const buffer = buildStatsWorkbook()
    return saveWorkbook(`信访统计报表-${stamp()}.xlsx`, buffer, {
      module: '首页统计',
      content: '导出统计报表',
    })
  })

  ipcMain.handle('settings:get', () => {
    requireUser()
    const current = readSettings()
    return ok({ ...current, defaults: defaults(), userData: app.getPath('userData') })
  })

  ipcMain.handle('settings:pick', async (_e, kind: 'db' | 'attachments') => {
    requireUser()
    const result = await dialog.showOpenDialog({
      title: kind === 'db' ? '选择数据库目录' : '选择附件目录',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths.length) return ok(null)
    const dir = result.filePaths[0]
    return ok(kind === 'db' ? path.join(dir, 'petition.db') : dir)
  })

  ipcMain.handle(
    'settings:save',
    (
      _e,
      payload: {
        dbPath: string
        attachmentsDir: string
        letterSlaDays?: number
        clueSlaDays?: number
        soonDays?: number
        disposeDays?: number
        allowUnlinkClue?: boolean
        copyData?: boolean
      },
    ) => {
      const user = requireUser()
      const before = readSettings()
      const next = {
        dbPath: payload.dbPath?.trim() || before.dbPath,
        attachmentsDir: payload.attachmentsDir?.trim() || before.attachmentsDir,
        letterSlaDays: payload.letterSlaDays ?? before.letterSlaDays,
        clueSlaDays: payload.clueSlaDays ?? before.clueSlaDays,
        soonDays: payload.soonDays ?? before.soonDays,
        disposeDays: payload.disposeDays ?? before.disposeDays,
        allowUnlinkClue: payload.allowUnlinkClue ?? before.allowUnlinkClue,
      }
      // 预警天数必须小于最短的办结窗口，否则新记录一落库就是「临期」
      const minWindow = Math.min(next.letterSlaDays, next.clueSlaDays, next.disposeDays)
      if (next.soonDays >= minWindow) {
        return fail(
          `临期预警天数（${next.soonDays} 天）必须小于最短的办结期限（${minWindow} 天），否则新建记录会立刻显示为「临期」`,
        )
      }
      try {
        if (next.dbPath !== before.dbPath) {
          checkpoint()
          if (payload.copyData) copyDatabase(before.dbPath, next.dbPath)
        }
        writeSettings(next)
        reloadDb()
        const current = getPaths()
        addLog({
          userName: user.username,
          userRealName: user.realName,
          userRole: user.role,
          operationType: '设置',
          operationModule: '系统设置',
          operationContent: `数据库 ${current.dbFile}；附件目录 ${current.attachmentsDir}`,
          targetId: current.dbFile,
          ipAddress: localIp(),
        })
        return ok({ ...current, defaults: defaults() })
      } catch (error) {
        writeSettings(before)
        reloadDb()
        return fail(error instanceof Error ? error.message : String(error))
      }
    },
  )

  // 打开数据所在目录：数据库用「在 Finder 中显示」，附件目录直接打开
  ipcMain.handle('app:reveal', async (_e, target: 'db' | 'attachments' | 'downloads') => {
    requireUser()
    try {
      const paths = getPaths()
      if (target === 'db') {
        shell.showItemInFolder(paths.dbFile)
        return ok(true)
      }
      const dir = target === 'downloads' ? app.getPath('downloads') : paths.attachmentsDir
      fs.mkdirSync(dir, { recursive: true })
      const error = await shell.openPath(dir)
      return error ? fail(error) : ok(true)
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error))
    }
  })

  ipcMain.handle('app:meta', () => ({
    ok: true,
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    platform: process.platform,
    driver: 'node:sqlite',
  }))
}

