<template>
  <el-container class="shell" :class="{ resizing }">
    <div class="sb-slot" :style="{ width: slotWidth }">
      <aside
        class="sidebar"
        :class="{ rail: railMode, peek: peeking }"
        :style="{ width: narrow ? RAIL_WIDTH + 'px' : width + 'px' }"
      >
        <div class="brand">
          <img class="logo" :src="logoApp" alt="" />
          <span class="brand-text">
            <span class="brand-name">审查调查</span>
            <span class="brand-sub">工作平台</span>
          </span>
          <button
          class="bar-btn brand-toggle"
          title="收起菜单"
          :aria-label="collapsed ? '展开菜单' : '收起菜单'"
          :aria-expanded="!collapsed"
          @click="toggleFromRail"
        >
            <el-icon><Fold /></el-icon>
          </button>
        </div>

        <nav class="nav" aria-label="主导航">
          <template v-for="(entry, index) in navItems" :key="entry.kind === 'group' ? `g-${entry.label}` : `${entry.label}-${index}`">
            <p v-if="entry.kind === 'group'" class="nav-group">{{ entry.label }}</p>
            <RouterLink
              v-else
              :to="entry.to"
              class="nav-item"
              :class="{ active: isActive(entry) }"
              :title="entry.label"
              :aria-current="isActive(entry) ? 'page' : undefined"
              @click="afterNavigate"
            >
              <el-icon class="nav-icon"><component :is="entry.icon" /></el-icon>
              <span class="nav-label">{{ entry.label }}</span>
              <span v-if="entry.count" class="nav-count">{{ navCounts[entry.count] }}</span>
            </RouterLink>
          </template>
        </nav>

        <div class="foot">
          <button class="foot-user" title="个人信息" @click="openProfile">
            <span class="avatar">{{ initial }}</span>
            <span class="foot-user-text">
              <span class="foot-name">{{ session.user?.realName }}</span>
              <span class="foot-sub mono">{{ session.user?.username }}</span>
            </span>
          </button>
          <button
            v-if="session.user?.role === 'Admin'"
            class="bar-btn foot-gear"
            title="系统设置"
            aria-label="系统设置"
            @click="goSettings"
          >
            <el-icon><Setting /></el-icon>
          </button>
          <button class="bar-btn foot-out" title="退出登录" aria-label="退出登录" @click="logout">
            <el-icon><SwitchButton /></el-icon>
          </button>
        </div>

        <div class="meta mono">
          <span v-if="version">v{{ version }}</span>
          <span>{{ platformLabel }}</span>
        </div>

        <div class="resizer" title="拖动调整菜单宽度" @mousedown.prevent="startResize"></div>
      </aside>
    </div>

    <el-container class="body">
      <el-header class="topbar">
        <div class="crumb">
          <span class="crumb-app">连云港港口控股集团</span>
          <span class="crumb-sep">/</span>
          <span class="crumb-current">{{ currentTitle }}</span>
        </div>
      </el-header>

      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>

    <el-dialog v-model="profileOpen" title="个人信息" width="29.5rem" align-center>
      <div class="profile-meta mono">
        <span>账号 {{ profileMeta.username }}</span>
        <span>{{ profileMeta.role }}</span>
        <span>最近登录 {{ profileMeta.lastLoginTime }}</span>
      </div>

      <el-form label-width="4.5rem" label-position="left" class="profile-form" @submit.prevent>
        <el-form-item label="姓名">
          <el-input v-model="profileForm.realName" maxlength="20" placeholder="请输入姓名" />
        </el-form-item>
        <el-form-item label="部门">
          <el-input v-model="profileForm.department" maxlength="40" placeholder="如：系统管理部" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="profileForm.email" maxlength="60" placeholder="可选" />
        </el-form-item>
        <el-form-item label="手机">
          <el-input v-model="profileForm.phone" maxlength="20" placeholder="可选" />
        </el-form-item>
      </el-form>

      <div class="pwd-block">
        <div class="pwd-title">
          <span>修改登录密码</span>
          <el-button text type="primary" :loading="savingPwd" @click="savePassword">保存新密码</el-button>
        </div>
        <el-form label-width="4.5rem" label-position="left" @submit.prevent>
          <el-form-item label="原密码">
            <el-input v-model="pwdForm.oldPassword" type="password" show-password placeholder="请输入原密码" />
          </el-form-item>
          <el-form-item label="新密码">
            <el-input v-model="pwdForm.newPassword" type="password" show-password placeholder="至少 6 位" />
          </el-form-item>
          <el-form-item label="确认">
            <el-input v-model="pwdForm.confirm" type="password" show-password placeholder="再次输入新密码" />
          </el-form-item>
        </el-form>
      </div>

      <template #footer>
        <div class="dlg-foot">
          <span class="dlg-foot-right">
            <el-button @click="profileOpen = false">关闭</el-button>
            <el-button type="primary" :loading="savingProfile" @click="saveProfile">保存</el-button>
          </span>
        </div>
      </template>
    </el-dialog>
  </el-container>
