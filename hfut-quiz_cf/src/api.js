import { clearAllInteractionCaches } from './utils/threadCache';

// 🔧 如果在本地调试，用 localhost；上线后改成您的 Workers 域名
const API_BASE = 'https://worker.junpgle.me/api';

const getToken = () => localStorage.getItem('auth_token');

// 请求去重：同一 URL+方法+body 的并发请求只发一次
const inflightRequests = new Map();

function getRequestKey(endpoint, method, body, skipAuth = false, token = '') {
  return `${method}:${endpoint}:${skipAuth ? 'pub' : 'auth:'+token}:${body ? JSON.stringify(body) : ''}`;
}

export const api = {
  async request(endpoint, method = 'GET', body = null, options = {}) {
    const { skipAuth = false, keepalive = false, cache } = options;
    const requestToken = skipAuth ? null : getToken();
    const headers = {};
    if (body !== null && body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (!skipAuth) {
      if (requestToken) headers['Authorization'] = `Bearer ${requestToken}`;
    }

    const safeEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${API_BASE}${safeEndpoint}`;

    // GET 请求去重
    const key = getRequestKey(safeEndpoint, method, body, skipAuth, requestToken);
    if (method === 'GET' && inflightRequests.has(key)) {
      return inflightRequests.get(key);
    }

    const fetchOptions = {
      method,
      headers,
      cache: cache ?? (skipAuth && method === 'GET' ? 'default' : 'no-store'),
      body: body !== null && body !== undefined ? JSON.stringify(body) : null,
    };
    if (keepalive) {
      fetchOptions.keepalive = true;
    }

    const promise = (async () => {
      const res = await fetch(url, fetchOptions);

      if (res.status === 401 && !skipAuth && safeEndpoint !== '/login') {
        if (getToken() === requestToken) this.logout();
        return null;
      }

      const responseText = await res.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        if (!res.ok) {
          const err = new Error(`[${res.status}] ${responseText || '服务器路径不存在'}`);
          err.status = res.status;
          throw err;
        }
        return responseText;
      }

      if (!res.ok) {
        const err = new Error(data.error || `请求失败 (状态码: ${res.status})`);
        err.status = res.status;
        throw err;
      }
      return data;
    })();

    if (method === 'GET') {
      inflightRequests.set(key, promise);
      promise.then(() => inflightRequests.delete(key), () => inflightRequests.delete(key));
    }

    return await promise;
  },

  // 2. 登录
  async login(username, password) {
    const data = await this.request('/login', 'POST', { username, password });
    if (data.token) {
      clearAllInteractionCaches();
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('user_info', JSON.stringify(data.user));
    }
    return data.user;
  },

  async loginWithProgress(username, password) {
    const data = await this.request('/login', 'POST', { username, password });
    if (data.token) {
      clearAllInteractionCaches();
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('user_info', JSON.stringify(data.user));
    }
    return data;
  },

  // A simple public POST avoids CORS preflight and does not send account tokens.
  async readSiteMetrics() {
    return this.request('/site-metrics','GET',null,{skipAuth:true,cache:'no-store'});
  },
  async recordSiteVisit(visitId) {
    const response=await fetch(API_BASE+'/site-metrics/visit',{
      method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:visitId,cache:'no-store',credentials:'omit'
    });
    if(!response.ok)throw new Error('站点统计暂不可用');
    const data=await response.json();
    if(!data?.success||!Number.isSafeInteger(data.pageViews)||!Number.isSafeInteger(data.registeredCount))throw new Error('站点统计响应异常');
    return data;
  },

  // 3. 注册 (对应后端 /api/register)
  async register(username, password, email) {
    return await this.request('/register', 'POST', { username, password, email }, { skipAuth: true });
  },

  // 💡 验证邮箱 (对应后端 /api/verify-email)
  async verifyEmail(email, code) {
    return await this.request('/verify-email', 'POST', { email, code }, { skipAuth: true });
  },

  // Question-Bank & extension share the same email-code account recovery.
  async requestPasswordReset(email) {
    return this.request('/password-reset/request','POST',{email},{skipAuth:true});
  },
  async confirmPasswordReset(email, code, newPassword) {
    return this.request('/password-reset/confirm','POST',{email,code,newPassword},{skipAuth:true});
  },

  // 4. 登出
  logout() {
    clearAllInteractionCaches();
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_info');
    window.location.hash = '/';
    window.location.reload();
  },

  // 5. 获取当前用户信息
  getCurrentUser() {
    const userStr = localStorage.getItem('user_info');
    return userStr ? JSON.parse(userStr) : null;
  },

  // ============================
  // ⬇️ 业务接口
  // ============================

  // 获取在线人数（免鉴权简单请求，无 OPTIONS 预检）
  async getOnlineCount() {
    return await this.request('/onlineCount', 'GET', null, { skipAuth: true });
  },

  // 发送心跳
  async sendHeartbeat() {
    return await this.request('/heartbeat', 'POST');
  },

  // 批量提交错题统计
  async batchRecord(results) {
    return await this.request('/batchRecord', 'POST', { results });
  },

  // 获取评论列表
  async getComments(questionId) {
    return await this.request(`/comments?questionId=${encodeURIComponent(questionId)}`);
  },

  // 发布评论
  async postComment(questionId, content) {
    return await this.request('/comments', 'POST', { questionId, content });
  },

  // 点赞评论
  async likeComment(commentId) {
    return await this.request(`/comments/${commentId}/like`, 'POST');
  },

  // 获取解析列表
  async getExplanations(questionId) {
    return await this.request(`/explanations?questionId=${encodeURIComponent(questionId)}`);
  },

  // 发布解析
  async postExplanation(questionId, content) {
    return await this.request('/explanations', 'POST', { questionId, content });
  },

  // 解析点赞/投赞成票
  async voteExplanation(explanationId) {
    return await this.request(`/explanations/${explanationId}/vote`, 'POST');
  },

  // ============================
  // ⬇️ 聚合与批量接口
  // ============================

  // 批量获取互动数据（替代每题单独调 /thread/:id）
  async batchGetThreads(questionIds) {
    return await this.request('/batch-threads', 'POST', { questionIds });
  },

  // 聚合同步（心跳 + 进度双向同步 + 统计 + 版本检查）
  async syncAll(payload, options = {}) {
    return await this.request('/sync-all', 'POST', payload, options);
  },

  // 报表页 3 合 1 聚合（进度 + 我的评论 + 我的解析）
  async getReportBundle() {
    return await this.request('/user/report-bundle');
  },

  // 获取用户进度
  async getUserProgress() {
    return await this.request('/userProgress');
  },

  // 安全同步（备份进度）
  async secureSync(data) {
    return await this.request('/secureSync', 'POST', data);
  },

  // 获取系统配置（免鉴权简单请求，无 OPTIONS 预检）
  async getSystemConfig(key) {
    return await this.request(`/SystemConfig?key=${encodeURIComponent(key)}`, 'GET', null, { skipAuth: true });
  },

  // 恢复离线统计
  async recoverOutageStats(history) {
    return await this.request('/recoverOutageStats', 'POST', { history });
  },

  // 获取错题排行榜（免鉴权简单请求，无 OPTIONS 预检）
  async getWrongQuestionRanking(limit, subject, force = false) {
    return await this.request(
      `/getWrongQuestionRanking?limit=${encodeURIComponent(limit)}&subject=${encodeURIComponent(subject)}`,
      'GET',
      null,
      { skipAuth: true, cache: force ? 'no-cache' : 'default' }
    );
  },

  // 获取/更新/删除评论
  async deleteComment(commentId) {
    return await this.request(`/comments/${commentId}`, 'DELETE');
  },
  async updateComment(commentId, content) {
    return await this.request(`/comments/${commentId}`, 'PUT', { content });
  },

  // 获取/更新/删除解析
  async deleteExplanation(explanationId) {
    return await this.request(`/explanations/${explanationId}`, 'DELETE');
  },
  async updateExplanation(explanationId, content) {
    return await this.request(`/explanations/${explanationId}`, 'PUT', { content });
  },

  // 用户中心
  async getMyComments() {
    return await this.request('/user/comments');
  },
  async getMyExplanations() {
    return await this.request('/user/explanations');
  }
};
