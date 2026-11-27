/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

type AnyResult<T = any> = { ok: boolean; data?: T; error?: string; [key: string]: any }

interface Window {
  api: {
    win: {
      minimize: () => Promise<AnyResult>
      toggleMaximize: () => Promise<AnyResult>
      close: () => Promise<AnyResult>
    }
    auth: {
      login: (payload: { username: string; password: string }) => Promise<AnyResult>
      current: () => Promise<AnyResult>
      logout: () => Promise<AnyResult>
      remember: {
        get: () => Promise<
          AnyResult<{
            accounts: { username: string; password: string }[]
            lastUsername: string
          }>
        >
        save: (payload: {
          remember: boolean
          username: string
          password: string
        }) => Promise<AnyResult<{ saved: boolean; encrypted: boolean }>>
        clear: () => Promise<AnyResult>
      }
    }
    profile: {
      get: () => Promise<
        AnyResult<{
          Id: number
          Username: string
          RealName: string
          Role: string
          Department: string
          Email: string
          Phone: string
          LastLoginTime: string | null
          CreateTime: string
        }>
      >
      save: (input: {
        realName: string
        department: string
        email: string
        phone: string
      }) => Promise<AnyResult>
      password: (payload: { oldPassword: string; newPassword: string }) => Promise<AnyResult>
    }
    complaints: {
      list: (filter: unknown) => Promise<AnyResult>
      get: (code: string) => Promise<AnyResult>
      nextCode: (kind?: 'clue' | 'letter') => Promise<AnyResult>
      convert: (code: string, mode?: 'basic' | 'full') => Promise<AnyResult>
      save: (payload: { isNew: boolean; data: Record<string, unknown> }) => Promise<AnyResult>
      handle: (data: Record<string, unknown>) => Promise<AnyResult>
      remove: (codes: string[]) => Promise<AnyResult>
      restore: (codes: string[]) => Promise<AnyResult>
      clueOptions: () => Promise<AnyResult>
      letters: (clueCode: string) => Promise<AnyResult>
      assign: (payload: { codes: string[]; clueCode: string | null }) => Promise<AnyResult>
      importExcel: () => Promise<AnyResult>
      importTemplate: () => Promise<AnyResult>
      print: (code: string) => Promise<AnyResult>
      printList: (filter: unknown) => Promise<AnyResult>
    }
    attachments: {
      list: (code: string) => Promise<AnyResult>
      pick: () => Promise<AnyResult>
      add: (payload: unknown) => Promise<AnyResult>
      remove: (ids: number[]) => Promise<AnyResult>
      download: (ids: number[]) => Promise<AnyResult>
      open: (id: number) => Promise<AnyResult>
    }
    dict: {
      classes: () => Promise<AnyResult>
      items: (classId: number) => Promise<AnyResult>
      options: (className: string) => Promise<AnyResult>
      labels: (className: string) => Promise<AnyResult>
      saveClass: (input: unknown) => Promise<AnyResult>
      removeClass: (id: number) => Promise<AnyResult>
      saveItem: (input: unknown) => Promise<AnyResult>
      removeItem: (id: number) => Promise<AnyResult>
    }
    users: {
      list: (options?: { deleted?: boolean }) => Promise<AnyResult>
      restore: (id: number) => Promise<AnyResult>
      save: (input: unknown) => Promise<AnyResult>
      remove: (id: number) => Promise<AnyResult>
      resetPassword: (payload: { id: number; password: string }) => Promise<AnyResult>
    }
    logs: {
      list: (filter: unknown) => Promise<AnyResult>
      facets: () => Promise<AnyResult>
    }
    stats: {
      overview: () => Promise<AnyResult>
      monthly: () => Promise<AnyResult>
      dashboard: () => Promise<AnyResult>
      groups: (field: 'ClueSource' | 'DisposeForm' | 'UndertakeDept') => Promise<AnyResult>
    }
    exports: {
      columns: () => Promise<
        AnyResult<{ columns: string[]; groups: Array<{ title: string; columns: string[] }> }>
      >
      preview: (payload?: {
        codes?: string[]
        category?: string
        filter?: Record<string, unknown>
      }) => Promise<AnyResult<{ title: string; columns: string[]; rows: Array<Record<string, string>>; total: number }>>
      complaints: (
        payload?: string[] | {
          codes?: string[]
          category?: string
          filter?: Record<string, unknown>
          columns?: string[]
        },
      ) => Promise<AnyResult>
      logs: (filter: unknown) => Promise<AnyResult>
      stats: () => Promise<AnyResult>
      home: () => Promise<AnyResult<string>>
    }
    settings: {
      get: () => Promise<AnyResult>
      pick: (kind: 'db' | 'attachments') => Promise<AnyResult>
      save: (payload: {
        dbPath: string
        attachmentsDir: string
        letterSlaDays?: number
        clueSlaDays?: number
        soonDays?: number
        disposeDays?: number
        allowUnlinkClue?: boolean
        copyData?: boolean
      }) => Promise<AnyResult>
    }
    app: {
      reveal: (target: 'db' | 'attachments' | 'downloads') => Promise<AnyResult<boolean>>
      meta: () => Promise<AnyResult>
    }
  }
}