</template>

<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, onMounted, reactive, ref, watch, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CircleCheck,
  Clock,
  Collection,
  Files,
  Fold,
  Guide,
  Odometer,
  Setting,
  Share,
  SwitchButton,
  Tickets,
  User
} from '@element-plus/icons-vue'
import { setUser, session } from '@/stores/session'
import logoApp from '@/assets/logo-app.png'

const RAIL_WIDTH = 56
const MIN_WIDTH = 176
const MAX_WIDTH = 320
const WIDTH_KEY = 'ui.sidebarWidth'
const COLLAPSED_KEY = 'ui.sidebarCollapsed'

const route = useRoute()
const router = useRouter()
const version = ref('')
const platform = ref('')

const width = ref(clampWidth(readNumber(WIDTH_KEY, 224)))
const collapsed = ref(readBool(COLLAPSED_KEY, false))
const peeking = ref(false)
const resizing = ref(false)
let leaveTimer: ReturnType<typeof setTimeout> | undefined

/** 窗口偏窄时自动收成图标栏（不改用户存下来的偏好，拉宽自动恢复） */
const AUTO_RAIL_BELOW = 1180
const autoRail = ref(typeof window !== 'undefined' && window.innerWidth < AUTO_RAIL_BELOW)

/** 宽度用 narrow 立即切换，宽度过渡由 CSS 完成；rail 类等宽度收完再上，避免文字瞬间消失 */
const isRail = computed(() => collapsed.value || autoRail.value)
const narrow = computed(() => isRail.value && !peeking.value)
const railSettled = ref(isRail.value)
const slotWidth = computed(() => `${narrow.value ? RAIL_WIDTH : width.value}px`)
let settleTimer: ReturnType<typeof setTimeout> | undefined

watch(
  [isRail, peeking],
  ([isCollapsed, isPeeking]) => {
    if (settleTimer) {
      clearTimeout(settleTimer)
      settleTimer = undefined
    }
    if (!isCollapsed || isPeeking) {
      railSettled.value = false
      return
    }
    settleTimer = setTimeout(() => {
      railSettled.value = true
    }, 240)
  },
  { immediate: true }
)

const railMode = computed(() => railSettled.value)

interface NavGroup {
  kind: 'group'
  label: string
}

type CountKey = 'letters' | 'clues' | 'open' | 'done' | 'convert'

interface NavLink {
  kind: 'item'
  to: { path: string; query?: Record<string, string> }
  label: string
  icon: Component
  admin?: boolean
  /** 右侧计数（来自 stats:overview），只在需要一眼看量的入口上显示 */
  count?: CountKey
}

type NavEntry = NavGroup | NavLink

