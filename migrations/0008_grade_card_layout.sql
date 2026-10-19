-- Old layouts remain stored but are not shown as if they were the new cards.
ALTER TABLE lms_grade_cards ADD COLUMN format INTEGER NOT NULL DEFAULT 1;
ALTER TABLE lms_grade_cards ADD COLUMN student_group TEXT NOT NULL DEFAULT '';
