-- Личная ручная отметка: это не статус сдачи из Moodle.
ALTER TABLE deadlines ADD COLUMN done_at INTEGER;