/** 导航按粗搞分组：信访线索 / 案件（案件就是线索的两个办结状态分页） */
const navItems = computed<NavEntry[]>(() => {
  const items: NavEntry[] = [
    { kind: 'item', to: { path: '/home' }, label: '主页', icon: markRaw(Odometer) },
    { kind: 'group', label: '信访线索' },
    { kind: 'item', to: { path: '/complaints' }, label: '信访', icon: markRaw(Files), count: 'letters' },
    { kind: 'item', to: { path: '/complaints', query: { parent: 'any' } }, label: '信访转线索', icon: markRaw(Share), count: 'convert' },
    { kind: 'item', to: { path: '/clues' }, label: '线索', icon: markRaw(Guide), count: 'clues' },
    { kind: 'group', label: '案件管理' },
    { kind: 'item', to: { path: '/clues', query: { completed: '否' } }, label: '未完结', icon: markRaw(Clock), count: 'open' },
    { kind: 'item', to: { path: '/clues', query: { completed: '是' } }, label: '已完结', icon: markRaw(CircleCheck), count: 'done' },
    { kind: 'group', label: '系统管理' },
    { kind: 'item', to: { path: '/dicts' }, label: '基础字典', icon: markRaw(Collection), admin: true },
    { kind: 'item', to: { path: '/users' }, label: '用户管理', icon: markRaw(User), admin: true },
    { kind: 'item', to: { path: '/logs' }, label: '操作日志', icon: markRaw(Tickets), admin: true }
  ]
  return items.filter((entry) => entry.kind === 'group' || !entry.admin || session.user?.role === 'Admin')
})

function isActive(item: NavLink): boolean {
  if (route.path !== item.to.path) return false
  const query = item.to.query ?? {}
  const keys = Object.keys(query)
  if (!keys.length) return !route.query.parent && !route.query.completed
  return keys.every((key) => String(route.query[key] ?? '') === query[key])
}

const titles: Record<string, string> = {
  '/home': '主页',
  '/clues': '线索',
  '/complaints': '信访',
  '/complaints/new': '新增信访件',
  '/clues/new': '新增线索',
  '/dicts': '基础字典',
  '/settings': '系统设置',
  '/users': '用户管理',
  '/logs': '操作日志'
}
const currentTitle = computed(() => {
  if (route.path.startsWith('/complaints/') && route.path.endsWith('/edit')) return '编辑信访件'
  if (route.path.startsWith('/clues/') && route.path.endsWith('/edit')) return '编辑线索'
  if (route.path === '/complaints' && route.query.parent === 'any') return '信访转线索'
  if (route.path === '/clues' && route.query.completed === '否') return '未完结'
  if (route.path === '/clues' && route.query.completed === '是') return '已完结'
  return titles[route.path] ?? '信访管理系统'
})
const initial = computed(() => (session.user?.realName ?? session.user?.username ?? 'U').slice(0, 1))
const platformLabel = computed(() =>
  platform.value === 'darwin' ? 'macOS' : platform.value === 'win32' ? 'Windows' : platform.value
)

const profileOpen = ref(false)
const savingProfile = ref(false)
const savingPwd = ref(false)
const profileMeta = reactive({ username: '', role: '', lastLoginTime: '' })
const profileForm = reactive({ realName: '', department: '', email: '', phone: '' })
const pwdForm = reactive({ oldPassword: '', newPassword: '', confirm: '' })

function readNumber(key: string, fallback: number): number {
  const raw = localStorage.getItem(key)
  const num = raw === null ? NaN : Number(raw)
  return Number.isFinite(num) ? num : fallback
}

function readBool(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key)
  return raw === null ? fallback : raw === '1'
}

function clampWidth(value: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value)))
}

function collapse(): void {
  collapsed.value = true
  peeking.value = false
  localStorage.setItem(COLLAPSED_KEY, '1')
}

function expand(): void {
  collapsed.value = false
  peeking.value = false
  localStorage.setItem(COLLAPSED_KEY, '0')
}

/** 收起态用全局鼠标位置判断展开/收回，比 mouseenter/mouseleave 更稳（浮层变宽时不会抖动） */
function handleGlobalMove(event: MouseEvent): void {
  if (!isRail.value || resizing.value) return
  const limit = peeking.value ? width.value : RAIL_WIDTH
  if (event.clientX <= limit) {
    if (leaveTimer) {
      clearTimeout(leaveTimer)
      leaveTimer = undefined
    }
    if (!peeking.value) peeking.value = true
    return
  }
  scheduleCollapse()
}

