import {test,expect} from '@playwright/test';
const url='http://127.0.0.1:4175/tests/smart-learning.html';
const t=new Date('2026-11-28T02:00:00Z');
const button=(page,name)=>page.getByRole('button',{name,exact:true});
async function open(page){
  await page.clock.install({time:t});
  await page.goto(url);
  await expect(page.getByRole('heading',{name:'考试计划'})).toBeVisible();
}
async function plan(page){
  await page.getByLabel('考试日期').fill('2026-11-29');
  await button(page,'保存学习计划').click();
  await expect(button(page,'开始今日学习')).toBeVisible();
}
async function returnPlan(page){await button(page,'返回计划').click();await expect(page.getByRole('heading',{name:'考试计划'})).toBeVisible();}
async function openReport(page){const toggle=button(page,'记忆分析与热力图');if(await toggle.isVisible())await toggle.click();await expect(page.getByRole('heading',{name:'全题库记忆热力图'})).toBeVisible();}
async function selectCard(page,n){await openReport(page);await page.getByRole('button',{name:new RegExp('^第'+n+'题 ')}).click();await button(page,'立即强化').click();}
test('first exposure, mixed queue, multi-select and uncommitted draft survive reload',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await open(page);await plan(page);
  await button(page,'开始今日学习').click();
  await expect(page.getByRole('heading',{name:'测试单选：首题'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'参考答案'})).toBeVisible();
  await expect(page.getByRole('progressbar',{name:'本题记忆阶段进度'})).toHaveAttribute('aria-valuenow','1');
  await button(page,'已记忆，继续').click();
  await expect(page.getByRole('heading',{name:'测试多选：第二题'})).toBeVisible();
  await button(page,'已记忆，继续').click();
  await returnPlan(page);
  await selectCard(page,2);
  await expect(page.getByRole('heading',{name:'参考答案'})).toHaveCount(0);
  await page.getByRole('button',{name:/正确选项丙/}).click();
  await page.reload();
  await button(page,'继续上次学习').click();
  await expect(page.getByRole('button',{name:/正确选项丙/})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:/正确选项丁/}).click();
  await button(page,'确认提交').click();
  await expect(page.getByRole('status').filter({hasText:'回答正确'})).toBeVisible();
  await button(page,'记得').click();
  await returnPlan(page);
  await expect(page.getByText(/进入复习 0 题/)).toBeVisible();
  expect(await page.evaluate(()=>window.__learningAttempts.map(a=>({id:a.questionId,correct:a.isCorrect,objective:a.objective})))).toEqual([{id:'MG-2',correct:true,objective:true}]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});
test('backup import merges on explicit confirmation and cross-day review hides answers',async({page})=>{
  await open(page);await plan(page);
  const mk=(id,kind,at,fields)=>({id:'00000000-0000-4000-8000-'+String(id).padStart(12,'0'),kind,at,day:'2026-11-27',...fields});
  const old=t.getTime()-86400000;
  const payload={format:'qbank-smart-learning-v1',subject:'maogai',exportedAt:t.getTime(),events:[mk(1,'intro',old,{questionId:'MG-1'}),mk(2,'rate',old+180000,{questionId:'MG-1',rating:3}),mk(3,'rate',old+240000,{questionId:'MG-1',rating:3}),mk(4,'rate',old+360000,{questionId:'MG-1',rating:3})]};
  await button(page,'学习记录备份 / 恢复').click();
  await page.locator('input[type=file]').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});
  await expect(page.getByText(/已验证 4 条事件/)).toBeVisible();
  await button(page,'确认合并').click();
  await expect(page.getByRole('status').filter({hasText:'备份已合并'}).filter({visible:true})).toBeVisible();
  await expect(page.getByText(/进入复习 1 题/)).toBeVisible();
  await button(page,'开始今日学习').click();
  // Queue starts with one new card, then alternates to old review.
  await expect(page.getByRole('heading',{name:'测试多选：第二题'})).toBeVisible();
  await button(page,'已记忆，继续').click();
  await expect(page.getByRole('heading',{name:'测试单选：首题'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'参考答案'})).toHaveCount(0);
  await page.getByRole('button',{name:/错误选项乙/}).click();
  await expect(page.getByText('需要重新巩固',{exact:true})).toBeVisible();
  await button(page,'重新学习').click();
  await expect(page.getByRole('heading',{name:'测试单选：首题'})).toBeVisible();
  await expect(page.getByRole('progressbar',{name:'本题记忆阶段进度'})).toHaveAttribute('aria-valuetext','重新学习');
  await expect(page.getByRole('heading',{name:'参考答案'})).toBeVisible();
  expect(await page.evaluate(()=>window.__learningAttempts.length)).toBe(0);
  await button(page,'已重新记忆，继续').click();
  await returnPlan(page);
  expect(await page.evaluate(()=>window.__learningAttempts.map(a=>({id:a.questionId,correct:a.isCorrect,objective:a.objective})))).toEqual([{id:'MG-1',correct:false,objective:true}]);
  if(await button(page,'学习记录备份 / 恢复').isVisible())await button(page,'学习记录备份 / 恢复').click();
  const download=page.waitForEvent('download');await button(page,'导出 JSON').click();
  expect((await download).suggestedFilename()).toMatch(/Qbank-智能学习-maogai/);
});
test('fill and short answer drafts, grading and self assessment',async({page})=>{
  await open(page);await plan(page);
  for(const n of [3,4]){
    await openReport(page);
    await page.getByRole('button',{name:new RegExp('^第'+n+'题 ')}).click();
    await button(page,'学习此题').click();
    await button(page,'已记忆，继续').click();
    await returnPlan(page);
  }
  await selectCard(page,3);
  await page.getByLabel('填空 1').fill('答案庚');
  await button(page,'确认提交').click();
  await expect(page.getByRole('status').filter({hasText:'回答正确'})).toBeVisible();
  await button(page,'记得').click();
  await returnPlan(page);
  await selectCard(page,4);
  await page.getByRole('textbox',{name:/先独立回忆/}).fill('我记得的要点');
  await button(page,'展示参考答案').click();
  await expect(page.getByText('参考要点辛',{exact:true})).toBeVisible();
  await button(page,'模糊').click();
  await returnPlan(page);
  await expect(page.getByText(/进入复习 0 题/)).toBeVisible();
});

