<template>
  <div class="login">
    <header class="tb">
      <img class="tb-logo" :src="logoApp" alt="" />
      <span class="tb-name">审查调查工作平台</span>
      <span class="tb-sep"></span>
      <span class="tb-crumb">登录</span>
      <WindowControls class="tb-right" />
    </header>

    <div class="canvas">
      <section class="hero">
        <div class="vlines"></div>
        <div class="arcs"><i></i><i></i><i></i></div>
        <div class="hero-in">
          <div class="brandmark"><img :src="logoApp" alt="审查调查工作平台" /></div>
          <h1>审查调查工作平台</h1>
          <p class="tag">信访 · 线索 · 案件 一体化办理</p>
        </div>
        <div class="metas">
          <div class="m"><b>本地部署</b><span>数据不出内网</span></div>
          <div class="sep"></div>
          <div class="m"><b>离线可用</b><span>断网不影响办理</span></div>
          <div class="sep"></div>
          <div class="m"><b>全程留痕</b><span>操作可追溯导出</span></div>
        </div>
      </section>

      <section class="intro">
        <h2>一件信访，全程有据可查</h2>
        <p class="lead">受理、流转、办结、归档都在同一个工作台完成，责任到人、节点留痕。</p>
        <ul class="caps">
          <li><span class="no">01</span><div class="txt"><b>信访登记</b><span>来访、来信、网络件统一受理</span></div></li>
          <li><span class="no">02</span><div class="txt"><b>线索流转</b><span>分级办理，节点与时限自动提示</span></div></li>
          <li><span class="no">03</span><div class="txt"><b>案件归档</b><span>处置结果沉淀为完整卷宗</span></div></li>
          <li><span class="no">04</span><div class="txt"><b>台账导出</b><span>按月生成报表，一键导出归档</span></div></li>
        </ul>
      </section>

      <section class="card">
        <div class="card-head">
          <div class="kicker">安全登录</div>
          <h2>账户登录</h2>
          <p>使用分配的账号进入工作台</p>
        </div>

        <el-form
          ref="formRef"
          class="form"
          :model="form"
          :rules="rules"
          label-position="top"
          hide-required-asterisk
          @submit.prevent="submit"
        >
          <div class="flabel"><span>用户名</span></div>
          <el-form-item prop="username">
            <el-autocomplete
              v-model="form.username"
              :fetch-suggestions="suggestAccounts"
              :trigger-on-focus="true"
              value-key="username"
              placeholder="请输入用户名"
              aria-label="用户名"
              autocomplete="username"
              clearable
              @focus="onFocus"
              @blur="onBlur"
              @input="onInput"
              @select="pickAccount"
            >
              <template #prefix>
                <svg class="fico" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.6" stroke="currentColor" stroke-width="1.6"/><path d="M5 20c0-3.5 3.1-5.6 7-5.6s7 2.1 7 5.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
              </template>
            </el-autocomplete>
          </el-form-item>

          <div class="flabel"><span>密码</span><span class="hint">区分大小写</span></div>
          <el-form-item prop="password">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="请输入密码"
              aria-label="密码"
              autocomplete="current-password"
              show-password
            >
              <template #prefix>
                <svg class="fico" viewBox="0 0 24 24" fill="none"><rect x="5" y="10.5" width="14" height="9" rx="2.2" stroke="currentColor" stroke-width="1.6"/><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5" stroke="currentColor" stroke-width="1.6"/></svg>
              </template>
            </el-input>
          </el-form-item>

          <div class="row">
            <el-checkbox v-model="remember" class="remember">记住密码</el-checkbox>
            <span class="hint">仅保存于本机</span>
          </div>

          <el-button class="submit" :loading="loading" native-type="submit">登 录</el-button>
        </el-form>

        <div class="demo"><span class="tagx">体验账号</span><code>admin</code><i>/</i><code>admin123</code></div>
        <div class="trust">
          <svg viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.4-3 8-7 10-4-2-7-5.6-7-10V6l7-3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9.2 12l2 2 3.6-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          数据加密保存在本机 · 断网可用<span class="ver">v{{ version }}</span>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { setUser } from '@/stores/session'