function scheduleCollapse(): void {
  if (!peeking.value || leaveTimer) return
  leaveTimer = setTimeout(() => {
    peeking.value = false
    leaveTimer = undefined
  }, 160)
}

/** 收起态下，点一次就固定展开（避免鼠标停在侧栏上导致“点了没反应”） */
function toggleFromRail(): void {
  if (autoRail.value && !collapsed.value) {
    // 窄窗口下自动收起的，点一下先固定展开，不改偏好
    autoRail.value = false
    return
  }
  if (collapsed.value) expand()
  else collapse()
}

/** 窗口跨过阈值时切换自动收起；回到宽窗口恢复用户原本的选择 */
function syncAutoRail(): void {
  const shouldRail = window.innerWidth < AUTO_RAIL_BELOW
  if (autoRail.value === shouldRail) return
  autoRail.value = shouldRail
  if (shouldRail) peeking.value = false
}

function afterNavigate(): void {
  if (isRail.value) peeking.value = false
}

function goSettings(): void {
  afterNavigate()
  if (route.path !== '/settings') router.push('/settings')
}

function startResize(event: MouseEvent): void {
  if (railMode.value) return
  resizing.value = true
  const startX = event.clientX
  const startWidth = width.value
  document.body.style.userSelect = 'none'

  const move = (e: MouseEvent): void => {
    width.value = clampWidth(startWidth + e.clientX - startX)
  }
  const stop = (): void => {
    resizing.value = false
    document.body.style.userSelect = ''
    localStorage.setItem(WIDTH_KEY, String(width.value))
    document.removeEventListener('mousemove', move)
    document.removeEventListener('mouseup', stop)
  }
  document.addEventListener('mousemove', move)
  document.addEventListener('mouseup', stop)
}

async function openProfile(): Promise<void> {
  const res = await window.api.profile.get()
  if (!res?.ok || !res.data) {
    ElMessage.error(res?.error ?? '读取个人信息失败')
    return
  }
  profileMeta.username = res.data.Username
  profileMeta.role = res.data.Role === 'Admin' ? '管理员' : '普通用户'
  profileMeta.lastLoginTime = res.data.LastLoginTime ?? '—'
  profileForm.realName = res.data.RealName ?? ''
  profileForm.department = res.data.Department ?? ''
  profileForm.email = res.data.Email ?? ''
  profileForm.phone = res.data.Phone ?? ''
  pwdForm.oldPassword = ''
  pwdForm.newPassword = ''
  pwdForm.confirm = ''
  profileOpen.value = true
}

async function saveProfile(): Promise<void> {
  if (!profileForm.realName.trim()) {
    ElMessage.warning('姓名不能为空')
    return
  }
  savingProfile.value = true
  const res = await window.api.profile.save({ ...profileForm })
  savingProfile.value = false
  if (!res?.ok) {
    ElMessage.error(res?.error ?? '保存失败')
    return
  }
  if (res.data) setUser(res.data)
  ElMessage.success('个人信息已更新')
}

async function savePassword(): Promise<void> {
  if (!pwdForm.oldPassword) {
    ElMessage.warning('请输入原密码')
    return
  }
  if (pwdForm.newPassword.length < 6) {
    ElMessage.warning('新密码至少 6 位')
    return
  }
  if (pwdForm.newPassword !== pwdForm.confirm) {
    ElMessage.warning('两次输入的新密码不一致')
    return
  }
  savingPwd.value = true
  const res = await window.api.profile.password({
    oldPassword: pwdForm.oldPassword,
    newPassword: pwdForm.newPassword
  })
  savingPwd.value = false
  if (!res?.ok) {
    ElMessage.error(res?.error ?? '修改密码失败')
    return
  }
  pwdForm.oldPassword = ''
  pwdForm.newPassword = ''
  pwdForm.confirm = ''
  ElMessage.success('密码已修改')
}

