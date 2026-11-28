-- One real attempt counts once; distinct attempts on the same question all count.
CREATE TABLE IF NOT EXISTS QuestionAttemptReceipts (
  user_id INTEGER NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
  attempt_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  question_title TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  is_correct INTEGER NOT NULL CHECK(is_correct IN (0,1)),
  answer_key TEXT NOT NULL DEFAULT 'Unknown',
  PRIMARY KEY(user_id,attempt_id)
);
CREATE INDEX IF NOT EXISTS idx_question_attempt_wrong_users ON QuestionAttemptReceipts(question_id,user_id) WHERE is_correct=0;
CREATE TRIGGER IF NOT EXISTS qbank_count_attempt AFTER INSERT ON QuestionAttemptReceipts
BEGIN
  INSERT INTO QuestionStats(question_id,question_title,category,error_count,total_attempts,option_stats)
  VALUES(NEW.question_id,NEW.question_title,NEW.category,1-NEW.is_correct,1,
    CASE WHEN NEW.is_correct=0 THEN json_object(NEW.answer_key,1) ELSE '{}' END)
  ON CONFLICT(question_id) DO UPDATE SET
    error_count=error_count+excluded.error_count,
    total_attempts=total_attempts+1,
    question_title=CASE WHEN excluded.question_title<>'' THEN excluded.question_title ELSE question_title END,
    category=CASE WHEN excluded.category<>'' THEN excluded.category ELSE category END,
    option_stats=CASE WHEN NEW.is_correct=0 THEN json_set(
      COALESCE(option_stats,'{}'),'$."'||NEW.answer_key||'"',
      COALESCE(json_extract(option_stats,'$."'||NEW.answer_key||'"'),0)+1)
      ELSE option_stats END;
END;
