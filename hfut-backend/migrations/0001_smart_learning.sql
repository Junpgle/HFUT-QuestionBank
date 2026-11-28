CREATE TABLE IF NOT EXISTS LearningEvents (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  UNIQUE(user_id,subject,event_id)
);
CREATE INDEX IF NOT EXISTS idx_learning_events_pull ON LearningEvents(user_id,subject,seq);
