<template>
  <div class="page">
    <header ref="headEl" class="page-head" :class="{ stuck }">
      <div class="head-actions">
        <el-button type="primary" :icon="Check" :loading="saving" @click="save">保存</el-button>
        <el-button :icon="Close" @click="goBack">取消</el-button>
      </div>
    </header>

    <nav class="section-nav" aria-label="表单分区导航">
      <button
        v-for="(title, index) in SECTION_TITLES"
        :key="title"
        type="button"
        class="sec-chip"
        :class="{ active: activeSection === index }"
        @click="jumpTo(index)"
      >
        {{ title }}
      </button>
    </nav>

    <el-form ref="formRef" :model="form" label-position="top" class="form">
      <section class="block form-section">
        <h2 class="block-title">编号信息</h2>
        <div class="grid">
          <el-form-item label="原始编号"><el-input v-model="form.OriginalCode" disabled /></el-form-item>
          <el-form-item v-if="isClue" label="线索编号">
            <el-input v-model="form.NewCode" placeholder="选填" />
          </el-form-item>
          <el-form-item label="信访编号"><el-input v-model="form.CategoryCode" placeholder="选填" /></el-form-item>
        </div>
      </section>

      <section class="block form-section">
        <h2 class="block-title">基本信息</h2>
        <div class="grid">
          <el-form-item label="类别">
            <div class="static-field">
              <span class="static-value">{{ categoryName }}</span>
              <span class="static-hint">由当前页面决定</span>
            </div>
          </el-form-item>
          <el-form-item v-if="!isClue" label="线索编号">
            <el-select
              v-model="form.ParentCode"
              class="fill"
              clearable
              filterable
              placeholder="未归并"
              @change="onParentPicked"
            >
              <el-option
                v-for="item in clueChoices"
                :key="item.code"
                :label="`${item.code} · ${item.name || item.summary}`"
                :value="item.code"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="线索来源">
            <el-select v-model="form.ClueSource" class="fill" clearable filterable>
              <el-option v-for="o in options['线索来源']" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="接收时间" prop="ReceiveTime" class="fi-receive">
            <el-date-picker
              v-model="form.ReceiveTime"
              type="datetime"
              format="YYYY-MM-DD HH:mm"
              value-format="YYYY-MM-DD HH:mm:ss"
              class="fill"
            />
          </el-form-item>
        </div>
      </section>

      <section class="block form-section">
        <div class="block-head">
          <h2 class="block-title">被反映人信息</h2>
          <el-button text type="primary" :icon="Plus" @click="addTarget">添加被反映人</el-button>
        </div>
        <div v-for="(t, i) in targets" :key="t.key" class="target-card">
          <div class="target-head">
            <span class="target-index">被反映人 {{ i + 1 }}</span>
            <el-button v-if="targets.length > 1" text type="danger" :icon="Delete" @click="removeTarget(i)">
              删除
            </el-button>
          </div>
          <div class="grid">
            <el-form-item label="被反映人类型">
              <el-select v-model="t.TargetType" class="fill" @change="onTargetTypeChange(t)">
                <el-option v-for="o in options.被反映人类型" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
            <el-form-item v-if="isUnitTarget(t.TargetType)" label="单位名称">
              <el-input v-model="t.OrganizationName" />
            </el-form-item>
            <el-form-item v-else label="姓名">
              <el-input v-model="t.TargetName" />
            </el-form-item>
            <el-form-item v-if="!isUnitTarget(t.TargetType)" :class="`fi-idcard-${i}`" label="身份证号" required>
              <el-input
                v-model="t.IdCard"
                maxlength="18"
                placeholder="个人必填，18 位（末位可为 X）"
                @input="onIdCardInput(t)"
              />
            </el-form-item>
            <el-form-item v-if="isUnitTarget(t.TargetType)" label="法人姓名">
              <el-input v-model="t.LegalPerson" />
            </el-form-item>
            <template v-else>
              <el-form-item label="性别">
                <el-select v-model="t.Gender" class="fill" clearable>
                  <el-option v-for="o in options.性别" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="职级">
                <el-select v-model="t.TargetRank" class="fill" clearable>
                  <el-option v-for="o in options.职位层级" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="政治面貌">
                <el-select v-model="t.PoliticalStatus" class="fill" clearable>
                  <el-option v-for="o in options.政治面貌" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="出生年月">
                <el-date-picker v-model="t.BirthDate" type="date" value-format="YYYY-MM-DD" class="fill" />
              </el-form-item>
            </template>
            <el-form-item label="单位职务"><el-input v-model="t.TargetPost" /></el-form-item>
            <el-form-item label="工作经历"><el-input v-model="t.WorkExperience" /></el-form-item>
            <el-form-item label="联系方式"><el-input v-model="t.ContactPhone" /></el-form-item>
            <el-form-item label="联系地址"><el-input v-model="t.ContactAddress" /></el-form-item>
          </div>
        </div>
      </section>

      <section class="block form-section">
        <h2 class="block-title">信访内容</h2>
        <div class="grid">
          <el-form-item label="举报形式">
            <el-select v-model="form.ReportForm" class="fill" clearable>
              <el-option v-for="o in options.举报形式" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="举报人姓名"><el-input v-model="form.ReportName" /></el-form-item>
          <el-form-item label="联系电话"><el-input v-model="form.ReportPhone" /></el-form-item>
          <el-form-item label="反映问题摘要" class="span-3">
            <el-input v-model="form.ProblemSummary" type="textarea" :rows="4" />
          </el-form-item>
        </div>
      </section>

      <section class="block form-section">
        <h2 class="block-title">分办信息</h2>
        <div class="grid">
          <el-form-item label="分办时间">
            <el-date-picker v-model="form.AssignTime" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" class="fill" />
          </el-form-item>
          <el-form-item label="分办部室">
            <el-select v-model="assignDepts" multiple class="fill" collapse-tags collapse-tags-tooltip>
              <el-option v-for="o in options.分办部室或片区" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="承办形式">
            <el-select v-model="form.UndertakeForm" class="fill" clearable>
              <el-option v-for="o in options.承办形式" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="承办部室">
            <el-select v-model="undertakeDepts" multiple class="fill" collapse-tags collapse-tags-tooltip>
              <el-option v-for="o in options.承办部室或片区" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </el-form-item>
        </div>
      </section>

      <section class="block form-section">
        <h2 class="block-title">处置信息</h2>
        <div class="grid">
          <el-form-item label="处置时间">
            <el-date-picker
              v-model="form.DisposeTime"
              type="datetime"
              value-format="YYYY-MM-DD HH:mm:ss"
              class="fill"
              @change="syncDeadlineFromDispose"
            />
          </el-form-item>
          <el-form-item label="问题类型">
            <el-input v-model="form.ProblemType" class="fill" maxlength="100" placeholder="手工填写" />
          </el-form-item>
          <el-form-item label="处置方式">
            <el-select v-model="form.DisposeMethod" class="fill" clearable>
              <el-option v-for="o in options.处置方式" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="目前处置状态">
            <el-select v-model="form.DisposeStatus" class="fill" clearable>
              <el-option v-for="o in options.处置方式" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="应办结时间">
            <el-date-picker v-model="form.Deadline" type="date" value-format="YYYY-MM-DD" class="fill" />
          </el-form-item>
          <el-form-item label="处置进度情况" class="span-progress">
            <el-input
              v-model="form.DisposeProgress"
              type="textarea"
              :rows="5"
              maxlength="2000"
              show-word-limit
              placeholder="可写 2000 字，支持换行"
            />
          </el-form-item>
          <el-form-item label="办理情况">
            <el-input v-model="form.HandleStatus" type="textarea" :rows="3" />
          </el-form-item>
        </div>
      </section>

      <section class="block form-section">
        <h2 class="block-title">处置（核实）结果</h2>
        <div class="grid">
          <el-form-item label="处置形态">
            <el-select
              v-model="disposeForms"
              class="fill"
              multiple
              clearable
              collapse-tags
              collapse-tags-tooltip
              placeholder="可多选（第一至第四种形态）"
            >
              <el-option v-for="o in options.处置形态" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="处置结果">
            <el-select
              v-model="form.DisposeResult"
              class="fill"
              clearable
              filterable
              allow-create
              default-first-option
              placeholder="选择或直接输入"
            >
              <el-option v-for="o in options['处置（核实）结果']" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
            <p class="field-hint">字典里没有的结果，输入后按回车即可，落库按原文保存。</p>
          </el-form-item>
          <el-form-item label="是否办结">
            <el-select v-model="form.IsCompleted" class="fill">
              <el-option v-for="o in options.是否办结" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="办结时间">
            <el-date-picker v-model="form.CompleteTime" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" class="fill" />
          </el-form-item>
        </div>
      </section>

      <section class="block form-section">
        <h2 class="block-title">超期信息</h2>
        <div class="grid">
          <el-form-item label="是否超期">
            <div class="static-field">
              <el-tag :type="autoOverdue === '是' ? 'danger' : 'info'" effect="plain" size="small">{{ autoOverdue }}</el-tag>
            </div>
          </el-form-item>
          <el-form-item label="超期原因" class="span-2">
            <el-input v-model="form.OverdueReason" />
          </el-form-item>
        </div>
      </section>

      <section class="block form-section">
        <h2 class="block-title">办案人员</h2>
        <div class="grid">
          <el-form-item label="主办人"><el-input v-model="form.MainHandler" /></el-form-item>
          <el-form-item label="协办人"><el-input v-model="form.AssistantHandler" /></el-form-item>
          <el-form-item label="审核人"><el-input v-model="form.AuditHandler" /></el-form-item>
        </div>
      </section>

      <section class="block form-section">
        <h2 class="block-title">签批信息</h2>
        <div class="grid">
          <el-form-item label="领导签批">
            <el-select v-model="form.LeaderApproval" class="fill" clearable>
              <el-option v-for="o in options.领导签批" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="签批情况">
            <el-select v-model="form.ApprovalStatus" class="fill" clearable>
              <el-option v-for="o in options.签批情况" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </el-form-item>
        </div>
      </section>

      <section class="block form-section">
        <h2 class="block-title">其他信息</h2>
        <div class="grid">
          <el-form-item label="实名举报反馈情况" class="span-3">
            <el-input v-model="form.RealNameReport" type="textarea" :rows="2" />
          </el-form-item>
          <el-form-item label="备注" class="span-3">
            <el-input v-model="form.Remark" type="textarea" :rows="2" />
          </el-form-item>
        </div>
      </section>

      <section class="block form-section">
        <header class="block-head">
          <h2 class="block-title no-border">附件管理</h2>
          <div class="attach-actions">
            <el-button :icon="Upload" :loading="uploading" @click="upload">上传附件</el-button>
            <el-button :icon="Download" :disabled="!checked.length" @click="download">
              下载所选{{ checked.length ? ` (${checked.length})` : '' }}
            </el-button>
            <el-button :icon="Delete" :disabled="!checked.length" @click="removeAttachments">
              删除所选{{ checked.length ? ` (${checked.length})` : '' }}
            </el-button>
            <span class="attach-count mono">共 {{ attachments.length }} 个附件</span>
          </div>
        </header>
        <el-table
          :data="attachments"
          v-loading="attachLoading"
          border
          max-height="220"
          @selection-change="onAttachSelect"
        >
          <el-table-column type="selection" width="46" />
          <el-table-column prop="FileName" label="文件名" min-width="220" show-overflow-tooltip />
          <el-table-column label="大小" width="110" align="right">
            <template #default="{ row }">{{ formatSize(row.FileSize) }}</template>
          </el-table-column>
          <el-table-column prop="Uploader" label="上传人" width="140" />
          <el-table-column prop="UploadTime" label="上传时间" width="160" class-name="cell-mono" />
          <template #empty>
            <div class="empty">还没有附件，保存后点「上传附件」添加</div>
          </template>
        </el-table>
      </section>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { isUnitTarget } from '@/utils/enums'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, Close, Delete, Download, Plus, Upload } from '@element-plus/icons-vue'

