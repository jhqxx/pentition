<template>
  <div class="page">
    <div class="grid">
      <div class="col">
        <section class="panel">
          <header class="panel-head">
            <h2 class="panel-title">数据文件</h2>
            <span class="state" :class="dbChanged ? 'state-warn' : 'state-ok'">
              {{ dbChanged ? '已改动，未应用' : '正在使用' }}
            </span>
          </header>

          <div class="field">
            <span class="field-label">数据库文件</span>
            <el-input v-model="form.dbPath" class="path" readonly placeholder="未设置">
              <template #append>
                <el-button :icon="FolderOpened" @click="pick('db')">选择目录</el-button>
              </template>
            </el-input>
            <p class="hint">
              默认 <span class="mono">{{ defaults.dbPath }}</span>
              <el-button link type="primary" @click="reveal('db')">在文件夹中显示</el-button>
            </p>
          </div>

          <div class="field">
            <span class="field-label">附件目录</span>
            <el-input v-model="form.attachmentsDir" class="path" readonly placeholder="未设置">
              <template #append>
                <el-button :icon="FolderOpened" @click="pick('attachments')">选择目录</el-button>
              </template>
            </el-input>
            <p class="hint">
              默认 <span class="mono">{{ defaults.attachmentsDir }}</span>；新上传的附件存到该目录，已有记录里的绝对路径不受影响。
              <el-button link type="primary" @click="reveal('attachments')">打开目录</el-button>
            </p>
          </div>

          <el-checkbox v-model="form.copyData" :disabled="!dbChanged" class="check-line">
            迁移时复制当前数据库到新位置（不勾选则在新位置建一个空库）
          </el-checkbox>
        </section>

        <section class="panel">
          <header class="panel-head">
            <h2 class="panel-title">运行环境</h2>
          </header>
          <dl class="meta">
            <div><dt>应用数据目录</dt><dd class="mono">{{ userData || '—' }}</dd></div>
            <div><dt>版本</dt><dd class="mono">{{ meta.version || '—' }}</dd></div>
            <div><dt>Electron</dt><dd class="mono">{{ meta.electron || '—' }}</dd></div>
            <div><dt>SQLite 驱动</dt><dd class="mono">{{ meta.driver || '—' }}</dd></div>
          </dl>
        </section>
      </div>

      <div class="col">
        <section class="panel">
          <header class="panel-head">
            <h2 class="panel-title">期限与预警</h2>
            <span class="state state-ok">状态色依据</span>
          </header>

          <div class="field">
            <span class="field-label">信访件办结期限</span>
            <div class="num-line">
              <el-input-number v-model="form.letterSlaDays" :min="1" :max="3650" :step="1" :precision="0" :step-strictly="true" controls-position="right" />
              <span class="unit">天</span>
            </div>
            <p class="hint">信访件没填「办理期限」时，按 接收时间 + 该天数 推算期限。</p>
            <p class="example">举例：今天接收的信访件 → {{ dueOn(form.letterSlaDays) }} 到期</p>
          </div>

          <div class="field">
            <span class="field-label">问题线索办结期限</span>
            <div class="num-line">
              <el-input-number v-model="form.clueSlaDays" :min="1" :max="3650" :step="1" :precision="0" :step-strictly="true" controls-position="right" />
              <span class="unit">天</span>
            </div>
            <p class="hint">线索没填「办理期限」时，按 接收时间 + 该天数 推算期限。</p>
            <p class="example">举例：今天接收的线索 → {{ dueOn(form.clueSlaDays) }} 到期</p>
          </div>

          <div class="field">
            <span class="field-label">临期预警（两类共用）</span>
            <div class="num-line">
              <el-input-number v-model="form.soonDays" :min="1" :max="3650" :step="1" :precision="0" :step-strictly="true" controls-position="right" />
              <span class="unit">天</span>
            </div>
            <p class="hint">距办理期限不足该天数时，状态显示为「临期」。</p>
            <p class="example">举例：一条 {{ dueOn(0) }} 到期的记录，{{ dueOn(-form.soonDays) }} 起变黄（临期）</p>
            <p v-if="soonTooLate" class="warn">
              预警天数不小于最短的办结期限（信访 {{ form.letterSlaDays }} 天 / 线索 {{ form.clueSlaDays }} 天 / 处置后
              {{ form.disposeDays }} 天），新建的记录一落库就是「临期」。建议预警天数至少比最短期限小 1 天，例如
              {{ suggestedSoon }} 天。
            </p>
          </div>

          <div class="field">
            <span class="field-label">处置后应办结</span>
            <div class="num-line">
              <el-input-number v-model="form.disposeDays" :min="1" :max="3650" :step="1" :precision="0" :step-strictly="true" controls-position="right" />
              <span class="unit">天</span>
            </div>
            <p class="hint">新建表单里填了「处置时间」后，「应办结时间」自动取 处置时间 + 该天数。</p>
            <p class="example">举例：处置时间填今天 → 应办结时间自动填 {{ dueOn(form.disposeDays) }}</p>
          </div>

          <div class="field switch-field">
            <div class="switch-text">
              <span class="switch-label">允许取消「信访转线索」生成的关联</span>
              <p class="hint">只限制转化生成的关联；手工「关联线索」建立的关联任何时候都能取消。</p>
            </div>
            <el-switch v-model="form.allowUnlinkClue" />
          </div>

          <ul class="legend">
            <li><i class="sw sw-overdue" />超期：已过办理期限，或「是否超期」为是</li>
            <li><i class="sw sw-soon" />临期：未办结且剩余天数 ≤ 预警天数</li>
            <li><i class="sw sw-done" />已办结：「是否办结」为是</li>
            <li><i class="sw sw-doing" />办理中：其余情况，不上色</li>
          </ul>
        </section>
      </div>
    </div>
    <div class="save-bar">
    <span v-if="soonTooLate" class="save-hint">临期预警天数需小于最短办结期限</span>
    <span v-else-if="dirty" class="save-hint">有未保存的修改</span>
    <span v-else class="save-hint muted">已是最新</span>
    <el-button :icon="RefreshLeft" @click="resetDefaults">恢复默认</el-button>
    <el-button type="primary" :icon="Check" :loading="saving" :disabled="soonTooLate" @click="save">
      保存并应用
    </el-button>
  </div>
