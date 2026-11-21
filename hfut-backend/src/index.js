import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { sign, verify } from 'hono/jwt'
import bcrypt from 'bcryptjs'
import { createHash } from 'node:crypto'
import { Resend } from 'resend'

const app = new Hono()

// 🔐 统一获取 JWT 密钥
const getJwtSecret = (env) => {
  return env?.JWT_SECRET || 'HFUT_QUESTION_BANK_SECRET_KEY_2026';
};

// 🌐 1. 全局 CORS 配置
const allowedOrigins = new Set([
  'https://cxcy.junpgle.me',
  'https://qbank.junpgle.me',
])

function isLocalOrigin(origin) {
  try {
    const url = new URL(origin)
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  } catch {
    return false
  }
}

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return ''

    if (allowedOrigins.has(origin)) {
      return origin
    }

    if (isLocalOrigin(origin)) {
      return origin
    }

    return ''
  },
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: true,
}))

// 🛡️ 2. Auth 统一中间件
app.use('/api/*', async (c, next) => {
  const url = new URL(c.req.url);
  const path = url.pathname;
  const method = c.req.method;

  if (method === 'OPTIONS') return c.text('', 204);

  // 免登录白名单
  const publicPaths = [
    '/api/login',
    '/api/register',
    '/api/onlineCount',
    '/api/verify-email',
    '/api/getWrongQuestionRanking',
    '/api/recoverOutageStats'
  ];

  // 评论和解析的 GET 请求（列表和单条详情）允许游客访问
  const isPublicGet = method === 'GET' && (
      path === '/api/comments' ||
      path === '/api/explanations' ||
      path.startsWith('/api/comments/') ||
      path.startsWith('/api/explanations/')
  );

  if (publicPaths.includes(path) || isPublicGet) {
    return await next();
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: '未授权: 缺少 Token' }, 401);
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = await verify(token, getJwtSecret(c.env), 'HS256');
    c.set('user', payload);
    await next();
  } catch (e) {
    console.error(`[Auth Error] ${path}: ${e.message}`);
    return c.json({ error: '身份过期，请重新登录' }, 401);
  }
});

