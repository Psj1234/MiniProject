-- ==============================================================================
-- VidyaMitra: Professor Assignments + AI-Based Subjective Evaluation Migration
-- ==============================================================================

-- 1. Create assignments table
CREATE TABLE IF NOT EXISTS public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses (id) ON DELETE CASCADE,
  professor_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  deadline timestamptz NOT NULL,
  allow_late_submissions boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'closed', 'archived')),
  total_marks numeric NOT NULL DEFAULT 0 CHECK (total_marks >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Create assignment_questions table
CREATE TABLE IF NOT EXISTS public.assignment_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments (id) ON DELETE CASCADE,
  order_num int NOT NULL DEFAULT 1,
  question_text text NOT NULL,
  question_type text NOT NULL DEFAULT 'subjective' CHECK (question_type IN ('subjective', 'multiple_choice', 'true_false')),
  max_marks numeric NOT NULL DEFAULT 10 CHECK (max_marks > 0),
  rubric text,
  options jsonb DEFAULT '[]'::jsonb, -- Array of string options for objective questions
  correct_answer text,                -- Expected answer for objective questions
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Create assignment_recipients table (Student assignment mapping)
CREATE TABLE IF NOT EXISTS public.assignment_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments (id) ON DELETE CASCADE,
  student_uid bigint NOT NULL,       -- Matches profiles.student_id & enrollments.student_id
  student_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'submitted', 'late', 'grading', 'graded', 'grading_failed')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_uid)
);

-- 4. Create assignment_submissions table
CREATE TABLE IF NOT EXISTS public.assignment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments (id) ON DELETE CASCADE,
  student_uid bigint NOT NULL,
  student_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  submitted_at timestamptz,
  is_draft boolean NOT NULL DEFAULT true,
  is_late boolean NOT NULL DEFAULT false,
  grading_status text NOT NULL DEFAULT 'not_submitted' CHECK (grading_status IN ('not_submitted', 'submitted', 'grading', 'graded', 'grading_failed')),
  ai_score numeric CHECK (ai_score >= 0),
  professor_score numeric CHECK (professor_score >= 0), -- Manual override by professor
  final_score numeric CHECK (final_score >= 0),         -- Effective score (professor_score ?? ai_score)
  percentage numeric CHECK (percentage >= 0 AND percentage <= 100),
  ai_strengths jsonb DEFAULT '[]'::jsonb,
  ai_weaknesses jsonb DEFAULT '[]'::jsonb,
  ai_topic_performance jsonb DEFAULT '[]'::jsonb,
  ai_recommendations jsonb DEFAULT '[]'::jsonb,
  ai_overall_feedback text,
  professor_feedback text,
  graded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_uid)
);

-- 5. Create assignment_answers table
CREATE TABLE IF NOT EXISTS public.assignment_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.assignment_submissions (id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.assignment_questions (id) ON DELETE CASCADE,
  student_answer text,
  marks_awarded numeric CHECK (marks_awarded >= 0),
  max_marks numeric NOT NULL DEFAULT 10,
  is_objective boolean NOT NULL DEFAULT false,
  ai_strengths jsonb DEFAULT '[]'::jsonb,
  ai_weaknesses jsonb DEFAULT '[]'::jsonb,
  ai_missing_points jsonb DEFAULT '[]'::jsonb,
  ai_feedback text,
  ai_reasoning text,
  professor_marks_override numeric CHECK (professor_marks_override >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, question_id)
);

-- 6. Create Indexes for High Performance
CREATE INDEX IF NOT EXISTS assignments_course_id_idx ON public.assignments (course_id);
CREATE INDEX IF NOT EXISTS assignments_professor_id_idx ON public.assignments (professor_id);
CREATE INDEX IF NOT EXISTS assignments_deadline_idx ON public.assignments (deadline);
CREATE INDEX IF NOT EXISTS assignment_questions_assignment_id_idx ON public.assignment_questions (assignment_id);
CREATE INDEX IF NOT EXISTS assignment_recipients_assignment_id_idx ON public.assignment_recipients (assignment_id);
CREATE INDEX IF NOT EXISTS assignment_recipients_student_uid_idx ON public.assignment_recipients (student_uid);
CREATE INDEX IF NOT EXISTS assignment_submissions_assignment_id_idx ON public.assignment_submissions (assignment_id);
CREATE INDEX IF NOT EXISTS assignment_submissions_student_uid_idx ON public.assignment_submissions (student_uid);
CREATE INDEX IF NOT EXISTS assignment_submissions_grading_status_idx ON public.assignment_submissions (grading_status);
CREATE INDEX IF NOT EXISTS assignment_answers_submission_id_idx ON public.assignment_answers (submission_id);
CREATE INDEX IF NOT EXISTS assignment_answers_question_id_idx ON public.assignment_answers (question_id);

-- 7. Enable Row Level Security (RLS) on all tables
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_answers ENABLE ROW LEVEL SECURITY;

