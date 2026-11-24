import { createRouter, createWebHashHistory } from 'vue-router'
import { isAdmin, session, setUser } from '@/stores/session'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue') },
    {
      path: '/',
      component: () => import('@/layout/AppLayout.vue'),
      redirect: '/home',
      children: [
        { path: 'home', name: 'home', component: () => import('@/views/HomeView.vue') },
        {
          path: 'clues',
          name: 'clues',
          component: () => import('@/views/ComplaintsView.vue'),
          meta: { kind: 'clue' },
        },
        {
          path: 'clues/new',
          name: 'clue-new',
          component: () => import('@/views/ComplaintFormView.vue'),
          meta: { kind: 'clue' },
        },
        {
          path: 'clues/:code/edit',
          name: 'clue-edit',
          component: () => import('@/views/ComplaintFormView.vue'),
          meta: { kind: 'clue' },
        },
        {
          path: 'complaints',
          name: 'complaints',
          component: () => import('@/views/ComplaintsView.vue'),
          meta: { kind: 'letter' },
        },
        {
          path: 'complaints/new',
          name: 'complaint-new',
          component: () => import('@/views/ComplaintFormView.vue'),
          meta: { kind: 'letter' },
        },
        {
          path: 'complaints/:code/edit',
          name: 'complaint-edit',
          component: () => import('@/views/ComplaintFormView.vue'),
          meta: { kind: 'letter' },
        },
        {
          path: 'dicts',
          name: 'dicts',
          component: () => import('@/views/DictView.vue'),
          meta: { admin: true },
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/views/SettingsView.vue'),
          meta: { admin: true },
        },
        { path: 'users', name: 'users', component: () => import('@/views/UsersView.vue'), meta: { admin: true } },
        { path: 'logs', name: 'logs', component: () => import('@/views/LogsView.vue'), meta: { admin: true } },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/home' },
  ],
})

let bootstrapped = false

router.beforeEach(async (to) => {
  if (to.path === '/login') {
    return session.user ? '/home' : true
  }
  if (!session.user) {
    if (!bootstrapped) {
      bootstrapped = true
      const res = await window.api.auth.current()
      if (res?.ok && res.data) {
        setUser(res.data)
      }
    }
    if (!session.user) return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (to.meta.admin && !isAdmin()) return '/home'
  return true
})

export default router
