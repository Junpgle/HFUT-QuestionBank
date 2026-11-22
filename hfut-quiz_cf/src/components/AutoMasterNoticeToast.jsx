import { useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle, RotateCcw, Sparkles, X } from 'lucide-react';

export function AutoMasterNoticeToast({ notice, onDismiss }) {
  const popoverRef = useRef(null);
  const closeBtnRef = useRef(null);
  const isUnmaster = notice?.type === 'unmaster';

  const announcementText = notice
    ? isUnmaster
      ? `首次触发掌握状态回退：这道原本已掌握的题目答错了，系统已自动将其退回未掌握状态并清零连对次数。`
      : `首次触发自动已掌握：你已连续答对这道题 ${notice.threshold} 遍，系统已自动将其标记为已掌握。`
    : '';

  useEffect(() => {
    const el = popoverRef.current;
    if (!notice || !el) return;

    try {
      if (typeof el.showPopover === 'function' && !el.matches(':popover-open')) {
        el.showPopover();
      }
    } catch {
      // Fallback for browsers without native Popover API
    }

    try {
      if (typeof document !== 'undefined' && typeof document.ariaNotify === 'function' && announcementText) {
        document.ariaNotify(announcementText);
      }
    } catch {
      // ignore ariaNotify errors
    }

    return () => {
      try {
        if (typeof el.hidePopover === 'function' && el.matches(':popover-open')) {
          el.hidePopover();
        }
      } catch {
        // ignore
      }
    };
  }, [notice, announcementText]);

  const handleClose = () => {
    const el = popoverRef.current;
    try {
      if (el && typeof el.hidePopover === 'function' && el.matches(':popover-open')) {
        el.hidePopover();
      }
    } catch {
      // ignore
    }
    onDismiss?.();
  };

  return (
    <div
      role="region"
      aria-label="学习状态通知"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[min(92vw,32rem)] pointer-events-none"
    >
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcementText}
      </div>

      {notice && (
        <div
          ref={popoverRef}
          popover="manual"
          role="status"
          className={`pointer-events-auto m-0 mx-auto w-[min(92vw,32rem)] rounded-2xl border-2 bg-white/95 backdrop-blur-md p-4 md:p-5 shadow-2xl text-slate-800 animate-enter motion-reduce:animate-none motion-reduce:transition-none dark:bg-slate-900/95 dark:text-slate-100 dark:shadow-black/50 ${
            isUnmaster
              ? 'border-amber-300 shadow-amber-900/15 dark:border-amber-700/80'
              : 'border-green-300 shadow-green-900/15 dark:border-green-700/80'
          }`}
          style={{
            position: 'fixed',
            top: '1rem',
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        >
          <div className="flex items-start gap-3.5">
            <div
              className={`shrink-0 w-10 h-10 rounded-xl text-white flex items-center justify-center shadow-md ${
                isUnmaster
                  ? 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/25'
                  : 'bg-gradient-to-br from-green-500 to-emerald-600 shadow-green-500/25'
              }`}
            >
              {isUnmaster ? (
                <RotateCcw size={21} aria-hidden="true" />
              ) : (
                <CheckCircle size={22} aria-hidden="true" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div
                className={`flex items-center gap-1.5 text-sm md:text-base font-extrabold ${
                  isUnmaster
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-green-700 dark:text-green-400'
                }`}
              >
                {isUnmaster ? (
                  <>
                    <AlertTriangle size={15} aria-hidden="true" className="shrink-0" />
                    <span>已从「已掌握」回退为「未掌握」</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={15} aria-hidden="true" className="shrink-0" />
                    <span>首次触发「自动已掌握」！</span>
                  </>
                )}
              </div>
              {isUnmaster ? (
                <p className="mt-1 text-xs md:text-sm text-slate-600 leading-relaxed dark:text-slate-300">
                  这道原本「已掌握」的题目本次答错了，系统已自动将其退回{' '}
                  <span className="font-bold text-amber-700 dark:text-amber-400">未掌握</span>{' '}
                  状态并清零连对次数（同时记入错题）。后续再次连续答对{' '}
                  <span className="font-bold text-amber-700 dark:text-amber-400">{notice.threshold} 遍</span>
                  ，或点击题卡顶部按钮手动标记，即可重新恢复为已掌握。
                </p>
              ) : (
                <p className="mt-1 text-xs md:text-sm text-slate-600 leading-relaxed dark:text-slate-300">
                  你已连续答对这道题{' '}
                  <span className="font-bold text-green-700 dark:text-green-400">{notice.threshold} 遍</span>
                  ，系统已自动将其标记为「已掌握」（后续答错会重置连对次数）。你也可以在题卡顶部随时手动切换，或在首页调整自动掌握阈值。
                </p>
              )}
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  ref={closeBtnRef}
                  type="button"
                  onClick={handleClose}
                  className={`px-3.5 py-1.5 rounded-xl text-white text-xs font-bold shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
                    isUnmaster
                      ? 'bg-amber-600 hover:bg-amber-700 focus-visible:outline-amber-600'
                      : 'bg-green-600 hover:bg-green-700 focus-visible:outline-green-600'
                  }`}
                >
                  知道了
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="关闭通知"
              className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors dark:hover:text-slate-200 dark:hover:bg-slate-800"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
