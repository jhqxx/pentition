<template>
  <div class="page">
    <section class="block">
      <div class="toolbar">
        <el-select v-model="filter.module" placeholder="操作模块" clearable class="w-40" @change="reload">
          <el-option v-for="item in facets.modules" :key="item" :label="item" :value="item" />
        </el-select>
        <el-select v-model="filter.type" placeholder="操作类型" clearable class="w-36" @change="reload">
          <el-option v-for="item in facets.types" :key="item" :label="item" :value="item" />
        </el-select>
        <el-date-picker
          v-model="range"
          type="daterange"
          value-format="YYYY-MM-DD"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          unlink-panels
          class="w-range"
          @change="reload"
        />
        <el-input v-model="filter.user" placeholder="操作人" clearable class="w-36" @keyup.enter="reload" />
        <el-input v-model="filter.keyword" placeholder="内容 / 对象" clearable class="w-52" @keyup.enter="reload" />
        <span class="filter-actions">
          <el-button :icon="Download" @click="exportLogs">导出 Excel</el-button>
          <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
          <el-button :icon="Refresh" @click="reset">重置</el-button>
        </span>
      </div>

      <div ref="tableWrap" class="table-wrap">
      <el-table v-loading="loading" :data="rows" border stripe :height="tableHeight">
        <el-table-column label="时间" width="168" class-name="cell-mono">
          <template #default="{ row }">{{ shortTime(row.OperationTime) }}</template>
        </el-table-column>
        <el-table-column label="操作人" width="150">
          <template #default="{ row }">
            {{ row.UserRealName || row.UserName }}
            <span class="role" v-if="row.UserRole === 'Admin' && row.UserRealName !== '系统管理员'">管理员</span>
          </template>
        </el-table-column>
        <el-table-column prop="OperationType" label="类型" width="100" />
        <el-table-column prop="OperationModule" label="模块" width="110" />
        <el-table-column prop="OperationContent" label="内容" min-width="180" show-overflow-tooltip />
        <el-table-column prop="TargetName" label="对象" width="130" show-overflow-tooltip />
        <el-table-column prop="IPAddress" label="IP" width="122" class-name="cell-mono" show-overflow-tooltip />
        <template #empty>
          <div class="tbl-empty">
            <p>{{ hasLogFilter ? '没有符合条件的日志' : '暂无操作日志' }}</p>
            <el-button v-if="hasLogFilter" link type="primary" @click="reset">清空筛选条件</el-button>
          </div>
        </template>
      </el-table>
      </div>

      <div class="pager">
        <el-pagination
          v-model:current-page="filter.page"
          v-model:page-size="filter.pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          background
          @current-change="load"
          @size-change="reload"
        />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Download, Refresh, Search } from '@element-plus/icons-vue'

type LogRow = {
  Id: number
  UserName: string
  UserRealName: string | null
  UserRole: string | null
  OperationType: string
  OperationModule: string
  OperationContent: string | null
  TargetName: string | null
  IPAddress: string | null
  OperationTime: string
}

const loading = ref(false)
/** 日期范围单独存，reload 时映射成 from/to 传给后端 */
const range = ref<[string, string] | null>(null)
const hasLogFilter = computed(() =>
  Boolean(filter.module || filter.type || filter.user || filter.keyword.trim() || range.value?.length),
)
const rows = ref<LogRow[]>([])
const total = ref(0)
const facets = reactive<{ modules: string[]; types: string[] }>({ modules: [], types: [] })

const filter = reactive({
  module: '',
  type: '',
  user: '',
  keyword: '',
  page: 1,
  pageSize: 20,
})

function shortTime(value: string | null): string {
  if (!value) return '—'
  return String(value).slice(0, 19)
}

/** 日期范围映射成 from/to，和后端的 date() 比较对齐 */
function query(): Record<string, unknown> {
  return { ...filter, from: range.value?.[0] ?? '', to: range.value?.[1] ?? '' }
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await window.api.logs.list(query())
    if (!res?.ok) return
    rows.value = res.data.rows
    total.value = res.data.total
  } finally {
    loading.value = false
  }
}

function reload(): void {
  filter.page = 1
  load()
}

function reset(): void {
  filter.module = ''
  filter.type = ''
  filter.user = ''
  filter.keyword = ''
  range.value = null
  reload()
}

async function exportLogs(): Promise<void> {
  const res = await window.api.exports.logs(query())
  if (!res?.ok) {
    ElMessage.error(res?.error ?? '导出失败')
    return
  }
  ElMessage.success(res.data ? `已导出到 ${res.data}` : '已取消导出')
}

const tableWrap = ref<HTMLElement | null>(null)
const tableHeight = ref(420)
let wrapObserver: ResizeObserver | null = null

function measureTable(): void {
  const el = tableWrap.value
  if (!el) return
  tableHeight.value = Math.max(240, Math.round(el.clientHeight))
}

onUnmounted(() => {
  wrapObserver?.disconnect()
  wrapObserver = null
})

onMounted(async () => {
  measureTable()
  if (tableWrap.value) {
    wrapObserver = new ResizeObserver(measureTable)
    wrapObserver.observe(tableWrap.value)
  }
  const res = await window.api.logs.facets()
  if (res?.ok) Object.assign(facets, res.data)
  load()
})
</script>

<style scoped>
.table-wrap {
  flex: 1 1 auto;
  min-height: 0;
}

.page {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.filter-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}

.block {
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  gap: 0.75rem;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.w-36 { width: 9rem; }
.w-range {
  width: 16rem;
}
.w-40 { width: 10rem; }
.w-52 { width: 13rem; }

.role {
  margin-left: 0.375rem;
  font-size: 0.75rem;
  color: var(--ink-3);
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.75rem;
}

.empty {
  color: var(--ink-3);
  font-size: 0.875rem;
  padding: 0.75rem 0;
}
</style>
