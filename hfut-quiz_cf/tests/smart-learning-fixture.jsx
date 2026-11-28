import React from 'react';
import {createRoot} from 'react-dom/client';
import SmartLearning from '../src/components/SmartLearning';
import '../src/index.css';
const bank={1:[
{id:'MG-1',type:'single',question:'测试单选：首题',options:['正确选项甲','错误选项乙'],rawAnswer:[0],explanation:'测试解析甲',category:'第一章'},
{id:'MG-2',type:'multiple',question:'测试多选：第二题',options:['正确选项丙','正确选项丁','错误选项戊'],rawAnswer:[0,1],explanation:'测试解析丙',category:'第一章'},
{id:'MG-3',type:'fill',question:'测试填空：第三题___',options:['答案庚'],rawAnswer:[0],explanation:'测试解析庚',category:'第二章'},
{id:'MG-4',type:'big',question:'测试简答：第四题',options:['参考要点辛'],rawAnswer:[0],explanation:'测试解析辛',category:'第二章'},
{id:'MG-5',type:'judgment',question:'测试判断：第五题',options:['正确','错误'],rawAnswer:[1],explanation:'测试解析壬',category:'第二章'}
]};
const empty=new Set();
createRoot(document.getElementById('root')).render(<React.StrictMode><SmartLearning subject="maogai" subjectName="测试题库" bank={bank} user={null} wrongIds={empty} brushedIds={empty} onBack={()=>{}}/></React.StrictMode>);
