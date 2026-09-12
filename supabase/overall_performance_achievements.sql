-- ==============================================================================
-- VidyaMitra: Student Overall Performance & Achievements Migration
-- ==============================================================================

-- 1. Add CGPA field to profiles table if it does not already exist
ALTER TABLE IF EXISTS public.profiles
ADD COLUMN IF NOT EXISTS cgpa numeric(4,2) CHECK (cgpa >= 0.0 AND cgpa <= 10.0);

-- Explicitly notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';

-- 2. Create student_achievements table for normalized one-to-many relationship
CREATE TABLE IF NOT EXISTS public.student_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_uid bigint NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('hackathon', 'coding_competition', 'research', 'internship', 'project')),
  title text NOT NULL,
  organizer text,
  date text,
  result text NOT NULL,
  score numeric NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  description text,
  proof_url text,
  certificate_name text,
  verification_status text NOT NULL DEFAULT 'verified' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS student_achievements_student_uid_idx ON public.student_achievements(student_uid);
CREATE INDEX IF NOT EXISTS student_achievements_user_id_idx ON public.student_achievements(user_id);
CREATE INDEX IF NOT EXISTS student_achievements_category_idx ON public.student_achievements(category);
CREATE INDEX IF NOT EXISTS student_achievements_verification_idx ON public.student_achievements(verification_status);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.student_achievements ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for student_achievements

-- Policy: Select achievements
-- Students can view their own achievements.
-- Professors can view achievements of students enrolled in their assigned courses.
DROP POLICY IF EXISTS "achievements_select_policy" ON public.student_achievements;
CREATE POLICY "achievements_select_policy" ON public.student_achievements
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.course_teachers ct
      JOIN public.enrollments e ON e.course_id = ct.course_id
      WHERE ct.teacher_id = auth.uid()
        AND e.student_id = student_achievements.student_uid
    )
  );

-- Policy: Insert achievements
-- Students can insert their own achievements.
DROP POLICY IF EXISTS "achievements_insert_policy" ON public.student_achievements;
CREATE POLICY "achievements_insert_policy" ON public.student_achievements
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
  );

-- Policy: Update achievements
-- Students can update their own achievements.
DROP POLICY IF EXISTS "achievements_update_policy" ON public.student_achievements;
CREATE POLICY "achievements_update_policy" ON public.student_achievements
  FOR UPDATE USING (
    user_id = auth.uid()
  );

-- Policy: Delete achievements
-- Students can delete their own achievements.
DROP POLICY IF EXISTS "achievements_delete_policy" ON public.student_achievements;
CREATE POLICY "achievements_delete_policy" ON public.student_achievements
  FOR DELETE USING (
    user_id = auth.uid()
  );
