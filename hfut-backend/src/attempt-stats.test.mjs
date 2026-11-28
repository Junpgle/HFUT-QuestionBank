import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {prepareAttemptStats} from './attempt-stats.js';
test('each independent wrong attempt counts; retries do not; unique users tracked',()=>{
 const sql=new DatabaseSync(':memory:');
 sql.exec("CREATE TABLE Users(id INTEGER PRIMARY KEY); INSERT INTO Users VALUES(1),(2); CREATE TABLE QuestionStats(question_id TEXT PRIMARY KEY,question_title TEXT,category TEXT,error_count INTEGER,total_attempts INTEGER,option_stats TEXT); INSERT INTO QuestionStats VALUES('MG-1','old','',4,10,'{}');");
 sql.exec(readFileSync(new URL('../migrations/0002_question_attempt_receipts.sql',import.meta.url),'utf8'));
 const db={prepare:q=>({bind:(...args)=>({run:()=>sql.prepare(q).run(...args)})})};
 const attempt=(id,isCorrect=false)=>({attemptId:'00000000-0000-4000-8000-'+String(id).padStart(12,'0'),questionId:'MG-1',isCorrect,userAnswer:'B'});
 const send=(uid,rows)=>{const p=prepareAttemptStats(db,uid,rows);for(const s of p.statements)s.run();return p.ack;};
 send(1,[attempt(1),attempt(2),attempt(1)]);send(1,[attempt(1)]);send(1,[attempt(3,true)]);send(2,[attempt(4)]);
 const row=sql.prepare("SELECT * FROM QuestionStats WHERE question_id='MG-1'").get();
 assert.equal(row.error_count,7);assert.equal(row.total_attempts,14);assert.equal(JSON.parse(row.option_stats).B,3);
 assert.equal(sql.prepare("SELECT COUNT(DISTINCT user_id) n FROM QuestionAttemptReceipts WHERE question_id='MG-1' AND is_correct=0").get().n,2);
 sql.close();
});
