'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  FileText,
  Plus,
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
  Users,
  Search,
  ChevronRight,
  ArrowLeft,
  RefreshCw,
  Award,
  Sparkles,
  BarChart3,
  TrendingUp,
  X,
  Trash2,
  Edit3,
  Save,
  RotateCcw,
  BookOpen,
  Filter
} from 'lucide-react'

interface CourseItem {
  id: string
  name: string
  code: string | null
}

interface EnrolledStudent {
  id: string // profile user id
  student_id: number // student_uid
  full_name: string
}

interface AssignmentItem {
  id: string
  course_id: string
  course_name?: string
  title: string
  description: string | null
  deadline: string
  allow_late_submissions: boolean
  status: 'draft' | 'published' | 'closed' | 'archived'
  total_marks: number
  created_at: string
  recipients_count?: number
  submissions_count?: number
  graded_count?: number
  avg_score?: number
}

interface QuestionDraft {
  id?: string
  order_num: number
  question_text: string
  question_type: 'subjective' | 'multiple_choice' | 'true_false'
  max_marks: number
  rubric: string
  options: string[]
  correct_answer: string
}

interface StudentSubmissionRow {
  recipient_id: string
  student_uid: number
  student_name: string
  status: 'assigned' | 'in_progress' | 'submitted' | 'late' | 'grading' | 'graded' | 'grading_failed'
  submission_id: string | null
  submitted_at: string | null
  is_late: boolean
  grading_status: string | null
  ai_score: number | null
  professor_score: number | null
  final_score: number | null
  percentage: number | null
  ai_overall_feedback: string | null
  professor_feedback: string | null
}

