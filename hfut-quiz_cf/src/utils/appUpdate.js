const parseSemver = (version) => {
  const cleaned = String(version || '').trim().replace(/^v/i, '');
  if (!/^\d+(\.\d+)*$/.test(cleaned)) return null;
  return cleaned.split('.').map((n) => Number.parseInt(n, 10));
};

/**
 * 判断远程版本号是否高于当前本地版本号
 */
export function isNewerVersion(remoteVersion, currentVersion) {
  const remote = String(remoteVersion || '').trim();
  const current = String(currentVersion || '').trim();
  if (!remote) return false;

  const rParts = parseSemver(remote);
  const cParts = parseSemver(current);
  if (rParts && cParts) {
    const len = Math.max(rParts.length, cParts.length);
    for (let i = 0; i < len; i += 1) {
      const r = rParts[i] || 0;
      const c = cParts[i] || 0;
      if (r > c) return true;
      if (r < c) return false;
    }
    return false;
  }

  return remote !== current;
}

/**
 * 注销 Service Worker、清理 CacheStorage 静态资源缓存并强制刷新页面
 * 不会清理 localStorage / IndexedDB 中的用户进度与本地题库
 */
export async function forceAppReload() {
  const cleanup = (async () => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations.map(async (reg) => {
            try {
              if (reg.waiting) {
                reg.waiting.postMessage({ type: 'SKIP_WAITING' });
              }
              await reg.unregister();
            } catch {
              // ignore individual registration errors
            }
          }),
        );
      } catch {
        // ignore SW errors
      }
    }

    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        const cacheNames = await window.caches.keys();
        await Promise.all(cacheNames.map((name) => window.caches.delete(name)));
      } catch {
        // ignore CacheStorage errors
      }
    }
  })();

  await Promise.race([
    cleanup,
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);

  window.location.reload();
}