import logoApp from '@/assets/logo-app.png'
import WindowControls from '@/components/WindowControls.vue'

interface RememberedAccount {
  username: string
  password: string
}

const router = useRouter()
const route = useRoute()
const formRef = ref<FormInstance>()
const loading = ref(false)
const version = ref('')
const remember = ref(false)
const accounts = ref<RememberedAccount[]>([])

const form = reactive({ username: '', password: '' })

const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'change' }],
  password: [{ required: true, message: '请输入密码', trigger: 'change' }]
}

/** 刚聚焦时先把已记住的账号全部列出，便于直接切换；一旦输入就转为按片段匹配 */
const browsing = ref(false)

function onFocus(): void {
  browsing.value = true
}

function onInput(): void {
  browsing.value = false
}

function onBlur(): void {
  browsing.value = false
}

function suggestAccounts(query: string, done: (items: RememberedAccount[]) => void): void {
  const pool = accounts.value
  if (!pool.length) {
    done([])
    return
  }
  const q = (query ?? '').trim().toLowerCase()
  if (browsing.value || !q) {
    done(pool)
    return
  }
  done(pool.filter((a) => a.username.toLowerCase().includes(q)))
}

function pickAccount(item: RememberedAccount): void {
  form.username = item.username
  if (item.password) form.password = item.password
  // 选中已记住的账号即视为继续记住它，避免下次登录把这条记录删掉
  remember.value = true
}

onMounted(async () => {
  const meta = await window.api.app.meta()
  if (meta?.ok) version.value = meta.version

  // 回填上次登录的账号；该账号记住过密码时一并回填密码
  const saved = await window.api.auth.remember.get()
  if (saved?.ok && saved.data) {
    accounts.value = saved.data.accounts ?? []
    const last = saved.data.lastUsername || accounts.value[0]?.username || ''
    if (last) form.username = last
    const hit = accounts.value.find((a) => a.username === last)
    if (hit) {
      if (hit.password) form.password = hit.password
      remember.value = true
    }
  }
})

