import { contextBridge, ipcRenderer } from 'electron'

const invoke = (channel: string, payload?: unknown) => ipcRenderer.invoke(channel, payload)

const api = {
  win: {
    minimize: () => invoke('win:minimize'),
    toggleMaximize: () => invoke('win:toggle-maximize'),
    close: () => invoke('win:close'),
  },
  auth: {
    login: (payload: { username: string; password: string }) => invoke('auth:login', payload),
    current: () => invoke('auth:current'),
    logout: () => invoke('auth:logout'),
    remember: {
      get: () => invoke('auth:remember:get'),
      save: (payload: { remember: boolean; username: string; password: string }) =>
        invoke('auth:remember:save', payload),
      clear: () => invoke('auth:remember:clear'),
    },
  },
  profile: {
    get: () => invoke('profile:get'),
    save: (input: { realName: string; department: string; email: string; phone: string }) =>
      invoke('profile:save', input),
    password: (payload: { oldPassword: string; newPassword: string }) =>
      invoke('profile:password', payload),
  },
  complaints: {
    list: (filter: unknown) => invoke('complaint:list', filter),
    get: (code: string) => invoke('complaint:get', code),
    nextCode: (kind?: 'clue' | 'letter') => invoke('complaint:nextCode', kind),
    convert: (code: string, mode?: 'basic' | 'full') => invoke('complaint:convert', { code, mode }),
    save: (payload: { isNew: boolean; data: Record<string, unknown> }) => invoke('complaint:save', payload),
    handle: (data: Record<string, unknown>) => invoke('complaint:handle', { data }),
    remove: (codes: string[]) => invoke('complaint:delete', codes),
    restore: (codes: string[]) => invoke('complaint:restore', codes),
    clueOptions: () => invoke('complaint:clueOptions'),
    letters: (clueCode: string) => invoke('complaint:letters', clueCode),
    assign: (payload: { codes: string[]; clueCode: string | null }) => invoke('complaint:assign', payload),
    importExcel: () => invoke('import:complaints'),
    importTemplate: () => invoke('import:template'),
    print: (code: string) => invoke('print:complaint', code),
    printList: (filter: unknown) => invoke('print:list', filter),
  },
  attachments: {
    list: (code: string) => invoke('attachment:list', code),
    pick: () => invoke('attachment:pick'),
    add: (payload: unknown) => invoke('attachment:add', payload),
    remove: (ids: number[]) => invoke('attachment:delete', ids),
    download: (ids: number[]) => invoke('attachment:download', ids),
    open: (id: number) => invoke('attachment:open', id),
  },
  dict: {
    classes: () => invoke('dict:classes'),
    items: (classId: number) => invoke('dict:items', classId),
    options: (className: string) => invoke('dict:options', className),
    labels: (className: string) => invoke('dict:labels', className),
    saveClass: (input: unknown) => invoke('dict:class:save', input),
    removeClass: (id: number) => invoke('dict:class:delete', id),
    saveItem: (input: unknown) => invoke('dict:item:save', input),
    removeItem: (id: number) => invoke('dict:item:delete', id),
  },
  users: {
    list: (options?: { deleted?: boolean }) => invoke('users:list', options),
    restore: (id: number) => invoke('users:restore', id),
    save: (input: unknown) => invoke('users:save', input),
    remove: (id: number) => invoke('users:delete', id),
    resetPassword: (payload: { id: number; password: string }) => invoke('users:resetPassword', payload),
  },
  logs: {
    list: (filter: unknown) => invoke('logs:list', filter),
    facets: () => invoke('logs:facets'),
  },
  stats: {
    overview: () => invoke('stats:overview'),
    monthly: () => invoke('stats:monthly'),
    dashboard: () => invoke('stats:dashboard'),
    groups: (field: 'ClueSource' | 'DisposeForm' | 'UndertakeDept') => invoke('stats:groups', field),
  },
  exports: {
    columns: () => invoke('export:columns'),
    preview: (payload?: {
      codes?: string[]
      category?: string
      filter?: Record<string, unknown>
    }) => invoke('export:preview', payload),
    complaints: (
      payload?: string[] | {
        codes?: string[]
        category?: string
        filter?: Record<string, unknown>
        columns?: string[]
      },
    ) => invoke('export:complaints', payload),
    logs: (filter: unknown) => invoke('export:logs', filter),
    stats: () => invoke('export:stats'),
    home: () => invoke('export:home'),
  },
  settings: {
    get: () => invoke('settings:get'),
    pick: (kind: 'db' | 'attachments') => invoke('settings:pick', kind),
    save: (payload: {
      dbPath: string
      attachmentsDir: string
      letterSlaDays?: number
      clueSlaDays?: number
      soonDays?: number
      disposeDays?: number
      copyData?: boolean
    }) => invoke('settings:save', payload),
  },
  app: {
    reveal: (target: 'db' | 'attachments' | 'downloads') => invoke('app:reveal', target),
  meta: () => invoke('app:meta'),
  },
}

contextBridge.exposeInMainWorld('api', api)
