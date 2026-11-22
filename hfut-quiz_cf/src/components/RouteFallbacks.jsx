export const RouteLoading = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
  </div>
);

export const RouteError = () => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center space-y-3 dark:bg-slate-950">
    <div className="text-3xl">🙈</div>
    <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">页面不存在或加载失败</h1>
    <p className="text-slate-500 dark:text-slate-400">请检查链接，或返回主页重试。</p>
    <div className="flex gap-3">
      <a href="/#/" className="px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold">返回主页</a>
      <a href="/#/report" className="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl font-semibold dark:bg-slate-800 dark:text-slate-200">前往报表</a>
    </div>
  </div>
);
