<template>
  <div class="login">
    <section class="card">
      <header class="card-head">
        <h1 class="card-title">信访管理系统</h1>
      </header>

      <div class="card-body">
        <div class="welcome">
          <el-icon class="welcome-icon"><Lock /></el-icon>
          <p class="welcome-text">欢迎登录</p>
        </div>

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          hide-required-asterisk
          @submit.prevent="submit"
        >
          <el-form-item label="用户名" prop="username">
            <el-autocomplete
              v-model="form.username"
              size="large"
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
            />
          </el-form-item>

          <el-form-item label="密码" prop="password">
            <el-input
              v-model="form.password"
              size="large"
              type="password"
              placeholder="请输入密码"
              aria-label="密码"
              autocomplete="current-password"
              show-password
            />
          </el-form-item>

          <el-checkbox v-model="remember" class="remember">记住密码</el-checkbox>

          <el-button class="submit" :loading="loading" native-type="submit">登 录</el-button>
        </el-form>

        <div class="demo">
          <p class="demo-title">默认账号：</p>
          <p class="demo-line">用户名：admin&nbsp;&nbsp;&nbsp;密码：admin123</p>
        </div>

        <p v-if="version" class="ver mono">v{{ version }}</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Lock } from '@element-plus/icons-vue'
import { setUser } from '@/stores/session'

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
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
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
    ElMessage.success('登录成功')
    router.replace((route.query.redirect as string) || '/home')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login {
  height: 100%;
  background: var(--page);
}

/* 登录窗口就是卡片本身：铺满窗口，不留任何上下左右空白 */
.card {
  width: 100%;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 0;
  border-radius: 0;
  box-shadow: none;
  overflow: hidden;
}

.card-head {
  background: var(--login-navy);
  padding: 0.875rem 1rem;
}

.card-title {
  margin: 0;
  text-align: center;
  font-size: 0.9375rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: #fff;
}

.card-body {
  padding: 1.5rem 1.375rem 1.25rem;
}

.welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 1.25rem;
}

.welcome-icon {
  font-size: 1.75rem;
  color: var(--login-navy);
}

.welcome-text {
  margin: 0.5rem 0 0;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--ink);
}

.card :deep(.el-form-item) {
  margin-bottom: 1.125rem;
}

/* 输入框本身再高一点，账号/密码有足够的点击与输入空间 */
.card :deep(.el-form-item .el-input__wrapper),
.card :deep(.el-form-item .el-autocomplete .el-input__wrapper) {
  min-height: 2.625rem;
  padding: 0 0.875rem;
}

.card :deep(.el-form-item__label) {
  font-size: 0.8125rem;
  line-height: 1.4;
  color: var(--ink-2);
  padding: 0 0 0.3125rem;
}

.card :deep(.el-autocomplete) {
  width: 100%;
}

.remember {
  margin-bottom: 0.875rem;
  font-size: 0.8125rem;
  /* 勾选态跟着深蓝主色走，避免 Element Plus 默认亮蓝 */
  --el-checkbox-checked-bg-color: var(--login-navy);
  --el-checkbox-checked-input-border-color: var(--login-navy);
  --el-checkbox-checked-text-color: var(--ink-2);
  --el-checkbox-input-border-color-hover: var(--login-navy);
}

.submit:hover,
.submit:focus-visible {
  background: var(--login-navy-strong) !important;
  border-color: var(--login-navy-strong) !important;
  color: #fff !important;
}

.submit {
  width: 100%;
  /* 与上方两个输入框同高（38px）：登录窗口固定 364×492，这里用 px 才对得上 EP 的大号控件 */
  height: 38px;
  /* 直接改写 Element Plus 的按钮变量：EP 的 .el-button 规则优先于 background 简写 */
  --el-button-bg-color: var(--login-navy);
  --el-button-border-color: var(--login-navy);
  --el-button-text-color: #fff;
  --el-button-hover-bg-color: var(--login-navy-strong);
  --el-button-hover-border-color: var(--login-navy-strong);
  --el-button-hover-text-color: #fff;
  --el-button-active-bg-color: var(--login-navy-strong);
  --el-button-active-border-color: var(--login-navy-strong);
  --el-button-active-text-color: #fff;
  /* EP 自带 `.el-button:not(...):not(...):not(...)` 选择器权重更高，这里必须 !important */
  background: var(--login-navy) !important;
  border-color: var(--login-navy) !important;
  color: #fff !important;
  font-weight: 600;
  letter-spacing: 0.18em;
  font-size: 0.9375rem;
}

.demo {
  margin-top: 1.125rem;
  padding: 0.625rem 0.75rem;
  background: var(--page);
  border: 1px solid var(--rule);
  border-radius: 0.25rem;
}

.demo-title {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ink-2);
}

.demo-line {
  margin: 0.1875rem 0 0;
  font-size: 0.75rem;
  color: var(--ink-3);
}

.ver {
  margin: 0.625rem 0 0;
  text-align: right;
  font-size: 0.6875rem;
  color: var(--ink-3);
  letter-spacing: 0.08em;
}

@media (max-width: 32rem) {
  .card-body {
    padding: 1.25rem 1rem 1rem;
  }
}
</style>