// 🔐 辅助函数
function verifyLegacyPassword(plainPassword, salt, targetHash) {
  try {
    let hash = createHash('sha512');
    hash.update(salt);
    hash.update(plainPassword);
    let value = hash.digest();
    for (let i = 0; i < 512; i++) {
      hash = createHash('sha512');
      hash.update(value);
      value = hash.digest();
    }
    return value.toString('base64') === targetHash;
  } catch (e) {
    return false;
  }
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ==========================================
// 🚀 核心功能路由
// ==========================================
// 优化 1: 同步全家桶 (合并心跳 + 进度同步 + 人数统计)
app.post('/api/sync-all', async (c) => {
  try {
    const user = c.get('user');
    const { progress, heartbeat = true } = await c.req.json();
    const now = new Date().toISOString();
    const tasks = [];

    if (progress) {
      tasks.push(c.env.DB.prepare(`
        INSERT INTO UserProgress (user_id, brushed_ids, memorized_ids, mastered_ids, wrong_ids, favorite_ids, history, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET 
          brushed_ids=excluded.brushed_ids, memorized_ids=excluded.memorized_ids, 
          mastered_ids=excluded.mastered_ids, wrong_ids=excluded.wrong_ids, 
          favorite_ids=excluded.favorite_ids, history=excluded.history, updated_at=excluded.updated_at
      `).bind(
          user.id,
          JSON.stringify(progress.brushedIds || []),
          JSON.stringify(progress.memorizedIds || []),
          JSON.stringify(progress.masteredIds || []),
          JSON.stringify(progress.wrongIds || []),
          JSON.stringify(progress.favoriteIds || []),
          JSON.stringify(progress.history || []),
          now
      ));
    }

    if (heartbeat) {
      tasks.push(c.env.DB.prepare(
          'INSERT INTO UserPresence (user_id, last_seen) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET last_seen = ?'
      ).bind(user.id, now, now));
    }

    if (tasks.length > 0) await c.env.DB.batch(tasks);

    const threshold = new Date(Date.now() - 180 * 1000).toISOString();
    const online = await c.env.DB.prepare('SELECT count(*) as count FROM UserPresence WHERE last_seen > ?').bind(threshold).first();

    return c.json({ success: true, onlineCount: online.count || 0 });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// 优化 2: 题目互动聚合 (一次性获取评论和解析)
app.get('/api/thread/:questionId', async (c) => {
  const questionId = c.req.param('questionId');
  let currentUserId = null;
  const authHeader = c.req.header('Authorization');
  if (authHeader) {
    try {
      const payload = await verify(authHeader.split(' ')[1], getJwtSecret(c.env), 'HS256');
      currentUserId = payload.id;
    } catch(e) {}
  }

  try {
    const [commentsRes, explanationsRes] = await c.env.DB.batch([
      c.env.DB.prepare(`
        SELECT c.*, COALESCE(u.username, '用户' || c.user_id) as author,
               (CASE WHEN cl.user_id IS NOT NULL THEN 1 ELSE 0 END) as liked
        FROM Comments c
        LEFT JOIN Users u ON c.user_id = u.id
        LEFT JOIN CommentLikes cl ON c.id = cl.comment_id AND cl.user_id = ?
        WHERE c.question_id = ? ORDER BY c.created_at DESC LIMIT 50
      `).bind(currentUserId, questionId),
      c.env.DB.prepare(`
        SELECT e.*, COALESCE(u.username, '用户' || e.user_id) as author,
               (CASE WHEN el.user_id IS NOT NULL THEN 1 ELSE 0 END) as liked
        FROM Explanations e
        LEFT JOIN Users u ON e.user_id = u.id
        LEFT JOIN ExplanationLikes el ON e.id = el.explanation_id AND el.user_id = ?
        WHERE e.question_id = ? ORDER BY e.votes DESC
      `).bind(currentUserId, questionId)
    ]);

    return c.json({
      comments: commentsRes.results.map(r => ({ ...r, liked: !!r.liked, createdAt: r.created_at, authorId: r.user_id })),
      explanations: explanationsRes.results.map(r => ({ ...r, liked: !!r.liked, createdAt: r.created_at, authorId: r.user_id }))
    });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.get('/api/SystemConfig', async (c) => {
  const key = c.req.query('key');
  const data = await c.env.DB.prepare("SELECT * FROM SystemConfig WHERE key = ?").bind(key).first();
  return c.json({ success: true, ...data });
});

// 批量提交统计
app.post('/api/batchRecord', async (c) => {
  try {
    const { results } = await c.req.json();
    if (!results?.length) return c.json({ success: true });

    const stmt = c.env.DB.prepare(`
      INSERT INTO QuestionStats (question_id, question_title, category, error_count, total_attempts, option_stats)
      VALUES (?, ?, ?, ?, 1, json_object(?, 1))
        ON CONFLICT(question_id) DO UPDATE SET
        error_count = error_count + excluded.error_count,
                                      total_attempts = total_attempts + 1,
                                      option_stats = CASE
                                      WHEN excluded.error_count > 0 AND ? IS NOT NULL THEN
                                      json_set(COALESCE(option_stats, '{}'), '$.' || ?, COALESCE(json_extract(option_stats, '$.' || ?), 0) + 1)
                                      ELSE option_stats END
    `);

    const batch = results.map(item => {
      const isErr = item.isCorrect ? 0 : 1;
      const ans = item.userAnswer || 'Unknown';
      // 严格绑定 8 个参数
      return stmt.bind(item.questionId, item.questionTitle, item.category, isErr, ans, ans, ans, ans);
    });

    await c.env.DB.batch(batch);
    return c.json({ success: true });
  } catch (e) {
    console.error('[BatchRecord Error]', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// ==========================================
// 🚀 路由：用户系统
// ==========================================

// 1. 注册接口
app.post('/api/register', async (c) => {
  try {
    const { username, password, email } = await c.req.json();

    // 1. 数据库逻辑
    const exist = await c.env.DB.prepare('SELECT id, email_verified FROM Users WHERE username = ? OR email = ?').bind(username, email).first();
    const code = generateCode();
    const expiresAt = Date.now() + 15 * 60 * 1000;
    const passwordHash = await bcrypt.hash(password, 10);

    if (exist) {
      if (exist.email_verified === 1) return c.json({ error: '该用户已激活' }, 400);
      await c.env.DB.prepare('UPDATE Users SET password_hash = ?, verification_code = ?, code_expires_at = ? WHERE id = ?').bind(passwordHash, code, expiresAt, exist.id).run();
    } else {
      await c.env.DB.prepare('INSERT INTO Users (username, password_hash, email, verification_code, code_expires_at, email_verified) VALUES (?, ?, ?, ?, ?, 0)').bind(username, passwordHash, email, code, expiresAt).run();
    }

    // 2. Resend 配置与增强调试
    const rawApiKey = c.env.RESEND_API_KEY;

    if (!rawApiKey) {
      console.error("[Email Error] 缺失 RESEND_API_KEY 环境变量");
      return c.json({ error: '后端未配置邮件服务密钥' }, 500);
    }

    // 去除可能存在的空格，并检查基本格式
    const apiKey = rawApiKey.trim();
    if (!apiKey.startsWith('re_')) {
      console.error(`[Email Error] API Key 格式不正确。当前 Key 前缀: ${apiKey.substring(0, 3)}...`);
      return c.json({ error: '邮件服务配置错误 (Invalid Key Format)' }, 500);
    }

    const resend = new Resend(apiKey);
    const fromEmail = c.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

    console.log(`[Email Debug] 尝试发送验证码至: ${email} (使用 Key: ${apiKey.substring(0, 7)}***)`);

    try {
      // 在开发阶段继续使用 await 以便捕获具体错误
      const result = await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: "【J's 通行证】注册验证码",
        html: `
          <div style="font-family: sans-serif; padding: 20px;">
            <h2>您的注册验证码</h2>
            <p style="font-size: 24px; font-weight: bold; color: #2563eb;">${code}</p>
            <p>有效期 15 分钟，请尽快验证。</p>
          </div>
        `
      });

      if (result.error) {
        console.error("[Resend API Error]", result.error);
        return c.json({ error: `邮件服务返回错误: ${result.error.message}` }, 500);
      }

      console.log("[Resend Success] 邮件已入队:", result.data.id);
    } catch (mailErr) {
      console.error("[Resend Runtime Exception]", mailErr.message);
      return c.json({ error: '无法连接邮件服务: ' + mailErr.message }, 500);
    }

    return c.json({ success: true, message: '验证码已发送' });
  } catch (e) {
    console.error("[Register System Error]", e.message);
    return c.json({ error: '注册系统异常' }, 500);
  }
});

// 2. 邮箱验证接口
app.post('/api/verify-email', async (c) => {
  try {
    const { email, code } = await c.req.json();
    const user = await c.env.DB.prepare('SELECT * FROM Users WHERE email = ?').bind(email).first();

    if (!user) return c.json({ error: '用户不存在' }, 404);
    if (user.verification_code !== code) return c.json({ error: '验证码错误' }, 400);
    if (Date.now() > user.code_expires_at) return c.json({ error: '验证码已过期' }, 400);

    await c.env.DB.prepare(
        'UPDATE Users SET email_verified = 1, verification_code = NULL, code_expires_at = NULL WHERE id = ?'
    ).bind(user.id).run();

    return c.json({ success: true, message: '账号已激活' });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// 登录
app.post('/api/login', async (c) => {
  try {
    const { username, password } = await c.req.json();
    const user = await c.env.DB.prepare('SELECT * FROM Users WHERE username = ?').bind(username).first();
    if (!user) return c.json({ error: '用户不存在' }, 401);

    const dbPassword = user.password_hash || user.password;
    let isValid = false;

    if (user.is_legacy == 1 || (user.salt && user.salt.length > 5)) {
      isValid = verifyLegacyPassword(password, user.salt, dbPassword);
      if (isValid) {
        const newHash = await bcrypt.hash(password, 10);
        await c.env.DB.prepare('UPDATE Users SET password_hash = ?, salt = NULL, is_legacy = 0 WHERE id = ?').bind(newHash, user.id).run();
      }
    } else {
      isValid = await bcrypt.compare(password, dbPassword);
    }

    if (!isValid) return c.json({ error: '密码错误' }, 401);
    if (user.email_verified === 0) return c.json({ error: '请先完成邮箱验证', needVerify: true }, 403);

    const token = await sign({
      id: user.id,
      username: user.username,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30
    }, getJwtSecret(c.env), 'HS256');

    // 优化 3: 登录时捎带进度数据
    const progress = await c.env.DB.prepare('SELECT * FROM UserProgress WHERE user_id = ?').bind(user.id).first();

    return c.json({
      success: true,
      token,
      user: { id: user.id, username: user.username, email: user.email },
      initialProgress: progress ? {
        brushedIds: JSON.parse(progress.brushed_ids || '[]'),
        memorizedIds: JSON.parse(progress.memorized_ids || '[]'),
        masteredIds: JSON.parse(progress.mastered_ids || '[]'),
        wrongIds: JSON.parse(progress.wrong_ids || '[]'),
        favoriteIds: JSON.parse(progress.favorite_ids || '[]'),
        history: JSON.parse(progress.history || '[]')
      } : null
    });
  } catch (e) {
    return c.json({ error: '登录异常: ' + e.message }, 500);
  }
});

app.get('/api/thread/:questionId', async (c) => {
  const questionId = c.req.param('questionId');
  let currentUserId = null;
  const authHeader = c.req.header('Authorization');
  if (authHeader) {
    try {
      const payload = await verify(authHeader.split(' ')[1], getJwtSecret(c.env), 'HS256');
      currentUserId = payload.id;
    } catch(e) {}
  }

  // 使用 DB.batch 并行查询评论和解析
  const [commentsRes, explanationsRes] = await c.env.DB.batch([
    c.env.DB.prepare(`
      SELECT c.*, COALESCE(u.username, '用户' || c.user_id) as author,
             (CASE WHEN cl.user_id IS NOT NULL THEN 1 ELSE 0 END) as liked
      FROM Comments c
      LEFT JOIN Users u ON c.user_id = u.id
      LEFT JOIN CommentLikes cl ON c.id = cl.comment_id AND cl.user_id = ?
      WHERE c.question_id = ? ORDER BY c.created_at DESC LIMIT 50
    `).bind(currentUserId, questionId),
    c.env.DB.prepare(`
      SELECT e.*, COALESCE(u.username, '用户' || e.user_id) as author,
             (CASE WHEN el.user_id IS NOT NULL THEN 1 ELSE 0 END) as liked
      FROM Explanations e
      LEFT JOIN Users u ON e.user_id = u.id
      LEFT JOIN ExplanationLikes el ON e.id = el.explanation_id AND el.user_id = ?
      WHERE e.question_id = ? ORDER BY e.votes DESC
    `).bind(currentUserId, questionId)
  ]);

  return c.json({
    comments: commentsRes.results.map(r => ({ ...r, liked: !!r.liked })),
    explanations: explanationsRes.results.map(r => ({ ...r, liked: !!r.liked }))
  });
});

// ==========================================
// 💬 评论系统 (Comments)
// ==========================================

app.get('/api/comments', async (c) => {
  const questionId = c.req.query('questionId');
  let currentUserId = null;
  const authHeader = c.req.header('Authorization');
  if (authHeader) {
    try {
      const payload = await verify(authHeader.split(' ')[1], getJwtSecret(c.env), 'HS256');
      currentUserId = payload.id;
    } catch(e) {}
  }

  const { results } = await c.env.DB.prepare(`
    SELECT c.*, COALESCE(u.username, '用户' || c.user_id) as author,
           (CASE WHEN cl.user_id IS NOT NULL THEN 1 ELSE 0 END) as liked
    FROM Comments c
           LEFT JOIN Users u ON c.user_id = u.id
           LEFT JOIN CommentLikes cl ON c.id = cl.comment_id AND cl.user_id = ?
    WHERE c.question_id = ? ORDER BY c.created_at DESC LIMIT 50
  `).bind(currentUserId, questionId).all();

  return c.json(results.map(r => ({ ...r, liked: !!r.liked, createdAt: r.created_at, authorId: r.user_id })));
});

app.post('/api/comments', async (c) => {
  const user = c.get('user');
  const { questionId, content } = await c.req.json();
  if (!content?.trim()) return c.json({ error: '内容不能为空' }, 400);
  await c.env.DB.prepare('INSERT INTO Comments (question_id, user_id, content) VALUES (?, ?, ?)').bind(questionId, user.id, content).run();
  return c.json({ success: true });
});

// 更新评论
app.put('/api/comments/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { content } = await c.req.json();
  if (!content?.trim()) return c.json({ error: '内容不能为空' }, 400);
  const res = await c.env.DB.prepare('UPDATE Comments SET content = ? WHERE id = ? AND user_id = ?').bind(content, id, user.id).run();
  if (res.meta.changes > 0) return c.json({ success: true });
  return c.json({ error: '更新失败，无权操作或评论不存在' }, 403);
});

app.post('/api/comments/:id/like', async (c) => {
  const user = c.get('user');
  const commentId = c.req.param('id');
  const liked = await c.env.DB.prepare('SELECT 1 FROM CommentLikes WHERE user_id = ? AND comment_id = ?').bind(user.id, commentId).first();

  if (liked) {
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM CommentLikes WHERE user_id = ? AND comment_id = ?').bind(user.id, commentId),
      c.env.DB.prepare('UPDATE Comments SET likes = likes - 1 WHERE id = ?').bind(commentId)
    ]);
    return c.json({ liked: false });
  } else {
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO CommentLikes (user_id, comment_id) VALUES (?, ?)').bind(user.id, commentId),
      c.env.DB.prepare('UPDATE Comments SET likes = likes + 1 WHERE id = ?').bind(commentId)
    ]);
    return c.json({ liked: true });
  }
});

app.delete('/api/comments/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const res = await c.env.DB.prepare('DELETE FROM Comments WHERE id = ? AND user_id = ?').bind(id, user.id).run();
  if (res.meta.changes > 0) return c.json({ success: true });
  return c.json({ error: '删除失败，无权操作或评论不存在' }, 403);
});

// ==========================================
// 💡 解析系统 (Explanations)
// ==========================================

app.get('/api/explanations', async (c) => {
  const questionId = c.req.query('questionId');
  let currentUserId = null;
  const authHeader = c.req.header('Authorization');
  if (authHeader) {
    try {
      const payload = await verify(authHeader.split(' ')[1], getJwtSecret(c.env), 'HS256');
      currentUserId = payload.id;
    } catch(e) {}
  }

  const { results } = await c.env.DB.prepare(`
    SELECT e.*, COALESCE(u.username, '用户' || e.user_id) as author,
           (CASE WHEN el.user_id IS NOT NULL THEN 1 ELSE 0 END) as liked
    FROM Explanations e
           LEFT JOIN Users u ON e.user_id = u.id
           LEFT JOIN ExplanationLikes el ON e.id = el.explanation_id AND el.user_id = ?
    WHERE e.question_id = ? ORDER BY e.votes DESC
  `).bind(currentUserId, questionId).all();

  return c.json(results.map(r => ({ ...r, liked: !!r.liked, createdAt: r.created_at, authorId: r.user_id })));
});

app.get('/api/explanations/:id', async (c) => {
  const id = c.req.param('id');
  const res = await c.env.DB.prepare(`
    SELECT e.*, COALESCE(u.username, '匿名用户') as author
    FROM Explanations e
           LEFT JOIN Users u ON e.user_id = u.id
    WHERE e.id = ?
  `).bind(id).first();
  if (!res) return c.json({ error: '解析不存在' }, 404);
  return c.json({ ...res, authorId: res.user_id });
});

app.post('/api/explanations', async (c) => {
  const user = c.get('user');
  const { questionId, content } = await c.req.json();
  if (!content) return c.json({ error: '内容不能为空' }, 400);
  await c.env.DB.prepare('INSERT INTO Explanations (question_id, user_id, content) VALUES (?, ?, ?)').bind(questionId, user.id, content).run();
  return c.json({ success: true });
});

// 更新解析
app.put('/api/explanations/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { content } = await c.req.json();
  if (!content?.trim()) return c.json({ error: '内容不能为空' }, 400);
  const res = await c.env.DB.prepare('UPDATE Explanations SET content = ? WHERE id = ? AND user_id = ?').bind(content, id, user.id).run();
  if (res.meta.changes > 0) return c.json({ success: true });
  return c.json({ error: '更新失败，无权操作或解析不存在' }, 403);
});

app.post('/api/explanations/:id/vote', async (c) => {
  const user = c.get('user');
  const expId = c.req.param('id');
  const liked = await c.env.DB.prepare('SELECT 1 FROM ExplanationLikes WHERE user_id = ? AND explanation_id = ?').bind(user.id, expId).first();

  if (liked) {
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM ExplanationLikes WHERE user_id = ? AND explanation_id = ?').bind(user.id, expId),
      c.env.DB.prepare('UPDATE Explanations SET votes = votes - 1 WHERE id = ?').bind(expId)
    ]);
    return c.json({ liked: false });
  } else {
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO ExplanationLikes (user_id, explanation_id) VALUES (?, ?)').bind(user.id, expId),
      c.env.DB.prepare('UPDATE Explanations SET votes = votes + 1 WHERE id = ?').bind(expId)
    ]);
    return c.json({ liked: true });
  }
});

app.delete('/api/explanations/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const res = await c.env.DB.prepare('DELETE FROM Explanations WHERE id = ? AND user_id = ?').bind(id, user.id).run();
  if (res.meta.changes > 0) return c.json({ success: true });
  return c.json({ error: '删除失败，无权操作或解析不存在' }, 403);
});

