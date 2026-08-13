create extension if not exists pgcrypto;

create table if not exists public.doubts (
  id uuid primary key default gen_random_uuid(),
  student_user_id uuid not null references auth.users (id) on delete cascade,
  student_id bigint not null,
  teacher_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null,
  question text not null,
  status text not null default 'pending' check (status in ('pending', 'answered', 'closed')),
  attachment_name text,
  attachment_type text,
  attachment_data text,
  answered_at timestamptz,
  closed_at timestamptz,
  reopened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.doubt_answers (
  id uuid primary key default gen_random_uuid(),
  doubt_id uuid not null references public.doubts (id) on delete cascade,
  teacher_id uuid not null references auth.users (id) on delete cascade,
  answer text not null,
  attachment_name text,
  attachment_type text,
  attachment_data text,
  created_at timestamptz not null default now()
);

create index if not exists doubts_student_user_id_idx on public.doubts (student_user_id);
create index if not exists doubts_teacher_id_idx on public.doubts (teacher_id);
create index if not exists doubts_course_id_idx on public.doubts (course_id);
create index if not exists doubts_status_idx on public.doubts (status);
create index if not exists doubt_answers_doubt_id_idx on public.doubt_answers (doubt_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists doubts_set_updated_at on public.doubts;
create trigger doubts_set_updated_at
before update on public.doubts
for each row
execute function public.set_updated_at();

alter table public.doubts enable row level security;
alter table public.doubt_answers enable row level security;

drop policy if exists "doubts_select_own_or_assigned" on public.doubts;
create policy "doubts_select_own_or_assigned"
on public.doubts
for select
using (
  student_user_id = auth.uid()
  or exists (
    select 1
    from public.course_teachers ct
    where ct.course_id = doubts.course_id
      and ct.teacher_id = auth.uid()
  )
);

drop policy if exists "doubts_insert_own" on public.doubts;
create policy "doubts_insert_own"
on public.doubts
for insert
with check (
  student_user_id = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'student'
      and p.student_id = doubts.student_id
  )
  and exists (
    select 1
    from public.enrollments e
    where e.course_id = doubts.course_id
      and e.student_id = doubts.student_id
  )
  and exists (
    select 1
    from public.course_teachers ct
    where ct.course_id = doubts.course_id
      and ct.teacher_id = doubts.teacher_id
  )
);

drop policy if exists "doubts_update_assigned_teacher" on public.doubts;
create policy "doubts_update_assigned_teacher"
on public.doubts
for update
using (
  teacher_id = auth.uid()
  and exists (
    select 1
    from public.course_teachers ct
    where ct.course_id = doubts.course_id
      and ct.teacher_id = auth.uid()
  )
)
with check (
  teacher_id = auth.uid()
  and exists (
    select 1
    from public.course_teachers ct
    where ct.course_id = doubts.course_id
      and ct.teacher_id = auth.uid()
  )
);

drop policy if exists "doubt_answers_select_own_or_assigned" on public.doubt_answers;
create policy "doubt_answers_select_own_or_assigned"
on public.doubt_answers
for select
using (
  exists (
    select 1
    from public.doubts d
    where d.id = doubt_answers.doubt_id
      and (
        d.student_user_id = auth.uid()
        or exists (
          select 1
          from public.course_teachers ct
          where ct.course_id = d.course_id
            and ct.teacher_id = auth.uid()
        )
      )
  )
);

drop policy if exists "doubt_answers_insert_assigned_teacher" on public.doubt_answers;
create policy "doubt_answers_insert_assigned_teacher"
on public.doubt_answers
for insert
with check (
  teacher_id = auth.uid()
  and exists (
    select 1
    from public.doubts d
    where d.id = doubt_answers.doubt_id
      and d.teacher_id = auth.uid()
      and exists (
        select 1
        from public.course_teachers ct
        where ct.course_id = d.course_id
          and ct.teacher_id = auth.uid()
      )
  )
);