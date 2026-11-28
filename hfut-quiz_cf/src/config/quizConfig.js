import { RELICS_SUBJECT_ID, RELICS_CHAPTERS } from '../utils/culturalRelics.js';

export const CURRENT_APP_VERSION = '5.4.1';
export const LEADERBOARD_LIMIT = 50;
export const GITHUB_BASE = 'https://raw.githubusercontent.com/Junpgle/HFUT---Innovation-and-Entrepreneurship-Question-Bank/refs/heads/main/questions/';
export const REPORT_URL = '/#/report';
export const BANK_CACHE_VERSION = 5;

export const LECTURES = [
  { id: 1, name: '第一讲：创新创业概述', file: '创新创业基础第一讲习题.xlsx' },
  { id: 2, name: '第二讲：创新思维与方法', file: '创新创业基础第二讲习题.xlsx' },
  { id: 3, name: '第三讲：机会与风险识别', file: '创新创业基础第三讲习题.xlsx' },
  { id: 4, name: '第四讲：团队与资源整合', file: '创新创业基础第四讲习题.xlsx' },
  { id: 5, name: '第五讲：商业模式与计划', file: '创新创业基础第五讲习题.xlsx' },
  { id: 6, name: '第六讲：融资与企业设立', file: '创新创业基础第六讲习题.xlsx' },
  { id: 7, name: '第七讲：新企业成长管理', file: '创新创业基础第七讲习题.xlsx' },
  { id: 99, name: '经典旧题库 (综合)', file: 'questions_old.xls' },
];

export const MAOGAO_CHAPTERS = [
  { id: 1, name: '导论' },
  { id: 2, name: '第一章' },
  { id: 3, name: '第二章' },
  { id: 4, name: '第三章' },
  { id: 5, name: '第四章' },
  { id: 6, name: '第五章' },
  { id: 7, name: '第六章' },
  { id: 8, name: '第七章' },
  { id: 9, name: '第八章' },
];

export const ENGLISH_CULTURE_CHAPTERS = [
  { id: 1, name: '作业一' },
  { id: 2, name: '作业二' },
  { id: 3, name: '作业三' },
];

export const SUBJECTS = [
  {
    id: 'innovation',
    name: '创新创业',
    category: '公共课程',
    icon: '🚀',
    description: '7个章节 + 经典旧题库，涵盖创新创业基础全部内容',
    lectures: LECTURES,
    getChapters: (bank) => LECTURES.filter((l) => bank[l.id]?.length),
    getChapterName: (id) => LECTURES.find((l) => l.id === id)?.name || `章节${id}`,
  },
  {
    id: 'maogai',
    name: '毛泽东思想和中国特色社会主义理论体系概论',
    shortName: '毛概',
    category: '思想政治',
    icon: '📖',
    description: '9个章节，涵盖毛泽东思想和中国特色社会主义理论体系概论全部内容',
    file: 'maogai_full.json',
    chapters: MAOGAO_CHAPTERS,
    getChapters: (bank) => MAOGAO_CHAPTERS.filter((ch) => bank[ch.id]?.length),
    getChapterName: (id) => MAOGAO_CHAPTERS.find((ch) => ch.id === id)?.name || `章节${id}`,
  },
  {
    id: 'hgdmy-maogai',
    name: '合工大智慧马院-毛概',
    shortName: '马院毛概',
    category: '思想政治',
    icon: '🏛️',
    description: '综合题库，涵盖合工大智慧马院毛概（学习通）全部题目',
    file: 'hgdmy-maogai.json',
    lectures: [{ id: 1, name: '全部题目' }],
    getChapters: (bank) => [{ id: 1, name: '全部题目' }].filter((ch) => bank[ch.id]?.length),
    getChapterName: () => '全部题目',
  },
  {
    id: RELICS_SUBJECT_ID,
    name: '文物精品与中华文明',
    shortName: '文物精品',
    category: '公共课程',
    icon: '🏺',
    description: '254 道题，涵盖考古遗址、青铜器、玉器、古代音乐与天文历法，附完整解析',
    file: 'cultural-relics.json',
    lectures: RELICS_CHAPTERS,
    getChapters: (bank) => RELICS_CHAPTERS.filter(ch => bank[ch.id]?.length),
    getChapterName: () => '全部题目',
  },
  {
    id: 'english-culture',
    name: '英语国家社会与文化',
    shortName: '英美文化',
    category: '公共课程',
    icon: '🌍',
    description: '3个作业章节，涵盖英语国家社会与文化全部内容',
    file: 'english-culture.json',
    chapters: ENGLISH_CULTURE_CHAPTERS,
    getChapters: (bank) => ENGLISH_CULTURE_CHAPTERS.filter((ch) => bank[ch.id]?.length),
    getChapterName: (id) => ENGLISH_CULTURE_CHAPTERS.find((ch) => ch.id === id)?.name || `章节${id}`,
  },
];

export const getBankCacheKey = (subjectId) => `hf_question_bank_${subjectId}`;
export const getBankCacheVersionKey = (subjectId) => `hf_bank_version_${subjectId}`;