// ==========================================
// 👤 个人中心路由 (新增，修复 404 问题)
// ==========================================

// 获取我的评论列表
app.get('/api/user/comments', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(`
    SELECT * FROM Comments WHERE user_id = ? ORDER BY created_at DESC
  `).bind(user.id).all();

  return c.json(results.map(r => ({
    id: r.id,
    questionId: r.question_id,
    content: r.content,
    likes: r.likes,
    createdAt: r.created_at
  })));
});

// 获取我的解析列表
app.get('/api/user/explanations', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(`
    SELECT * FROM Explanations WHERE user_id = ? ORDER BY created_at DESC
  `).bind(user.id).all();

  return c.json(results.map(r => ({
    id: r.id,
    questionId: r.question_id,
    content: r.content,
    votes: r.votes,
    createdAt: r.created_at
  })));
});

// ==========================================
// 📊 其他系统路由
// ==========================================

app.get('/api/getWrongQuestionRanking', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '20');
    const subject = c.req.query('subject');

    let querySql = 'SELECT * FROM QuestionStats WHERE error_count > 0';
    let params = [];

    if (subject === 'maogai') {
      querySql += " AND question_id LIKE 'MG-%'";
    } else if (subject === 'innovation') {
      querySql += " AND question_id NOT LIKE 'MG-%' AND question_id NOT LIKE 'HGD-MG-%'";
    } else if (subject === 'hgdmy-maogai') {
      querySql += " AND question_id LIKE 'HGD-MG-%'";
    }

    querySql += ' ORDER BY error_count DESC LIMIT ?';
    params.push(limit);

    const { results } = await c.env.DB.prepare(querySql).bind(...params).all();
    return c.json({
      success: true,
      ranking: results.map((item, i) => ({
        rank: i + 1,
        questionId: item.question_id,
        questionTitle: item.question_title,
        category: item.category,
        errorCount: item.error_count,
        totalAttempts: item.total_attempts,
        errorRate: item.total_attempts > 0 ? Math.round((item.error_count / item.total_attempts) * 100) : 0,
        optionStats: item.option_stats ? JSON.parse(item.option_stats) : {}
      }))
    });
  } catch (e) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// 批量获取互动数据（替代每题单独调 /thread/:id）