type Option = { label: string; value: string }
type Attachment = {
  Id: number
  FileName: string
  FileSize: number | null
  UploadTime: string
  Uploader: string | null
}

const route = useRoute()
const router = useRouter()
const formRef = ref()
const saving = ref(false)
const attachments = ref<Attachment[]>([])
const checked = ref<Attachment[]>([])
const options = reactive<Record<string, Option[]>>({})
const assignDepts = ref<string[]>([])
const undertakeDepts = ref<string[]>([])
const disposeForms = ref<string[]>([])

const code = computed(() => (route.params.code as string) ?? '')
const isNew = computed(() => !code.value)
const isClue = computed(() => route.meta.kind === 'clue')
const pageTitle = computed(() => {
  const noun = isClue.value ? '线索' : '信访件'
  return isNew.value ? `新增${noun}` : `编辑${noun}`
})
const categoryName = computed(() => (isClue.value ? '问题线索' : '信访件'))

const autoOverdue = computed<string>(() => {
  if (form.IsCompleted === '是') return '否'
  const raw = String(form.Deadline ?? '').trim()
  const base = raw || String(form.ReceiveTime ?? '').trim()
  if (!base) return '否'
  const start = new Date(base.replace(' ', 'T')).getTime()
  if (Number.isNaN(start)) return '否'
  const days = isClue.value ? clueSlaDays.value : letterSlaDays.value
  const due = raw ? start : start + days * 86400000
  return due < Date.now() ? '是' : '否'
})
const clueChoices = ref<Array<{ code: string; name: string; summary: string }>>([])


