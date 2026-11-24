<template>
  <div class="page">
    <div class="layout">
      <section class="pane pane-left">
        <header class="pane-head">
          <span class="pane-title">字典分类</span>
          <el-button link type="primary" :icon="Plus" @click="openClassCreate">新增分类</el-button>
        </header>
        <div class="pane-search">
          <el-input v-model="classKw" size="small" clearable placeholder="搜索分类" :prefix-icon="Search" />
        </div>
        <ul class="class-list">
          <li
            v-for="item in filteredClasses"
            :key="item.Id"
            :class="['class-item', { active: item.Id === activeId }]"
            @click="selectClass(item.Id)"
          >
            <div class="class-main">
              <span class="class-name">{{ item.ClassName }}</span>
              <span class="class-count mono">{{ item.itemCount }}</span>
            </div>
            <span v-if="item.Description && item.Description !== item.ClassName" class="class-desc">{{ item.Description }}</span>
            <div class="class-actions">
              <el-button link type="primary" @click.stop="openClassEdit(item)">编辑</el-button>
              <el-button link type="danger" @click.stop="removeClass(item)">删除</el-button>
            </div>
          </li>
          <li v-if="!filteredClasses.length" class="class-empty">
            {{ classes.length ? '没有符合条件的分类' : '暂无字典分类' }}
          </li>
        </ul>
      </section>

      <section class="pane pane-right">
        <header class="pane-head">
          <span class="pane-title">{{ activeClass?.ClassName || '字典项' }}</span>
          <span class="pane-tools">
            <el-input
              v-model="kw"
              class="pane-search-input"
              clearable
              placeholder="搜索键值 / 显示值"
              :prefix-icon="Search"
            />
            <el-button v-if="items.length && !kw.trim()" link @click="toggleExpand">
              {{ expandAll ? '收起全部' : '展开全部' }}
            </el-button>
            <span class="pane-hint">
              {{ kw.trim() ? `匹配 ${shownCount} / 共 ${totalItemCount}` : `共 ${totalItemCount} 项` }}
            </span>
            <el-button type="primary" :icon="Plus" :disabled="!activeId" @click="openItemCreate()">
              新增字典项
            </el-button>
          </span>
        </header>
        <el-table
          :key="`${activeId}-${expandAll}-${kw}`"
          v-loading="loading"
          :data="filteredItems"
          :row-class-name="({ row }: { row: DictItem }) => (row.Id === highlightId ? 'row-flash' : '')"
          row-key="Id"
          :tree-props="{ children: 'children' }"
          :default-expand-all="expandAll || Boolean(kw.trim())"
          border
          stripe
        >
          <el-table-column prop="ItemKey" label="键值" min-width="120" class-name="cell-mono" />
          <el-table-column label="显示值" min-width="180">
            <template #default="{ row }">
              <span class="level-dot" :class="row.ParentId ? 'level-3' : 'level-2'" />
              {{ row.ItemValue }}
            </template>
          </el-table-column>
          <el-table-column prop="SortOrder" label="排序" width="70" align="center" />
          <el-table-column label="说明" min-width="160" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.Description && row.Description !== row.ItemValue">{{ row.Description }}</span>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="188" class-name="cell-actions">
            <template #default="{ row }">
              <el-button v-if="!row.ParentId" link type="primary" @click="openItemCreate(row)">加子项</el-button>
              <el-button link type="primary" @click="openItemEdit(row)">编辑</el-button>
              <el-button link type="danger" @click="removeItem(row)">删除</el-button>
            </template>
          </el-table-column>
          <template #empty>
            <div class="empty">{{ kw.trim() ? '没有符合条件的字典项' : '该字典下暂无字典项' }}</div>
          </template>
        </el-table>
      </section>
    </div>

    <el-dialog v-model="classDialog" :title="classForm.id ? '编辑字典分类' : '新增字典分类'" width="28rem" destroy-on-close>
      <el-form :model="classForm" label-width="5.5rem">
        <el-form-item label="字典名称" required>
          <el-input v-model="classForm.className" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="classForm.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="classDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitClass">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="itemDialog" :title="itemForm.id ? '编辑字典项' : '新增字典项'" width="30rem" destroy-on-close>
      <el-form :model="itemForm" label-width="5.5rem">
        <el-form-item label="上级项">
          <el-select v-model="itemForm.parentId" clearable placeholder="无（二级字典项）" :disabled="itemForm.id > 0" class="fill">
            <el-option
              v-for="root in rootItems"
              :key="root.Id"
              :label="`${root.ItemValue}（${root.ItemKey}）`"
              :value="root.Id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="键值" required>
          <el-input v-model="itemForm.itemKey" placeholder="如 XS1001" />
        </el-form-item>
        <el-form-item label="显示值" required>
          <el-input v-model="itemForm.itemValue" placeholder="如 基层报送" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="itemForm.sortOrder" :min="0" :max="9999" controls-position="right" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="itemForm.description" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="itemDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitItem">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'