</div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, FolderOpened, RefreshLeft } from '@element-plus/icons-vue'

const saving = ref(false)
const userData = ref('')
const meta = reactive<Record<string, string>>({})
const DEFAULTS = { letterSlaDays: 60, clueSlaDays: 60, soonDays: 15, disposeDays: 30, allowUnlinkClue: true }
const defaults = reactive({ dbPath: '', attachmentsDir: '', ...DEFAULTS })
const current = reactive({ dbPath: '', attachmentsDir: '', ...DEFAULTS })
const form = reactive({ dbPath: '', attachmentsDir: '', ...DEFAULTS, copyData: true })

const dbChanged = computed(() => form.dbPath.trim() !== current.dbPath)

/** 与「已保存的值」比较：有偏离才提示未保存，避免用户以为改没生效 */
function snapshot(): string {
  return JSON.stringify({
    dbPath: form.dbPath,
    attachmentsDir: form.attachmentsDir,
    letterSlaDays: form.letterSlaDays,
    clueSlaDays: form.clueSlaDays,
    soonDays: form.soonDays,
    disposeDays: form.disposeDays,
    allowUnlinkClue: form.allowUnlinkClue,
  })
}
const savedSnapshot = ref('')
const dirty = computed(() => savedSnapshot.value !== '' && snapshot() !== savedSnapshot.value)

/** 预警天数吃掉了整个办结窗口时，新记录会一建就变黄——这里给出提醒 */
const minWindow = computed(() =>
  Math.min(form.letterSlaDays, form.clueSlaDays, form.disposeDays)
)
const soonTooLate = computed(() => form.soonDays >= minWindow.value)
const suggestedSoon = computed(() => Math.max(1, Math.floor(minWindow.value / 3)))