function onParentPicked(code: string): void {
  form.NewCode = code ?? ''
}
const isUnit = computed(() => isUnitTarget(targets.value[0]?.TargetType ?? form.TargetType))
const ID_CARD_RE = /^(\d{17}[\dXx]|\d{15})$/

/** 一条记录可以有多个被反映人，每人一份档案 */
interface TargetItem {
  key: number
  TargetType: string
  TargetName: string
  IdCard: string
  BirthDate: string
  Gender: string
  WorkExperience: string
  OrganizationName: string
  LegalPerson: string
  ContactPhone: string
  ContactAddress: string
  TargetPost: string
  TargetRank: string
  PoliticalStatus: string
}

let targetSeed = 1
function blankTarget(): TargetItem {
  return {
    key: targetSeed++,
    TargetType: '个人',
    TargetName: '',
    IdCard: '',
    BirthDate: '',
    Gender: '',
    WorkExperience: '',
    OrganizationName: '',
    LegalPerson: '',
    ContactPhone: '',
    ContactAddress: '',
    TargetPost: '',
    TargetRank: '',
    PoliticalStatus: '',
  }
}

const targets = ref<TargetItem[]>([blankTarget()])

function addTarget(): void {
  targets.value.push(blankTarget())
}

function removeTarget(index: number): void {
  targets.value.splice(index, 1)
  if (!targets.value.length) targets.value.push(blankTarget())
}

