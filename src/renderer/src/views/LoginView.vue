<template>
  <div class="login">
    <header class="tb">
      <div class="tb-l">
        <img class="tb-logo" :src="logoApp" alt="" />
        <span>审查调查工作平台</span>
      </div>
      <WindowControls class="tb-r" style="--wc-hover: rgba(255, 255, 255, 0.18)" />
    </header>

    <section class="banner">
      <div class="bl">
        <span class="banner-logo"><img :src="logoApp" alt="审查调查工作平台" /></span>
        <div>
          <h1>审查调查工作平台</h1>
          <p>信访 · 线索 · 案件 一体化办理</p>
        </div>
      </div>
      <div class="bmeta">内网专线 · 支持离线<br />数据仅保存在本机</div>
    </section>

    <div class="stage">
      <section class="leftnote">
        <h3>让每一件信访都留下清晰的轨迹</h3>
        <p>
          从受理登记到线索处置、再到案件归档，所有动作在同一个工作台完成，全程留痕、可追溯、可按月导出。
        </p>
        <div class="chips">
          <span>信访登记</span><span>线索流转</span><span>案件归档</span><span>台账导出</span>
        </div>
      </section>

      <section class="sheet">
        <h2>登录</h2>
        <p class="sub">使用分配的账号进入工作台</p>

        <el-form
          ref="formRef"
          class="form"
          :model="form"
          :rules="rules"
          label-position="top"
          hide-required-asterisk
          @submit.prevent="submit"
        >
          <el-form-item label="用户名" prop="username">
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
            />
          </el-form-item>

          <el-form-item label="密码" prop="password">
            <el-input
              v-model="form.password"
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

        <div class="demo"><b>默认账号</b>&nbsp;&nbsp;admin / admin123</div>
        <p class="note">数据仅保存在本机 · 断网可用</p>
        <p v-if="version" class="ver mono">v{{ version }}</p>
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
/* ---------- L8 横幅 ---------- */
.login {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #eef5fa;
  color: #12222e;
}

/* 自绘标题栏（应用内窗口按钮） */
.tb {
  height: 44px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px 0 16px;
  background: #1f6fb2;
  color: #eef7fd;
  border-bottom: 1px solid rgba(255, 255, 255, 0.14);
  -webkit-app-region: drag;
  user-select: none;
}
.tb-l {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.03em;
  white-space: nowrap;
}
.tb-logo {
  width: 20px;
  height: 20px;
  display: block;
  border-radius: 4px;
}
.tb-r {
  margin-left: auto;
}

/* 通栏海蓝横幅 */
.banner {
  height: 250px;
  flex: none;
  background: #1f6fb2;
  color: #fff;
  padding: 0 74px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  position: relative;
  overflow: hidden;
}
.banner::after {
  content: '';
  position: absolute;
  right: -80px;
  top: -120px;
  width: 420px;
  height: 420px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 50%;
  box-shadow: 0 0 0 60px rgba(255, 255, 255, 0.05);
}
.bl {
  display: flex;
  align-items: center;
  gap: 20px;
  position: relative;
  z-index: 1;
}
.banner-logo img {
  width: 62px;
  height: 62px;
  display: block;
  border-radius: 14px;
}
.bl h1 {
  margin: 0;
  font-size: 40px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #fff;
}
.bl p {
  margin: 10px 0 0;
  font-size: 14px;
  letter-spacing: 0.22em;
  color: #cfe5f5;
}
.bmeta {
  position: absolute;
  right: 74px;
  top: 34px;
  z-index: 2;
  text-align: right;
  font-size: 11.5px;
  line-height: 1.8;
  color: #e8f4fc;
  letter-spacing: 0.06em;
}

/* 表单浮卡 */
.stage {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  justify-content: flex-end;
  align-items: flex-start;
  padding: 0 92px;
}
.leftnote {
  position: absolute;
  left: 92px;
  top: 56px;
  max-width: 420px;
}
.leftnote h3 {
  margin: 0 0 10px;
  font-size: 15px;
  font-weight: 600;
  color: #2b3d4a;
}
.leftnote p {
  margin: 0 0 10px;
  font-size: 12.5px;
  line-height: 1.95;
  color: #5f7383;
}
.leftnote .chips {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}
.leftnote .chips span {
  font-size: 11px;
  color: #1f6fb2;
  background: #e6f1fa;
  border-radius: 999px;
  padding: 4px 11px;
}

.sheet {
  width: 452px;
  background: #fff;
  border: 1px solid #dbe7f1;
  border-radius: 12px;
  box-shadow: 0 24px 54px rgba(23, 80, 130, 0.16);
  margin-top: -56px;
  padding: 32px 40px 18px;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 3;
}
.sheet h2 {
  margin: 0 0 2px;
  font-size: 22px;
  font-weight: 600;
  color: #12222e;
}
.sheet .sub {
  margin: 0;
  font-size: 12px;
  color: #7a8d9c;
}

.form {
  margin-top: 12px;
}
.sheet :deep(.el-form-item) {
  margin-bottom: 0;
  margin-top: 12px;
}
.sheet :deep(.el-form-item__label) {
  padding: 0 0 7px;
  font-size: 12.5px;
  line-height: 1.2;
  color: #3a4d5c;
  letter-spacing: 0.02em;
}
.sheet :deep(.el-input__wrapper),
.sheet :deep(.el-autocomplete .el-input__wrapper) {
  height: 46px;
  padding: 0 14px;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 0 0 1px #c6d9e7 inset;
}
.sheet :deep(.el-input__wrapper.is-focus),
.sheet :deep(.el-autocomplete .el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #1f6fb2 inset, 0 0 0 3px #e2eef8;
}
.sheet :deep(.el-input__inner) {
  height: 46px;
  font-size: 15px;
  color: #12222e;
}
.sheet :deep(.el-autocomplete) {
  width: 100%;
}
.remember {
  margin-top: 12px;
  font-size: 12.5px;
  --el-checkbox-checked-bg-color: #1f6fb2;
  --el-checkbox-checked-input-border-color: #1f6fb2;
  --el-checkbox-checked-text-color: #3a4d5c;
  --el-checkbox-input-border-color-hover: #1f6fb2;
}
.submit {
  width: 100%;
  height: 48px;
  margin-top: 18px;
  border-radius: 8px;
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
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.26em;
}
.demo {
  margin-top: 14px;
  padding: 10px 14px;
  border: 1px solid #d9e6f0;
  border-radius: 8px;
  background: #f3f8fc;
  font-size: 11.5px;
  line-height: 1.55;
  color: #6d8090;
}
.demo b {
  color: #3a4d5c;
  font-weight: 600;
}
.note {
  margin: 10px 0 0;
  font-size: 11px;
  color: #6d8090;
  letter-spacing: 0.02em;
}
.ver {
  margin: 10px 0 0;
  text-align: right;
  font-size: 10px;
  letter-spacing: 0.1em;
  color: #7a8d9c;
}
</style>
