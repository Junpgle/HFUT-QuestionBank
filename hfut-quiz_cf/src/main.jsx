import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { createHashRouter, RouterProvider } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        registration.update().catch(() => {})
      }
    })
  },
})

const App = lazy(() => import('./App.jsx'))
const Report = lazy(() => import('./Report.jsx'))
const Introduce = lazy(() => import('./Introduce.jsx'))
const Register = lazy(() => import('./Register.jsx'))

const RouteLoading = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
  </div>
)

const RouteError = () => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center space-y-3">
    <div className="text-3xl">🙈</div>
    <h1 className="text-xl font-bold text-slate-800">页面不存在或加载失败</h1>
    <p className="text-slate-500">请检查链接，或返回主页重试。</p>
    <div className="flex gap-3">
      <a href="/#/" className="px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold">返回主页</a>
      <a href="/#/report" className="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl font-semibold">前往报表</a>
    </div>
  </div>
);

const withSuspense = (element) => (
  <Suspense fallback={<RouteLoading />}>{element}</Suspense>
)

const router = createHashRouter([
  { path: '/', element: withSuspense(<App />), errorElement: <RouteError /> },
  { path: '/report', element: withSuspense(<Report />), errorElement: <RouteError /> },
  { path: '/introduce', element: withSuspense(<Introduce />), errorElement: <RouteError /> },
  { path: '/register', element: withSuspense(<Register />), errorElement: <RouteError /> },
  { path: '*', element: <RouteError /> },
])

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)