/** 切换类型时清掉另一套字段，避免个人和企业字段混着存 */
function onTargetTypeChange(t: TargetItem): void {
  if (isUnitTarget(t.TargetType)) {
    t.TargetName = ''
    t.IdCard = ''
    t.Gender = ''
    t.TargetRank = ''
    t.PoliticalStatus = ''
    t.BirthDate = ''
  } else {
    t.OrganizationName = ''
    t.LegalPerson = ''
  }
}

/** 身份证末位 x 统一存大写，并去掉空格 */
function onIdCardInput(t: TargetItem): void {
  t.IdCard = String(t.IdCard ?? '').replace(/\s/g, '').toUpperCase()
}

const form = reactive<Record<string, any>>({
  OriginalCode: '',
  NewCode: '',
  CategoryCode: '',
  Category: '问题线索',
  ParentCode: '',
  ClueSource: '',
  ReceiveTime: '',
  TargetType: '个人',
  TargetName: '',
  IdCard: '',
  BirthDate: '',
  Gender: '',
  WorkExperience: '',
  OrganizationName: '',
  LegalPerson: '',
  ContactPhone: '',
  ContactAddress: '',
  TargetPost: '',
  TargetRank: '',
  PoliticalStatus: '',
  ProblemSummary: '',
  ReportForm: '',
  ReportName: '',
  ReportPhone: '',
  AssignTime: '',
  AssignDept: '',
  UndertakeDept: '',
  UndertakeForm: '',
  DisposeTime: '',
  DisposeMethod: '',
  DisposeStatus: '',
  ProblemType: '',
  Deadline: '',
  DisposeProgress: '',
  HandleStatus: '',
  DisposeForm: '',
  DisposeResult: '',
  IsCompleted: '否',
  CompleteTime: '',
  IsOverdue: '',
  OverdueReason: '',
  MainHandler: '',
  AssistantHandler: '',
  AuditHandler: '',
  LeaderApproval: '',
  ApprovalStatus: '',
  RealNameReport: '',
  Remark: '',
})

/** 「应办结时间」跟随「处置时间」自动加 N 天（设置里可配，默认 30）；用户手填过就不再覆盖 */
const autoDeadline = ref('')
const disposeDays = ref(30)
const letterSlaDays = ref(60)
const clueSlaDays = ref(60)

