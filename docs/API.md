# API Reference

All routes live under `app/api/` and run on the server. AI calls to Groq are
made only from these routes using `GROQ_API_KEY`.

| Method | Route | Purpose | Auth |
| --- | --- | --- | --- |
| POST | `/api/auth/signup` | Create a user account (student or professor) | Public |
| GET | `/api/recommendations` | Personalised AI recommendations for the logged-in student | Logged-in student |
| POST | `/api/student-ai-card` | Generate the student's AI summary card | Logged-in user |
| POST | `/api/assignments/grade` | AI-evaluate a submission | Logged-in professor |
| POST | `/api/assignments/delete` | Delete an assignment and its related rows | Logged-in professor (owner) |

## POST `/api/auth/signup`

Body: `{ email, password, name, role, studentId }`

- `400` invalid email, missing name, weak password, or duplicate student ID
- `409` account already exists

## GET `/api/recommendations`

- `401` not logged in
- `404` student profile not found
- `400` student ID not configured on the profile

## POST `/api/assignments/grade`

Body: `{ submissionId }`

- `400` missing `submissionId`
- `401` unauthorized
- `403` caller does not own the assignment
- `404` submission not found

Falls back to baseline grading if the Groq key is not configured.

## POST `/api/assignments/delete`

Body: `{ assignmentId }`

Deletes answers, submissions, recipients, questions, then the assignment.

- `400` missing `assignmentId`
- `401` unauthorized
- `403` not the owner
- `404` assignment not found