export default function ProfessorAssignments() {
  const [supabase] = useState(() => createClient())

  // Loading and core states
  const [isLoading, setIsLoading] = useState(true)
  const [courses, setCourses] = useState<CourseItem[]>([])
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [assignments, setAssignments] = useState<AssignmentItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  // View modes
  const [currentView, setCurrentView] = useState<'list' | 'create' | 'detail'>('list')
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentItem | null>(null)

  // Creation State
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newCourseId, setNewCourseId] = useState('')
  const [newDeadline, setNewDeadline] = useState('')
  const [newAllowLate, setNewAllowLate] = useState(false)
  const [newQuestions, setNewQuestions] = useState<QuestionDraft[]>([
    {
      order_num: 1,
      question_text: '',
      question_type: 'subjective',
      max_marks: 10,
      rubric: '',
      options: ['', '', '', ''],
      correct_answer: ''
    }
  ])
  const [enrolledStudents, setEnrolledStudents] = useState<EnrolledStudent[]>([])
  const [selectedStudentUids, setSelectedStudentUids] = useState<number[]>([])
  const [studentSearchTerm, setStudentSearchTerm] = useState('')
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Assignment Detail & Analytics State
  const [detailSubmissions, setDetailSubmissions] = useState<StudentSubmissionRow[]>([])
  const [detailQuestions, setDetailQuestions] = useState<any[]>([])
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [detailSearch, setDetailSearch] = useState('')

  // Submission Review Modal State
  const [activeReviewSubmission, setActiveReviewSubmission] = useState<StudentSubmissionRow | null>(null)
  const [submissionAnswers, setSubmissionAnswers] = useState<any[]>([])
  const [fullSubmissionData, setFullSubmissionData] = useState<any | null>(null)
  const [overrideScoreInput, setOverrideScoreInput] = useState<string>('')
  const [overrideFeedbackInput, setOverrideFeedbackInput] = useState<string>('')
  const [isSavingOverride, setIsSavingOverride] = useState(false)
  const [isRetryingGrading, setIsRetryingGrading] = useState(false)
  const [reviewMessage, setReviewMessage] = useState<string | null>(null)

  // Delete Assignment State
  const [assignmentToDelete, setAssignmentToDelete] = useState<AssignmentItem | null>(null)
  const [isDeletingAssignment, setIsDeletingAssignment] = useState(false)
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null)
  const [deleteSuccessMessage, setDeleteSuccessMessage] = useState<string | null>(null)

  // 1. Initial Data Fetch: Courses & Assignments
  const fetchData = async () => {
    try {
      setIsLoading(true)
      const {
        data: { user }
      } = await supabase.auth.getUser()

      if (!user) return

      // Fetch courses taught by professor
      const { data: teacherCourses, error: cErr } = await supabase
        .from('course_teachers')
        .select(`
          course_id,
          courses (
            id,
            name,
            code
          )
        `)
        .eq('teacher_id', user.id)

      if (cErr) throw cErr

      const formattedCourses: CourseItem[] = (teacherCourses || [])
        .map((tc: any) => tc.courses)
        .filter(Boolean)
        .map((c: any) => ({
          id: c.id,
          name: c.name,
          code: c.code || null
        }))

      setCourses(formattedCourses)
      if (formattedCourses.length > 0 && !newCourseId) {
        setNewCourseId(formattedCourses[0].id)
      }

      // Fetch assignments created by this professor
      const { data: assignData, error: aErr } = await supabase
        .from('assignments')
        .select(`
          *,
          courses (
            id,
            name
          )
        `)
        .eq('professor_id', user.id)
        .order('created_at', { ascending: false })

      if (aErr) {
        // Handle case where table might not exist yet
        console.warn('Assignments table query:', aErr.message)
        setAssignments([])
        setIsLoading(false)
        return
      }

      // Fetch recipient and submission counts for stats
      const assignmentList: AssignmentItem[] = []
      for (const a of assignData || []) {
        // Fetch recipients count
        const { count: recCount } = await supabase
          .from('assignment_recipients')
          .select('id', { count: 'exact', head: true })
          .eq('assignment_id', a.id)

        // Fetch submissions count and averages
        const { data: subs } = await supabase
          .from('assignment_submissions')
          .select('final_score, grading_status')
          .eq('assignment_id', a.id)
          .eq('is_draft', false)

        const submittedCount = subs?.length || 0
        const gradedSubs = (subs || []).filter((s) => s.grading_status === 'graded' && s.final_score !== null)
        const gradedCount = gradedSubs.length
        const avgScore =
          gradedCount > 0
            ? Math.round(
                (gradedSubs.reduce((acc, s) => acc + Number(s.final_score), 0) / gradedCount) * 10
              ) / 10
            : undefined

        assignmentList.push({
          id: a.id,
          course_id: a.course_id,
          course_name: a.courses?.name || 'Course',
          title: a.title,
          description: a.description,
          deadline: a.deadline,
          allow_late_submissions: a.allow_late_submissions,
          status: a.status,
          total_marks: Number(a.total_marks || 0),
          created_at: a.created_at,
          recipients_count: recCount || 0,
          submissions_count: submittedCount,
          graded_count: gradedCount,
          avg_score: avgScore
        })
      }

      setAssignments(assignmentList)
    } catch (err: any) {
      console.error('Error fetching assignments:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // 2. Fetch enrolled students when newCourseId changes during creation
  useEffect(() => {
    const fetchStudentsForCourse = async () => {
      if (!newCourseId) {
        setEnrolledStudents([])
        setSelectedStudentUids([])
        return
      }

      const { data: enrolls } = await supabase
        .from('enrollments')
        .select(`
          student_id,
          profiles (
            id,
            student_id,
            full_name
          )
        `)
        .eq('course_id', newCourseId)

      const students: EnrolledStudent[] = (enrolls || [])
        .map((e: any) => ({
          id: e.profiles?.id || '',
          student_id: Number(e.student_id),
          full_name: e.profiles?.full_name || `Student ${e.student_id}`
        }))
        .filter((s) => s.student_id > 0)

      setEnrolledStudents(students)
      // By default select all students in course
      setSelectedStudentUids(students.map((s) => s.student_id))
    }

    if (currentView === 'create') {
      fetchStudentsForCourse()
    }
  }, [newCourseId, currentView])

  // Filtered assignments list
  const filteredAssignments = useMemo(() => {
    return assignments.filter((a) => {
      const matchCourse = selectedCourseFilter === 'all' || a.course_id === selectedCourseFilter
      const matchStatus = statusFilter === 'all' || a.status === statusFilter
      const matchSearch =
        a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (a.course_name || '').toLowerCase().includes(searchQuery.toLowerCase())
      return matchCourse && matchStatus && matchSearch
    })
  }, [assignments, selectedCourseFilter, statusFilter, searchQuery])

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const total = assignments.length
    const active = assignments.filter((a) => new Date(a.deadline) > new Date()).length
    const totalSubmissions = assignments.reduce((sum, a) => sum + (a.submissions_count || 0), 0)
    const totalGraded = assignments.reduce((sum, a) => sum + (a.graded_count || 0), 0)
    return { total, active, totalSubmissions, totalGraded }
  }, [assignments])

  // --- QUESTION BUILDER HELPERS ---
  const handleAddQuestion = (type: 'subjective' | 'multiple_choice' | 'true_false') => {
    const nextOrder = newQuestions.length + 1
    const newQ: QuestionDraft = {
      order_num: nextOrder,
      question_text: '',
      question_type: type,
      max_marks: type === 'subjective' ? 10 : 5,
      rubric: '',
      options: type === 'multiple_choice' ? ['', '', '', ''] : type === 'true_false' ? ['True', 'False'] : [],
      correct_answer: type === 'true_false' ? 'True' : ''
    }
    setNewQuestions([...newQuestions, newQ])
  }

  const handleRemoveQuestion = (index: number) => {
    if (newQuestions.length <= 1) return
    const updated = newQuestions.filter((_, idx) => idx !== index).map((q, idx) => ({ ...q, order_num: idx + 1 }))
    setNewQuestions(updated)
  }

  const handleUpdateQuestion = (index: number, field: keyof QuestionDraft, val: any) => {
    const updated = [...newQuestions]
    updated[index] = { ...updated[index], [field]: val }
    setNewQuestions(updated)
  }

  const handleUpdateOption = (qIndex: number, optIndex: number, val: string) => {
    const updated = [...newQuestions]
    const opts = [...updated[qIndex].options]
    opts[optIndex] = val
    updated[qIndex].options = opts
    setNewQuestions(updated)
  }

  const totalCalculatedMarks = useMemo(() => {
    return newQuestions.reduce((acc, q) => acc + (Number(q.max_marks) || 0), 0)
  }, [newQuestions])

  // --- CREATE ASSIGNMENT HANDLER ---
  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError(null)

    if (!newTitle.trim()) {
      setCreateError('Please provide an assignment title.')
      return
    }

    if (!newCourseId) {
      setCreateError('Please select an authorized course.')
      return
    }

    if (!newDeadline) {
      setCreateError('Please select an assignment deadline date and time.')
      return
    }

    if (selectedStudentUids.length === 0) {
      setCreateError('Please select at least one student to assign.')
      return
    }

    // Validate questions
    for (let i = 0; i < newQuestions.length; i++) {
      const q = newQuestions[i]
      if (!q.question_text.trim()) {
        setCreateError(`Question ${i + 1} text cannot be blank.`)
        return
      }
      if (q.question_type !== 'subjective' && !q.correct_answer.trim()) {
        setCreateError(`Please specify the correct answer for objective Question ${i + 1}.`)
        return
      }
    }

    try {
      setIsSubmittingCreate(true)
      const {
        data: { user }
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated. Please log in again.')

      // Validate deadline
      const deadlineDate = new Date(newDeadline)
      if (isNaN(deadlineDate.getTime())) {
        setCreateError('Please select a valid deadline date and time.')
        return
      }

      // 1. Create assignment record
      const { data: assignRecord, error: aErr } = await supabase
        .from('assignments')
        .insert({
          course_id: newCourseId,
          professor_id: user.id,
          title: newTitle.trim(),
          description: newDescription.trim() || null,
          deadline: deadlineDate.toISOString(),
          allow_late_submissions: newAllowLate,
          status: 'published',
          total_marks: totalCalculatedMarks
        })
        .select()
        .single()

      if (aErr) {
        const fullMsg = aErr.message || aErr.details || aErr.hint || ''
        const isTableMissing =
          aErr.code === '42P01' ||
          aErr.code === 'PGRST205' ||
          fullMsg.toLowerCase().includes('relation "public.assignments" does not exist') ||
          fullMsg.toLowerCase().includes('schema cache')

        if (isTableMissing) {
          throw new Error('DATABASE_MIGRATION_REQUIRED')
        }
        throw new Error(fullMsg || `Database error creating assignment (${aErr.code || 'UNKNOWN'})`)
      }

      const assignmentId = assignRecord.id

      // 2. Insert questions
      const questionsToInsert = newQuestions.map((q) => ({
        assignment_id: assignmentId,
        order_num: q.order_num,
        question_text: q.question_text.trim(),
        question_type: q.question_type,
        max_marks: Number(q.max_marks),
        rubric: q.rubric.trim() || null,
        options: q.options.filter((o) => o.trim() !== ''),
        correct_answer: q.correct_answer.trim() || null
      }))

      const { error: qErr } = await supabase.from('assignment_questions').insert(questionsToInsert)
      if (qErr) {
        throw new Error(qErr.message || qErr.details || qErr.hint || 'Failed to save assignment questions.')
      }

      // 3. Insert recipients with strict UUID check
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const recipientsToInsert = selectedStudentUids.map((uid) => {
        const studentObj = enrolledStudents.find((s) => s.student_id === uid)
        const validUserId =
          studentObj?.id && typeof studentObj.id === 'string' && uuidRegex.test(studentObj.id.trim())
            ? studentObj.id.trim()
            : null

        return {
          assignment_id: assignmentId,
          student_uid: uid,
          student_user_id: validUserId,
          status: 'assigned'
        }
      })

      const { error: rErr } = await supabase.from('assignment_recipients').insert(recipientsToInsert)
      if (rErr) {
        throw new Error(rErr.message || rErr.details || rErr.hint || 'Failed to assign recipients to this assignment.')
      }

      // Reset form and return to list view
      setNewTitle('')
      setNewDescription('')
      setNewDeadline('')
      setNewQuestions([
        {
          order_num: 1,
          question_text: '',
          question_type: 'subjective',
          max_marks: 10,
          rubric: '',
          options: ['', '', '', ''],
          correct_answer: ''
        }
      ])
      setCurrentView('list')
      fetchData()
    } catch (err: any) {
      const errorMsg =
        err?.message ||
        err?.details ||
        err?.hint ||
        (typeof err === 'object' && err !== null ? JSON.stringify(err) : String(err))

      console.error('Error creating assignment details:', {
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code,
        raw: err
      })

      if (
        errorMsg === 'DATABASE_MIGRATION_REQUIRED' ||
        errorMsg.toLowerCase().includes('relation "public.assignments" does not exist') ||
        errorMsg.toLowerCase().includes('schema cache')
      ) {
        setCreateError('DATABASE_MIGRATION_REQUIRED')
      } else {
        setCreateError(errorMsg || 'Failed to create assignment.')
      }
    } finally {
      setIsSubmittingCreate(false)
    }
  }

  // --- OPEN ASSIGNMENT DETAIL VIEW ---
  const handleOpenDetail = async (assignment: AssignmentItem) => {
    setSelectedAssignment(assignment)
    setCurrentView('detail')
    setIsLoadingDetail(true)

    try {
      // 1. Fetch questions for assignment
      const { data: qData } = await supabase
        .from('assignment_questions')
        .select('*')
        .eq('assignment_id', assignment.id)
        .order('order_num', { ascending: true })

      setDetailQuestions(qData || [])

      // 2. Fetch recipients (avoiding invalid schema foreign key join with profiles)
      const { data: recData, error: recError } = await supabase
        .from('assignment_recipients')
        .select('id, student_uid, status, student_user_id')
        .eq('assignment_id', assignment.id)

      if (recError) {
        console.warn('Error fetching recipients:', recError)
      }

      // 3. Fetch submissions
      const { data: subData, error: subError } = await supabase
        .from('assignment_submissions')
        .select('*')
        .eq('assignment_id', assignment.id)

      if (subError) {
        console.warn('Error fetching submissions:', subError)
      }

      const subMap = new Map<number, any>()
      ;(subData || []).forEach((s) => subMap.set(Number(s.student_uid), s))

      const recMap = new Map<number, any>()
      ;(recData || []).forEach((r) => recMap.set(Number(r.student_uid), r))

      // 4. Gather all student UIDs from both recipients and submissions
      const allStudentUids = Array.from(
        new Set([
          ...(recData || []).map((r: any) => Number(r.student_uid)),
          ...(subData || []).map((s: any) => Number(s.student_uid))
        ])
      ).filter((uid) => uid > 0)

      // 5. Query profiles separately to resolve student full_name
      const profileNameMap = new Map<number, string>()
      if (allStudentUids.length > 0) {
        const { data: profData } = await supabase
          .from('profiles')
          .select('student_id, full_name')
          .in('student_id', allStudentUids)

        ;(profData || []).forEach((p: any) => {
          if (p.student_id) {
            profileNameMap.set(Number(p.student_id), p.full_name || `Student ${p.student_id}`)
          }
        })
      }

      // 6. Combine into table rows
      const rows: StudentSubmissionRow[] = allStudentUids.map((uid) => {
        const r = recMap.get(uid)
        const sub = subMap.get(uid)
        const studentName = profileNameMap.get(uid) || `Student ${uid}`

        return {
          recipient_id: r?.id || sub?.id || `rec_${uid}`,
          student_uid: uid,
          student_name: studentName,
          status: sub
            ? (sub.grading_status === 'graded'
                ? 'graded'
                : sub.grading_status === 'grading'
                ? 'grading'
                : sub.grading_status === 'grading_failed'
                ? 'grading_failed'
                : sub.is_late
                ? 'late'
                : 'submitted')
            : (r?.status || 'assigned'),
          submission_id: sub?.id || null,
          submitted_at: sub?.submitted_at || null,
          is_late: sub?.is_late || false,
          grading_status: sub?.grading_status || null,
          ai_score: sub?.ai_score !== undefined && sub?.ai_score !== null ? Number(sub.ai_score) : null,
          professor_score: sub?.professor_score !== undefined && sub?.professor_score !== null ? Number(sub.professor_score) : null,
          final_score: sub?.final_score !== undefined && sub?.final_score !== null ? Number(sub.final_score) : null,
          percentage: sub?.percentage !== undefined && sub?.percentage !== null ? Number(sub.percentage) : null,
          ai_overall_feedback: sub?.ai_overall_feedback || null,
          professor_feedback: sub?.professor_feedback || null
        }
      })

      setDetailSubmissions(rows)
    } catch (err: any) {
      console.error('Error fetching assignment details:', err)
    } finally {
      setIsLoadingDetail(false)
    }
  }

  // Filtered submissions in detail view
  const filteredDetailSubmissions = useMemo(() => {
    return detailSubmissions.filter(
      (s) =>
        s.student_name.toLowerCase().includes(detailSearch.toLowerCase()) ||
        String(s.student_uid).includes(detailSearch)
    )
  }, [detailSubmissions, detailSearch])

  // --- OPEN SUBMISSION REVIEW MODAL ---
  const handleOpenReview = async (row: StudentSubmissionRow) => {
    setActiveReviewSubmission(row)
    setOverrideScoreInput(row.professor_score !== null ? String(row.professor_score) : '')
    setOverrideFeedbackInput(row.professor_feedback || '')
    setReviewMessage(null)

    if (!row.submission_id) return

    try {
      // Fetch full submission data including answers
      const { data: subData } = await supabase
        .from('assignment_submissions')
        .select('*')
        .eq('id', row.submission_id)
        .single()

      setFullSubmissionData(subData)

      const { data: ansData } = await supabase
        .from('assignment_answers')
        .select(`
          *,
          assignment_questions (
            order_num,
            question_text,
            question_type,
            max_marks,
            rubric
          )
        `)
        .eq('submission_id', row.submission_id)

      const mappedAnswers = (ansData || []).map((ans: any) => {
        if (!ans.assignment_questions && detailQuestions.length > 0) {
          const q = detailQuestions.find((dq) => dq.id === ans.question_id)
          if (q) return { ...ans, assignment_questions: q }
        }
        return ans
      })

      setSubmissionAnswers(mappedAnswers)
    } catch (err: any) {
      console.error('Error loading submission details:', err)
    }
  }

  // --- RETRY AI GRADING ---
  const handleRetryGrading = async () => {
    if (!activeReviewSubmission?.submission_id) return
    setIsRetryingGrading(true)
    setReviewMessage(null)

    try {
      const res = await fetch('/api/assignments/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: activeReviewSubmission.submission_id })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'AI grading failed.')

      setReviewMessage('AI grading completed successfully!')
      // Refresh modal
      if (selectedAssignment) {
        handleOpenDetail(selectedAssignment)
        handleOpenReview(activeReviewSubmission)
      }
    } catch (err: any) {
      console.error('Error retrying AI grading:', err)
      setReviewMessage(`Grading failed: ${err.message}`)
    } finally {
      setIsRetryingGrading(false)
    }
  }

  // --- SAVE PROFESSOR SCORE OVERRIDE ---
  const handleSaveOverride = async () => {
    if (!activeReviewSubmission?.submission_id) return
    setIsSavingOverride(true)
    setReviewMessage(null)

    try {
      const parsedOverride = overrideScoreInput.trim() !== '' ? parseFloat(overrideScoreInput) : null
      const maxPossible = selectedAssignment?.total_marks || 100

      if (parsedOverride !== null && (isNaN(parsedOverride) || parsedOverride < 0 || parsedOverride > maxPossible)) {
        throw new Error(`Score must be between 0 and ${maxPossible}`)
      }

      const finalScore = parsedOverride !== null ? parsedOverride : fullSubmissionData?.ai_score ?? 0
      const percentage =
        maxPossible > 0 ? Math.round((finalScore / maxPossible) * 100 * 10) / 10 : 0

      const { error: updErr } = await supabase
        .from('assignment_submissions')
        .update({
          professor_score: parsedOverride,
          final_score: finalScore,
          percentage: percentage,
          professor_feedback: overrideFeedbackInput.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', activeReviewSubmission.submission_id)

      if (updErr) throw updErr

      setReviewMessage('Professor score override saved successfully!')
      if (selectedAssignment) {
        handleOpenDetail(selectedAssignment)
      }
    } catch (err: any) {
      console.error('Error saving override:', err)
      setReviewMessage(`Failed to save override: ${err.message}`)
    } finally {
      setIsSavingOverride(false)
    }
  }

  // --- DELETE ASSIGNMENT HANDLER ---
  const handleConfirmDelete = async () => {
    if (!assignmentToDelete) return
    setIsDeletingAssignment(true)
    setDeleteErrorMessage(null)

    try {
      const res = await fetch('/api/assignments/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId: assignmentToDelete.id })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete assignment')
      }

      setDeleteSuccessMessage(`Assignment "${assignmentToDelete.title}" was deleted successfully.`)
      const deletedId = assignmentToDelete.id
      setAssignmentToDelete(null)

      // If viewing the detail of this assignment, navigate back to list
      if (currentView === 'detail' && selectedAssignment?.id === deletedId) {
        setCurrentView('list')
        setSelectedAssignment(null)
      }

      // Refresh assignments list
      await fetchData()

      setTimeout(() => {
        setDeleteSuccessMessage(null)
      }, 4000)
    } catch (err: any) {
      console.error('Error deleting assignment:', err)
      setDeleteErrorMessage(err.message || 'Failed to delete assignment.')
    } finally {
      setIsDeletingAssignment(false)
    }
  }

  // --------------------------------------------------------------------------
  // RENDER: CREATE ASSIGNMENT VIEW
  // --------------------------------------------------------------------------
  if (currentView === 'create') {
    return (
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentView('list')}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Assignments
            </Button>
            <div>
              <h2 className="text-xl font-bold text-white">Create New Assignment</h2>
              <p className="text-xs text-slate-400">
                Deadline-based, subjective-first assignment with automated Groq AI evaluation
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-400">Total Marks:</span>
            <span className="ml-1 text-base font-mono font-bold text-blue-400">
              {totalCalculatedMarks} pts
            </span>
          </div>
        </div>

        <form onSubmit={handleCreateAssignment} className="space-y-6">
          {createError === 'DATABASE_MIGRATION_REQUIRED' ? (
            <div className="p-4 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs space-y-2">
              <div className="flex items-center gap-2 font-semibold text-amber-300 text-sm">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                <span>Supabase Database Migration Required</span>
              </div>
              <p>
                The database tables for assignments (<code>assignments</code>, <code>assignment_questions</code>, <code>assignment_recipients</code>, etc.) have not been created yet in your Supabase project.
              </p>
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800 font-mono text-[11px] text-slate-300 select-all">
                supabase/assignments_and_ai_evaluation.sql
              </div>
              <p className="text-slate-400">
                Please open your <strong>Supabase Dashboard &rarr; SQL Editor</strong>, paste the contents of <strong>supabase/assignments_and_ai_evaluation.sql</strong>, and click <strong>Run</strong>. Then click &ldquo;Publish Assignment&rdquo; again.
              </p>
            </div>
          ) : createError ? (
            <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{createError}</span>
            </div>
          ) : null}

          {/* Section 1: Basic Information */}
          <Card className="bg-slate-800/40 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-blue-400" />
                Assignment Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Target Course *</label>
                  <select
                    value={newCourseId}
                    onChange={(e) => setNewCourseId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.code ? `(${c.code})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Assignment Title *</label>
                  <Input
                    type="text"
                    placeholder="e.g. Operating Systems Concurrency & Case Study"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="bg-slate-900 border-slate-700 text-white text-sm"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Instructions / Description</label>
                <textarea
                  rows={3}
                  placeholder="Provide general guidance, academic formatting guidelines, or references for the students..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-md p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-blue-400" />
                    Deadline (Date & Time) *
                  </label>
                  <Input
                    type="datetime-local"
                    value={newDeadline}
                    onChange={(e) => setNewDeadline(e.target.value)}
                    className="bg-slate-900 border-slate-700 text-white text-sm"
                    required
                  />
                  <p className="text-[11px] text-slate-400">
                    Students can save drafts and submit any time before this deadline. No attempt timer.
                  </p>
                </div>

                <div className="flex items-center space-x-2 pt-6">
                  <input
                    type="checkbox"
                    id="allowLate"
                    checked={newAllowLate}
                    onChange={(e) => setNewAllowLate(e.target.checked)}
                    className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="allowLate" className="text-xs font-medium text-slate-300 cursor-pointer">
                    Allow Late Submissions (clearly flagged as "Late Submission" in reports)
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Question Builder */}
          <Card className="bg-slate-800/40 border-slate-700">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  Questions & Evaluation Rubrics
                </CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  Add subjective analysis questions (evaluated by Groq AI) or objective check questions.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleAddQuestion('subjective')}
                  className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 text-xs"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add Subjective
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleAddQuestion('multiple_choice')}
                  className="border-blue-500/40 text-blue-300 hover:bg-blue-500/10 text-xs"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add Objective
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {newQuestions.map((q, qIdx) => (
                <div
                  key={qIdx}
                  className="bg-slate-900/60 border border-slate-700/80 rounded-lg p-4 space-y-3 relative group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-blue-600/30 text-blue-400 font-mono text-xs flex items-center justify-center font-bold">
                        {q.order_num}
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        {q.question_type === 'subjective'
                          ? 'Subjective Question (AI Evaluated)'
                          : q.question_type === 'multiple_choice'
                          ? 'Multiple Choice'
                          : 'True / False'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-xs">
                        <label className="text-slate-400">Max Marks:</label>
                        <Input
                          type="number"
                          min="1"
                          max="100"
                          value={q.max_marks}
                          onChange={(e) =>
                            handleUpdateQuestion(qIdx, 'max_marks', Math.max(1, parseInt(e.target.value) || 1))
                          }
                          className="w-16 h-7 bg-slate-800 border-slate-700 text-white text-xs font-mono"
                        />
                      </div>
                      {newQuestions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveQuestion(qIdx)}
                          className="text-slate-500 hover:text-rose-400 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Question Text */}
                  <div className="space-y-1">
                    <textarea
                      rows={2}
                      placeholder={`Enter question ${qIdx + 1} text... (e.g. Explain, analyze, compare, design)`}
                      value={q.question_text}
                      onChange={(e) => handleUpdateQuestion(qIdx, 'question_text', e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded-md p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      required
                    />
                  </div>

                  {/* Subjective Rubric */}
                  {q.question_type === 'subjective' && (
                    <div className="space-y-1 bg-slate-950/40 p-3 rounded-md border border-slate-800">
                      <label className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        Grading Rubric / Key Evaluation Criteria (Optional but Recommended)
                      </label>
                      <textarea
                        rows={2}
                        placeholder="e.g. Correct definition (20%), trade-offs explained (30%), concrete real-world example (30%), clarity of reasoning (20%)"
                        value={q.rubric}
                        onChange={(e) => handleUpdateQuestion(qIdx, 'rubric', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 text-white rounded-md p-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                      />
                      <p className="text-[10px] text-slate-500">
                        Groq AI will strictly adhere to this rubric when allocating question marks and giving constructive feedback.
                      </p>
                    </div>
                  )}

                  {/* Objective Options */}
                  {q.question_type === 'multiple_choice' && (
                    <div className="space-y-2 bg-slate-950/40 p-3 rounded-md border border-slate-800">
                      <p className="text-xs font-semibold text-slate-300">Multiple Choice Options & Correct Answer:</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.options.map((opt, optIdx) => (
                          <div key={optIdx} className="flex items-center gap-2">
                            <input
                              type="radio"
                              name={`correct_${qIdx}`}
                              checked={q.correct_answer === opt && opt.trim() !== ''}
                              onChange={() => handleUpdateQuestion(qIdx, 'correct_answer', opt)}
                              className="text-blue-600 focus:ring-blue-500"
                              title="Mark as correct answer"
                            />
                            <Input
                              type="text"
                              placeholder={`Option ${String.fromCharCode(65 + optIdx)}`}
                              value={opt}
                              onChange={(e) => handleUpdateOption(qIdx, optIdx, e.target.value)}
                              className="bg-slate-900 border-slate-700 text-white text-xs h-8"
                              required
                            />
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Select the radio button next to the option that represents the correct answer.
                      </p>
                    </div>
                  )}

                  {/* True / False Options */}
                  {q.question_type === 'true_false' && (
                    <div className="flex items-center gap-4 bg-slate-950/40 p-3 rounded-md border border-slate-800">
                      <span className="text-xs font-semibold text-slate-300">Correct Answer:</span>
                      {['True', 'False'].map((tf) => (
                        <label key={tf} className="flex items-center gap-1.5 text-xs text-white cursor-pointer">
                          <input
                            type="radio"
                            name={`tf_${qIdx}`}
                            value={tf}
                            checked={q.correct_answer === tf}
                            onChange={() => handleUpdateQuestion(qIdx, 'correct_answer', tf)}
                            className="text-blue-600 focus:ring-blue-500"
                          />
                          {tf}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Section 3: Student Selection Scoped to Course */}
          <Card className="bg-slate-800/40 border-slate-700">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-400" />
                  Select Enrolled Students ({selectedStudentUids.length} of {enrolledStudents.length} selected)
                </CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  Only students enrolled in this authorized course can be assigned.
                </CardDescription>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedStudentUids(enrolledStudents.map((s) => s.student_id))}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs"
                >
                  Select All
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedStudentUids([])}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs"
                >
                  Deselect All
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Filter students by name or Student UID..."
                  value={studentSearchTerm}
                  onChange={(e) => setStudentSearchTerm(e.target.value)}
                  className="pl-9 bg-slate-900 border-slate-700 text-white text-xs"
                />
              </div>

              <div className="max-h-48 overflow-y-auto border border-slate-800 rounded-lg p-2 bg-slate-950/40 divide-y divide-slate-800">
                {enrolledStudents
                  .filter(
                    (s) =>
                      s.full_name.toLowerCase().includes(studentSearchTerm.toLowerCase()) ||
                      String(s.student_id).includes(studentSearchTerm)
                  )
                  .map((student) => {
                    const isSelected = selectedStudentUids.includes(student.student_id)
                    return (
                      <label
                        key={student.student_id}
                        className="flex items-center justify-between p-2 hover:bg-slate-900/60 rounded cursor-pointer transition text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedStudentUids([...selectedStudentUids, student.student_id])
                              } else {
                                setSelectedStudentUids(selectedStudentUids.filter((id) => id !== student.student_id))
                              }
                            }}
                            className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="font-medium text-white">{student.full_name}</span>
                        </div>
                        <span className="font-mono text-slate-400 text-[11px]">UID: {student.student_id}</span>
                      </label>
                    )
                  })}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCurrentView('list')}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmittingCreate}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6"
            >
              {isSubmittingCreate ? 'Publishing Assignment...' : 'Publish Assignment'}
            </Button>
          </div>
        </form>
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // RENDER: ASSIGNMENT DETAIL & ANALYTICS VIEW
  // --------------------------------------------------------------------------
  if (currentView === 'detail' && selectedAssignment) {
    const isPastDeadline = new Date() > new Date(selectedAssignment.deadline)

    return (
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentView('list')}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">{selectedAssignment.title}</h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/30">
                  {selectedAssignment.course_name}
                </span>
                {isPastDeadline ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                    Deadline Passed
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-3">
                <span>Deadline: {new Date(selectedAssignment.deadline).toLocaleString()}</span>
                <span>• Total Marks: {selectedAssignment.total_marks} pts</span>
                <span>• Questions: {detailQuestions.length}</span>
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setAssignmentToDelete(selectedAssignment)}
            className="border-rose-500/40 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 text-xs flex items-center gap-1.5 shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Assignment
          </Button>
        </div>

        {/* Analytics Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="bg-slate-800/40 border-slate-700 p-4">
            <span className="text-xs text-slate-400">Assigned Students</span>
            <p className="text-2xl font-bold text-white mt-1">{detailSubmissions.length}</p>
          </Card>
          <Card className="bg-slate-800/40 border-slate-700 p-4">
            <span className="text-xs text-slate-400">Submissions Received</span>
            <p className="text-2xl font-bold text-blue-400 mt-1">
              {detailSubmissions.filter((s) => s.submission_id).length}
            </p>
          </Card>
          <Card className="bg-slate-800/40 border-slate-700 p-4">
            <span className="text-xs text-slate-400">AI Graded</span>
            <p className="text-2xl font-bold text-emerald-400 mt-1">
              {detailSubmissions.filter((s) => s.grading_status === 'graded').length}
            </p>
          </Card>
          <Card className="bg-slate-800/40 border-slate-700 p-4">
            <span className="text-xs text-slate-400">Class Average</span>
            <p className="text-2xl font-bold text-purple-400 mt-1">
              {selectedAssignment.avg_score !== undefined ? `${selectedAssignment.avg_score} pts` : '—'}
            </p>
          </Card>
        </div>

        {/* Submissions List Table */}
        <Card className="bg-slate-800/40 border-slate-700">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-white">Student Submissions & AI Reports</CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Inspect submitted student answers, review question-level AI evaluations, and override grades.
              </CardDescription>
            </div>
            <div className="w-64 relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <Input
                type="text"
                placeholder="Search student..."
                value={detailSearch}
                onChange={(e) => setDetailSearch(e.target.value)}
                className="pl-8 bg-slate-900 border-slate-700 text-white text-xs h-8"
              />
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {isLoadingDetail ? (
              <div className="p-8 text-center text-slate-400 flex flex-col items-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                <span className="text-xs">Loading submissions...</span>
              </div>
            ) : filteredDetailSubmissions.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">No matching student records found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700/80 text-slate-400 font-semibold bg-slate-900/40">
                      <th className="py-3 px-4">Student</th>
                      <th className="py-3 px-4">UID</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Submitted At</th>
                      <th className="py-3 px-4">AI Score</th>
                      <th className="py-3 px-4">Final Score</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredDetailSubmissions.map((row) => (
                      <tr key={row.recipient_id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3 px-4 font-medium text-white">{row.student_name}</td>
                        <td className="py-3 px-4 font-mono text-slate-400">{row.student_uid}</td>
                        <td className="py-3 px-4">
                          {row.status === 'graded' ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[11px] font-semibold">
                              Graded
                            </span>
                          ) : row.status === 'grading' ? (
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30 text-[11px] font-semibold animate-pulse">
                              Grading in progress...
                            </span>
                          ) : row.status === 'grading_failed' ? (
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[11px] font-semibold">
                              Grading Failed
                            </span>
                          ) : row.status === 'late' || row.is_late ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[11px] font-semibold">
                              Late Submission
                            </span>
                          ) : row.submission_id ? (
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30 text-[11px] font-semibold">
                              Submitted
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[11px]">
                              Not Submitted
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-400">
                          {row.submitted_at ? new Date(row.submitted_at).toLocaleString() : '—'}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-300">
                          {row.ai_score !== null ? `${row.ai_score} pts` : '—'}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                          {row.final_score !== null ? (
                            <span>
                              {row.final_score} / {selectedAssignment.total_marks} ({row.percentage}%)
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {row.submission_id ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenReview(row)}
                              className="border-slate-700 text-slate-200 hover:bg-slate-700 text-xs h-7"
                            >
                              Review & Report
                            </Button>
                          ) : (
                            <span className="text-[11px] text-slate-500 italic">Pending</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* SUBMISSION REVIEW & OVERRIDE MODAL */}
        {activeReviewSubmission && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <Card className="bg-slate-900 border-slate-700 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
              <CardHeader className="border-b border-slate-800 pb-4 sticky top-0 bg-slate-900 z-10">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                      <Award className="w-5 h-5 text-emerald-400" />
                      AI Evaluation Report & Answers: {activeReviewSubmission.student_name}
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-400 mt-0.5">
                      Student UID: {activeReviewSubmission.student_uid} • Submitted:{' '}
                      {activeReviewSubmission.submitted_at
                        ? new Date(activeReviewSubmission.submitted_at).toLocaleString()
                        : 'N/A'}
                      {activeReviewSubmission.is_late && (
                        <span className="ml-2 text-amber-400 font-bold">[Late Submission]</span>
                      )}
                    </CardDescription>
                  </div>
                  <button
                    onClick={() => setActiveReviewSubmission(null)}
                    className="text-slate-400 hover:text-white transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </CardHeader>

              <CardContent className="p-6 space-y-6">
                {reviewMessage && (
                  <div className="p-3 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{reviewMessage}</span>
                  </div>
                )}

                {/* Score Summary & Override Bar */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-center gap-6">
                    <div>
                      <span className="text-[11px] text-slate-400 uppercase font-semibold">Raw AI Score</span>
                      <p className="text-2xl font-mono font-bold text-blue-400">
                        {fullSubmissionData?.ai_score ?? activeReviewSubmission.ai_score ?? '—'} /{' '}
                        {selectedAssignment.total_marks}
                      </p>
                    </div>

                    <div className="h-8 w-px bg-slate-800" />

                    <div>
                      <span className="text-[11px] text-slate-400 uppercase font-semibold">Final Effective Score</span>
                      <p className="text-2xl font-mono font-bold text-emerald-400">
                        {fullSubmissionData?.final_score ?? activeReviewSubmission.final_score ?? '—'} /{' '}
                        {selectedAssignment.total_marks}
                      </p>
                    </div>
                  </div>

                  {/* Professor Override Controls */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full md:w-auto">
                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-400">Professor Adjusted Score (Optional):</label>
                      <Input
                        type="number"
                        placeholder="Override score..."
                        value={overrideScoreInput}
                        onChange={(e) => setOverrideScoreInput(e.target.value)}
                        className="bg-slate-900 border-slate-700 text-white text-xs w-36 h-8"
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={handleSaveOverride}
                      disabled={isSavingOverride}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 mt-4 sm:mt-5"
                    >
                      {isSavingOverride ? 'Saving...' : 'Save Override'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleRetryGrading}
                      disabled={isRetryingGrading}
                      className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs h-8 mt-4 sm:mt-5"
                    >
                      {isRetryingGrading ? 'Grading...' : 'Retry AI Grading'}
                    </Button>
                  </div>
                </div>

                {/* Overall AI Report Section */}
                {fullSubmissionData?.ai_overall_feedback && (
                  <Card className="bg-slate-950/40 border-slate-800 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-emerald-400">
                      <Sparkles className="w-4 h-4" />
                      Groq AI Academic Progress Report
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {fullSubmissionData.ai_overall_feedback}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      {/* Strengths */}
                      <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                        <span className="text-[11px] font-bold text-emerald-400 uppercase">Key Strengths</span>
                        <ul className="mt-1.5 space-y-1 text-xs text-slate-300 list-disc list-inside">
                          {(fullSubmissionData.ai_strengths || []).map((s: string, idx: number) => (
                            <li key={idx}>{s}</li>
                          ))}
                        </ul>
                      </div>

                      {/* Areas for Improvement */}
                      <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                        <span className="text-[11px] font-bold text-amber-400 uppercase">Areas for Improvement</span>
                        <ul className="mt-1.5 space-y-1 text-xs text-slate-300 list-disc list-inside">
                          {(fullSubmissionData.ai_weaknesses || []).map((w: string, idx: number) => (
                            <li key={idx}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Recommendations */}
                    {fullSubmissionData.ai_recommendations && fullSubmissionData.ai_recommendations.length > 0 && (
                      <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                        <span className="text-[11px] font-bold text-blue-400 uppercase">Actionable Recommendations</span>
                        <ul className="mt-1.5 space-y-1 text-xs text-slate-300 list-disc list-inside">
                          {fullSubmissionData.ai_recommendations.map((r: string, idx: number) => (
                            <li key={idx}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </Card>
                )}

                {/* Per-Question Student Answer & AI Breakdown */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Question-by-Question Evaluation
                  </h3>

                  {submissionAnswers.map((ans, idx) => {
                    const qInfo = ans.assignment_questions
                    return (
                      <div
                        key={idx}
                        className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                          <span className="font-semibold text-xs text-white">
                            Question {qInfo?.order_num || idx + 1}: {qInfo?.question_text}
                          </span>
                          <span className="font-mono text-xs font-bold text-blue-400">
                            Score: {ans.marks_awarded} / {ans.max_marks} pts
                          </span>
                        </div>

                        {/* Student Answer */}
                        <div className="space-y-1">
                          <span className="text-[11px] text-slate-400 uppercase font-semibold">Student's Answer:</span>
                          <div className="p-3 bg-slate-900 rounded-lg text-xs text-white font-mono whitespace-pre-wrap">
                            {ans.student_answer || <span className="italic text-slate-500">No answer provided</span>}
                          </div>
                        </div>

                        {/* AI Question Feedback */}
                        {ans.ai_feedback && (
                          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg space-y-2">
                            <span className="text-[11px] font-bold text-emerald-400 uppercase flex items-center gap-1">
                              <Sparkles className="w-3 h-3" />
                              AI Question Evaluation & Feedback
                            </span>
                            <p className="text-xs text-slate-300">{ans.ai_feedback}</p>

                            {ans.ai_strengths && ans.ai_strengths.length > 0 && (
                              <p className="text-[11px] text-slate-400">
                                <strong className="text-emerald-400">Strengths:</strong>{' '}
                                {ans.ai_strengths.join(' • ')}
                              </p>
                            )}

                            {ans.ai_missing_points && ans.ai_missing_points.length > 0 && (
                              <p className="text-[11px] text-slate-400">
                                <strong className="text-amber-400">Missing Elements:</strong>{' '}
                                {ans.ai_missing_points.join(' • ')}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // RENDER: MAIN ASSIGNMENTS LIST VIEW
  // --------------------------------------------------------------------------
  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileText className="w-7 h-7 text-blue-500" />
            Professor Assignments Hub
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Create, assign, and track subjective assignments evaluated with Groq AI intelligence
          </p>
        </div>

        <Button
          onClick={() => setCurrentView('create')}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-2 shadow-lg shadow-blue-600/20"
        >
          <Plus className="w-4 h-4" />
          Create Assignment
        </Button>
      </div>

      {deleteSuccessMessage && (
        <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 rounded-lg text-xs flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            {deleteSuccessMessage}
          </span>
          <button
            onClick={() => setDeleteSuccessMessage(null)}
            className="text-emerald-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-800/40 border-slate-700/60 p-4 space-y-1">
          <span className="text-xs font-semibold text-slate-400">Total Assignments</span>
          <p className="text-2xl font-bold text-white">{metrics.total}</p>
        </Card>
        <Card className="bg-slate-800/40 border-slate-700/60 p-4 space-y-1">
          <span className="text-xs font-semibold text-slate-400">Active Deadlines</span>
          <p className="text-2xl font-bold text-emerald-400">{metrics.active}</p>
        </Card>
        <Card className="bg-slate-800/40 border-slate-700/60 p-4 space-y-1">
          <span className="text-xs font-semibold text-slate-400">Submissions Received</span>
          <p className="text-2xl font-bold text-blue-400">{metrics.totalSubmissions}</p>
        </Card>
        <Card className="bg-slate-800/40 border-slate-700/60 p-4 space-y-1">
          <span className="text-xs font-semibold text-slate-400">Evaluated & Graded</span>
          <p className="text-2xl font-bold text-purple-400">{metrics.totalGraded}</p>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-800/30 p-3 rounded-xl border border-slate-700/60">
        <div className="w-full sm:w-64">
          <select
            value={selectedCourseFilter}
            onChange={(e) => setSelectedCourseFilter(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 text-white rounded-md px-3 py-1.5 text-xs focus:outline-none"
          >
            <option value="all">All Authorized Courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="w-full sm:w-44">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 text-white rounded-md px-3 py-1.5 text-xs focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="published">Published</option>
            <option value="closed">Closed / Archived</option>
          </select>
        </div>

        <div className="w-full relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2 text-slate-400" />
          <Input
            type="text"
            placeholder="Search assignments by title or course name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-slate-900 border-slate-700 text-white text-xs h-8"
          />
        </div>
      </div>

      {/* Assignments List */}
      {isLoading ? (
        <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-sm">Loading assignments...</p>
        </div>
      ) : filteredAssignments.length === 0 ? (
        <Card className="bg-slate-800/20 border-dashed border-slate-700 p-12 text-center">
          <FileText className="w-12 h-12 text-slate-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">No assignments found</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            You have not created any assignments matching the current filter. Click "+ Create Assignment" to publish your first subjective assignment.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredAssignments.map((assignment) => {
            const isPast = new Date() > new Date(assignment.deadline)
            const submissionRate =
              assignment.recipients_count && assignment.recipients_count > 0
                ? Math.round(((assignment.submissions_count || 0) / assignment.recipients_count) * 100)
                : 0

            return (
              <Card
                key={assignment.id}
                className="bg-slate-800/40 border-slate-700/80 hover:border-slate-600 transition flex flex-col justify-between shadow-md group cursor-pointer"
                onClick={() => handleOpenDetail(assignment)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/30">
                      {assignment.course_name}
                    </span>
                    {isPast ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                        Deadline Passed
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        Active
                      </span>
                    )}
                  </div>

                  <CardTitle className="text-base font-bold text-white group-hover:text-blue-400 transition mt-2">
                    {assignment.title}
                  </CardTitle>
                  {assignment.description && (
                    <CardDescription className="text-xs text-slate-400 line-clamp-2">
                      {assignment.description}
                    </CardDescription>
                  )}
                </CardHeader>

                <CardContent className="space-y-4 pt-0">
                  <div className="bg-slate-900/60 p-3 rounded-lg space-y-2 border border-slate-800 text-xs">
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-blue-400" />
                        Deadline:
                      </span>
                      <span className="text-slate-200 font-medium">
                        {new Date(assignment.deadline).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-400">
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-purple-400" />
                        Submissions:
                      </span>
                      <span className="text-slate-200 font-mono">
                        {assignment.submissions_count || 0} / {assignment.recipients_count || 0} ({submissionRate}%)
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-400">
                      <span className="flex items-center gap-1">
                        <Award className="w-3.5 h-3.5 text-emerald-400" />
                        Class Average:
                      </span>
                      <span className="font-mono font-bold text-emerald-400">
                        {assignment.avg_score !== undefined ? `${assignment.avg_score} pts` : '—'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                    <span className="text-slate-400 font-mono font-medium">
                      {assignment.total_marks} Marks
                    </span>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          setAssignmentToDelete(assignment)
                        }}
                        className="text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 h-7 w-7 p-0 rounded transition"
                        title="Delete Assignment"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                      <span className="text-blue-400 font-semibold flex items-center group-hover:translate-x-1 transition">
                        View Submissions & Report <ChevronRight className="w-4 h-4 ml-0.5" />
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* DELETE ASSIGNMENT CONFIRMATION MODAL */}
      {assignmentToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="bg-slate-900 border-slate-800 w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-400" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-base font-bold text-white">Delete Assignment?</CardTitle>
                <CardDescription className="text-xs text-slate-400 leading-relaxed">
                  Are you sure you want to delete{' '}
                  <strong className="text-white font-semibold">"{assignmentToDelete.title}"</strong>?
                </CardDescription>
              </div>
            </div>

            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-[11px] text-rose-300 space-y-1">
              <p className="font-semibold flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                This will automatically:
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-slate-300">
                <li>Remove this assignment from all assigned students' accounts.</li>
                <li>Permanently delete all student submissions, answers, and AI reports.</li>
                <li>Recalculate affected students' overall performance scores automatically.</li>
              </ul>
            </div>

            {deleteErrorMessage && (
              <div className="p-2.5 bg-rose-950/60 border border-rose-500/40 rounded text-xs text-rose-300">
                {deleteErrorMessage}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isDeletingAssignment}
                onClick={() => {
                  setAssignmentToDelete(null)
                  setDeleteErrorMessage(null)
                }}
                className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isDeletingAssignment}
                onClick={handleConfirmDelete}
                className="bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-lg shadow-rose-600/20"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isDeletingAssignment ? 'Deleting...' : 'Delete Assignment'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
