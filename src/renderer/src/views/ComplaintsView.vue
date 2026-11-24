<template>
  <div class="page">

    <section class="filters">
      <span v-if="!isClue && filter.clue" class="scope-chip">
        仅看线索 {{ filter.clue }}
        <el-button link type="primary" size="small" @click="clearClueScope">取消</el-button>
      </span>
      <span v-if="filter.code" class="scope-chip">
        仅看 {{ filter.code }}
        <el-button link type="primary" size="small" @click="clearCodeScope">取消</el-button>
      </span>
      <el-select
        v-if="convertView"
        v-model="filter.parent"
        placeholder="转线索状态"
        clearable
        class="w-140"
        @change="reload"
      >
        <el-option label="未转线索" value="none" />
        <el-option label="已转线索" value="any" />
      </el-select>
      <el-select v-if="!convertView" v-model="filter.disposeForm" placeholder="处置形态" clearable class="w-160" @change="reload">
        <el-option v-for="item in disposeOptions" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
      <el-select v-if="!convertView" v-model="filter.late" placeholder="办结时效" clearable class="w-120" @change="reload">
        <el-option label="超期办结" value="1" />
      </el-select>
      <el-input
        v-model="filter.keyword"
        placeholder="编号 / 姓名 / 问题摘要 / 主办人"
        clearable
        class="w-260"
        @keyup.enter="searchNow"
      />
      <span v-if="convertView" class="head-actions">
        <el-button :icon="Search" @click="reload">搜索</el-button>
        <el-button :icon="RefreshLeft" @click="reset">重置</el-button>
      </span>

      <div v-if="!convertView" class="head-actions">
        <el-button :icon="Search" @click="reload">搜索</el-button>
        <el-button :icon="RefreshLeft" @click="reset">重置</el-button>
        <el-button v-if="!filter.deleted && !convertView" type="primary" :icon="Plus" @click="openNew">
          {{ isClue ? '新增线索' : '登记信访件' }}
        </el-button>
        <el-button v-if="selection.length && !filter.deleted && !convertView" :icon="Delete" type="danger" plain @click="removeSelected">
          删除 {{ selection.length }} 条
        </el-button>
        <el-button v-if="selection.length && filter.deleted && !convertView" :icon="RefreshRight" @click="restoreSelected">
          恢复 {{ selection.length }} 条
        </el-button>
        <el-button v-if="!filter.deleted && !convertView" :icon="Download" @click="openExport">导出</el-button>
        <el-dropdown
          v-if="!convertView"
          trigger="click"
          @command="onPageCommand"
        >
          <el-button :icon="MoreFilled">更多</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="!isClue && !filter.deleted" command="import" :icon="Upload">导入 Excel</el-dropdown-item>
              <el-dropdown-item v-if="!isClue && !filter.deleted" command="template" :icon="Document">下载导入模板</el-dropdown-item>
              <el-dropdown-item v-if="!filter.deleted" command="print" :icon="Printer">打印台账</el-dropdown-item>
              <el-dropdown-item command="recycle" :icon="RefreshLeft">
                {{ filter.deleted ? '返回列表' : '回收站' }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <span v-if="selection.length" class="sel-chip">
          已选 {{ selection.length }} 条
          <el-button link type="primary" @click="clearSelection">清空</el-button>
        </span>
      </div>
    </section>

    <div v-if="!convertView" class="list-bar">
      <el-tabs v-if="!filter.deleted && !statusLocked && !convertView" v-model="filter.tab" class="tabs" @tab-change="reload">
        <el-tab-pane :label="`全部 (${tabs.all ?? 0})`" name="all" />
        <el-tab-pane v-if="!isClue" :label="`实名举报 (${tabs.real ?? 0})`" name="real" />
        <el-tab-pane v-if="!isClue" :label="`匿名举报 (${tabs.anonymous ?? 0})`" name="anonymous" />
        <el-tab-pane :label="`办理中 (${tabs.processing ?? 0})`" name="processing" />
        <el-tab-pane :label="`已办结 (${tabs.completed ?? 0})`" name="completed" />
        <el-tab-pane :label="`已超期 (${tabs.overdue ?? 0})`" name="overdue" />
      </el-tabs>
    </div>

    <div ref="tableWrap" class="table-wrap">
      <el-table
      ref="tableRef"
      @header-contextmenu="openHeaderMenu"
      @header-dragend="onHeaderDragEnd"
      v-loading="loading"
      :data="rows"
      border
      stripe
      :row-class-name="rowClass"
      :height="tableHeight"
      row-key="OriginalCode"
      @selection-change="onSelectionChange"
      @row-dblclick="openDetail"
    >
      <template v-if="!convertView">
      <el-table-column type="selection" width="36" fixed="left" reserve-selection />
      <el-table-column type="index" label="序号" :width="cw('序号', 56)" align="center" fixed="left" :index="indexMethod" />
      <el-table-column prop="OriginalCode" label="原始编号" :width="cw('原始编号', 128)" class-name="cell-mono" fixed="left" />
      <el-table-column v-if="!isClue" label="所属线索" :width="cw('所属线索', 92)" class-name="cell-mono">
        <template #default="{ row }">
          <el-button v-if="row.ParentCode" link type="primary" @click="focusClue(row.ParentCode)">
            {{ row.ParentCode }}
          </el-button>
          <span v-else class="muted">未关联</span>
        </template>
      </el-table-column>
      <el-table-column label="被反映对象" :width="cw('被反映对象', 96)" show-overflow-tooltip class-name="cell-target">
        <template #default="{ row }">
          <span>{{ targetPrimary(row) }}</span>
          <span class="cell-sub">{{ targetSub(row) }}</span>
        </template>
      </el-table-column>
      <el-table-column v-if="showRelatedCode" label="关联编号" :width="cw('关联编号', 116)" class-name="cell-mono">
        <template #default="{ row }">
          <span v-if="row.NewCode || row.CategoryCode">{{ row.NewCode || row.CategoryCode }}</span>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="问题摘要" :width="flexW">
        <template #default="{ row }">
          <el-tooltip
            :content="tipOf(row.ProblemSummary)"
            placement="top"
            effect="dark"
            :show-after="350"
            popper-class="summary-tip"
          >
            <span class="cell-ellipsis">{{ row.ProblemSummary }}</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="线索来源" :width="cw('线索来源', 82)" show-overflow-tooltip>
        <template #default="{ row }">{{ labelOf(clueLabelMap, row.ClueSource) }}</template>
      </el-table-column>
      <el-table-column v-if="isClue" label="信访件" :width="cw('信访件', 68)">
        <template #default="{ row }">
          <el-button
            v-if="childCounts[row.OriginalCode]"
            link
            type="primary"
            @click="focusLetters(row.OriginalCode)"
          >
            {{ childCounts[row.OriginalCode] }}
          </el-button>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column prop="MainHandler" label="主办人" :width="cw('主办人', 70)" />
      <el-table-column label="状态" :width="cw('状态', 136)">
        <template #default="{ row }">
          <el-tooltip :disabled="row.IsLateCompleted !== '是'" placement="top" :show-after="300" :content="lateTip(row)">
            <span class="status-cell">
              <span class="status-text">{{ statusOf(row).label }}</span>
              <span v-if="row.IsLateCompleted === '是'" class="late-badge">超期办结</span>
            </span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="接收时间" :width="cw('接收时间', 104)" class-name="cell-mono">
        <template #default="{ row }">
          <el-tooltip :content="shortTime(row.ReceiveTime)" placement="top" :show-after="300">
            <span class="cell-date">{{ dateOnly(row.ReceiveTime) }}</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column
        label="操作"
        :width="cw('操作', filter.deleted ? 100 : 152)"
        fixed="right"
        class-name="cell-actions"
      >
        <template #default="{ row }">
          <el-button v-if="!filter.deleted" link type="primary" @click="openHandle(row)">办理</el-button>
          <el-button link type="primary" @click="openDetail(row)">查看</el-button>
          <template v-if="filter.deleted">
            <el-button link @click="restoreRow(row)">恢复</el-button>
          </template>
          <el-dropdown v-else trigger="click" class="row-more" @command="(cmd: string) => onRowCommand(cmd, row)">
            <el-button link class="more-btn">更多<el-icon class="more-icon"><ArrowDown /></el-icon></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="edit">编辑</el-dropdown-item>
                <el-dropdown-item
                  v-if="!isClue && row.ParentCode"
                  command="unlink"
                  :disabled="!allowUnlink && !!row.ConvertedTime"
                >
                  取消关联
                </el-dropdown-item>
                <el-dropdown-item v-if="!isClue && !row.ParentCode" command="link">关联线索</el-dropdown-item>
                <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
      </template>
      <template v-else>
        <el-table-column type="index" label="序号" :width="cw('序号', 60)" align="center" />
        <el-table-column prop="OriginalCode" label="信访编号" :width="cw('信访编号', 156)" class-name="cell-mono" />
        <el-table-column label="被反映人/单位" :min-width="cw('被反映人/单位', 200)">
          <template #default="{ row }">
            <span>{{ targetPrimary(row) }}</span>
            <span class="cell-sub">{{ targetSub(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="接收时间" width="120" class-name="cell-mono">
          <template #default="{ row }">{{ dateOnly(row.ReceiveTime) }}</template>
        </el-table-column>
        <el-table-column label="转线索状态" :width="cw('转线索状态', 230)">
          <template #default="{ row }">
            <div v-if="row.ParentCode" class="conv-cell">
              <el-tag size="small" type="success" effect="plain">已转</el-tag>
              <el-button link type="primary" @click="focusClue(row.ParentCode)">{{ row.ParentCode }}</el-button>
            </div>
            <div v-else class="conv-cell">
              <el-tag size="small" effect="plain">未转</el-tag>
              <el-button link type="primary" @click="convertToClue('basic', String(row.OriginalCode))">
                转为线索
              </el-button>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" :width="cw('操作', 90)" fixed="right" class-name="cell-actions">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">查看</el-button>
          </template>
        </el-table-column>
      </template>
      <template #empty>
        <div class="tbl-empty">
          <p>{{ filter.deleted ? '回收站为空' : hasFilter ? '没有符合条件的记录' : '暂无记录' }}</p>
          <el-button v-if="hasFilter && !filter.deleted" link type="primary" @click="reset">清空筛选条件</el-button>
        </div>
      </template>
    </el-table>
    </div>

    <div class="pager">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @current-change="load"
        @size-change="reload"
      />
    </div>

    <el-drawer v-model="detailVisible" :title="isClue ? '线索详情' : '信访详情'" size="46%">
      <template #header>
        <div class="drawer-head">
          <span class="drawer-title">{{ isClue ? '线索详情' : '信访详情' }}</span>
          <div class="drawer-actions">
            <template v-if="detail && !isClue">
              <el-button class="act" size="small" @click="convertToClue('basic')">转为线索</el-button>
              <el-button class="act" size="small" type="primary" plain @click="convertToClue('full')">转线索（含办理）</el-button>
            </template>
            <el-button v-if="detail && !detail.IsDeleted" class="act" size="small" @click="handleFromDetail">办理</el-button>
            <el-button v-if="detail && !detail.IsDeleted" class="act" size="small" :icon="Edit" @click="editFromDetail">
              编辑
            </el-button>
            <el-button v-if="detail" class="act" size="small" :icon="Printer" @click="printOne">打印</el-button>
          </div>
        </div>
      </template>
      <div v-if="detail" class="detail">
        <section v-if="!isClue && detail.ParentCode" class="linked">
          <h3>所属线索</h3>
          <p class="linked-row">
            <el-button link type="primary" class="mono" @click="openLinked(detail.ParentCode, 'clue')">
              {{ detail.ParentCode }}
            </el-button>
            <span class="linked-hint">点编号查看线索详情</span>
          </p>
        </section>

        <section v-if="isClue && related.length" class="linked">
          <h3>关联信访件（{{ related.length }}）</h3>
          <el-table
            :data="related"
            border
            size="small"
            class="related-table"
            :row-class-name="rowClass"
          >
            <el-table-column prop="OriginalCode" label="原始编号" width="118" class-name="cell-mono" />
            <el-table-column prop="TargetName" label="被反映人" min-width="110" show-overflow-tooltip />
            <el-table-column label="问题摘要" min-width="150">
              <template #default="{ row }">
                <el-tooltip
                  :content="tipOf(row.ProblemSummary)"
                  placement="top"
                  effect="dark"
                  :show-after="350"
                  popper-class="summary-tip"
                >
                  <span class="cell-ellipsis">{{ row.ProblemSummary }}</span>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="92">
              <template #default="{ row }">
                <span class="status-text">{{ statusOf(row).label }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="70">
              <template #default="{ row }">
                <el-button link type="primary" @click="openLinked(row.OriginalCode, 'letter')">查看</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>

        <section v-for="group in detailGroups" :key="group.title">
          <h3>{{ group.title }}</h3>
          <dl>
            <template v-for="field in group.fields" :key="field.label">
              <dt>{{ field.label }}</dt>
              <dd>{{ field.value || '—' }}</dd>
            </template>
          </dl>
        </section>
      </div>
    </el-drawer>

    <el-drawer
      v-model="handleVisible"
      :title="handleRow ? `办理 · ${handleRow.OriginalCode}` : '办理'"
      size="34rem"
      append-to-body
    >
      <div class="handle">
        <section class="hblock">
          <h4 class="hblock-title">处置信息</h4>
          <el-form label-position="top" class="hform">
            <div class="hgrid">
              <el-form-item label="处置时间">
                <el-date-picker
                  v-model="handleForm.DisposeTime"
                  type="datetime"
                  value-format="YYYY-MM-DD HH:mm:ss"
                  format="YYYY-MM-DD HH:mm"
                  placeholder="选择时间"
                  style="width: 100%"
                />
              </el-form-item>
              <el-form-item label="问题类型">
                <el-input v-model="handleForm.ProblemType" maxlength="100" placeholder="手工填写" />
              </el-form-item>
              <el-form-item label="处置方式">
                <el-select v-model="handleForm.DisposeMethod" clearable placeholder="选择处置方式" style="width: 100%">
                  <el-option v-for="o in handleOptions['处置方式']" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="目前处置状态">
                <el-select v-model="handleForm.DisposeStatus" clearable placeholder="同处置方式" style="width: 100%">
                  <el-option v-for="o in handleOptions['处置方式']" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="应办结时间">
                <el-date-picker
                  v-model="handleForm.Deadline"
                  type="date"
                  value-format="YYYY-MM-DD"
                  format="YYYY-MM-DD"
                  placeholder="选择日期"
                  style="width: 100%"
                />
              </el-form-item>
              <el-form-item label="处置形态（可多选）" class="hspan2">
                <el-select v-model="handleForms" multiple collapse-tags collapse-tags-tooltip placeholder="可同时选择多种形态" style="width: 100%">
                  <el-option v-for="o in disposeOptions" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="处置进度情况" class="hspan2">
                <el-input v-model="handleForm.DisposeProgress" type="textarea" :rows="3" maxlength="2000" show-word-limit />
              </el-form-item>
              <el-form-item label="办理情况" class="hspan2">
                <el-input v-model="handleForm.HandleStatus" type="textarea" :rows="2" maxlength="500" />
              </el-form-item>
            </div>
          </el-form>
        </section>

        <section class="hblock">
          <h4 class="hblock-title">处置（核实）结果</h4>
          <el-form label-position="top" class="hform">
            <div class="hgrid">
              <el-form-item label="处置结果" class="hspan2">
                <el-select
                  v-model="handleForm.DisposeResult"
                  filterable
                  allow-create
                  default-first-option
                  clearable
                  placeholder="选择或直接输入"
                  style="width: 100%"
                >
                  <el-option v-for="o in handleOptions['处置（核实）结果']" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="是否办结">
                <el-select v-model="handleForm.IsCompleted" style="width: 100%" @change="syncHandleComplete">
                  <el-option v-for="o in handleOptions['是否办结']" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="办结时间">
                <el-date-picker
                  v-model="handleForm.CompleteTime"
                  type="datetime"
                  value-format="YYYY-MM-DD HH:mm:ss"
                  format="YYYY-MM-DD HH:mm"
                  :disabled="handleForm.IsCompleted !== '是'"
                  placeholder="办结后自动带出"
                  style="width: 100%"
                />
              </el-form-item>
              <el-form-item label="是否超期">
                <div class="static-value">
                  <el-tag :type="overdueAuto === '是' ? 'danger' : 'info'" effect="plain" size="small">{{ overdueAuto }}</el-tag>
                  <el-tag v-if="handleLate === '是'" type="danger" effect="plain" size="small">超期办结</el-tag>
                  <span v-if="handleLate === '是'" class="late-hint">{{ lateTip({ ...handleRow, Deadline: handleForm.Deadline, CompleteTime: handleForm.CompleteTime }) }}</span>
                </div>
              </el-form-item>
              <el-form-item label="超期原因">
                <el-input v-model="handleForm.OverdueReason" maxlength="200" placeholder="超期时填写" />
              </el-form-item>
            </div>
          </el-form>
        </section>

        <section class="hblock">
          <h4 class="hblock-title">承办与签批</h4>
          <el-form label-position="top" class="hform">
            <div class="hgrid">
              <el-form-item label="主办人">
                <el-input v-model="handleForm.MainHandler" maxlength="40" />
              </el-form-item>
              <el-form-item label="协办人">
                <el-input v-model="handleForm.AssistantHandler" maxlength="40" />
              </el-form-item>
              <el-form-item label="审核人">
                <el-input v-model="handleForm.AuditHandler" maxlength="40" />
              </el-form-item>
              <el-form-item label="领导签批">
                <el-select v-model="handleForm.LeaderApproval" clearable placeholder="选择" style="width: 100%">
                  <el-option v-for="o in handleOptions['领导签批']" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="签批情况">
                <el-select v-model="handleForm.ApprovalStatus" clearable placeholder="选择" style="width: 100%">
                  <el-option v-for="o in handleOptions['签批情况']" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="实名举报反馈情况" class="hspan2">
                <el-input v-model="handleForm.RealNameReport" type="textarea" :rows="2" maxlength="500" />
              </el-form-item>
            </div>
          </el-form>
        </section>
      </div>
      <template #footer>
        <div class="hfoot">
          <span class="hfoot-hint">是否办结选「是」会自动带出办结时间；是否超期选「是」需填超期原因</span>
          <div class="hfoot-acts">
            <el-button @click="handleVisible = false">取消</el-button>
            <el-button type="primary" :loading="handleSaving" @click="saveHandle">保存办理情况</el-button>
          </div>
        </div>
      </template>
    </el-drawer>

    <el-drawer v-model="linkedVisible" :title="linkedTitle" size="46%" append-to-body>
      <div v-if="linked" class="detail">
        <section v-if="linkedKind === 'letter' && linked.ParentCode" class="linked">
          <h3>所属线索</h3>
          <p class="linked-row">
            <el-button link type="primary" class="mono" @click="openLinked(linked.ParentCode, 'clue')">
              {{ linked.ParentCode }}
            </el-button>
            <span class="linked-hint">点编号查看线索详情</span>
          </p>
        </section>
        <section v-if="linkedKind === 'clue'" class="linked">
          <h3>关联信访件（{{ related.length }}）</h3>
          <p v-if="!related.length" class="linked-hint">这条线索下还没有关联的信访件</p>
          <el-table v-else :data="related" border class="related-table" :row-class-name="rowClass">
            <el-table-column prop="OriginalCode" label="原始编号" width="140" class-name="cell-mono" />
            <el-table-column label="被反映对象" min-width="120" show-overflow-tooltip>
              <template #default="{ row }">
                {{ targetPrimary(row) }}<span v-if="targetSub(row)" class="target-sub">{{ targetSub(row) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="92">
              <template #default="{ row }">
                <span class="status-text">{{ statusOf(row).label }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="76" class-name="cell-actions">
              <template #default="{ row }">
                <el-button link type="primary" @click="openLinked(String(row.OriginalCode), 'letter')">查看</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>
        <section v-for="group in linkedGroups" :key="group.title">
          <h3>{{ group.title }}</h3>
          <dl>
            <template v-for="field in group.fields" :key="field.label">
              <dt>{{ field.label }}</dt>
              <dd>{{ field.value || '—' }}</dd>
            </template>
          </dl>
        </section>
      </div>
    </el-drawer>

    <Teleport to="body">
    <div
      v-if="headerMenu"
      class="col-menu"
      role="menu"
      :style="{ left: `${headerMenu.x}px`, top: `${headerMenu.y}px` }"
      @mousedown.stop
      @keydown="onHeaderMenuKeydown"
    >
      <button ref="colMenuFirst" type="button" class="col-menu-item" role="menuitem" @click="exportHeaderColumn">
        <span class="col-menu-name">{{ headerMenu.label }}</span>
        <span class="col-menu-hint">只导出这一列</span>
      </button>
      <button type="button" class="col-menu-item" role="menuitem" @click="exportWholeTable">
        <span class="col-menu-name">全部列</span>
        <span class="col-menu-hint">打开导出面板</span>
      </button>
    </div>
    </Teleport>

    <el-drawer v-model="exportVisible" size="26rem" :with-header="false" class="export-drawer">
      <div class="ex-head">
        <div class="ex-head-text">
          <h2>导出{{ isClue ? '线索' : '信访件' }}</h2>
          <p>选好行范围和列，导出的 Excel 只含你勾的列。</p>
        </div>
        <el-button class="ex-close" link :icon="Close" title="关闭" @click="exportVisible = false" />
      </div>
      <div class="ex-body">
        <section class="ex-sec">
          <h3>哪些行</h3>
          <el-radio-group v-model="exportScope" size="small" class="ex-scope">
            <el-radio-button value="filter">当前筛选 {{ total }} 行</el-radio-button>
            <el-radio-button value="selected" :disabled="!selection.length">已勾选 {{ selection.length }} 行</el-radio-button>
          </el-radio-group>
          <p v-if="!selection.length" class="ex-hint">只导某几行时，先在列表左侧勾选。</p>
        </section>
        <section class="ex-sec ex-sec-grow">
          <h3>哪些列 <span class="ex-count">{{ pickedColumns.length }} / {{ allColumns.length }}</span></h3>
          <div class="ex-tools">
            <el-input v-model="colKeyword" size="small" clearable placeholder="搜索列名" />
            <el-button link type="primary" @click="pickAllColumns">全选</el-button>
            <el-button link @click="pickedColumns = []">清空</el-button>
          </div>
          <div class="ex-list">
            <template v-for="group in filteredGroups" :key="group.title">
              <p class="ex-group">{{ group.title }}</p>
              <div v-for="name in group.columns" :key="name" class="ex-row">
                <el-checkbox v-model="pickedColumns" :value="name">{{ name }}</el-checkbox>
                <el-button link class="ex-only" @click="pickedColumns = [name]">仅此列</el-button>
              </div>
            </template>
            <p v-if="!filteredGroups.length" class="ex-hint">没有匹配的列名。</p>
          </div>
        </section>
        <section class="ex-sec ex-sec-preview">
          <h3>
            预览
            <span class="ex-count">共 {{ previewTotal || previewRows.length || 0 }} 行 · {{ previewColumns.length }} 列<span class="ex-count-hint">（被反映人多人时一人一行）</span></span>
          </h3>
          <div class="ex-preview">
            <p class="ex-preview-title">{{ previewTitle || '—' }}</p>
            <div class="ex-preview-scroll">
              <table>
                <thead>
                  <tr>
                    <th v-for="name in previewColumns" :key="name">{{ name }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, index) in previewRows" :key="index">
                    <td v-for="name in previewColumns" :key="name">{{ row[name] || '—' }}</td>
                  </tr>
                  <tr v-if="!previewRows.length">
                    <td class="ex-preview-empty" :colspan="previewColumns.length || 1">暂无数据</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
      <footer class="ex-foot">
        <div class="ex-foot-main">
          <span class="ex-summary" :class="{ 'is-warn': !pickedColumns.length }">
            {{ pickedColumns.length ? exportSummary : '至少选一列' }}
          </span>
          <p v-if="lastExport" class="ex-last">
            上次导出：<span class="mono">{{ lastExport.file }}</span> · {{ lastExport.time }}
            <el-button link type="primary" @click="revealDownloads">打开下载文件夹</el-button>
          </p>
        </div>
        <div class="ex-actions">
          <el-button @click="exportVisible = false">取消</el-button>
          <el-button type="primary" :disabled="!pickedColumns.length" :loading="exporting" @click="doExport">导出</el-button>
        </div>
      </footer>
    </el-drawer>

    <el-dialog v-model="assignVisible" title="关联线索" width="32rem">
      <p class="assign-hint">已选 {{ assignCodes.length }} 件信访件。选择一条问题线索作为主单。</p>
      <el-select v-model="assignClue" filterable clearable placeholder="搜索编号 / 被反映人 / 摘要" class="assign-select">
        <el-option v-for="item in clueChoices" :key="item.code" :label="`${item.code} · ${item.name}`" :value="item.code">
          <span class="mono">{{ item.code }}</span>
          <span class="assign-summary">{{ item.name }} {{ item.summary ? '· ' + item.summary : '' }}</span>
        </el-option>
      </el-select>
      <template #footer>
        <el-button @click="assignVisible = false">取消</el-button>
        <el-button :disabled="!assignClue" type="primary" @click="confirmAssign">关联</el-button>
        <el-button @click="detachAssign">取消关联</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { isClueCategory, isCompleted, isOverdue, isUnitTarget } from '@/utils/enums'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, Close, Delete, Document, Download, Edit, MoreFilled, Plus, Printer, RefreshLeft, RefreshRight, Search, Upload } from '@element-plus/icons-vue'

type Row = Record<string, any>

const router = useRouter()
const route = useRoute()
const isClue = computed(() => route.meta.kind === 'clue')
/** 信访转线索页：展示全部信访件，并在列里标出「已转 / 未转」 */
const convertView = ref(false)
/** 系统设置里是否允许取消信访件与线索的关联 */
const allowUnlink = ref(true)

/** 导航「未完结 / 已完结 / 信访转线索」是同一页的不同入口，标题跟着走 */
/** 从「案件管理 / 未完结、已完结」进来时，页面锁定在该状态，不再给切换条件 */
const statusLocked = computed(() => route.query.completed === '否' || route.query.completed === '是')

const pageTitle = computed(() => {
  if (route.query.deleted === '1') return '回收站'
  if (route.query.completed === '否') return '未完结'
  if (route.query.completed === '是') return '已完结'
  if (route.query.parent === 'any') return '信访转线索'
  return isClue.value ? '线索' : '信访'
})
const loading = ref(false)
const hasFilter = computed(() =>
  Boolean(filter.keyword || filter.disposeForm || filter.late || filter.parent || filter.deleted || filter.tab !== 'all')
)
const rows = ref<Row[]>([])
/** 关联编号列只在真的有值时才出现（历史数据里 NewCode/CategoryCode 常为空） */
const showRelatedCode = computed(() =>
  rows.value.some((r) => Boolean(r.NewCode || r.CategoryCode)),
)
const childCounts = ref<Record<string, number>>({})
const clueChoices = ref<Array<{ code: string; name: string; summary: string }>>([])
const assignVisible = ref(false)
const assignCodes = ref<string[]>([])
const assignClue = ref('')
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

/** 列表只显示日期，完整时间进 tooltip，避免窄列折成三行 */
function dateOnly(value: unknown): string {
  const text = String(value ?? '')
  return text ? text.slice(0, 10) : '—'
}


/** 列表里的被反映人：主被反映人 + 「等 N 人」 */
function targetPrimary(row: Record<string, any>): string {
  const name = isUnitTarget(row.TargetType) ? row.OrganizationName : row.TargetName
  const count = Number(row.TargetCount ?? 0)
  const base = name || '—'
  return count > 1 ? `${base} 等${count}人` : base
}

function targetSub(row: Record<string, any>): string {
  const count = Number(row.TargetCount ?? 0)
  return count > 1 ? `${targetTypeLabel(row.TargetType)} · 共 ${count} 人` : targetTypeLabel(row.TargetType)
}

/** 序号跨页连续：第 2 页第 1 行是 21（按当前排序后的行序） */
function indexMethod(index: number): number {
  return (page.value - 1) * pageSize.value + index + 1
}
const tabs = ref<Record<string, number>>({})
const selection = ref<Row[]>([])
const disposeOptions = ref<Array<{ label: string; value: string }>>([])
const disposeLabelMap = ref<Record<string, string>>({})
/** 列宽按「页面」各自记忆：拖过哪个页面的列，就只影响那个页面 */
const COL_DEFAULTS: Record<string, number> = {
  序号: 56,
  原始编号: 128,
  所属线索: 92,
  被反映对象: 96,
  关联编号: 116,
  问题摘要: 84,
  线索来源: 82,
  信访件: 68,
  主办人: 70,
  状态: 136,
  接收时间: 104,
  操作: 152,
  信访编号: 156,
  '被反映人/单位': 200,
  转线索状态: 230,
}
const colWidths = ref<Record<string, number>>({})
const colStorageKey = computed(
  () => `ui.colWidths.${route.path}${convertView.value ? ':convert' : ''}`,
)

/** 编号类列不能被历史拖拽宽度压窄到显示不全，至少保持默认宽 */
const MIN_KEYS = new Set(['原始编号', '关联编号', '所属线索', '信访编号', '接收时间'])

/** 弹性列（问题摘要 / 被反映人）至少留够表头不折行的宽度 */
const FLEX_KEYS = new Set(['问题摘要', '被反映人/单位'])

function cw(key: string, fallback?: number): number {
  const base = colWidths.value[key] ?? fallback ?? COL_DEFAULTS[key] ?? 100
  // 编号 / 接收时间这类「最小必需宽」不受历史拖拽值影响，避免被压窄或撑破
  if (MIN_KEYS.has(key)) return COL_DEFAULTS[key] ?? fallback ?? 84
  if (FLEX_KEYS.has(key)) return Math.max(base, COL_DEFAULTS[key] ?? 84)
  return base
}

function loadColWidths(): void {
  try {
    const raw = localStorage.getItem(colStorageKey.value)
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {}
    // 丢掉过窄的历史脏数据，避免列被挤成竖排
    colWidths.value = Object.fromEntries(Object.entries(parsed).filter(([, w]) => Number(w) >= 40))
  } catch {
    colWidths.value = {}
  }
}

function saveColWidths(): void {
  try {
    localStorage.setItem(colStorageKey.value, JSON.stringify(colWidths.value))
  } catch {
    /* 存不下就算了，只影响记忆 */
  }
}


/** 弹性列（问题摘要 / 被反映人）的宽度：容器宽度减去其余列，保证表格始终铺满 */
const flexW = ref(120)

function relayout(): void {
  tableRef.value?.doLayout?.()
  // 两次 rAF：第一次让 EP 重排，第二次把残余的 1~2px 空隙也吸收掉
  requestAnimationFrame(() => {
    computeFlex()
    requestAnimationFrame(() => computeFlex())
  })
}

/** 弹性列宽度 = 表格可用宽度 − 其余各列宽度；用「排除自身」的方式测量，结果幂等、不会来回震荡 */
function computeFlex(): void {
  const el =
    ((tableRef.value as unknown as { $el?: HTMLElement } | null)?.$el as HTMLElement | undefined) ??
    (document.querySelector('.page .el-table') as HTMLElement | null)
  if (!el) return
  const ths = [...el.querySelectorAll('.el-table__header-wrapper th')] as HTMLElement[]
  if (ths.length < 2) return
  const key = convertView.value ? '被反映人' : '问题摘要'
  const flexTh = ths.find((th) => th.innerText.trim().startsWith(key))
  if (!flexTh) return
  const others = ths.reduce((n, th) => (th === flexTh ? n : n + th.getBoundingClientRect().width), 0)
  const avail = el.getBoundingClientRect().width
  const next = Math.max(84, Math.round(avail - others))
  if (next !== flexW.value) flexW.value = next
}

function onWindowResize(): void {
  relayout()
  window.setTimeout(relayout, 160)
}

function onHeaderDragEnd(newWidth: number, _oldWidth: number, column: { label?: string; property?: string }): void {
  const key = column.label || column.property || ''
  if (!key) return
  // 弹性列只记「最小宽度」，剩余宽度交给它自己撑开，表格右侧就不会留白
  colWidths.value = { ...colWidths.value, [key]: Math.max(Math.round(newWidth), COL_DEFAULTS[key] ?? 40) }
  saveColWidths()
  nextTick(() => relayout())
}

const tableWrap = ref<HTMLElement | null>(null)
const tableRef = ref<{ clearSelection: () => void; doLayout?: () => void } | null>(null)
const tableHeight = ref(420)
let wrapObserver: ResizeObserver | null = null

function measureTable(): void {
  const el = tableWrap.value
  if (!el) return
  tableHeight.value = Math.max(240, Math.round(el.clientHeight))
}

onMounted(() => {
  window.addEventListener('resize', onWindowResize)
  document.addEventListener('click', closeHeaderMenu)
  measureTable()
  if (tableWrap.value) {
    wrapObserver = new ResizeObserver(() => {
      measureTable()
      relayout()
    })
    wrapObserver.observe(tableWrap.value)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', onWindowResize)
  document.removeEventListener('click', closeHeaderMenu)
  wrapObserver?.disconnect()
  wrapObserver = null
})

const exporting = ref(false)
const lastExport = ref<{ file: string; time: string } | null>(readLastExport())

function readLastExport(): { file: string; time: string } | null {
  try {
    const raw = localStorage.getItem('ui.exportLastExport')
    if (!raw) return null
    const parsed = JSON.parse(raw) as { file?: string; time?: string }
    return parsed.file ? { file: parsed.file, time: parsed.time ?? '' } : null
  } catch {
    return null
  }
}

function revealDownloads(): void {
  void window.api.app.reveal('downloads')
}
const handleVisible = ref(false)
const handleSaving = ref(false)
const handleRow = ref<Row | null>(null)
const handleForm = ref<Record<string, string>>({})
const handleForms = ref<string[]>([])
const handleOptions = ref<Record<string, Array<{ label: string; value: string }>>>({})
const overdueAuto = computed<string>(() => {
  const row = handleRow.value
  const f = handleForm.value
  if (!row) return '否'
  if (f.IsCompleted === '是') return '否'
  const raw = String(f.Deadline ?? '').trim()
  const base = raw || String(row.ReceiveTime ?? '').trim()
  if (!base) return '否'
  const start = new Date(base.replace(' ', 'T')).getTime()
  if (Number.isNaN(start)) return '否'
  const days = isClueCategory(row.Category) ? clueSlaDays.value : letterSlaDays.value
  const due = raw ? start : start + days * 86400000
  return due < Date.now() ? '是' : '否'
})

const handleLate = computed<string>(() => {
  const row = handleRow.value
  const f = handleForm.value
  if (!row || f.IsCompleted !== '是') return '否'
  const raw = String(f.Deadline || row.Deadline || '').trim()
  const base = raw || String(row.ReceiveTime ?? '').trim()
  if (!base) return '否'
  const start = new Date(base.replace(' ', 'T')).getTime()
  if (Number.isNaN(start)) return '否'
  const days = isClueCategory(row.Category) ? clueSlaDays.value : letterSlaDays.value
  const due = raw ? start : start + days * 86400000
  const done = new Date(String(f.CompleteTime || '').replace(' ', 'T')).getTime()
  if (Number.isNaN(done)) return '否'
  return done > due ? '是' : '否'
})
const detailVisible = ref(false)
const colMenuFirst = ref<HTMLButtonElement | null>(null)
const linkedVisible = ref(false)
const linked = ref<Record<string, any> | null>(null)
const linkedKind = ref<'clue' | 'letter'>('clue')
const related = ref<Array<Record<string, any>>>([])
const linkedTitle = computed(() => (linkedKind.value === 'clue' ? '线索详情' : '信访详情'))
const detail = ref<Row | null>(null)

const filter = reactive({
  deleted: false,
  tab: 'all',
  parent: '',
  clue: '',
  code: '',
  disposeForm: '',
  late: '',
  reportForm: '',
  isCompleted: '',
  keyword: '',
})

const categoryOptions = ref<Array<{ label: string; value: string }>>([])
const categoryMap = ref<Record<string, string>>({
  '0': '问题线索',
  '1': '信访件',
  问题线索: '问题线索',
  信访件: '信访件',
})
const targetTypeMap = ref<Record<string, string>>({ ORG: '单位', IND: '个人', 单位: '单位', 个人: '个人' })
const reportFormMap: Record<string, string> = {
  JB1001: '实名',
  JB1002: '匿名',
  实名: '实名',
  匿名: '匿名',
}
const clueLabelMap = ref<Record<string, string>>({})
const dictMaps = ref<Record<string, Record<string, string>>>({})
const dictLabel = (className: string, value: unknown) => {
  if (value == null || value === '') return ''
  const map = dictMaps.value[className]
  return map?.[String(value)] ?? String(value)
}

const categoryLabel = (v: string) => categoryMap.value[v] ?? v ?? '—'
const targetTypeLabel = (v: string) => targetTypeMap.value[v] ?? v ?? '—'
const reportFormLabel = (v: string) => reportFormMap[v] ?? v ?? '—'
const labelOf = (map: Record<string, string>, v: string) => map[v] ?? v ?? '—'
/** 多选列（逗号拼接）：逐段翻译后用顿号连接 */
const labelsOf = (map: Record<string, string>, v?: string | null): string =>
  String(v ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => map[part] ?? part)
    .join('、')


/** 详情里的被反映人：多人时每人一组 */
function targetGroups(row: Record<string, any>) {
  const group = (title: string, fields: Array<[string, any]>) => ({
    title,
    fields: fields.map(([label, value]) => ({ label, value: value == null ? '' : String(value) })),
  })
  const list: Array<Record<string, any>> =
    Array.isArray(row.Targets) && row.Targets.length ? row.Targets : [row]
  const many = list.length > 1
  return list.map((t, index) =>
    group(many ? `被反映人 ${index + 1}` : '被反映人', [
      ['类型', targetTypeLabel(t.TargetType)],
      ['姓名', t.TargetName],
      ['身份证号', t.IdCard],
      ['性别', dictLabel('性别', t.Gender)],
      ['出生年月', t.BirthDate],
      ['单位职务', t.TargetPost],
      ['职级', dictLabel('职位层级', t.TargetRank)],
      ['政治面貌', dictLabel('政治面貌', t.PoliticalStatus)],
      ['单位名称', t.OrganizationName],
      ['法人姓名', t.LegalPerson],
      ['工作经历', t.WorkExperience],
      ['联系方式', t.ContactPhone],
      ['联系地址', t.ContactAddress],
    ]),
  )
}

function buildGroups(row: Record<string, any>) {
  const group = (title: string, fields: Array<[string, any]>) => ({
    title,
    fields: fields.map(([label, value]) => ({ label, value: value == null ? '' : String(value) })),
  })
  return [
    group('编号信息', [
      ['原始编号', row.OriginalCode],
      ['信访编号', row.CategoryCode],
      ...(isClueCategory(row.Category) ? ([['线索编号', row.NewCode]] as Array<[string, any]>) : []),
    ]),
    group('基本信息', [
      ['类别', categoryLabel(row.Category)],
      ...(isClueCategory(row.Category) ? [] : ([['所属线索', row.ParentCode]] as Array<[string, any]>)),
      ['线索来源', dictLabel('线索来源', row.ClueSource)],
      ['接收时间', shortTime(row.ReceiveTime)],
    ]),
    ...targetGroups(row),
    group('信访内容', [
      ['举报形式', reportFormLabel(row.ReportForm)],
      ['举报人姓名', row.ReportName],
      ['联系电话', row.ReportPhone],
      ['反映问题摘要', row.ProblemSummary],
    ]),
    group('分办信息', [
      ['分办时间', row.AssignTime],
      ['分办部室', row.AssignDept],
      ['承办形式', dictLabel('承办形式', row.UndertakeForm)],
      ['承办部室', row.UndertakeDept],
    ]),
    group('处置信息', [
      ['处置时间', row.DisposeTime],
      ['问题类型', row.ProblemType],
      ['处置方式', dictLabel('处置方式', row.DisposeMethod)],
      ['目前处置状态', dictLabel('处置方式', row.DisposeStatus)],
      ['应办结时间', row.Deadline],
      ['处置进度情况', row.DisposeProgress],
      ['办理情况', row.HandleStatus],
    ]),
    group('处置（核实）结果', [
      ['处置形态', labelsOf(disposeLabelMap.value, row.DisposeForm)],
      ['处置结果', dictLabel('处置（核实）结果', row.DisposeResult)],
      ['是否办结', isCompleted(row.IsCompleted) ? '是' : '否'],
      ['办结时间', row.CompleteTime],
    ]),
    group('超期信息', [
      ['是否超期', isOverdue(row.IsOverdue) ? '是' : '否'],
      ['超期办结', row.IsLateCompleted === '是' ? '是' : '否'],
      ['超期原因', row.OverdueReason],
    ]),
    group('办案人员', [
      ['主办人', row.MainHandler],
      ['协办人', row.AssistantHandler],
      ['审核人', row.AuditHandler],
    ]),
    group('签批信息', [
      ['领导签批', dictLabel('领导签批', row.LeaderApproval)],
      ['签批情况', dictLabel('签批情况', row.ApprovalStatus)],
    ]),
    group('其他信息', [
      ['实名举报反馈情况', row.RealNameReport],
      ['备注', row.Remark],
    ]),
  ]
}

const detailGroups = computed(() => buildGroups(detail.value ?? {}))
const linkedGroups = computed(() => buildGroups(linked.value ?? {}))

async function load(): Promise<void> {
  loading.value = true
  try {
    await fetchRows()
  } finally {
    loading.value = false
  }
}

async function fetchRows(): Promise<void> {
  const res = await window.api.complaints.list({
    ...filter,
    category: isClue.value ? '0' : '1',
    page: page.value,
    pageSize: pageSize.value,
  })
  if (!res?.ok) {
    ElMessage.error(res?.error ?? '加载失败')
    return
  }
  rows.value = res.data.rows
  total.value = res.data.total
  tabs.value = res.data.tabs
  childCounts.value = res.data.childCounts ?? {}
  // 数据/分页变化会改变行数与滚动条状态，列宽需要重新分配一次
  await nextTick()
  const wrapEl = tableWrap.value?.querySelector('.el-table__body-wrapper .el-scrollbar__wrap') as HTMLElement | null
  if (wrapEl) wrapEl.scrollTop = 0
  relayout()
  window.setTimeout(relayout, 280)
}

function reload(): void {
  page.value = 1
  load()
}

/** 回车立即查询：跳过 350ms 防抖 */
function searchNow(): void {
  window.clearTimeout(keywordTimer)
  reload()
}

/** 关键词即输即查（350ms 防抖），不用再按「搜索」 */
let keywordTimer: number | undefined
watch(
  () => filter.keyword,
  () => {
    window.clearTimeout(keywordTimer)
    keywordTimer = window.setTimeout(() => reload(), 350)
  }
)

function reset(): void {
  filter.tab = 'all'
  filter.parent = ''
  filter.disposeForm = ''
  filter.late = ''
  filter.reportForm = ''
  filter.isCompleted = ''
  filter.keyword = ''
  page.value = 1
  load()
}

function onSelectionChange(list: Row[]): void {
  selection.value = list
}

/** 清空勾选（表格内部 reserve-selection 的缓存也要清） */
function clearSelection(): void {
  tableRef.value?.clearSelection()
  selection.value = []
}

function openNew(): void {
  const base = isClue.value ? '/clues/new' : '/complaints/new'
  router.push(filter.clue && !isClue.value ? `${base}?clue=${encodeURIComponent(filter.clue)}` : base)
}

function openEdit(row: Row): void {
  if (!row) return
  const base = isClue.value ? '/clues' : '/complaints'
  router.push(`${base}/${encodeURIComponent(row.OriginalCode)}/edit`)
}

function focusLetters(clueCode: string): void {
  router.push({ path: '/complaints', query: { clue: clueCode } })
}

function focusClue(clueCode: string): void {
  router.push({ path: '/clues', query: { code: clueCode } })
}

function clearCodeScope(): void {
  filter.code = ''
  const query = { ...route.query }
  delete query.code
  router.replace({ path: route.path, query })
}

function clearClueScope(): void {
  filter.clue = ''
  router.replace('/complaints')
  reload()
}

function onPageCommand(command: string): void {
  if (command === 'import') return void importExcel()
  if (command === 'template') return void downloadTemplate()
  if (command === 'print') return void printList()
  if (command === 'recycle') return void toggleRecycle()
}

/** 下载 Excel 导入模板（表头 + 个人/单位示例 + 填写说明） */
async function downloadTemplate(): Promise<void> {
  const res = await window.api.complaints.importTemplate()
  if (!res?.ok) {
    ElMessage.error(res?.error ?? '生成导入模板失败')
    return
  }
  const name = String(res.data ?? '').split('/').pop()
  ElMessage.success(`模板已生成：${name}（下载文件夹）`)
}

async function onRowCommand(command: string, row: Row): Promise<void> {
  if (command === 'edit') return openEdit(row)
  if (command === 'link') return openAssign(row)
  if (command === 'unlink') return unlinkRow(row)
  if (command === 'delete') return removeRow(row)
}

/** 取消信访件与线索的关联（是否允许由系统设置控制） */
async function unlinkRow(row: Row): Promise<void> {
  const code = String(row.OriginalCode)
  try {
    await ElMessageBox.confirm(
      `取消信访件 ${code} 与线索 ${row.ParentCode} 的关联？信访件本身会保留。`,
      '取消关联',
      { confirmButtonText: '取消关联', cancelButtonText: '再想想', type: 'warning' },
    )
  } catch {
    return
  }
  const res = await window.api.complaints.assign({ codes: [code], clueCode: null })
  if (!res?.ok) {
    ElMessage.error(res?.error ?? '取消关联失败')
    return
  }
  ElMessage.success('已取消关联')
  await load()
}

async function openAssign(row: Row): Promise<void> {
  assignCodes.value = row ? [String(row.OriginalCode)] : selection.value.map((item) => String(item.OriginalCode))
  if (!assignCodes.value.length) return
  if (!clueChoices.value.length) {
    const res = await window.api.complaints.clueOptions()
    if (res?.ok) clueChoices.value = res.data
  }
  assignClue.value = (row?.ParentCode as string) ?? ''
  assignVisible.value = true
}

async function confirmAssign(): Promise<void> {
  const res = await window.api.complaints.assign({ codes: assignCodes.value, clueCode: assignClue.value })
  if (!res?.ok) {
    ElMessage.error(res?.error ?? '关联失败')
    return
  }
  ElMessage.success(`已关联 ${res.data} 件信访件`)
  assignVisible.value = false
  load()
}

async function detachAssign(): Promise<void> {
  const res = await window.api.complaints.assign({ codes: assignCodes.value, clueCode: null })
  if (!res?.ok) {
    ElMessage.error(res?.error ?? '移出失败')
    return
  }
  ElMessage.success(`已移出 ${res.data} 件信访件`)
  assignVisible.value = false
  load()
}

function nowText(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 独立「办理」：只改办理/处置/办结这一组字段，不必进整张表单 */
async function openHandle(row: Row): Promise<void> {
  const res = await window.api.complaints.get(row.OriginalCode)
  if (!res?.ok) {
    ElMessage.error(res?.error ?? '加载失败')
    return
  }
  const d = res.data as Row
  handleRow.value = d
  handleForm.value = {
    DisposeTime: d.DisposeTime ?? '',
    ProblemType: d.ProblemType ?? '',
    DisposeMethod: d.DisposeMethod ?? '',
    DisposeStatus: d.DisposeStatus ?? '',
    Deadline: d.Deadline ?? '',
    DisposeProgress: d.DisposeProgress ?? '',
    HandleStatus: d.HandleStatus ?? '',
    DisposeResult: d.DisposeResult ?? '',
    IsCompleted: d.IsCompleted || '否',
    CompleteTime: d.CompleteTime ?? '',
    IsOverdue: d.IsOverdue || '否',
    OverdueReason: d.OverdueReason ?? '',
    MainHandler: d.MainHandler ?? '',
    AssistantHandler: d.AssistantHandler ?? '',
    AuditHandler: d.AuditHandler ?? '',
    LeaderApproval: d.LeaderApproval ?? '',
    ApprovalStatus: d.ApprovalStatus ?? '',
    RealNameReport: d.RealNameReport ?? '',
  }
  handleForms.value = String(d.DisposeForm ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  handleVisible.value = true
}

function handleFromDetail(): void {
  const row = detail.value
  if (!row) return
  detailVisible.value = false
  void openHandle(row)
}

/** 选「是」自动带出办结时间，改回「否」清空 */
function syncHandleComplete(): void {
  const f = handleForm.value
  if (f.IsCompleted === '是') {
    if (!f.CompleteTime) f.CompleteTime = nowText()
  } else {
    f.CompleteTime = ''
  }
}

async function saveHandle(): Promise<void> {
  const row = handleRow.value
  if (!row || handleSaving.value) return
  const f = handleForm.value
  if (f.IsCompleted === '是' && !f.CompleteTime) {
    ElMessage.error('已办结的记录请填写办结时间')
    return
  }
  if (overdueAuto.value === '是' && !String(f.OverdueReason ?? '').trim()) {
    ElMessage.error('已超期的记录请填写超期原因')
    return
  }
  handleSaving.value = true
  try {
    const payload: Record<string, unknown> = {
      OriginalCode: row.OriginalCode,
      Category: row.Category,
      TargetName: row.TargetName ?? null,
      CreateTime: row.CreateTime ?? undefined,
      DisposeTime: f.DisposeTime || null,
      ProblemType: f.ProblemType || null,
      DisposeMethod: f.DisposeMethod || null,
      DisposeStatus: f.DisposeStatus || null,
      Deadline: f.Deadline || null,
      DisposeForm: handleForms.value.join(',') || null,
      DisposeProgress: f.DisposeProgress || null,
      HandleStatus: f.HandleStatus || null,
      DisposeResult: f.DisposeResult || null,
      IsCompleted: f.IsCompleted,
      CompleteTime: f.IsCompleted === '是' ? f.CompleteTime : null,
      OverdueReason: f.IsOverdue === '是' ? f.OverdueReason || null : null,
      MainHandler: f.MainHandler || null,
      AssistantHandler: f.AssistantHandler || null,
      AuditHandler: f.AuditHandler || null,
      LeaderApproval: f.LeaderApproval || null,
      ApprovalStatus: f.ApprovalStatus || null,
      RealNameReport: f.RealNameReport || null,
    }
    const res = await window.api.complaints.handle(payload)
    if (!res?.ok) {
      ElMessage.error(res?.error ?? '保存失败')
      return
    }
    ElMessage.success(f.IsCompleted === '是' ? '已保存，并标记为已办结' : '办理情况已保存')
    handleVisible.value = false
    await load()
  } finally {
    handleSaving.value = false
  }
}

/** 从详情直接进入编辑，少一次「关抽屉 → 找行 → 点编辑」 */
function editFromDetail(): void {
  const row = detail.value
  if (!row) return
  detailVisible.value = false
  openEdit(row)
}

async function openDetail(row: Row): Promise<void> {
  const res = await window.api.complaints.get(row.OriginalCode)
  if (!res?.ok) {
    ElMessage.error(res?.error ?? '加载详情失败')
    return
  }
  detail.value = res.data
  related.value = []
  detailVisible.value = true
  if (isClue.value) await loadRelated(res.data.OriginalCode)
}

/** 状态只显示一个，按优先级取最高：超期 > 临期（30 天内到期）> 已办结 > 办理中 */
/** 期限与预警天数来自系统设置，改完设置刷新即可生效 */
const letterSlaDays = ref(60)
const clueSlaDays = ref(60)
const soonDays = ref(30)

function deadlineOf(row: Record<string, any>): number | null {
  if (row.Deadline) {
    const t = new Date(String(row.Deadline)).getTime()
    return Number.isNaN(t) ? null : t
  }
  const received = row.ReceiveTime ? new Date(String(row.ReceiveTime)).getTime() : NaN
  if (Number.isNaN(received)) return null
  const days = isClueCategory(row.Category) ? clueSlaDays.value : letterSlaDays.value
  return received + days * 86400000
}

function statusOf(row: Record<string, any>): { label: string; tone: 'overdue' | 'soon' | 'done' | 'doing' } {
  const done = isCompleted(row.IsCompleted)
  if (isOverdue(row.IsOverdue)) return { label: '超期', tone: 'overdue' }
  if (!done) {
    const deadline = deadlineOf(row)
    if (deadline !== null) {
      const left = (deadline - Date.now()) / 86400000
      if (left < 0) return { label: '超期', tone: 'overdue' }
      if (left <= soonDays.value) return { label: '临期', tone: 'soon' }
    }
  }
  return done ? { label: '已办结', tone: 'done' } : { label: '办理中', tone: 'doing' }
}

/**
 * 问题摘要的悬浮预览：压平换行、截到 120 字，避免一整段长文本把 tooltip 撑成半屏。
 * 完整内容在「查看」抽屉里看。
 */
const TIP_CHARS = 120
function tipOf(text?: string | null): string {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!flat) return '（未填写）'
  return flat.length > TIP_CHARS ? `${flat.slice(0, TIP_CHARS)}…` : flat
}

/** 底色按状态整行铺开（row-class-name 下发到 <tr>） */
/** 「超期办结」的说明：应办结 / 实际办结 */
/** 毫秒时间戳 → YYYY-MM-DD（本地时区，不掺 UTC 偏移） */
function dayOf(ms: number): string {
  const d = new Date(ms)
  const p2 = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

function lateTip(row: Record<string, any>): string {
  const due = deadlineOf(row)
  const dueText = due === null ? '—' : dayOf(due)
  const done = String(row.CompleteTime ?? '').slice(0, 16)
  return `超期办结：应办结 ${dueText}，实际办结 ${done}`
}

function rowClass({ row }: { row: Record<string, any> }): string {
  return `row-tone-${statusOf(row).tone}`
}

async function loadRelated(code: string): Promise<void> {
  const letters = await window.api.complaints.letters(code)
  related.value = letters?.ok ? letters.data : []
}

async function openLinked(code: string, kind: 'clue' | 'letter'): Promise<void> {
  const res = await window.api.complaints.get(code)
  if (!res?.ok) {
    ElMessage.error(res?.error ?? '加载失败')
    return
  }
  linkedKind.value = kind
  linked.value = res.data
  related.value = []
  linkedVisible.value = true
  if (kind === 'clue') await loadRelated(code)
}

async function importExcel(): Promise<void> {
  // 文件选择框关掉前不显示遮罩，否则会挡住系统对话框
  const res = await window.api.complaints.importExcel()
  if (!res?.ok) {
    ElMessage.error(res?.error ?? '导入失败')
    return
  }
  const data = res.data as { imported: number; skipped: number; failed: number; canceled: boolean; errors?: string[] }
  if (data.canceled) return
  const errors = data.errors ?? []
  // 错误明细最多列 3 条，避免 toast 撑成一屏
  if (errors.length) {
    const head = errors.slice(0, 3).join('；')
    ElMessage.warning(errors.length > 3 ? `${head}；等 ${errors.length} 条问题` : head)
  }
  ElMessage.success(`导入完成：新增 ${data.imported} 条，跳过重复 ${data.skipped} 条，失败 ${data.failed} 条`)
  await load()
}

async function printList(): Promise<void> {
  const codes = selection.value.map((row) => String(row.OriginalCode))
  // 打印范围必须跟当前列表一致：带上类别，否则信访台账会把线索一起打出来
  const base = { ...filter, category: isClue.value ? '0' : '1' }
  const res = await window.api.complaints.printList(codes.length ? { ...base, codes } : base)
  if (!res?.ok) ElMessage.error(res?.error ?? '无法打开打印预览')
}

async function convertToClue(mode: 'basic' | 'full', targetCode?: string) {
  const code = targetCode ?? detail.value?.OriginalCode
  if (!code) return
  const label = mode === 'full' ? '连同办理结果一起复制' : '只复制登记信息，办理字段留空'
  try {
    await ElMessageBox.confirm(
      `将信访件 ${code} 转为一条新的问题线索（${label}）。原信访件会保留，并挂到新线索下。`,
      '转为线索',
      { confirmButtonText: '确定转化', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  const res = await window.api.complaints.convert(code, mode)
  if (!res?.ok) {
    ElMessage.error(res?.error || '转化失败')
    return
  }
  ElMessage.success(`已生成线索 ${res.data}`)
  await load()
  // 从列表行直接转化时留在原页看状态变化；从详情抽屉转化才跳过去看新线索
  if (!targetCode) openLinked(res.data, 'clue')
}

async function printOne(): Promise<void> {
  if (!detail.value) return
  const res = await window.api.complaints.print(String(detail.value.OriginalCode))
  if (!res?.ok) ElMessage.error(res?.error ?? '无法打开打印预览')
}

const exportVisible = ref(false)
const allColumns = ref<string[]>([])
const columnGroups = ref<Array<{ title: string; columns: string[] }>>([])
const pickedColumns = ref<string[]>([])
const exportScope = ref<'filter' | 'selected'>('filter')
const colKeyword = ref('')
const EXPORT_COLUMN_KEY = 'ui.exportColumns'

/** 搜索时只保留命中列的分组，空分组不显示 */
const filteredGroups = computed(() =>
  columnGroups.value
    .map((group) => ({
      title: group.title,
      columns: group.columns.filter((name) =>
        colKeyword.value.trim() ? name.includes(colKeyword.value.trim()) : true,
      ),
    }))
    .filter((group) => group.columns.length),
)

const exportRowCount = computed(() =>
  exportScope.value === 'selected' ? selection.value.length : total.value,
)

const exportSummary = computed(() => {
  const base = `将导出 ${exportRowCount.value} 条记录 × ${pickedColumns.value.length} 列`
  return previewTotal.value > exportRowCount.value ? `${base} · 展开 ${previewTotal.value} 行` : base
})

const previewTitle = ref('')
const previewRows = ref<Array<Record<string, string>>>([])
const previewTotal = ref(0)
const previewColumns = computed(() =>
  allColumns.value.filter((name) => pickedColumns.value.includes(name)),
)

/** 预览：只取前 5 行，列在本地按勾选顺序裁剪，改勾选不用重新请求 */
async function loadPreview(): Promise<void> {
  const useSelection = exportScope.value === 'selected' && selection.value.length > 0
  const payload = useSelection
    ? { codes: selection.value.map((row) => String(row.OriginalCode)), category: isClue.value ? '0' : '1' }
    : { filter: { ...filter, page: undefined, pageSize: undefined }, category: isClue.value ? '0' : '1' }
  const res = await window.api.exports.preview(payload)
  if (res?.ok && res.data) {
    previewTitle.value = res.data.title
    previewRows.value = res.data.rows
    previewTotal.value = res.data.total ?? res.data.rows.length
  }
}

async function openExport(): Promise<void> {
  if (!allColumns.value.length) {
    const res = await window.api.exports.columns()
    const data = res?.ok ? res.data : null
    allColumns.value = data?.columns ?? []
    columnGroups.value = data?.groups ?? []
  }
  const saved = localStorage.getItem(EXPORT_COLUMN_KEY)
  const restored = saved ? (JSON.parse(saved) as string[]).filter((name) => allColumns.value.includes(name)) : []
  // 没有记录时默认全选；有记录（含空数组=用户主动清空）就按记录来
  pickedColumns.value = saved ? restored : [...allColumns.value]
  colKeyword.value = ''
  // 有勾选时默认导勾选行，否则导当前筛选
  exportScope.value = selection.value.length ? 'selected' : 'filter'
  exportVisible.value = true
  previewTitle.value = ''
  previewRows.value = []
  previewTotal.value = 0
  void loadPreview()
}

watch(exportScope, () => {
  if (exportVisible.value) void loadPreview()
})

/** 抽屉关掉就记住这次的列选择，下次打开直接是上次的勾法（哪怕只勾了 1 列） */
watch(exportVisible, (open) => {
  if (open) return
  if (!pickedColumns.value.length) return
  localStorage.setItem(EXPORT_COLUMN_KEY, JSON.stringify(pickedColumns.value))
})

function pickAllColumns(): void {
  pickedColumns.value = [...allColumns.value]
}

async function doExport(): Promise<void> {
  if (!pickedColumns.value.length || exporting.value) return
  exporting.value = true
  localStorage.setItem(EXPORT_COLUMN_KEY, JSON.stringify(pickedColumns.value))
  const useSelection = exportScope.value === 'selected' && selection.value.length > 0
  const category = isClue.value ? '0' : '1'
  const columns = [...pickedColumns.value]
  // 过滤条件来自响应式对象，含 Proxy/函数时 IPC 结构化克隆会抛「could not be cloned」，先转成纯数据
  const plainFilter = JSON.parse(JSON.stringify({ ...filter })) as Record<string, unknown>
  delete plainFilter.page
  delete plainFilter.pageSize
  const payload = useSelection
    ? { codes: selection.value.map((row) => String(row.OriginalCode)), columns, category }
    : { filter: plainFilter, columns, category }
  try {
    const res = await window.api.exports.complaints(payload)
    notifyExport(res)
    if (res?.ok) exportVisible.value = false
  } catch (error) {
    ElMessage.error(`导出失败：${(error as Error)?.message ?? error}`)
  } finally {
    exporting.value = false
  }
}

/** 表头右键 → 导出这一列：表头文字映射到 Excel 的中文列名（操作/勾选列不参与） */
const HEADER_COLUMNS: Record<string, string[]> = {
  原始编号: ['原始编号'],
  所属线索: ['线索编号'],
  被反映对象: ['姓名', '单位名称'],
  问题摘要: ['反映问题摘要'],
  线索来源: ['线索来源'],
  信访件: ['信访编号'],
  主办人: ['主办人'],
  状态: ['是否办结', '是否超期', '应办结时间'],
  接收时间: ['接收时间']
}

const headerMenu = ref<{ x: number; y: number; label: string; columns: string[] } | null>(null)

function openHeaderMenu(column: { label?: string }, event: MouseEvent): void {
  const columns = column?.label ? HEADER_COLUMNS[column.label] : undefined
  if (!columns?.length) return
  event.preventDefault()
  const x = Math.min(event.clientX, window.innerWidth - 12.5 * 16)
  const y = Math.min(event.clientY, window.innerHeight - 6.5 * 16)
  headerMenu.value = { x, y, label: column.label as string, columns }
  // 键盘用户：菜单一出现就把焦点放到第一项，Esc 可关
  void nextTick(() => colMenuFirst.value?.focus())
}

function closeHeaderMenu(): void {
  headerMenu.value = null
}

/** Esc 关闭表头菜单，并把焦点还给当前表头 */
function onHeaderMenuKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  event.stopPropagation()
  closeHeaderMenu()
}

async function exportHeaderColumn(): Promise<void> {
  const menu = headerMenu.value
  headerMenu.value = null
  if (!menu) return
  const category = isClue.value ? '0' : '1'
  const payload = selection.value.length
    ? { codes: selection.value.map((row) => String(row.OriginalCode)), columns: menu.columns, category }
    : { filter: { ...filter, page: undefined, pageSize: undefined }, columns: menu.columns, category }
  notifyExport(await window.api.exports.complaints(payload))
}

function exportWholeTable(): void {
  headerMenu.value = null
  openExport()
}

function notifyExport(res: { ok: boolean; data?: string | null; error?: string }): void {
  if (!res?.ok) {
    ElMessage.error(res?.error ?? '导出失败')
    return
  }
  const name = res.data ? String(res.data).split('/').pop() : ''
  if (res.data) {
    const entry = { file: String(name), time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }
    lastExport.value = entry
    try {
      localStorage.setItem(EXPORT_COLUMN_KEY.replace('Columns', 'LastExport'), JSON.stringify(entry))
    } catch {
      /* 忽略存储失败 */
    }
  }
  ElMessage.success(res.data ? `已导出：${name}（下载文件夹）` : '已取消导出')
}

function toggleRecycle(): void {
  const query: Record<string, string> = { ...(route.query as Record<string, string>) }
  if (filter.deleted) delete query.deleted
  else query.deleted = '1'
  clearSelection()
  page.value = 1
  void router.replace({ path: route.path, query })
}

async function restoreSelected(): Promise<void> {
  const codes = selection.value.map((row) => row.OriginalCode)
  try {
    await ElMessageBox.confirm(`恢复 ${codes.length} 条记录到列表？`, '从回收站恢复', {
      type: 'info',
      confirmButtonText: `恢复 ${codes.length} 条`,
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  const res = await window.api.complaints.restore(codes)
  if (!res?.ok) {
    ElMessage.error(res?.error ?? '恢复失败')
    return
  }
  ElMessage.success(`已恢复 ${res.data} 条`)
  clearSelection()
  load()
}

async function restoreRow(row: { OriginalCode: string }): Promise<void> {
  const res = await window.api.complaints.restore([row.OriginalCode])
  if (!res?.ok) {
    ElMessage.error(res?.error ?? '恢复失败')
    return
  }
  ElMessage.success('已恢复')
  load()
}

async function removeRow(row: Row): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除 ${row.OriginalCode} 吗？删除后可在回收站恢复。`, '确认删除', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  const res = await window.api.complaints.remove([row.OriginalCode])
  if (!res?.ok) {
    ElMessage.error(res?.error ?? '删除失败')
    return
  }
  ElMessage.success('已删除，可在回收站恢复')
  load()
}

async function removeSelected(): Promise<void> {
  const codes = selection.value.map((row) => row.OriginalCode as string)
  if (!codes.length) return
  try {
    await ElMessageBox.confirm(`确定删除选中的 ${codes.length} 条记录吗？删除后可在回收站恢复。`, '确认删除', {
      type: 'warning',
      confirmButtonText: `删除 ${codes.length} 条`,
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  const res = await window.api.complaints.remove(codes)
  if (!res?.ok) {
    ElMessage.error(res?.error ?? '删除失败')
    return
  }
  ElMessage.success(`已删除 ${res.data} 条，可在回收站恢复`)
  clearSelection()
  load()
}

function shortTime(value: string | null): string {
  if (!value) return '—'
  return String(value).slice(0, 19)
}

/** 导航入口通过 query 带条件：parent=any（信访转线索，展示全部信访件）、completed=否/是（未完结/已完结） */
function applyRouteFilter(): void {
  filter.deleted = route.query.deleted === '1'
  filter.clue = typeof route.query.clue === 'string' ? route.query.clue : ''
  filter.code = typeof route.query.code === 'string' ? route.query.code : ''
  convertView.value = route.query.parent === 'any'
  // 信访转线索页要看到「全部信访件」（含未转的），具体看哪一类交给「转线索状态」下拉
  filter.parent = convertView.value ? '' : typeof route.query.parent === 'string' ? route.query.parent : ''
  filter.isCompleted = typeof route.query.completed === 'string' ? route.query.completed : ''
  loadColWidths()
  nextTick(() => relayout())
}

watch(
  () => route.fullPath,
  () => {
    applyRouteFilter()
    filter.tab = 'all'
    page.value = 1
    load()
  },
)

onMounted(async () => {
  const settings = await window.api.settings.get()
  if (settings?.ok) {
    letterSlaDays.value = settings.data?.letterSlaDays ?? 60
    clueSlaDays.value = settings.data?.clueSlaDays ?? 60
    soonDays.value = settings.data?.soonDays ?? 30
    allowUnlink.value = settings.data?.allowUnlinkClue !== false
  }
  const classes = ['线索来源', '职位层级', '政治面貌', '性别', '承办形式', '处置方式', '处置（核实）结果', '领导签批', '签批情况', '分办部室或片区', '承办部室或片区']
  const [dispose, disposeLabels, category, categoryLabels, targetTypes, clueLabels, ...labelSets] = await Promise.all([
    window.api.dict.options('处置形态'),
    window.api.dict.labels('处置形态'),
    window.api.dict.options('信访类别'),
    window.api.dict.labels('信访类别'),
    window.api.dict.labels('被反映人类型'),
    window.api.dict.labels('线索来源'),
    ...classes.map((name) => window.api.dict.labels(name)),
  ])
  const maps: Record<string, Record<string, string>> = {}
  classes.forEach((name, index) => {
    const res = labelSets[index]
    if (res?.ok) maps[name] = res.data
  })
  dictMaps.value = maps
  if (dispose?.ok) disposeOptions.value = dispose.data
  if (disposeLabels?.ok) disposeLabelMap.value = disposeLabels.data
  if (category?.ok) categoryOptions.value = category.data
  if (categoryLabels?.ok && Object.keys(categoryLabels.data).length) categoryMap.value = categoryLabels.data
  if (targetTypes?.ok && Object.keys(targetTypes.data).length) targetTypeMap.value = targetTypes.data
  if (clueLabels?.ok) clueLabelMap.value = clueLabels.data
  const handleNames = ['处置方式', '是否办结', '是否超期', '领导签批', '签批情况', '处置（核实）结果']
  const handleRes = await Promise.all(handleNames.map((name) => window.api.dict.options(name)))
  handleNames.forEach((name, index) => {
    if (handleRes[index]?.ok) handleOptions.value[name] = handleRes[index].data
  })
  applyRouteFilter()
  load()
})
</script>

<style scoped>
.cell-date {
  white-space: nowrap;
}

.ex-sec-preview {
  flex: none;
  min-height: 0;
}

.ex-preview {
  border: 1px solid var(--rule);
  border-radius: var(--r-sm);
  overflow: hidden;
  background: var(--surface);
}

.ex-preview-title {
  margin: 0;
  padding: 0.5rem 0.625rem;
  font-size: 0.8125rem;
  font-weight: 600;
  text-align: center;
  color: var(--ink);
  border-bottom: 1px solid var(--rule);
}

.ex-preview-scroll {
  max-height: 10.5rem;
  overflow: auto;
}

.ex-preview table {
  border-collapse: collapse;
  font-size: 0.6875rem;
  white-space: nowrap;
}

.ex-preview th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 0.25rem 0.375rem;
  font-weight: 600;
  text-align: left;
  color: var(--ink-2);
  background: var(--page);
  border-bottom: 1px solid var(--rule);
  border-right: 1px solid var(--rule);
}

.ex-preview td {
  max-width: 9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0.25rem 0.375rem;
  color: var(--ink-2);
  border-bottom: 1px solid var(--rule);
  border-right: 1px solid var(--rule);
}

.ex-preview tr:last-child td {
  border-bottom: 0;
}

.ex-preview-empty {
  padding: 1rem 0.625rem;
  text-align: center;
  color: var(--ink-3);
}


.linked {
  border-bottom: 1px solid var(--rule);
  padding-bottom: 0.75rem;
}

.linked-row {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.linked-hint {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  color: var(--ink-3);
}

.related-table {
  margin-top: 0.5rem;
}

.page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 3.25rem);
  box-sizing: border-box;
  gap: 0.625rem;
  padding-top: 1rem;
  padding-bottom: 1rem;
}

/* 表格在卡片内滚动（表头常驻），分页条固定在卡片下方 */
.table-wrap {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

/* 动作组统一贴内容右缘：搜索/重置 与 新增/导出/更多 同一行 */
.head-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}

.head-actions > .el-button + .el-button {
  margin-left: 0;
}

.w-130 { width: 8.125rem; }
.w-140 { width: 8.75rem; }
.w-160 { width: 10rem; }
.w-260 { width: 16.25rem; }

.tabs {
  margin-bottom: 0;
}

/* 页签与动作同一行：左侧看板切换，右侧操作，去掉多余的空栏 */
.list-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid var(--rule);
}

.list-bar .el-tabs__header {
  margin: 0;
}

.list-bar .el-tabs__nav-wrap::after {
  content: none;
}

.list-bar .el-tabs {
  min-width: 0;
}

.pager {
  display: flex;
  justify-content: flex-end;
  padding-top: 0.25rem;
}

.empty {
  color: var(--ink-3);
  font-size: 0.875rem;
  padding: 1rem 0;
}

.muted {
  color: var(--ink-3);
}

.detail {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.detail h3 {
  margin: 0 0 0.5rem;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--ink);
  border-left: 2px solid var(--harbor);
  padding-left: 0.5rem;
}

.detail dl {
  margin: 0;
  display: grid;
  grid-template-columns: 6.5rem minmax(0, 1fr);
  gap: 0.375rem 0.75rem;
  font-size: 0.875rem;
}

.detail dt {
  color: var(--ink-3);
}

.detail dd {
  margin: 0;
  color: var(--ink);
  word-break: break-word;
}

.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-right: 1rem;
}

.handle {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.hblock {
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  padding: 0.75rem 0.875rem 0.25rem;
}

.hblock-title {
  margin: 0 0 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--ink-2);
  padding-left: 0.5rem;
  border-left: 2px solid var(--harbor);
}

.hgrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 1rem;
}

.hspan2 {
  grid-column: 1 / -1;
}

.hform :deep(.el-form-item) {
  margin-bottom: 0.75rem;
}

.hform :deep(.el-form-item__label) {
  font-size: 0.8125rem;
  line-height: 1.35;
  color: var(--ink-2);
  padding: 0 0 0.25rem;
  min-height: 0;
}

.hfoot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.hfoot-hint {
  font-size: 0.75rem;
  color: var(--ink-3);
  line-height: 1.4;
}

.hfoot-acts {
  display: flex;
  gap: 0.5rem;
  flex: none;
}

.drawer-actions .act {
  width: 7.75rem;
  justify-content: center;
  padding-left: 0;
  padding-right: 0;
}

.drawer-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.drawer-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--ink);
}
.scope-chip {
  margin-left: 0.5rem;
  padding: 0.0625rem 0.375rem;
  border: 1px solid var(--rule-2);
  border-radius: 0.25rem;
  font-family: var(--mono);
  font-size: 0.75rem;
  color: var(--ink-2);
}

.assign-hint {
  margin: 0 0 0.75rem;
  font-size: 0.8125rem;
  color: var(--ink-3);
}

.assign-select {
  width: 100%;
}

.assign-summary {
  margin-left: 0.5rem;
  color: var(--ink-3);
  font-size: 0.8125rem;
}

.row-more { margin-left: 0.5rem; }

.more-btn { font-size: 0.8125rem; }

.more-icon { margin-left: 0.125rem; font-size: 0.75rem; }

.conv-cell {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  white-space: nowrap;
}

.cell-sub {
  margin-left: 0.375rem;
  font-size: 0.6875rem;
  color: var(--ink-3);
  white-space: nowrap;
}

:deep(.cell-actions .cell) {
  white-space: nowrap;
}

:deep(.el-table__row .cell) {
  line-height: 1.4;
}

/* 编号类列用更小的等宽字号，13 位编号也能塞进 124px */
.el-table .cell-mono .cell {
  font-size: 0.75rem;
}

.el-table .cell-target .cell {
  white-space: nowrap;
}

.el-table .cell-nowrap {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.status-cell {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  white-space: nowrap;
}
.late-hint {
  font-size: 0.6875rem;
  color: #9a2f27;
}
.late-badge {
  padding: 0 0.25rem;
  border: 1px solid #e3b0ac;
  border-radius: 0.1875rem;
  color: #9a2f27;
  background: #fdf1ef;
  font-size: 0.6875rem;
  line-height: 1.35;
  white-space: nowrap;
}
</style>