type DictClass = {
  Id: number
  ClassName: string
  Description: string | null
  itemCount: number
}

type DictItem = {
  Id: number
  ClassId: number
  ParentId: number | null
  ItemKey: string
  ItemValue: string
  SortOrder: number
  Description: string | null
  children?: DictItem[]
}

const classes = ref<DictClass[]>([])
const classKw = ref('')
const kw = ref('')
const expandAll = ref(true)
/** 新增/编辑后短暂高亮该行并滚到可见处 */
const highlightId = ref<number | null>(null)
const loading = ref(false)
const items = ref<DictItem[]>([])
const activeId = ref<number | null>(null)
const classDialog = ref(false)
const itemDialog = ref(false)
const saving = ref(false)

const classForm = reactive({ id: 0, className: '', description: '' })
const itemForm = reactive({ id: 0, parentId: null as number | null, itemKey: '', itemValue: '', sortOrder: 0, description: '' })

const activeClass = computed(() => classes.value.find((item) => item.Id === activeId.value) ?? null)

/** 左栏按名称 / 说明过滤分类 */
const filteredClasses = computed(() => {
  const q = classKw.value.trim().toLowerCase()
  if (!q) return classes.value
  return classes.value.filter(
    (item) =>
      item.ClassName.toLowerCase().includes(q) ||
      String(item.Description ?? '').toLowerCase().includes(q),
  )
})

function matchItem(row: DictItem, q: string): boolean {
  return (
    String(row.ItemKey ?? '').toLowerCase().includes(q) ||
    String(row.ItemValue ?? '').toLowerCase().includes(q)
  )
}

/** 右栏按键值 / 显示值过滤；父项命中带出全部子项，子项命中保留父项 + 命中的子项 */
const filteredItems = computed<DictItem[]>(() => {
  const q = kw.value.trim().toLowerCase()
  if (!q) return items.value
  const out: DictItem[] = []
  for (const top of items.value) {
    if (matchItem(top, q)) {
      out.push(top)
      continue
    }
    const children = (top.children ?? []).filter((child) => matchItem(child, q))
    if (children.length) out.push({ ...top, children })
  }
  return out
})

/** 字典项总数（含子项） */
const totalItemCount = computed(() =>
  items.value.reduce((sum, top) => sum + 1 + (top.children?.length ?? 0), 0),
)

/** 过滤后可见的行数（含子项），用于「匹配 N / 共 M」提示 */
const shownCount = computed(() =>
  filteredItems.value.reduce((sum, top) => sum + 1 + (top.children?.length ?? 0), 0),
)

function toggleExpand(): void {
  expandAll.value = !expandAll.value
}

const totalItems = computed(() => classes.value.reduce((sum, item) => sum + item.itemCount, 0))
const rootItems = computed(() => items.value.filter((item) => !item.ParentId))

async function loadClasses(keepId?: number): Promise<void> {
  const res = await window.api.dict.classes()
  if (!res?.ok) return
  classes.value = res.data
  const next = keepId ?? activeId.value ?? res.data[0]?.Id ?? null
  if (next) selectClass(next)
  else {
    activeId.value = null
    items.value = []
  }
}

async function loadItems(): Promise<void> {
  if (!activeId.value) return
  loading.value = true
  try {
    const res = await window.api.dict.items(activeId.value)
    if (res?.ok) items.value = res.data
  } finally {
    loading.value = false
  }
}

function selectClass(id: number): void {
  activeId.value = id
  loadItems()
}

function openClassCreate(): void {
  Object.assign(classForm, { id: 0, className: '', description: '' })
  classDialog.value = true
}

function openClassEdit(row: DictClass): void {
  Object.assign(classForm, { id: row.Id, className: row.ClassName, description: row.Description ?? '' })
  classDialog.value = true
}

async function submitClass(): Promise<void> {
  if (!classForm.className.trim()) {
    ElMessage.warning('字典名称不能为空')
    return
  }
  saving.value = true
  try {
    const res = await window.api.dict.saveClass({
      id: classForm.id || undefined,
      className: classForm.className.trim(),
      description: classForm.description,
    })
    if (!res?.ok) {
      ElMessage.error(res?.error ?? '保存失败')
      return
    }
    ElMessage.success('已保存')
    classDialog.value = false
    await loadClasses(classForm.id || res.data)
  } finally {
    saving.value = false
  }
}