function syncDeadlineFromDispose(value: string | null | undefined): void {
  const raw = String(value ?? '').trim()
  if (!raw) return
  if (form.Deadline && form.Deadline !== autoDeadline.value) return
  const start = new Date(raw.replace(' ', 'T'))
  if (Number.isNaN(start.getTime())) return
  const due = new Date(start.getTime() + disposeDays.value * 86400000)
  const pad = (n: number): string => String(n).padStart(2, '0')
  const text = `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`
  form.Deadline = text
  autoDeadline.value = text
}

const DICT_CLASSES = [
  '信访类别',
  '被反映人类型',
  '线索来源',
  '职位层级',
  '政治面貌',
  '举报形式',
  '分办部室或片区',
  '承办部室或片区',
  '承办形式',
  '处置方式',
  '处置形态',
  '处置（核实）结果',
  '是否办结',
  '是否超期',
  '领导签批',
  '签批情况',
  '性别',
]

function formatSize(size: number | null): string {
  if (!size) return '—'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

async function loadOptions(): Promise<void> {
  await Promise.all(
    DICT_CLASSES.map(async (name) => {
      const res = await window.api.dict.options(name)
      if (res?.ok) options[name] = res.data
    }),
  )
}

async function loadComplaint(): Promise<void> {
  const res = await window.api.complaints.get(code.value)
  if (!res?.ok) {
    ElMessage.error(res?.error ?? '加载失败')
    return
  }
  Object.assign(form, res.data)
  const detailTargets = (res.data as { Targets?: Partial<TargetItem>[] }).Targets
  targets.value = detailTargets?.length
    ? detailTargets.map((item) => ({ ...blankTarget(), ...item, key: targetSeed++ }))
    : [blankTarget()]
  assignDepts.value = String(form.AssignDept ?? '').split(',').filter(Boolean)
  undertakeDepts.value = String(form.UndertakeDept ?? '').split(',').filter(Boolean)
  disposeForms.value = String(form.DisposeForm ?? '').split(',').filter(Boolean)
}

const attachLoading = ref(false)
const uploading = ref(false)

async function loadAttachments(): Promise<void> {
  if (!code.value) return
  attachLoading.value = true
  try {
    const res = await window.api.attachments.list(code.value)
    if (res?.ok) attachments.value = res.data
  } finally {
    attachLoading.value = false
  }
}

/** 把某个必填项滚到视野中间并聚焦，长表单里出错不必自己找 */
function revealField(selector: string): void {
  void nextTick(() => {
    const box = document.querySelector(selector) as HTMLElement | null
    if (!box) return
    box.scrollIntoView({ block: 'center' })
    const input = box.querySelector('input, textarea') as HTMLInputElement | null
    input?.focus({ preventScroll: true })
  })
}

async function save(): Promise<void> {
  if (!form.ReceiveTime) {
    ElMessage.warning('请先填写接收时间')
    revealField('.fi-receive')
    return
  }
  for (const [index, t] of targets.value.entries()) {
    if (isUnitTarget(t.TargetType)) continue
    const idCard = String(t.IdCard ?? '').trim()
    const who = targets.value.length > 1 ? `第 ${index + 1} 位被反映人` : '被反映人'
    if (!idCard) {
      ElMessage.warning(`${who}为个人时，请填写身份证号`)
      revealField(`.fi-idcard-${index}`)
      return
    }
    if (!ID_CARD_RE.test(idCard)) {
      ElMessage.warning(`${who}的身份证号格式不正确（18 位，末位可为 X；或 15 位旧号）`)
      revealField(`.fi-idcard-${index}`)
      return
    }
  }
  saving.value = true
  try {
    const payload: Record<string, unknown> = { ...form }
    payload.Targets = targets.value.map(({ key: _key, ...rest }) => rest)
    payload.Category = isClue.value ? '问题线索' : '信访件'
    if (isClue.value) payload.ParentCode = null
    else payload.NewCode = form.ParentCode || form.NewCode || null
    payload.AssignDept = assignDepts.value.join(',')
    payload.UndertakeDept = undertakeDepts.value.join(',')
    payload.DisposeForm = disposeForms.value.join(',')
    for (const key of Object.keys(payload)) {
      if (payload[key] === '') payload[key] = null
    }
    payload.OriginalCode = form.OriginalCode
    const res = await window.api.complaints.save({ isNew: isNew.value, data: payload })
    if (!res?.ok) {
      ElMessage.error(res?.error ?? '保存失败')
      return
    }
    dirty.value = false
    ElMessage.success(isNew.value ? '新增成功' : '保存成功')
    router.replace(isClue.value ? '/clues' : '/complaints')
  } finally {
    saving.value = false
  }
}

async function upload(): Promise<void> {
  if (isNew.value) {
    ElMessage.warning('请先保存信访记录，再上传附件')
    return
  }
  const picked = await window.api.attachments.pick()
  if (!picked?.ok) {
    ElMessage.error(picked?.error ?? '选择文件失败')
    return
  }
  if (!picked.data?.length) return
  const files = picked.data.map((filePath: string) => ({
    path: filePath,
    name: filePath.split(/[\\/]/).pop(),
    size: 0,
    type: (filePath.split('.').pop() ?? '').toUpperCase(),
  }))
  uploading.value = true
  try {
    const res = await window.api.attachments.add({ code: form.OriginalCode, files })
    if (!res?.ok) {
      ElMessage.error(res?.error ?? '上传失败')
      return
    }
    ElMessage.success(`已上传 ${files.length} 个附件`)
    await loadAttachments()
  } finally {
    uploading.value = false
  }
}

async function download(): Promise<void> {
  const res = await window.api.attachments.download(checked.value.map((item) => item.Id))
  if (!res?.ok) {
    ElMessage.error(res?.error ?? '下载失败')
    return
  }
  if (res.data > 0) ElMessage.success(`已导出 ${res.data} 个附件`)
  else ElMessage.info('没有可下载的附件')
}

async function removeAttachments(): Promise<void> {
  const count = checked.value.length
  if (!count) return
  try {
    await ElMessageBox.confirm(`删除选中的 ${count} 个附件？文件会从磁盘移除，不能恢复。`, '删除附件', {
      type: 'warning',
      confirmButtonText: `删除 ${count} 个`,
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  const res = await window.api.attachments.remove(checked.value.map((item) => item.Id))
  if (!res?.ok) {
    ElMessage.error(res?.error ?? '删除失败')
    return
  }
  ElMessage.success(`已删除 ${count} 个附件`)
  await loadAttachments()
}

function onAttachSelect(list: Attachment[]): void {
  checked.value = list
}

function goBack(): void {
  router.push(isClue.value ? '/clues' : '/complaints')
}

/** 表单分区索引：与模板中的 form-section 顺序一一对应 */
const SECTION_TITLES = [
  '编号信息',
  '基本信息',
  '被反映人信息',
  '信访内容',
  '分办信息',
  '处置信息',
  '处置（核实）结果',
  '超期信息',
  '办案人员',
  '签批信息',
  '其他信息'
]
const activeSection = ref(0)
const NAV_OFFSET = 104

function jumpTo(index: number): void {
  activeSection.value = index
  const section = document.querySelectorAll('.form-section')[index] as HTMLElement | undefined
  const scroller = headEl.value?.closest('.main') as HTMLElement | null
  if (!section || !scroller) return
  const top =
    section.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - NAV_OFFSET
  // 该窗口里 smooth 滚动会被吞掉（实测 scrollTop 不动），直接定位更可靠
  scroller.scrollTo({ top, behavior: 'auto' })
}

function trackSection(): void {
  const scroller = headEl.value?.closest('.main') as HTMLElement | null
  if (!scroller) return
  const base = scroller.getBoundingClientRect().top + NAV_OFFSET
  const sections = [...document.querySelectorAll('.form-section')] as HTMLElement[]
  let current = 0
  sections.forEach((section, index) => {
    if (section.getBoundingClientRect().top - base <= 8) current = index
  })
  activeSection.value = current
}

/** 未保存提示：进入页面回填完成后再开始记录改动 */
const hydrated = ref(false)
const dirty = ref(false)
let baseline = ''
function snapshot(): string {
  return JSON.stringify({ form, targets: targets.value })
}
watch(
  [form, targets],
  () => {
    if (!hydrated.value) return
    // 以「是否真的偏离载入时的快照」判定，避免挂载期的赋值把表单误标成已修改
    dirty.value = snapshot() !== baseline
  },
  { deep: true }
)

onBeforeRouteLeave(async (_to, _from, next) => {
  if (!dirty.value) return next()
  try {
    await ElMessageBox.confirm('当前表单有未保存的修改，确定离开吗？', '离开页面', {
      type: 'warning',
      confirmButtonText: '放弃修改并离开',
      cancelButtonText: '继续编辑',
      distinguishCancelAndClose: true
    })
    dirty.value = false
    next()
  } catch {
    next(false)
  }
})

function onKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    if (!saving.value) void save()
  }
}

function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (!dirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

const headEl = ref<HTMLElement | null>(null)
const stuck = ref(false)

onMounted(async () => {
  const scroller = headEl.value?.closest('.main') as HTMLElement | null
  const onScroll = (): void => {
    stuck.value = (scroller?.scrollTop ?? 0) > 4
    trackSection()
  }
  scroller?.addEventListener('scroll', onScroll, { passive: true })
  onBeforeUnmount(() => scroller?.removeEventListener('scroll', onScroll))

  const cfg = await window.api.settings.get()
  if (cfg?.ok) {
    disposeDays.value = cfg.data.disposeDays ?? 30
    letterSlaDays.value = cfg.data.letterSlaDays ?? 60
    clueSlaDays.value = cfg.data.clueSlaDays ?? 60
  }

  await loadOptions()
  if (!isClue.value) {
    const res = await window.api.complaints.clueOptions()
    if (res?.ok) clueChoices.value = res.data
    const fromQuery = route.query.clue
    if (isNew.value && typeof fromQuery === 'string') form.ParentCode = fromQuery
  }
  if (isNew.value) {
    const res = await window.api.complaints.nextCode(isClue.value ? 'clue' : 'letter')
    if (res?.ok) form.OriginalCode = res.data
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    form.ReceiveTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
      now.getHours(),
    )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  } else {
    await loadComplaint()
    await loadAttachments()
  }
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('beforeunload', onBeforeUnload)
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown)
    window.removeEventListener('beforeunload', onBeforeUnload)
  })
  hydrated.value = true
  baseline = snapshot()
  dirty.value = false
})
</script>

