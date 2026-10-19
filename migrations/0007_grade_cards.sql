-- Private images: no public URLs, fetched only by the owner's Telegram account.
CREATE TABLE lms_grade_cards (
  chat_id INTEGER NOT NULL,
  course_id TEXT NOT NULL,
  page INTEGER NOT NULL,
  pages INTEGER NOT NULL,
  signature TEXT NOT NULL,
  image TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, course_id, page)
);
