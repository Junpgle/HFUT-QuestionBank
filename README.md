# HFUT 综合刷题系统 (v5.2.6)

面向合肥工业大学课程的在线多科目刷题与背题系统，支持多题型练习、自定义题库导入、AI 出题、云端同步与社区共建解析。

## 界面预览

### 科目选择首页
![科目选择首页](docs/images/home-subjects.jpg)

### 刷题控制台
![刷题控制台](docs/images/dashboard.jpg)

### 全站易错榜与学习数据报表
| 全站易错榜 | 学习数据报表 |
| --- | --- |
| ![全站易错榜](docs/images/ranking.png) | ![学习数据报表](docs/images/report.png) |

### 上传自定义题库
![上传自定义题库](docs/images/custom-upload.jpg)

## 主要功能

### 核心刷题与学习
- **多科目题库支持**：内置多门课程题库，支持一键切换科目与分章节练习
- **多题型支持**：
  - **单选题 / 多选题 / 判断题**
  - **填空题**：支持真实输入框作答、多空与多等价答案匹配、大小写与标点容错；支持**逐字提示**（首次显示首单词首字母，每次点击多显示一个字符；使用提示后答对不计入「已掌握」）
  - **简答题**
- **多种练习模式**：
  - **刷题模式**：支持按「全部 / 未做 / 错题 / 收藏」筛选，支持顺序或乱序
  - **背题模式**：直接展示答案与解析，筛选「未做」时自动过滤已背题目
  - **错题攻坚 / 收藏夹**：自动归集错题与收藏题目，支持针对性复习
- **进度与数据报表**：本地 + 云端统计刷题数、掌握率与正确率，支持查看历史记录与数据报表

### 扩展与社区能力
- **自定义题库上传**：支持解析 Excel（`.xlsx`/`.xls`）、Word（`.docx`）、文本/JSON 等格式的自定义题库
- **AI 辅助出题**：支持配置自定义 OpenAI 兼容接口生成题目
- **题库搜索与筛选**：支持按关键词、章节、题型与答题状态快速检索题目
- **易错题排行榜**：按科目查看全站高频错题排行
- **题目讨论与共建解析**：支持在题目下方发表评论、贡献解析与投票点赞
- **外观与离线体验**：支持浅色 / 深色模式切换、响应式移动端适配、PWA 离线缓存与版本更新提醒

## HFUT-CS-Online 扩展账号云同步