<style scoped>
/* 分区索引：长表单的定位条，吸附在页头之下 */
.section-nav {
  position: sticky;
  top: 3.5rem;
  z-index: 5;
  display: flex;
  gap: 0.25rem;
  overflow-x: auto;
  padding: 0.375rem 0;
  margin: -0.25rem 0 0.75rem;
  background: var(--page);
  scrollbar-width: none;
}
.section-nav::-webkit-scrollbar {
  display: none;
}
.sec-chip {
  flex: none;
  padding: 0.25rem 0.5rem;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-2);
  font-size: 0.8125rem;
  line-height: 1.5;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}
.sec-chip:hover {
  background: var(--surface);
  border-color: var(--rule);
  color: var(--ink);
}
.sec-chip.active {
  background: var(--surface);
  border-color: var(--rule);
  color: var(--harbor);
  font-weight: 600;
}
.sec-chip:focus-visible {
  outline: 2px solid var(--harbor);
  outline-offset: 1px;
}

.field-hint {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  line-height: 1.45;
  color: var(--ink-3);
}
.span-progress :deep(.el-textarea__inner) {
  padding-bottom: 1.625rem;
}

.page {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

/* 长表单：页头吸顶，滚动时保存/取消始终可见 */

.head-title {
  min-width: 0;
}

.block-title.no-border {
  border-left: none;
  padding-left: 0;
  margin-bottom: 0;
}

/* 两列栅格：字段成对排列，行不会再留半行空洞；多行文本与地址独占整行 */
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 1.5rem;
}

.form :deep(.el-form-item) {
  margin-bottom: 1rem;
}

.form :deep(.el-form-item__label) {
  font-size: 0.8125rem;
  line-height: 1.35;
  color: var(--ink-2);
  padding: 0 0 0.3125rem;
  min-height: 0;
}

.grid > .el-form-item:has(textarea) {
  grid-column: 1 / -1;
}

.span-2 { grid-column: span 2; }
.span-3 { grid-column: 1 / -1; }

.fill { width: 100%; }

.attach-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.attach-count {
  font-size: 0.8125rem;
  color: var(--ink-3);
}

.empty {
  color: var(--ink-3);
  font-size: 0.875rem;
  padding: 0.75rem 0;
}

@media (max-width: 72rem) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.static-field {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2rem;
}
.static-value {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--ink);
}
.static-hint {
  font-size: 0.75rem;
  color: var(--ink-3);
}
.target-card {
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  padding: 0.75rem 0.875rem 0.125rem;
  background: var(--page);
}

.target-card + .target-card {
  margin-top: 0.75rem;
}

.target-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.target-index {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--ink-2);
}

</style>