/** 把「天数」翻成具体日期，设置页里每个数字都带一句举例 */
function dueOn(days: number): string {
  const d = new Date(Date.now() + days * 86400000)
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

async function load(): Promise<void> {
  const res = await window.api.settings.get()
  if (!res?.ok) {
    ElMessage.error(res?.error ?? '读取设置失败')
    return
  }
  Object.assign(current, {
    dbPath: res.data.dbPath,
    attachmentsDir: res.data.attachmentsDir,
    letterSlaDays: res.data.letterSlaDays ?? 60,
    clueSlaDays: res.data.clueSlaDays ?? 60,
    soonDays: res.data.soonDays ?? 30,
    disposeDays: res.data.disposeDays ?? 30,
    allowUnlinkClue: res.data.allowUnlinkClue !== false,
  })
  Object.assign(defaults, res.data.defaults)
  Object.assign(form, {
    dbPath: res.data.dbPath,
    attachmentsDir: res.data.attachmentsDir,
    letterSlaDays: res.data.letterSlaDays ?? 60,
    clueSlaDays: res.data.clueSlaDays ?? 60,
    soonDays: res.data.soonDays ?? 30,
    disposeDays: res.data.disposeDays ?? 30,
    allowUnlinkClue: res.data.allowUnlinkClue !== false,
    copyData: true,
  })
  savedSnapshot.value = snapshot()
  userData.value = res.data.userData
  const info = await window.api.app.meta()
  if (info?.ok) Object.assign(meta, info)
}

async function reveal(target: 'db' | 'attachments'): Promise<void> {
  const res = await window.api.app.reveal(target)
  if (!res?.ok) ElMessage.error(res?.error ?? '打开失败')
}

async function pick(kind: 'db' | 'attachments'): Promise<void> {
  const res = await window.api.settings.pick(kind)
  if (!res?.ok) {
    ElMessage.error(res?.error ?? '选择目录失败')
    return
  }
  if (!res.data) return
  if (kind === 'db') form.dbPath = res.data
  else form.attachmentsDir = res.data
}

function resetDefaults(): void {
  form.dbPath = defaults.dbPath
  form.attachmentsDir = defaults.attachmentsDir
  form.letterSlaDays = defaults.letterSlaDays
  form.clueSlaDays = defaults.clueSlaDays
  form.soonDays = defaults.soonDays
  form.disposeDays = defaults.disposeDays
  form.allowUnlinkClue = defaults.allowUnlinkClue !== false
  form.copyData = false
}

async function save(): Promise<void> {
  if (soonTooLate.value) {
    ElMessage.error(`临期预警必须小于最短的办结期限（${minWindow.value} 天），请先调整`)
    return
  }
  const switching = form.dbPath.trim() !== current.dbPath
  if (switching) {
    const copy = form.copyData ? '会把当前数据库复制到新位置' : '会在新位置建一个空库'
    try {
      await ElMessageBox.confirm(
        `把数据库切换到 ${form.dbPath}？${copy}，保存后列表数据会立即变成新库里的内容。`,
        '切换数据库',
        { type: 'warning', confirmButtonText: '切换', cancelButtonText: '取消' },
      )
    } catch {
      return
    }
  }
  saving.value = true
  try {
    const res = await window.api.settings.save({
      dbPath: form.dbPath,
      attachmentsDir: form.attachmentsDir,
      letterSlaDays: form.letterSlaDays,
      clueSlaDays: form.clueSlaDays,
      soonDays: form.soonDays,
      disposeDays: form.disposeDays,
      allowUnlinkClue: form.allowUnlinkClue,
      copyData: form.copyData,
    })
    if (!res?.ok) {
      ElMessage.error(res?.error ?? '保存失败')
      return
    }
    Object.assign(current, {
      dbPath: res.data.dbFile,
      attachmentsDir: res.data.attachmentsDir,
      letterSlaDays: form.letterSlaDays,
      clueSlaDays: form.clueSlaDays,
      soonDays: form.soonDays,
      disposeDays: form.disposeDays,
      allowUnlinkClue: form.allowUnlinkClue,
    })
    Object.assign(form, { dbPath: res.data.dbFile, attachmentsDir: res.data.attachmentsDir })
    savedSnapshot.value = snapshot()
    ElMessage.success(switching ? '已切换数据库' : '已应用')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}

@media (max-width: 72rem) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.col {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.panel {
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  display: flex;
  flex-direction: column;
}

.switch-field {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 1rem;
  padding-top: 0.875rem;
  border-top: 1px solid var(--rule);
}

.switch-text { min-width: 0; }

.switch-label { font-size: 0.8125rem; font-weight: 500; }

.switch-field .hint { margin: 0.25rem 0 0; }

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.8125rem 1rem;
  border-bottom: 1px solid var(--rule);
}

.panel-title {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--ink);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.875rem 1rem 0;
}

.field-label {
  font-size: 0.8125rem;
  color: var(--ink-2);
}

.panel > .field:last-of-type {
  padding-bottom: 0.25rem;
}

.path :deep(.el-input__inner) {
  font-family: var(--mono);
  font-size: 0.8125rem;
}

.num-line {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.num-line :deep(.el-input-number) {
  width: 8.5rem;
}

.unit {
  font-size: 0.8125rem;
  color: var(--ink-3);
}

.hint {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--ink-3);
}

/* 每个数字下面一句具体日期，避免「天数」抽象 */
.warn {
  margin: 0.375rem 0 0;
  padding: 0.375rem 0.5rem;
  font-size: 0.75rem;
  line-height: 1.5;
  color: #7a4a05;
  background: #fff8e6;
  border-left: 2px solid #d99a2b;
}

.example {
  margin: 0;
  padding: 0.375rem 0.5rem;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--ink-2);
  background: var(--page);
  border-left: 2px solid var(--rule);
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
}

.check-line {
  margin: 0.875rem 1rem 1rem;
  height: auto;
  font-size: 0.8125rem;
}

.state {
  display: inline-flex;
  align-items: center;
  gap: 0.3125rem;
  font-size: 0.75rem;
}

.state::before {
  content: '';
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 50%;
  background: currentColor;
}

.state-ok {
  color: #14664b;
}

.state-warn {
  color: #9a2c22;
}

.legend {
  margin: 0;
  padding: 0.75rem 1rem 1rem;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  border-top: 1px solid var(--rule);
  font-size: 0.75rem;
  color: var(--ink-2);
}

.legend li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.sw {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 2px;
  border: 1px solid var(--rule-2);
  flex: none;
}

.sw-overdue {
  background: #f8a2a2;
}

.sw-soon {
  background: #fff1b8;
}

.sw-done {
  background: #eaf6ef;
}

.sw-doing {
  background: var(--surface);
}

.meta {
  margin: 0;
  padding: 0.875rem 1rem 1rem;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.625rem 1.25rem;
  font-size: 0.8125rem;
}

.meta dt {
  color: var(--ink-3);
  font-size: 0.75rem;
}

.meta dd {
  margin: 0.125rem 0 0;
  color: var(--ink);
  word-break: break-all;
}
</style>