本项目的 Cloudflare Worker 后端也为独立项目 [HFUT-CS-Online-Sync-Extension](https://github.com/Junpgle/HFUT-CS-Online-Sync-Extension) 提供**可选的账号同步服务**。

- 复用 Question-Bank 原有的用户名、bcrypt 密码验证、邮件激活和 30 天 JWT，无需注册第二套账号；浏览器扩展需单独登录一次。
- `https://worker.junpgle.me/api/site-sync/exchange`：受现有 JWT 中间件保护，双向合并题目状态、阅读位置和课程同步控制。对同一用户使用乐观并发版本检查，防止不同设备覆盖更新。
- `POST /api/site-sync/course`：禁用或恢复指定课程同步；`DELETE /api/site-sync`：删除当前登录用户的全部独立云学习记录。
- 数据独立保存在 D1 的 `SiteSyncState` 表，不修改已有的 `UserProgress`、`Users` 等题库业务表。
- 扩展独立云同步默认关闭，只有用户主动登录后才上传学习记录；JWT 留在扩展本地存储，明文密码不持久保存。
- 服务每个账号的学习快照上限约 190 KB，支持登录后手动同步，前端正常使用浏览器存储且服务器故障时不丢失已有本地记录。
- 仅允许指定浏览器扩展来源与题库现有前端域名；所有读写仍必须验证 JWT，CORS 不是身份认证替代品。

数据库迁移语句已附于 `hfut-backend/schema.sql`，线上 D1 `hfut-db` 已新增该表。扩展的 Microsoft Edge 商店正式包需由扩展项目另行提交更新和审核，详情见扩展的 [隐私政策](https://github.com/Junpgle/HFUT-CS-Online-Sync-Extension/blob/main/PRIVACY.md)。

## 账号注册与邮箱验证码找回密码

Question-Bank 账号同时用于本题库和 [HFUT-CS-Online 全站学习同步扩展](https://github.com/Junpgle/HFUT-CS-Online-Sync-Extension)。两个产品共用用户名、密码和 JWT 鉴权；扩展中需单独登录。

- **注册新账号：** https://qbank.junpgle.me/#/register
- **修改／忘记密码：** https://qbank.junpgle.me/#/reset-password
- **登录入口：** https://qbank.junpgle.me/#/

注册时发送邮箱激活验证码。修改或找回密码时，输入**已激活账号的绑定邮箱**，即可通过 Resend 获得独立的一次性 6 位验证码；验证码有效期 **10 分钟**，错误尝试最多 **5 次**，重复发送至少间隔 **60 秒**，并对邮箱及请求来源设置额外发送频率限制。新密码要求 **8–128 位**，修改成功后原有题库网页和扩展端 JWT 均失效，需要在所有设备重新登录。

相关 API：`POST /api/password-reset/request`（提交邮箱获取验证码，统一响应不透露账号是否存在）和 `POST /api/password-reset/confirm`（提交邮箱、验证码及新密码）。数据库中的 `PasswordResetRequests` 独立保存验证码的 HMAC 摘要、有效期及错误次数；`PasswordResetIpRate` 使用带密钥摘要限制异常请求，不存储明文来源 IP。密码仍按 bcrypt 保存；重置流程不会读取或删除题库成绩及 HFUT-CS-Online 学习记录。

线上 D1 `hfut-db` 已增加上述两张表及 `Users.token_version` 列，原有账号无需重新注册。

## 内置题库

| 科目 | 章节/说明 | 数据文件 |
| --- | --- | --- |
| 创新创业 | 第一讲 ~ 第七讲 + 经典旧题库 | `questions/创新创业基础第一~七讲习题.xlsx`、`questions_old.xls` |
| 毛泽东思想和中国特色社会主义理论体系概论 | 导论 + 第一章 ~ 第八章 | `questions/maogai_full.json` |
| 合工大智慧马院-毛概 | 综合题库 | `hgdmy-maogai.json` |
| 英语国家社会与文化 | 作业一 ~ 作业三（含多空填空题） | `questions/english-culture.json` |
| 文物精品与中华文明 | 254 道题（单选、多选、判断、填空、简答），全部附解析 | `hfut-quiz_cf/public/cultural-relics.json` |

## 技术栈

- **前端 (`hfut-quiz_cf/`)**：React 19、Vite 7、Tailwind CSS 3、React Router 7、Lucide React、React Markdown、`vite-plugin-pwa`
- **文档解析**：`xlsx`、`mammoth`、`jszip`
- **本地存储**：LocalForage (IndexedDB) + LocalStorage
- **后端 (`hfut-backend/`)**：Cloudflare Workers + Hono + Cloudflare D1 + Resend

## 目录结构

```text
HFUT---Innovation-and-Entrepreneurship-Question-Bank/
├── hfut-quiz_cf/                 # 当前主前端项目（React + Vite + PWA）
│   ├── src/
│   │   ├── App.jsx               # 主应用与刷题状态管理
│   │   ├── components/           # 题目面板、导航、搜索、更新弹窗等组件
│   │   ├── config/quizConfig.js  # 版本号与科目/章节配置
│   │   ├── utils/                # 填空判题/提示、题型、存储、更新工具
│   │   ├── CustomUploadModal.jsx # 自定义题库导入
│   │   ├── AIQuestionModal.jsx   # AI 出题弹窗
│   │   ├── RankingPage.jsx       # 易错题排行榜
│   │   └── Report.jsx            # 数据报表页
│   └── package.json
├── hfut-backend/                 # Cloudflare Workers + D1 后端服务
│   ├── src/index.js
│   ├── schema.sql
│   └── wrangler.toml
├── questions/                    # 题库数据文件
└── hfut-quiz/                    # 旧版前端目录
```

## 快速开始

### 前端开发 (`hfut-quiz_cf`)

```bash
git clone https://github.com/Junpgle/HFUT---Innovation-and-Entrepreneurship-Question-Bank.git
cd HFUT---Innovation-and-Entrepreneurship-Question-Bank/hfut-quiz_cf

npm install
npm run dev      # 启动本地开发服务器
npm run build    # 构建生产版本
npm run preview  # 预览生产构建
```

### 后端开发 (`hfut-backend`)

```bash
cd hfut-backend
npm install
npm run dev      # 启动 wrangler 本地调试
npm run deploy   # 部署至 Cloudflare Workers
```

## 更新日志（近期）

- **v5.2.3**：填空题新增逐字提示功能（每次点击多显示一个字符，使用提示后答对不计入掌握）
- **v5.2.2**：修复更新检测并新增应用版本号展示
- **v5.2.x**：上线真实填空题作答与判题、新增题目收藏功能、修复黑夜模式 Markdown 样式与易错榜跨科目过滤、优化背题模式「未做」筛选、新增英语国家社会与文化题库

## 开发者与声明

- 主要开发者：[Junpgle](https://github.com/Junpgle)
- 本项目仅供学习交流使用，请勿用于商业用途。


文物精品与中华文明为内置题库，题目 ID 使用 `RELICS-` 前缀，参与常规云同步和学习报告。题干、选项、课程标准答案与原始导出一致；补充解析中的课程口径和争议说明保留。当前来源为一份综合自测卷，统一归为「全部题目」，不虚构章节。为保持历史学习记录，未来新增题目请追加，不要重排现有题目。

## 智能学习（开发预览）

科目控制台新增智能学习：设置考试日期、范围、考前预留天数和目标保持率，自动计算新题数量；首次直接展示答案，随后混合回忆检测、错题重学与跨天复习。使用 FSRS-4.5 公开记忆公式及独立的短时学习策略，预测值并非考试成绩。旧进度用于确认性学习的优先级，不伪造历史记忆数据；纳入智能学习的题目在普通刷题时也记录后续记忆反馈。学习日统一按北京时间计算。新增记忆热力图、章节稳定率、跨天回忆统计及考试日预测；智能学习记录按账号和科目独立存于 IndexedDB，自定义题库仅本地。内置题库可手动同步，并在学习、普通刷题、进入或返回计划页时批量交换云端事件，服务器按事件 ID 去重；旧客户端不触碰新表。

部署前先应用 D1 迁移 `hfut-backend/migrations/0001_smart_learning.sql`（先备份数据库），再部署 Worker 和前端。算法测试：`cd hfut-quiz_cf && node --test src/learning/scheduler.test.js`。本地记录不应因同步失败而删除。

智能学习支持按科目导出/合并 JSON 备份、未提交答题草稿恢复、独立移动端答题布局。同步接口禁止 PWA 缓存，返回用户 ID 用于客户端校验；正式上线时必须先部署新 Worker。长期记忆要求至少三个独立成功学习日。

### 智能学习低频同步
本地即时保存；30 秒无新增、首条未同步事件满 5 分钟、累计 50 条、退出/页面隐藏且有待同步记录时触发。进入页面拉取冷却 5 分钟，无变化不轮询；失败退避 30 秒起、最长 30 分钟。`POST /api/learning/exchange` 一次上传最多 50 条并增量拉取最多 200 条，旧 GET/POST 接口保留，404/405 时暂时兼容回退。关闭页面的 keepalive 上传为尽力而为，本地事件仅在确认后标记已同步。新接口无需新增 D1 迁移，需先部署 Worker。

### 普通题库进度同步协议 v2
普通题库使用 `/api/sync-all` 的 `progressOps` 增量字段，客户端持久化按账号的待确认变更，服务器 CAS 合并 `UserProgress`，上传同时拉取，恢复/备份均为双向同步。旧客户端快照仅做非破坏性并集，无法表达删除；应更新前后端。新版后端无需额外 D1 表迁移。原已被覆盖的历史记录不会凭空恢复，请保留其他设备和备份。云端历史仍保留最近500条，自定义题库仅本地。

### 智能学习共享答题统计
智能学习完成客观作答后写入普通刷题状态及历史，并复用 `/api/sync-all` 批量统计；即时和跨天复习均计数，不按日期或题目去重。首次看答案不计，主观自评及提示辅助仅更新个人记录；实际答对但自评蒙对按客观正确统计、个人记忆按自评处理。每次作答 UUID 由 D1 唯一键和触发器去重，重复请求不会重复计数。部署新版前执行 `npx wrangler d1 execute hfut-db --remote --file=./migrations/0002_question_attempt_receipts.sql`。排行榜人数仅从新版统计开始，旧版计数保留。

### 普通答题键盘快捷键
普通刷题、错题和收藏练习支持 1–8 / A–H 选择、Enter 提交多选、Space/F 未作答时忘记并显示答案（计为失败回忆），作答后 Space/Enter 下一题，←/→ 仅翻题、Esc 返回。背题 Space/Enter 确认记住并继续。填空输入中 Enter 下一空或提交，输入框、弹窗、组合键、输入法和长按重复不触发全局快捷键。

### 首页站点统计
今日浏览量（PV）按北京时间统计，每次打开或刷新正式站点计一次，含游客，不统计 SPA 内部切换、开发预览或答题；同一页面请求重试凭随机 UUID 去重，不存储 IP、账号或设备标识。注册人数为已邮箱验证账号总数，不包括待验证注册；服务端短时缓存人数，页面不轮询。一次简单公开 POST 同时记录访问并返回三项指标。上线前在后端目录执行 `npx wrangler d1 execute hfut-db --remote --file=./migrations/0003_site_metrics.sql`，然后部署 Worker 和前端。历史 PV 未回填，公开访问统计不能作为精确防机器人流量分析。