async function logout(): Promise<void> {
  try {
    await ElMessageBox.confirm('确定退出登录吗？', '提示', { type: 'warning' })
  } catch {
    return
  }
  await window.api.auth.logout()
  setUser(null)
  profileOpen.value = false
  ElMessage.success('已退出登录')
  router.replace('/login')
}

const navCounts = ref<Record<CountKey, number>>({ letters: 0, clues: 0, open: 0, done: 0, convert: 0 })

async function loadNavCounts(): Promise<void> {
  const res = await window.api.stats.overview()
  if (!res?.ok || !res.data) return
  const d = res.data as {
    xfTotal: number
    xsTotal: number
    processing: number
    completed: number
    unconverted: number
  }
  navCounts.value = {
    letters: d.xfTotal ?? 0,
    clues: d.xsTotal ?? 0,
    open: d.processing ?? 0,
    done: d.completed ?? 0,
    convert: d.unconverted ?? 0
  }
}

watch(
  () => route.fullPath,
  () => void loadNavCounts()
)

onMounted(async () => {
  syncAutoRail()
  window.addEventListener('resize', syncAutoRail)
  document.addEventListener('mousemove', handleGlobalMove)
  document.addEventListener('mouseleave', scheduleCollapse)
  const meta = await window.api.app.meta()
  if (meta?.ok) {
    version.value = meta.version
    platform.value = meta.platform
  }
  void loadNavCounts()
})

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', handleGlobalMove)
  window.removeEventListener('resize', syncAutoRail)
  document.removeEventListener('mouseleave', scheduleCollapse)
  if (leaveTimer) clearTimeout(leaveTimer)
  if (settleTimer) clearTimeout(settleTimer)
})
</script>

<style scoped>
.shell {
  height: 100vh;
  overflow: hidden;
}

.sb-slot {
  position: relative;
  flex: none;
  z-index: 40;
  transition: width 220ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.sidebar {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-right: 1px solid var(--rule);
  color: var(--night-text);
  overflow: hidden;
  transition: width 220ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.sidebar.peek {
  box-shadow: 12px 0 28px rgba(16, 22, 29, 0.18);
}

.shell.resizing .sb-slot,
.shell.resizing .sidebar {
  transition: none;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.5625rem;
  height: 3.625rem;
  padding: 0 0.75rem;
  border-bottom: 1px solid var(--night-2);
}

.logo {
  display: block;
  flex: none;
  width: 1.75rem;
  height: 1.75rem;
}

.brand-text {
  display: flex;
  flex-direction: column;
  gap: 0.1875rem;
  min-width: 0;
  line-height: 1.15;
}

.brand-name {
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--ink);
  white-space: nowrap;
}

.brand-sub {
  font-size: 0.625rem;
  letter-spacing: 0.08em;
  color: var(--night-muted);
  white-space: nowrap;
}

.brand-toggle {
  margin-left: auto;
}

.bar-btn {
  display: grid;
  place-items: center;
  flex: none;
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--night-muted);
  font-size: 0.9375rem;
  cursor: pointer;
  transition: background-color 0.16s ease, color 0.16s ease, border-color 0.16s ease;
}

.bar-btn:hover {
  background: var(--night-2);
  border-color: var(--night-3);
  color: var(--ink);
}