test('quick introductions return to first recall before all new cards are shown',async({page})=>{
  await open(page);await plan(page);
  await button(page,'开始今日学习').click();
  for(const name of ['测试单选：首题','测试多选：第二题']){
    await expect(page.getByRole('heading',{name})).toBeVisible();
    await button(page,'已记忆，继续').click();
  }
  await expect(page.getByRole('heading',{name:/测试填空/})).toBeVisible();
  await button(page,'已记忆，继续').click();
  await expect(page.getByRole('heading',{name:'测试单选：首题'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'参考答案'})).toHaveCount(0);
  await expect(page.getByRole('progressbar',{name:'本题记忆阶段进度'})).toHaveAttribute('aria-valuenow','2');
});

test('memory stage is compact and not duplicated on mobile or desktop',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await open(page);await plan(page);
  await button(page,'开始今日学习').click();
  for(const viewport of [{width:390,height:844},{width:1280,height:800}]){
    await page.setViewportSize(viewport);
    const progress=page.getByRole('progressbar',{name:'本题记忆阶段进度'});
    await expect(progress).toHaveCount(1);
    const rect=await progress.evaluate(el=>el.parentElement.getBoundingClientRect().height);
    expect(rect).toBeLessThanOrEqual(28);
    await expect(page.getByText('当前阶段：学习新题',{exact:true})).toHaveCount(0);
  }
});

test('desktop daily question grid highlights current question and revisits history without changing the active task',async({page})=>{
 await page.setViewportSize({width:1280,height:800});await open(page);await plan(page);
 await button(page,'开始今日学习').click();
 const grid=page.getByRole('region',{name:'今日学习题号'});
 await expect(grid).toBeVisible();
 await expect(grid.getByRole('button',{name:/第 \d+ 题/})).toHaveCount(5);
 await expect(grid.getByRole('button',{name:/第 1 题 · 当前查看/})).toHaveAttribute('aria-current','true');
 await expect(grid.getByRole('button',{name:/第 2 题 · 未学习/})).toBeDisabled();
 await button(page,'已记忆，继续').click();
 await expect(grid.getByRole('button',{name:/第 2 题 · 当前查看/})).toHaveAttribute('aria-current','true');
 await grid.getByRole('button',{name:/第 1 题 · 待巩固/}).click();
 await expect(page.getByRole('heading',{name:'测试单选：首题'})).toBeVisible();
 await grid.getByRole('button',{name:/第 2 题 · 未学习/}).click();
 await expect(page.getByRole('heading',{name:'测试多选：第二题'})).toBeVisible();
});

test('learned grid opens persisted questions after reload and keeps active task unchanged',async({page})=>{
 await page.setViewportSize({width:1280,height:800});await open(page);await plan(page);
 await button(page,'开始今日学习').click();
 await button(page,'已记忆，继续').click();
 await expect(page.getByRole('heading',{name:'测试多选：第二题'})).toBeVisible();
 await page.reload();
 await button(page,'继续上次学习').click();
 const grid=page.getByRole('region',{name:'今日学习题号'});
 await expect(grid.getByRole('button',{name:/第 1 题 · 待巩固/})).toBeEnabled();
 await grid.getByRole('button',{name:/第 1 题 · 待巩固/}).click();
 await expect(page.getByRole('heading',{name:'测试单选：首题'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'参考答案'})).toBeVisible();
 await expect(page.getByText('需要重新巩固',{exact:true})).toHaveCount(0);
 await button(page,'回到当前学习').click();
 await expect(page.getByRole('heading',{name:'测试多选：第二题'})).toBeVisible();
 expect(await page.evaluate(()=>window.__learningAttempts.length)).toBe(0);
});

