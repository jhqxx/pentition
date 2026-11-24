import { screen, type BrowserWindow } from 'electron'

/** 登录态窗口：只比登录卡片大一圈，避免四周大片空白 */
export const LOGIN_SIZE = { width: 364, height: 492 }
export const LOGIN_MIN = { width: 340, height: 470 }
/** 登录后的工作尺寸 */
export const WORK_SIZE = { width: 1320, height: 860 }
export const WORK_MIN = { width: 900, height: 600 }

/**
 * 切换窗口尺寸、最小尺寸并重新居中。
 * 用一次 setBounds 完成，避免 macOS 上 setSize() 后紧跟 center() 导致尺寸被动画回弹。
 * 用户已经最大化/全屏时不动，避免把最大化状态打回小窗。
 */
export function resizeTo(
  win: BrowserWindow | null | undefined,
  size: { width: number; height: number },
  min: { width: number; height: number }
): void {
  if (!win || win.isDestroyed()) return
  win.setMinimumSize(min.width, min.height)
  if (win.isMaximized() || win.isFullScreen()) return
  const area = screen.getDisplayMatching(win.getBounds()).workArea
  win.setBounds({
    x: Math.round(area.x + (area.width - size.width) / 2),
    y: Math.round(area.y + (area.height - size.height) / 2),
    width: size.width,
    height: size.height
  })
}
