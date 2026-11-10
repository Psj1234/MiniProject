# Database Design

Tables defined in the three files under `supabase/`. `courses` and `auth.users`
are referenced but not created by these files.

```mermaid
erDiagram
    COURSES ||--o{ ASSIGNMENTS : has
    AUTH_USERS ||--o{ ASSIGNMENTS : "creates (professor)"
    ASSIGNMENTS ||--o{ ASSIGNMENT_QUESTIONS : contains
    ASSIGNMENTS ||--o{ ASSIGNMENT_RECIPIENTS : "sent to"
    ASSIGNMENTS ||--o{ ASSIGNMENT_SUBMISSIONS : receives
    AUTH_USERS ||--o{ ASSIGNMENT_SUBMISSIONS : submits
    ASSIGNMENT_SUBMISSIONS ||--o{ ASSIGNMENT_ANSWERS : has
    ASSIGNMENT_QUESTIONS ||--o{ ASSIGNMENT_ANSWERS : answered_by
    COURSES ||--o{ DOUBTS : about
    AUTH_USERS ||--o{ DOUBTS : "asks (student)"
    DOUBTS ||--o{ DOUBT_ANSWERS : has
    AUTH_USERS ||--o{ DOUBT_ANSWERS : "answers (teacher)"
    AUTH_USERS ||--o{ STUDENT_ACHIEVEMENTS : earns
```

## Files and tables

| SQL file | Tables |
| --- | --- |
| `assignments_and_ai_evaluation.sql` | assignments, assignment_questions, assignment_recipients, assignment_submissions, assignment_answers |
| `doubt_resolution.sql` | doubts, doubt_answers |
| `overall_performance_achievements.sql` | student_achievements |

## Delete behaviour

Most foreign keys use `ON DELETE CASCADE`, so deleting an assignment removes its
questions, recipients, submissions and answers. `assignment_recipients.student_user_id`
uses `ON DELETE SET NULL`.