async function submit(): Promise<void> {
  if (!formRef.value || loading.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  try {
    const res = await window.api.auth.login({
      username: form.username.trim(),
      password: form.password
    })
    if (!res.ok) {
      ElMessage.error(res.error || '登录失败')
      return
    }

    const saved = await window.api.auth.remember.save({
      remember: remember.value,
      username: form.username.trim(),
      password: form.password
    })
    if (remember.value && saved?.ok && saved.data && !saved.data.encrypted) {
      ElMessage.warning('当前系统不支持安全存储，仅记住了账号')
    }

    setUser(res.data)
    // 默认账号首次登录：登录后提示修改密码
    if (form.username.trim() === 'admin' && form.password === 'admin123') {
      sessionStorage.setItem('pwd-default-hint', '1')
    }
    ElMessage.success('登录成功')
    router.replace((route.query.redirect as string) || '/home')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login {
  --canvas: #eef4f9;
  --card: #fff;
  --ink: #0f2029;
  --ink2: #33485a;
  --ink3: #4f6374;
  --rule: #d7e5f0;
  --rule2: #c3d8e7;
  --blue: #17629e;
  --blue2: #1f6fb2;
  --blue3: #10456f;

  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--canvas);
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', 'Microsoft YaHei', sans-serif;
}

/* ---------- titlebar ---------- */
.tb {
  height: 44px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 10px 0 18px;
  background: #f8fbfe;
  border-bottom: 1px solid var(--rule);
  position: relative;
  z-index: 3;
  -webkit-app-region: drag;
  user-select: none;
}
.tb-logo { width: 20px; height: 20px; border-radius: 5px; display: block; }
.tb-name { font-size: 12px; font-weight: 600; letter-spacing: 0.04em; color: var(--ink2); }
.tb-sep { width: 1px; height: 12px; background: var(--rule2); margin: 0 4px; }
.tb-crumb { font-size: 11px; color: var(--ink3); letter-spacing: 0.02em; }
.tb-right { margin-left: auto; }

/* ---------- canvas ---------- */
.canvas { flex: 1; min-height: 0; position: relative; }
.canvas::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(to right, rgba(23, 98, 158, 0.05) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(23, 98, 158, 0.05) 1px, transparent 1px);
  background-size: 32px 32px;
}

/* hero */
.hero {
  position: absolute;
  left: 24px;
  right: 24px;
  top: 22px;
  height: 316px;
  border-radius: 18px;
  background: var(--blue);
  overflow: hidden;
  box-shadow: 0 18px 44px -18px rgba(16, 69, 111, 0.55);
}
.hero::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(0, 0, 0, 0.06));
}
.hero .vlines {
  position: absolute;
  inset: 0;
  opacity: 0.14;
  background-image: repeating-linear-gradient(to right, rgba(255, 255, 255, 0.5) 0 1px, transparent 1px 88px);
  pointer-events: none;
}
.arcs { position: absolute; right: -70px; top: -150px; width: 560px; height: 560px; pointer-events: none; }
.arcs i { position: absolute; border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 50%; inset: 0; margin: auto; }
.arcs i:nth-child(1) { width: 560px; height: 560px; }
.arcs i:nth-child(2) { width: 440px; height: 440px; border-color: rgba(255, 255, 255, 0.12); }
.arcs i:nth-child(3) { width: 320px; height: 320px; border-color: rgba(255, 255, 255, 0.09); }
.hero-in { position: absolute; left: 52px; top: 40px; right: 430px; z-index: 2; color: #fff; }
.brandmark {
  width: 58px;
  height: 58px;
  border-radius: 14px;
  background: #fff;
  display: grid;
  place-items: center;
  box-shadow: 0 10px 22px -8px rgba(0, 0, 0, 0.35);
  margin-bottom: 18px;
}
.brandmark img { width: 36px; height: 36px; display: block; }
.hero h1 { font-size: 42px; font-weight: 600; letter-spacing: 0.05em; line-height: 1.06; color: #fff; margin: 0; }
.hero .tag { margin: 14px 0 0; font-size: 13.5px; letter-spacing: 0.34em; color: #d3e6f4; font-weight: 400; }
.metas {
  position: absolute;
  left: 52px;
  right: 430px;
  bottom: 34px;
  display: flex;
  gap: 26px;
  z-index: 2;
  padding-top: 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.18);
}
.metas .m { display: flex; flex-direction: column; gap: 5px; }
.metas .m b { font-size: 13px; font-weight: 600; color: #fff; letter-spacing: 0.04em; }
.metas .m span { font-size: 10.5px; color: #d6e9f7; letter-spacing: 0.04em; }
.metas .sep { width: 1px; background: rgba(255, 255, 255, 0.22); }

/* intro */
.intro { position: absolute; left: 52px; top: 356px; width: 404px; }
.intro h2 { margin: 0; font-size: 19px; font-weight: 600; letter-spacing: 0.02em; color: var(--ink); line-height: 1.3; }
.intro .lead { margin: 8px 0 0; font-size: 12.5px; line-height: 1.95; color: var(--ink3); letter-spacing: 0.01em; }
.caps { margin: 16px 0 0; padding: 0; border-top: 1px solid var(--rule2); }
.caps li { list-style: none; display: flex; align-items: flex-start; gap: 16px; padding: 10px 2px; border-bottom: 1px solid var(--rule); }
.caps .no { font-family: 'SF Mono', Menlo, monospace; font-size: 10.5px; letter-spacing: 0.08em; color: var(--blue2); padding-top: 2px; width: 20px; flex: none; }
.caps .txt b { display: block; font-size: 13px; font-weight: 600; color: var(--ink2); letter-spacing: 0.02em; }
.caps .txt span { display: block; margin-top: 3px; font-size: 11px; color: var(--ink3); }

/* card */
.card {
  position: absolute;
  right: 44px;
  top: 188px;
  width: 452px;
  background: var(--card);
  border: 1px solid var(--rule);
  border-radius: 16px;
  box-shadow: 0 34px 70px -28px rgba(16, 69, 111, 0.42), 0 2px 8px rgba(16, 69, 111, 0.06);
  padding: 32px 38px 24px;
  z-index: 4;
}
.card-head .kicker { display: flex; align-items: center; gap: 8px; font-size: 11px; letter-spacing: 0.22em; color: var(--blue2); margin-bottom: 10px; }
.card-head .kicker::before { content: ''; width: 16px; height: 1px; background: var(--blue2); }
.card-head h2 { margin: 0; font-size: 24px; font-weight: 600; letter-spacing: 0.03em; color: var(--ink); line-height: 1.2; }
.card-head p { margin: 7px 0 0; font-size: 12px; color: var(--ink3); letter-spacing: 0.01em; }

.form { margin-top: 22px; }
.flabel { display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; color: var(--ink2); letter-spacing: 0.04em; margin: 15px 0 7px; }
.flabel:first-child { margin-top: 0; }
.flabel .hint { font-size: 11px; color: #64798a; }
.row { display: flex; align-items: center; justify-content: space-between; margin-top: 15px; }
.row .hint { font-size: 11px; color: #64798a; letter-spacing: 0.02em; }
.remember {
  font-size: 12px;
  --el-checkbox-checked-bg-color: #1f6fb2;
  --el-checkbox-checked-input-border-color: #1f6fb2;
  --el-checkbox-input-border-color-hover: #1f6fb2;
  --el-checkbox-checked-text-color: #33485a;
  --el-checkbox-text-color: #33485a;
  height: 18px;
}

.form :deep(.el-form-item) { margin-bottom: 0; }
.form :deep(.el-form-item__content) { display: block; line-height: normal; }
.form :deep(.el-input__wrapper) {
  height: 48px;
  padding: 0 14px;
  border-radius: 10px;
  background: #fbfdff;
  box-shadow: 0 0 0 1px var(--rule2) inset;
}
.form :deep(.el-input__wrapper:hover) { box-shadow: 0 0 0 1px #a9c4d8 inset; }
.form :deep(.el-input__wrapper.is-focus) {
  background: #fff;
  box-shadow: 0 0 0 1px var(--blue2) inset, 0 0 0 3px rgba(31, 111, 178, 0.14);
}
.form :deep(.el-input__inner) { height: 48px; font-size: 14.5px; color: var(--ink); }
.form :deep(.el-input__prefix) { color: #8aa0b0; }
.form :deep(.el-autocomplete) { width: 100%; }
.fico { width: 16px; height: 16px; }

.submit {
  width: 100%;
  height: 50px;
  margin-top: 22px;
  border: 0;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.3em;
  box-shadow: 0 12px 24px -10px rgba(31, 111, 178, 0.6);
  --el-button-bg-color: #1f6fb2;
  --el-button-border-color: #1f6fb2;
  --el-button-text-color: #fff;
  --el-button-hover-bg-color: #175a93;
  --el-button-hover-border-color: #175a93;
  --el-button-hover-text-color: #fff;
  --el-button-active-bg-color: #10456f;
  --el-button-active-border-color: #10456f;
  background: #1f6fb2 !important;
  border-color: #1f6fb2 !important;
  color: #fff !important;
}

.demo {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  color: var(--ink3);
  border: 1px dashed var(--rule2);
  border-radius: 9px;
  padding: 9px 13px;
  background: #f7fbfe;
}
.demo .tagx { font-size: 10px; letter-spacing: 0.1em; color: #64798a; }
.demo code { font-family: 'SF Mono', Menlo, monospace; font-size: 11.5px; color: var(--ink2); background: #eaf2f9; border-radius: 4px; padding: 2px 7px; }
.demo i { color: #b3c4d1; font-style: normal; }

.trust { margin-top: 12px; padding-top: 14px; border-top: 1px solid var(--rule); display: flex; align-items: center; gap: 7px; font-size: 10.5px; color: #64798a; letter-spacing: 0.03em; }
.trust svg { width: 12px; height: 12px; color: #9fb2c0; }
.trust .ver { margin-left: auto; font-family: 'SF Mono', Menlo, monospace; font-size: 9.5px; letter-spacing: 0.08em; color: #7d92a1; }
</style>