.foot-out:hover {
  background: #fbeae8;
  border-color: #f3d3cf;
  color: var(--danger, #9a2c22);
}

.nav {
  flex: 1;
  min-height: 0;
  padding: 0.5rem 0.5rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.1875rem;
  overflow-y: auto;
  overflow-x: hidden;
}

.nav-group {
  flex: none;
  margin: 0.875rem 0 0.375rem;
  padding: 0 0.625rem;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  color: var(--night-text);
  opacity: 0.55;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: none;
  min-height: 2.5rem;
  padding: 0 0.75rem;
  border-radius: var(--r-md);
  color: var(--night-text);
  font-size: 0.9375rem;
  text-decoration: none;
  position: relative;
  transition: color 0.16s ease, background-color 0.16s ease;
}

.nav-item:hover {
  color: var(--ink);
  background: var(--night-2);
}

.nav-item.active {
  color: var(--harbor);
  background: var(--night-3);
  font-weight: 500;
}

.nav-item.active .nav-icon {
  color: var(--harbor);
}

.nav-icon {
  font-size: 1.125rem;
  opacity: 0.92;
}

.nav-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-count {
  margin-left: auto;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: var(--ink-3);
}

.nav-item.active .nav-count {
  color: var(--harbor);
}

.foot {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.625rem;
  border-top: 1px solid var(--night-2);
}

.foot-user {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.16s ease;
}

.foot-user:hover {
  background: var(--night-2);
}

.foot-user-text {
  display: flex;
  flex-direction: column;
  gap: 0.0625rem;
  min-width: 0;
  line-height: 1.25;
}

.foot-name {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.foot-sub {
  font-size: 0.6875rem;
  color: var(--night-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.avatar {
  flex: none;
  width: 1.75rem;
  height: 1.75rem;
  display: grid;
  place-items: center;
  background: var(--harbor);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 600;
  border-radius: 0.4375rem;
}

.meta {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0 0.875rem 0.625rem;
  font-size: 0.625rem;
  letter-spacing: 0.06em;
  color: var(--night-muted);
}

.resizer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 5px;
  cursor: col-resize;
  background: transparent;
  transition: background-color 0.16s ease;
}

.resizer:hover {
  background: var(--harbor);
  opacity: 0.5;
}

.rail .brand {
  justify-content: center;
  padding: 0;
}

.rail .brand-text,
.rail .brand-toggle,
.rail .nav-count {
  display: none;
}

.rail .nav-group {
  height: 1px;
  margin: 0.5rem 0.75rem;
  padding: 0;
  font-size: 0;
  letter-spacing: 0;
  background: rgba(255, 255, 255, 0.14);
  opacity: 1;
}

.rail .nav-label,
.rail .foot-user-text,
.rail .meta,
.rail .resizer {
  display: none;
}

.rail .nav {
  padding: 0.5rem 0.4375rem 1rem;
}

.rail .nav-item {
  justify-content: center;
  padding: 0;
}

.rail .foot {
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem 0;
}

.rail .foot-user {
  flex: none;
  justify-content: center;
  padding: 0.1875rem;
}

.body {
  min-width: 0;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 3.25rem;
  background: var(--surface);
  border-bottom: 1px solid var(--rule);
  padding: 0 var(--gutter);
}

.crumb {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

/* 面包屑与页面标题同一套字号/字重，不再出现 9.7px 与 12.6px 混排 */
.crumb-app {
  font-size: 0.8125rem;
  font-weight: 500;
  letter-spacing: 0;
  color: var(--ink-3);
}

.crumb-sep {
  color: var(--rule-2);
  font-size: 0.8125rem;
}

.crumb-current {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--ink);
}

.main {
  background: var(--page);
  padding: 0;
  overflow-y: auto;
  /* 自定义滚动条：Chromium 会改为占位式（非覆盖式），不再压住表格最后一列 */
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: rgba(31, 111, 178, 0.32) transparent;
}
.main::-webkit-scrollbar {
  width: 10px;
}
.main::-webkit-scrollbar-track {
  background: transparent;
}
.main::-webkit-scrollbar-thumb {
  background: rgba(31, 111, 178, 0.3);
  border: 3px solid transparent;
  background-clip: content-box;
  border-radius: 999px;
}
.main::-webkit-scrollbar-thumb:hover {
  background: rgba(31, 111, 178, 0.48);
  background-clip: content-box;
}

.profile-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem 0.875rem;
  margin-bottom: 0.875rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--rule);
  border-radius: var(--r-sm);
  background: var(--surface-alt);
  font-size: 0.6875rem;
  color: var(--ink-3);
}

.profile-form :deep(.el-form-item),
.pwd-block :deep(.el-form-item) {
  margin-bottom: 0.75rem;
}

.pwd-block {
  margin-top: 0.875rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--rule);
}

.pwd-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.625rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--ink);
}

.dlg-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.dlg-foot-right {
  display: flex;
  gap: 0.5rem;
}
</style>