app.post('/api/batch-threads', async (c) => {
  try {
    const { questionIds } = await c.req.json();
    if (!questionIds?.length) return c.json({ threads: {} });

    let currentUserId = null;
    const authHeader = c.req.header('Authorization');
    if (authHeader) {
      try {
        const payload = await verify(authHeader.split(' ')[1], getJwtSecret(c.env), 'HS256');
        currentUserId = payload.id;
      } catch(e) {}
    }

    const placeholders = questionIds.map(() => '?').join(',');
    const [commentsRes, explanationsRes] = await c.env.DB.batch([
      c.env.DB.prepare(`
        SELECT c.*, COALESCE(u.username, '用户' || c.user_id) as author,
               (CASE WHEN cl.user_id IS NOT NULL THEN 1 ELSE 0 END) as liked
        FROM Comments c
        LEFT JOIN Users u ON c.user_id = u.id
        LEFT JOIN CommentLikes cl ON c.id = cl.comment_id AND cl.user_id = ?
        WHERE c.question_id IN (${placeholders}) ORDER BY c.created_at DESC
      `).bind(currentUserId, ...questionIds),
      c.env.DB.prepare(`
        SELECT e.*, COALESCE(u.username, '用户' || e.user_id) as author,
               (CASE WHEN el.user_id IS NOT NULL THEN 1 ELSE 0 END) as liked
        FROM Explanations e
        LEFT JOIN Users u ON e.user_id = u.id
        LEFT JOIN ExplanationLikes el ON e.id = el.explanation_id AND el.user_id = ?
        WHERE e.question_id IN (${placeholders}) ORDER BY e.votes DESC
      `).bind(currentUserId, ...questionIds)
    ]);

    const threads = {};
    for (const qid of questionIds) {
      threads[qid] = { comments: [], explanations: [] };
    }
    for (const r of commentsRes.results) {
      const t = threads[r.question_id];
      if (t && t.comments.length < 50) {
        t.comments.push({ ...r, liked: !!r.liked, createdAt: r.created_at, authorId: r.user_id });
      }
    }
    for (const r of explanationsRes.results) {
      const t = threads[r.question_id];
      if (t) {
        t.explanations.push({ ...r, liked: !!r.liked, createdAt: r.created_at, authorId: r.user_id });
      }
    }

    return c.json({ threads });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/heartbeat', async (c) => {
  const user = c.get('user');
  const now = new Date().toISOString();
  await c.env.DB.prepare('INSERT INTO UserPresence (user_id, last_seen) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET last_seen = ?').bind(user.id, now, now).run();
  return c.json({ ok: true });
});

app.get('/api/onlineCount', async (c) => {
  const threshold = new Date(Date.now() - 180 * 1000).toISOString();
  const res = await c.env.DB.prepare('SELECT count(*) as count FROM UserPresence WHERE last_seen > ?').bind(threshold).first();
  return c.json({ count: res.count || 0 });
});

app.get('/api/userProgress', async (c) => {
  const user = c.get('user');
  const res = await c.env.DB.prepare('SELECT * FROM UserProgress WHERE user_id = ?').bind(user.id).first();
  if (!res) return c.json({ found: false });
  return c.json({
    found: true,
    progress: {
      brushedIds: JSON.parse(res.brushed_ids || '[]'),
      memorizedIds: JSON.parse(res.memorized_ids || '[]'),
      masteredIds: JSON.parse(res.mastered_ids || '[]'),
      wrongIds: JSON.parse(res.wrong_ids || '[]'),
      favoriteIds: JSON.parse(res.favorite_ids || '[]'),
      history: JSON.parse(res.history || '[]')
    }
  });
});

app.post('/api/secureSync', async (c) => {
  const user = c.get('user');
  const d = await c.req.json();
  await c.env.DB.prepare(`
    INSERT INTO UserProgress (user_id, brushed_ids, memorized_ids, mastered_ids, wrong_ids, favorite_ids, history, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET brushed_ids=excluded.brushed_ids, memorized_ids=excluded.memorized_ids, mastered_ids=excluded.mastered_ids, wrong_ids=excluded.wrong_ids, favorite_ids=excluded.favorite_ids, history=excluded.history, updated_at=excluded.updated_at
  `).bind(user.id, JSON.stringify(d.brushedIds||[]), JSON.stringify(d.memorizedIds||[]), JSON.stringify(d.masteredIds||[]), JSON.stringify(d.wrongIds||[]), JSON.stringify(d.favoriteIds||[]), JSON.stringify(d.history||[]), new Date().toISOString()).run();
  return c.json({ success: true });
});

app.post('/api/recoverOutageStats', async (c) => c.json({ success: true }));

export default app