async function removeClass(row: DictClass): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `删除字典「${row.ClassName}」会同时删除其下 ${row.itemCount} 个字典项，删除后不可恢复。确定删除？`,
      '删除字典',
      {
      type: 'warning',
    })
  } catch {
    return
  }
  const res = await window.api.dict.removeClass(row.Id)
  if (!res?.ok) {
    ElMessage.error(res?.error ?? '删除失败')
    return
  }
  ElMessage.success('已删除')
  if (activeId.value === row.Id) activeId.value = null
  await loadClasses()
}

function openItemCreate(parent?: DictItem): void {
  Object.assign(itemForm, {
    id: 0,
    parentId: parent?.Id ?? null,
    itemKey: '',
    itemValue: '',
    sortOrder: 0,
    description: '',
  })
  itemDialog.value = true
}

function openItemEdit(row: DictItem): void {
  Object.assign(itemForm, {
    id: row.Id,
    parentId: row.ParentId,
    itemKey: row.ItemKey,
    itemValue: row.ItemValue,
    sortOrder: row.SortOrder,
    description: row.Description ?? '',
  })
  itemDialog.value = true
}

async function submitItem(): Promise<void> {
  if (!activeId.value) return
  if (!itemForm.itemKey.trim() || !itemForm.itemValue.trim()) {
    ElMessage.warning('键值与显示值不能为空')
    return
  }
  saving.value = true
  try {
    const res = await window.api.dict.saveItem({
      id: itemForm.id || undefined,
      classId: activeId.value,
      parentId: itemForm.parentId ?? null,
      itemKey: itemForm.itemKey.trim(),
      itemValue: itemForm.itemValue.trim(),
      sortOrder: itemForm.sortOrder,
      description: itemForm.description,
    })
    if (!res?.ok) {
      ElMessage.error(res?.error ?? '保存失败')
      return
    }
    ElMessage.success('已保存')
    itemDialog.value = false
    const savedId = typeof res.data === 'number' ? res.data : null
    await Promise.all([loadItems(), loadClasses(activeId.value ?? undefined)])
    if (savedId) {
      highlightId.value = savedId
      await nextTick()
      document.querySelector('.el-table__body tr.row-flash')?.scrollIntoView({ block: 'nearest' })
      window.setTimeout(() => (highlightId.value = null), 1600)
    }
  } finally {
    saving.value = false
  }
}

async function removeItem(row: DictItem): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除字典项「${row.ItemValue}」后不可恢复。确定删除？`, '删除字典项', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }
  const res = await window.api.dict.removeItem(row.Id)
  if (!res?.ok) {
    ElMessage.error(res?.error ?? '删除失败')
    return
  }
  ElMessage.success('已删除')
  await Promise.all([loadItems(), loadClasses(activeId.value ?? undefined)])
}

onMounted(() => loadClasses())
</script>

<style scoped>
.level-dot {
  display: inline-block;
  width: 0.3125rem;
  height: 0.3125rem;
  border-radius: 50%;
  margin-right: 0.375rem;
  vertical-align: 0.0625rem;
}

.level-2 {
  background: var(--harbor);
}

.level-3 {
  background: var(--rule-2);
}

.page {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 100%;
}

.layout {
  display: grid;
  grid-template-columns: minmax(13rem, 17rem) minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}

.pane {
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  padding: 0.75rem;
}

.pane-search {
  padding: 0.5rem 0.75rem 0;
}

.pane-search-input {
  width: 12.5rem;
}

.pane-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.625rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--rule);
}

.pane-hint {
  font-size: 0.75rem;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}

.pane-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--ink);
}

.class-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.class-item {
  padding: 0.5rem 0.625rem;
  border-radius: var(--r-sm);
  cursor: pointer;
  border: 1px solid transparent;
}

.class-item:hover {
  background: var(--surface-alt);
}

.class-item.active {
  background: #eaf2f9;
  border-color: #c9dcee;
}

.class-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.class-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--ink);
}

.class-count {
  font-size: 0.75rem;
  color: var(--ink-3);
}

.class-desc {
  display: block;
  font-size: 0.75rem;
  color: var(--ink-3);
  margin-top: 0.125rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.class-actions {
  display: none;
  gap: 0.25rem;
  margin-top: 0.25rem;
}

.class-item:hover .class-actions {
  display: flex;
}

.class-empty,
.empty {
  color: var(--ink-3);
  font-size: 0.875rem;
  padding: 0.75rem 0;
  text-align: center;
}

@media (max-width: 64rem) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