-- 7.5. Helper Security Definer Functions (Prevents RLS infinite recursion)
CREATE OR REPLACE FUNCTION public.check_is_assignment_recipient(p_assignment_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assignment_recipients ar
    LEFT JOIN public.profiles p ON p.student_id = ar.student_uid
    WHERE ar.assignment_id = p_assignment_id
      AND (p.id = p_user_id OR ar.student_user_id = p_user_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.check_is_assignment_professor(p_assignment_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assignments a
    WHERE a.id = p_assignment_id
      AND a.professor_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.check_can_access_submission(p_submission_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assignment_submissions s
    JOIN public.assignments a ON a.id = s.assignment_id
    WHERE s.id = p_submission_id
      AND (s.student_user_id = p_user_id OR a.professor_id = p_user_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.check_is_assignment_recipient(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.check_is_assignment_professor(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.check_can_access_submission(uuid, uuid) TO authenticated, anon;

-- 8. RLS Policies: assignments
DROP POLICY IF EXISTS "assignments_select_policy" ON public.assignments;
CREATE POLICY "assignments_select_policy" ON public.assignments
  FOR SELECT USING (
    professor_id = auth.uid()
    OR public.check_is_assignment_recipient(id, auth.uid())
  );

DROP POLICY IF EXISTS "assignments_insert_policy" ON public.assignments;
CREATE POLICY "assignments_insert_policy" ON public.assignments
  FOR INSERT WITH CHECK (
    professor_id = auth.uid()
  );

DROP POLICY IF EXISTS "assignments_update_policy" ON public.assignments;
CREATE POLICY "assignments_update_policy" ON public.assignments
  FOR UPDATE USING (
    professor_id = auth.uid()
  );

DROP POLICY IF EXISTS "assignments_delete_policy" ON public.assignments;
CREATE POLICY "assignments_delete_policy" ON public.assignments
  FOR DELETE USING (
    professor_id = auth.uid()
  );

-- 9. RLS Policies: assignment_questions
DROP POLICY IF EXISTS "questions_select_policy" ON public.assignment_questions;
CREATE POLICY "questions_select_policy" ON public.assignment_questions
  FOR SELECT USING (
    public.check_is_assignment_professor(assignment_id, auth.uid())
    OR public.check_is_assignment_recipient(assignment_id, auth.uid())
  );

DROP POLICY IF EXISTS "questions_manage_policy" ON public.assignment_questions;
CREATE POLICY "questions_manage_policy" ON public.assignment_questions
  FOR ALL USING (
    public.check_is_assignment_professor(assignment_id, auth.uid())
  )
  WITH CHECK (
    public.check_is_assignment_professor(assignment_id, auth.uid())
  );

-- 10. RLS Policies: assignment_recipients
DROP POLICY IF EXISTS "recipients_select_policy" ON public.assignment_recipients;
CREATE POLICY "recipients_select_policy" ON public.assignment_recipients
  FOR SELECT USING (
    student_user_id = auth.uid()
    OR public.check_is_assignment_professor(assignment_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.student_id = assignment_recipients.student_uid
        AND p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "recipients_manage_policy" ON public.assignment_recipients;
CREATE POLICY "recipients_manage_policy" ON public.assignment_recipients
  FOR ALL USING (
    public.check_is_assignment_professor(assignment_id, auth.uid())
  )
  WITH CHECK (
    public.check_is_assignment_professor(assignment_id, auth.uid())
  );

-- 11. RLS Policies: assignment_submissions
DROP POLICY IF EXISTS "submissions_select_policy" ON public.assignment_submissions;
CREATE POLICY "submissions_select_policy" ON public.assignment_submissions
  FOR SELECT USING (
    student_user_id = auth.uid()
    OR public.check_is_assignment_professor(assignment_id, auth.uid())
  );

DROP POLICY IF EXISTS "submissions_insert_policy" ON public.assignment_submissions;
CREATE POLICY "submissions_insert_policy" ON public.assignment_submissions
  FOR INSERT WITH CHECK (
    student_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "submissions_update_policy" ON public.assignment_submissions;
CREATE POLICY "submissions_update_policy" ON public.assignment_submissions
  FOR UPDATE USING (
    student_user_id = auth.uid()
    OR public.check_is_assignment_professor(assignment_id, auth.uid())
  );

DROP POLICY IF EXISTS "submissions_delete_policy" ON public.assignment_submissions;
CREATE POLICY "submissions_delete_policy" ON public.assignment_submissions
  FOR DELETE USING (
    public.check_is_assignment_professor(assignment_id, auth.uid())
  );

-- 12. RLS Policies: assignment_answers
DROP POLICY IF EXISTS "answers_select_policy" ON public.assignment_answers;
CREATE POLICY "answers_select_policy" ON public.assignment_answers
  FOR SELECT USING (
    public.check_can_access_submission(submission_id, auth.uid())
  );

DROP POLICY IF EXISTS "answers_manage_policy" ON public.assignment_answers;
CREATE POLICY "answers_manage_policy" ON public.assignment_answers
  FOR ALL USING (
    public.check_can_access_submission(submission_id, auth.uid())
  )
  WITH CHECK (
    public.check_can_access_submission(submission_id, auth.uid())
  );

-- 13. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