test('daily grid scrolls independently and smoothly centers a newly selected question',async({page})=>{
  await page.setViewportSize({width:1280,height:800});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.clock.install({time:t});
  await page.goto(url+'?large=1');
  await expect(page.getByRole('heading',{name:'考试计划'})).toBeVisible();
  await plan(page);
  await openReport(page);
  await page.getByRole('button',{name:/^第51题 /}).click();
  await button(page,'学习此题').click();
  const scroller=page.getByTestId('learning-question-scroll');
  const progress=page.getByTestId('learning-daily-progress');
  await expect(scroller).toBeVisible();
  const selected=scroller.locator('[aria-current=true]');
  await expect(selected).toHaveText('51');
  await expect.poll(()=>scroller.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  await expect.poll(()=>scroller.evaluate(el=>{
    const r=el.getBoundingClientRect(),b=el.querySelector('[aria-current=true]').getBoundingClientRect();
    return Math.abs((r.top+r.bottom-b.top-b.bottom)/2);
  })).toBeLessThan(3);
  const before=await progress.boundingBox();
  await scroller.evaluate(el=>el.scrollTop=0);
  await expect.poll(()=>scroller.evaluate(el=>el.scrollTop)).toBe(0);
  expect(await progress.boundingBox()).toEqual(before);
  await page.clock.runFor(6000);
  expect(await scroller.evaluate(el=>el.scrollTop)).toBe(0);
});

test('waiting for first recall offers explicit early reinforcement or more new cards',async({page})=>{
 await page.setViewportSize({width:1280,height:800});await open(page);
 await page.getByLabel('考试日期').fill('2026-12-15');
 await button(page,'保存学习计划').click();
 await button(page,'开始今日学习').click();
 await button(page,'已记忆，继续').click();
 await expect(page.getByRole('heading',{name:'正在等待巩固间隔'})).toBeVisible();
 await expect(button(page,'继续学习新题')).toBeVisible();
 await button(page,'提前巩固').click();
 await expect(page.getByRole('heading',{name:'测试单选：首题'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'参考答案'})).toHaveCount(0);
 expect(await page.evaluate(()=>window.__learningAttempts.length)).toBe(0);
});

test('legacy one-success card is demoted and shows remaining reinforcement',async({page})=>{
 await page.setViewportSize({width:1280,height:800});await open(page);await plan(page);
 const old=t.getTime()-86400000;
 const events=[{id:'00000000-0000-4000-8000-000000000011',kind:'intro',at:old,day:'2026-11-27',questionId:'MG-1'},
 {id:'00000000-0000-4000-8000-000000000012',kind:'rate',at:old+180000,day:'2026-11-27',questionId:'MG-1',rating:4}];
 await button(page,'学习记录备份 / 恢复').click();
 await page.locator('input[type=file]').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'qbank-smart-learning-v1',subject:'maogai',exportedAt:t.getTime(),events}))});
 await button(page,'确认合并').click();
 await expect(page.getByText(/进入复习 0 题/)).toBeVisible();
 await button(page,'开始今日学习').click();
 await expect(page.getByRole('heading',{name:'测试单选：首题'})).toBeVisible();
 await expect(page.getByLabel('短时强化 1/3')).toBeVisible();
 const orderBefore=await page.getByRole('button',{name:/正确选项甲|错误选项乙/}).allTextContents();
 await page.getByRole('button',{name:/正确选项甲/}).click();
 await button(page,'很熟悉').click();
 await returnPlan(page);
 await expect(page.getByText(/进入复习 0 题/)).toBeVisible();
 expect(await page.evaluate(()=>window.__learningAttempts.length)).toBe(1);
 await page.clock.runFor(125000);
 await selectCard(page,1);
 await expect(page.getByLabel('短时强化 2/3')).toBeVisible();
 expect(await page.getByRole('button',{name:/正确选项甲|错误选项乙/}).allTextContents()).not.toEqual(orderBefore);
 await page.getByRole('button',{name:/正确选项甲/}).click();
 await button(page,'记得').click();
 await returnPlan(page);
 await expect(page.getByText(/进入复习 1 题/)).toBeVisible();
});

test('option shuffle preference can be disabled and persists without resetting progress',async({page})=>{
 await page.setViewportSize({width:1280,height:800});await open(page);await plan(page);
 const toggle=page.getByRole('switch',{name:'随机选项顺序'});
 await expect(toggle).toBeChecked();
 await page.locator('label[for="learning-shuffle-options"]').last().click();
 await expect(toggle).not.toBeChecked();
 await button(page,'开始今日学习').click();
 await button(page,'已记忆，继续').click();
 await returnPlan(page);
 await page.reload();
 await expect(toggle).not.toBeChecked();
 await selectCard(page,1);
 const opts=page.getByRole('button',{name:/正确选项甲|错误选项乙/});
 await expect(opts.nth(0)).toContainText('正确选项甲');
 await expect(opts.nth(1)).toContainText('错误选项乙');
 await page.keyboard.press('1');
 await expect(page.getByRole('status').filter({hasText:'回答正确'})).toBeVisible();
 await button(page,'记得').click();
 await returnPlan(page);
 await expect(toggle).not.toBeChecked();
 await page.locator('label[for="learning-shuffle-options"]').last().click();
 await page.reload();
 await expect(toggle).toBeChecked();
});
