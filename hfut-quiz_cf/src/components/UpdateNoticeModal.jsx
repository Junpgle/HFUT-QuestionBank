import { useState } from 'react';
import { RefreshCw } from 'lucide-react';

export function UpdateNoticeModal({ open, currentVersion, remoteVersionInfo, onReload, onClose }) {
  const [reloading, setReloading] = useState(false);

  if (!open) return null;

  const handleReload = async () => {
    if (reloading) return;
    setReloading(true);
    try {
      await onReload?.();
    } finally {
      setReloading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 animate-enter backdrop-blur-sm">
      <div style={{ viewTransitionName: 'modal' }} className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl relative overflow-hidden border border-transparent dark:border-slate-800">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-100 dark:bg-blue-950/30 rounded-full -mr-10 -mt-10 opacity-50 blur-2xl" />
        <div className="relative z-10">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mb-4 shadow-inner">
              <RefreshCw size={32} className="animate-spin-slow" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">发现新版本 {remoteVersionInfo.version}</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">当前版本: {currentVersion}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 mb-6 border border-slate-100 dark:border-slate-800 text-left">
            <div className="text-xs font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase">更新内容</div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{remoteVersionInfo.log}</p>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={handleReload}
              disabled={reloading}
              className="py-3.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-70 shadow-lg shadow-blue-200 dark:shadow-blue-950/40 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <RefreshCw size={18} className={reloading ? 'animate-spin' : ''} />
              {reloading ? '正在清理缓存并刷新...' : '立即刷新体验'}
            </button>
            <button
              onClick={onClose}
              disabled={reloading}
              className="py-3 rounded-xl font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors text-sm disabled:opacity-50"
            >
              暂不更新
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
