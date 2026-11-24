/**
 * 字典字段在库里存「显示值」，历史数据/导入模板里可能还是代码。
 * 这些判定函数同时接受两种写法，避免代码漂移后界面显示错乱。
 */
export const isClueCategory = (value?: string | null): boolean => value === '0' || value === '问题线索'

export const isLetterCategory = (value?: string | null): boolean => value === '1' || value === '信访件'

export const isUnitTarget = (value?: string | null): boolean => value === 'ORG' || value === '单位'

export const isCompleted = (value?: string | null): boolean => value === 'BJ1001' || value === '是'

export const isOverdue = (value?: string | null): boolean => value === 'CQ1001' || value === '是'

export const isRealReport = (value?: string | null): boolean => value === 'JB1001' || value === '实名'

export const isAnonymousReport = (value?: string | null): boolean => value === 'JB1002' || value === '匿名'
