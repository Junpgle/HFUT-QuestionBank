import test from 'node:test';
import assert from 'node:assert/strict';
import {ignoreQuizShortcut,optionShortcutIndex,quizShortcutAction} from './quizShortcuts.js';
const state={mode:'quiz',type:'single',answered:false,optionCount:4};
test('single and multiple choice, bounds and no hidden reveal on navigation',()=>{
 assert.deepEqual(quizShortcutAction('b',state),{type:'option',index:1});
 assert.deepEqual(quizShortcutAction('4',state),{type:'option',index:3});
 assert.equal(quizShortcutAction('5',state),null);
 assert.deepEqual(quizShortcutAction('Enter',{...state,type:'multiple',selectedCount:2}),{type:'submit'});
 assert.equal(quizShortcutAction('Enter',{...state,type:'multiple'}),null);
 assert.deepEqual(quizShortcutAction('ArrowRight',state),{type:'next'});
 assert.deepEqual(quizShortcutAction(' ',state),{type:'reveal'});
 assert.deepEqual(quizShortcutAction('F',state),{type:'reveal'});
});
test('memory mode, fill, answered and unrelated modes',()=>{
 assert.deepEqual(quizShortcutAction(' ',{...state,mode:'memorize'}),{type:'memorize'});
 assert.deepEqual(quizShortcutAction('Enter',{...state,type:'fill'}),{type:'submit-fill'});
 assert.deepEqual(quizShortcutAction('Enter',{...state,answered:true}),{type:'next'});
 assert.equal(quizShortcutAction('2',{...state,answered:true}),null);
 assert.equal(quizShortcutAction('F',{...state,type:'big'}),null);
 assert.equal(quizShortcutAction('Escape',{...state,mode:'smart-learning'}),null);
 assert.deepEqual(quizShortcutAction('Escape',{...state,mode:'favorites'}),{type:'exit'});
 assert.equal(quizShortcutAction('ArrowLeft',{...state,canGoBack:false}),null);
});
test('exclude IME, browser shortcuts, repeats and editable targets',()=>{
 for(const flag of ['repeat','isComposing','metaKey','ctrlKey','altKey','defaultPrevented'])assert.equal(ignoreQuizShortcut({[flag]:true}),true);
 assert.equal(ignoreQuizShortcut({keyCode:229}),true);
 assert.equal(ignoreQuizShortcut({target:{isContentEditable:true}}),true);
 assert.equal(ignoreQuizShortcut({target:{closest:()=>({})}}),true);
 assert.equal(ignoreQuizShortcut({key:'a'}),false);
 assert.equal(optionShortcutIndex('H',8),7);
});
