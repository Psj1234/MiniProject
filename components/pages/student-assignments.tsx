'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  FileText,
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Award,
  BookOpen,
  ArrowLeft,
  RefreshCw,
  Save,
  Send,
  HelpCircle,
  X,
  ChevronRight
} from 'lucide-react'

interface StudentAssignmentItem {
  assignment_id: string
  title: string
  description: string | null
  course_id: string
  course_name: string
  deadline: string
  allow_late: boolean
  total_marks: number
  recipient_status: 'assigned' | 'in_progress' | 'submitted' | 'late' | 'grading' | 'graded' | 'grading_failed'
  submission_id: string | null
  is_draft: boolean
  submitted_at: string | null
  is_late: boolean
  grading_status: string | null
  ai_score: number | null
  final_score: number | null
  percentage: number | null
  ai_overall_feedback: string | null
  professor_feedback: string | null
}

interface QuestionItem {
  id: string
  order_num: number
  question_text: string
  question_type: 'subjective' | 'multiple_choice' | 'true_false'
  max_marks: number
  rubric: string | null
  options: string[]
}

interface AnswerDraft {
  question_id: string
  student_answer: string
}

export default function StudentAssignments() {
  const [supabase] = useState(() => createClient())

  // Loading and profile states
  const [isLoading, setIsLoading] = useState(true)
  const [studentUid, setStudentUid] = useState<number | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  // Assignments list state
  const [assignments, setAssignments] = useState<StudentAssignmentItem[]>([])
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'all'>('active')

  // Attempt / Working View State
  const [currentView, setCurrentView] = useState<'list' | 'attempt'>('list')
  const [activeAssignment, setActiveAssignment] = useState<StudentAssignmentItem | null>(null)
  const [assignmentQuestions, setAssignmentQuestions] = useState<QuestionItem[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [attemptMessage, setAttemptMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null)

  // Feedback Modal State
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [feedbackAssignment, setFeedbackAssignment] = useState<StudentAssignmentItem | null>(null)
  const [feedbackAnswers, setFeedbackAnswers] = useState<any[]>([])
  const [feedbackSubmission, setFeedbackSubmission] = useState<any | null>(null)
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(false)
  const [isRetryingGrading, setIsRetryingGrading] = useState(false)
  const [retryMessage, setRetryMessage] = useState<string | null>(null)

  // 1. Fetch Student's Assignments
  const fetchStudentAssignments = async () => {
    try {
      setIsLoading(true)
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser()

      if (userError || !user) {
        setIsLoading(false)
        return
      }

      setUserId(user.id)

      // Fetch profile to get student_id
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, student_id')
        .eq('id', user.id)
        .single()

      if (!profile?.student_id) {
        setIsLoading(false)
        return
      }

      const uid = Number(profile.student_id)
      setStudentUid(uid)

      // Fetch assignment_recipients assigned to this student
      const { data: recipients, error: rErr } = await supabase
        .from('assignment_recipients')
        .select(`
          id,
          status,
          assignment_id,
          assignments (
            id,
            title,
            description,
            deadline,
            allow_late_submissions,
            total_marks,
            course_id,
            courses (
              id,
              name
            )
          )
        `)
        .eq('student_uid', uid)

      if (rErr) {
        console.warn('Could not load assignment recipients:', rErr.message)
        setAssignments([])
        setIsLoading(false)
        return
      }

      // Fetch submissions made by this student
      const { data: submissions } = await supabase
        .from('assignment_submissions')
        .select('*')
        .eq('student_uid', uid)

      const subMap = new Map<string, any>()
      ;(submissions || []).forEach((s) => subMap.set(s.assignment_id, s))

      const items: StudentAssignmentItem[] = (recipients || [])
        .map((r: any) => {
          const a = r.assignments
          if (!a) return null

          const sub = subMap.get(a.id)

          return {
            assignment_id: a.id,
            title: a.title,
            description: a.description,
            course_id: a.course_id,
            course_name: a.courses?.name || 'Course',
            deadline: a.deadline,
            allow_late: a.allow_late_submissions || false,
            total_marks: Number(a.total_marks || 0),
            recipient_status: r.status,
            submission_id: sub?.id || null,
            is_draft: sub ? sub.is_draft : true,
            submitted_at: sub?.submitted_at || null,
            is_late: sub?.is_late || false,
            grading_status: sub?.grading_status || null,
            ai_score: sub?.ai_score !== undefined ? Number(sub.ai_score) : null,
            final_score: sub?.final_score !== undefined ? Number(sub.final_score) : null,
            percentage: sub?.percentage !== undefined ? Number(sub.percentage) : null,
            ai_overall_feedback: sub?.ai_overall_feedback || null,
            professor_feedback: sub?.professor_feedback || null
          }
        })
        .filter(Boolean) as StudentAssignmentItem[]

      setAssignments(items)
    } catch (err: any) {
      console.error('Error fetching student assignments:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchStudentAssignments()
  }, [])

  // Filtered list based on active tab
  const filteredAssignments = useMemo(() => {
    const now = new Date()
    return assignments.filter((item) => {
      const isPastDeadline = now > new Date(item.deadline)
      const isSubmitted = item.submission_id && !item.is_draft

      if (activeTab === 'active') {
        return !isSubmitted && (!isPastDeadline || item.allow_late)
      }
      if (activeTab === 'completed') {
        return isSubmitted
      }
      return true
    })
  }, [assignments, activeTab])

  // --- OPEN ASSIGNMENT ATTEMPT VIEW ---
  const handleOpenAttempt = async (item: StudentAssignmentItem) => {
    setActiveAssignment(item)
    setCurrentView('attempt')
    setAttemptMessage(null)
    setLastSavedTime(null)

    try {
      // 1. Fetch questions
      const { data: questions } = await supabase
        .from('assignment_questions')
        .select('*')
        .eq('assignment_id', item.assignment_id)
        .order('order_num', { ascending: true })

      setAssignmentQuestions(questions || [])

      // 2. Fetch existing saved answers if any
      if (item.submission_id) {
        const { data: existingAnswers } = await supabase
          .from('assignment_answers')
          .select('question_id, student_answer')
          .eq('submission_id', item.submission_id)

        const initialAnswers: Record<string, string> = {}
        ;(existingAnswers || []).forEach((ea) => {
          initialAnswers[ea.question_id] = ea.student_answer || ''
        })
        setAnswers(initialAnswers)
      } else {
        setAnswers({})
      }
    } catch (err: any) {
      console.error('Error loading assignment attempt:', err)
    }
  }

  // --- SAVE DRAFT HANDLER ---
  const handleSaveDraft = async () => {
    if (!activeAssignment || !studentUid || !userId) return
    setIsSavingDraft(true)
    setAttemptMessage(null)

    try {
      // 1. Ensure submission record exists with is_draft = true
      let subId = activeAssignment.submission_id

      if (!subId) {
        const { data: newSub, error: subErr } = await supabase
          .from('assignment_submissions')
          .insert({
            assignment_id: activeAssignment.assignment_id,
            student_uid: studentUid,
            student_user_id: userId,
            is_draft: true,
            grading_status: 'not_submitted'
          })
          .select()
          .single()

        if (subErr) throw subErr
        subId = newSub.id
        setActiveAssignment({ ...activeAssignment, submission_id: subId })
      }

      // Update recipient status to 'in_progress'
      await supabase
        .from('assignment_recipients')
        .update({ status: 'in_progress' })
        .eq('assignment_id', activeAssignment.assignment_id)
        .eq('student_uid', studentUid)

      // 2. Upsert answers
      const answersToUpsert = assignmentQuestions.map((q) => ({
        submission_id: subId,
        question_id: q.id,
        student_answer: answers[q.id] || '',
        max_marks: Number(q.max_marks || 10),
        is_objective: q.question_type !== 'subjective'
      }))

      const { error: ansErr } = await supabase
        .from('assignment_answers')
        .upsert(answersToUpsert, { onConflict: 'submission_id,question_id' })

      if (ansErr) throw ansErr

      setLastSavedTime(new Date().toLocaleTimeString())
      setAttemptMessage({ text: 'Draft saved successfully! You can resume at any time.', type: 'success' })
    } catch (err: any) {
      console.error('Error saving draft:', err)
      setAttemptMessage({ text: `Failed to save draft: ${err.message}`, type: 'error' })
    } finally {
      setIsSavingDraft(false)
    }
  }

  // --- SUBMIT ASSIGNMENT HANDLER ---
  const handleSubmitAssignment = async () => {
    if (!activeAssignment || !studentUid || !userId) return
    setIsSubmitting(true)
    setAttemptMessage(null)

    try {
      const now = new Date()
      const deadlineDate = new Date(activeAssignment.deadline)
      const isLate = now > deadlineDate

      if (isLate && !activeAssignment.allow_late) {
        throw new Error('The deadline has passed for this assignment. Late submissions are not allowed.')
      }

      // 1. Ensure submission record exists
      let subId = activeAssignment.submission_id

      if (!subId) {
        const { data: newSub, error: subErr } = await supabase
          .from('assignment_submissions')
          .insert({
            assignment_id: activeAssignment.assignment_id,
            student_uid: studentUid,
            student_user_id: userId,
            is_draft: false,
            is_late: isLate,
            submitted_at: now.toISOString(),
            grading_status: 'submitted'
          })
          .select()
          .single()

        if (subErr) throw subErr
        subId = newSub.id
      } else {
        const { error: updErr } = await supabase
          .from('assignment_submissions')
          .update({
            is_draft: false,
            is_late: isLate,
            submitted_at: now.toISOString(),
            grading_status: 'submitted',
            updated_at: now.toISOString()
          })
          .eq('id', subId)

        if (updErr) throw updErr
      }

      // 2. Save all latest answers
      const answersToUpsert = assignmentQuestions.map((q) => ({
        submission_id: subId,
        question_id: q.id,
        student_answer: answers[q.id] || '',
        max_marks: Number(q.max_marks || 10),
        is_objective: q.question_type !== 'subjective'
      }))

      await supabase
        .from('assignment_answers')
        .upsert(answersToUpsert, { onConflict: 'submission_id,question_id' })

      // 3. Update recipient status
      await supabase
        .from('assignment_recipients')
        .update({ status: isLate ? 'late' : 'submitted' })
        .eq('assignment_id', activeAssignment.assignment_id)
        .eq('student_uid', studentUid)

      setAttemptMessage({
        text: 'Assignment submitted! Groq AI evaluation has been triggered...',
        type: 'success'
      })

      // 4. Trigger Groq AI Grading Route (Server-side API route)
      try {
        const gradeRes = await fetch('/api/assignments/grade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submissionId: subId })
        })

        const gradeData = await gradeRes.json().catch(() => null)
        if (!gradeRes.ok) {
          console.warn('[AI Grading Trigger] API returned non-OK response:', gradeData)
        } else {
          setAttemptMessage({
            text: 'Assignment submitted and evaluated by Groq AI!',
            type: 'success'
          })
        }
      } catch (gradeErr) {
        console.warn('[AI Grading Trigger] Network/Grading error:', gradeErr)
      }

      // Return to dashboard and refresh
      setTimeout(() => {
        setCurrentView('list')
        fetchStudentAssignments()
      }, 1500)
    } catch (err: any) {
      console.error('Error submitting assignment:', err)
      setAttemptMessage({ text: err.message || 'Submission failed.', type: 'error' })
    } finally {
      setIsSubmitting(false)
    }
  }

  // --- OPEN FEEDBACK & AI REPORT MODAL ---
  const handleOpenFeedback = async (item: StudentAssignmentItem) => {
    setFeedbackAssignment(item)
    setShowFeedbackModal(true)
    setIsLoadingFeedback(true)

    try {
      if (!item.submission_id) return

      // Fetch submission
      const { data: sub } = await supabase
        .from('assignment_submissions')
        .select('*')
        .eq('id', item.submission_id)
        .single()

      setFeedbackSubmission(sub)
      if (sub) {
        setFeedbackAssignment((prev) =>
          prev
            ? {
                ...prev,
                final_score: sub.final_score !== undefined && sub.final_score !== null ? Number(sub.final_score) : null,
                ai_score: sub.ai_score !== undefined && sub.ai_score !== null ? Number(sub.ai_score) : null,
                percentage: sub.percentage !== undefined && sub.percentage !== null ? Number(sub.percentage) : null,
                grading_status: sub.grading_status,
                ai_overall_feedback: sub.ai_overall_feedback,
                professor_feedback: sub.professor_feedback
              }
            : null
        )
      }

      // Fetch answers with question details
      const { data: ans } = await supabase
        .from('assignment_answers')
        .select(`
          *,
          assignment_questions (
            order_num,
            question_text,
            question_type,
            max_marks
          )
        `)
        .eq('submission_id', item.submission_id)

      setFeedbackAnswers(ans || [])
    } catch (err: any) {
      console.error('Error loading feedback:', err)
    } finally {
      setIsLoadingFeedback(false)
    }
  }

  // --- RETRY AI EVALUATION FOR FAILED SUBMISSION ---
  const handleRetryStudentGrading = async () => {
    if (!feedbackAssignment?.submission_id) return
    setIsRetryingGrading(true)
    setRetryMessage(null)

    try {
      const res = await fetch('/api/assignments/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: feedbackAssignment.submission_id })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'AI grading failed.')

      setRetryMessage('AI evaluation succeeded!')
      // Refresh current feedback view and assignment list
      await handleOpenFeedback(feedbackAssignment)
      fetchStudentAssignments()
    } catch (err: any) {
      console.error('Error retrying AI evaluation:', err)
      setRetryMessage(`Evaluation retry failed: ${err.message}`)
    } finally {
      setIsRetryingGrading(false)
    }
  }

  // --------------------------------------------------------------------------
  // RENDER: ATTEMPT / WORKING INTERFACE (DEADLINE-BASED, NO TIMER)
  // --------------------------------------------------------------------------
  if (currentView === 'attempt' && activeAssignment) {
    const isPastDeadline = new Date() > new Date(activeAssignment.deadline)

    return (
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Top Navigation */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCurrentView('list')
              fetchStudentAssignments()
            }}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Assignments
          </Button>

          {lastSavedTime && (
            <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Draft saved at {lastSavedTime}
            </span>
          )}
        </div>

        {/* Assignment Header Banner */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/30">
                {activeAssignment.course_name}
              </span>
              <div className="flex items-center gap-1.5 text-xs text-amber-300 font-medium bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/30">
                <Calendar className="w-3.5 h-3.5" />
                Deadline: {new Date(activeAssignment.deadline).toLocaleString()}
              </div>
            </div>

            <h1 className="text-xl font-bold text-white">{activeAssignment.title}</h1>
            {activeAssignment.description && (
              <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                {activeAssignment.description}
              </p>
            )}

            <div className="p-2.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px] flex items-center gap-2">
              <HelpCircle className="w-4 h-4 shrink-0" />
              <span>
                <strong>Deadline-Based Assignment:</strong> Take your time to write thorough, analytical answers. You can click <strong>Save Draft</strong> anytime and come back later before the deadline.
              </span>
            </div>
          </CardContent>
        </Card>

        {attemptMessage && (
          <div
            className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
              attemptMessage.type === 'success'
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
            }`}
          >
            {attemptMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{attemptMessage.text}</span>
          </div>
        )}

        {/* Questions List */}
        <div className="space-y-6">
          {assignmentQuestions.map((q, idx) => {
            const currentAnswer = answers[q.id] || ''
            const wordCount = currentAnswer.trim() ? currentAnswer.trim().split(/\s+/).length : 0

            return (
              <Card key={q.id} className="bg-slate-800/40 border-slate-700/80">
                <CardHeader className="pb-3 border-b border-slate-800/80">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <span className="w-6 h-6 rounded-full bg-blue-600/30 text-blue-400 font-mono text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">
                        {q.order_num || idx + 1}
                      </span>
                      <div>
                        <CardTitle className="text-sm font-semibold text-white leading-snug">
                          {q.question_text}
                        </CardTitle>
                        {q.rubric && (
                          <p className="text-[11px] text-emerald-400 mt-1 font-mono">
                            Rubric criteria: {q.rubric}
                          </p>
                        )}
                      </div>
                    </div>

                    <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-900 text-blue-400 border border-slate-800 shrink-0">
                      {q.max_marks} pts
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="p-5">
                  {q.question_type === 'subjective' ? (
                    <div className="space-y-2">
                      <textarea
                        rows={6}
                        placeholder="Write your detailed explanation, analysis, or solution here..."
                        value={currentAnswer}
                        onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                        className="w-full bg-slate-900/90 border border-slate-700 text-white rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed font-sans"
                      />
                      <div className="flex justify-between text-[11px] text-slate-500">
                        <span>Markdown supported</span>
                        <span>{wordCount} words</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(q.options || []).map((opt, optIdx) => (
                        <label
                          key={optIdx}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition text-xs ${
                            currentAnswer === opt
                              ? 'bg-blue-600/20 border-blue-500/50 text-white'
                              : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800/60'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`q_${q.id}`}
                            value={opt}
                            checked={currentAnswer === opt}
                            onChange={() => setAnswers({ ...answers, [q.id]: opt })}
                            className="text-blue-600 focus:ring-blue-500"
                          />
                          <span className="font-medium">{opt}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Bottom Submission Action Bar */}
        <div className="sticky bottom-4 bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-xl p-4 flex items-center justify-between shadow-2xl z-20">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveDraft}
              disabled={isSavingDraft || isSubmitting}
              className="border-slate-700 text-slate-200 hover:bg-slate-800 text-xs flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              {isSavingDraft ? 'Saving Draft...' : 'Save Draft'}
            </Button>
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              Your answers will remain safely saved in Supabase.
            </span>
          </div>

          <Button
            type="button"
            onClick={handleSubmitAssignment}
            disabled={isSubmitting || (isPastDeadline && !activeAssignment.allow_late)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-1.5 px-6 shadow-lg shadow-blue-600/20"
          >
            <Send className="w-3.5 h-3.5" />
            {isSubmitting ? 'Submitting & Evaluating...' : 'Submit Assignment'}
          </Button>
        </div>
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // RENDER: MAIN ASSIGNMENTS DASHBOARD
  // --------------------------------------------------------------------------
  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileText className="w-7 h-7 text-blue-500" />
            My Subjective Assignments
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Work on assignments before deadlines, save drafts, and view detailed Groq AI evaluation feedback
          </p>
        </div>
      </div>

      {/* Tabs Filter */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('active')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
            activeTab === 'active'
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Active / Due Soon
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
            activeTab === 'completed'
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Submitted & Graded
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
            activeTab === 'all'
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          All Assignments
        </button>
      </div>

      {/* Assignments List */}
      {isLoading ? (
        <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-sm">Loading your assignments...</p>
        </div>
      ) : filteredAssignments.length === 0 ? (
        <Card className="bg-slate-800/20 border-dashed border-slate-700 p-12 text-center">
          <FileText className="w-12 h-12 text-slate-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">No assignments found</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            {activeTab === 'active'
              ? 'You have no active pending assignments at this time. Check back later!'
              : 'No assignments match the selected filter.'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredAssignments.map((item) => {
            const isPast = new Date() > new Date(item.deadline)
            const isSubmitted = item.submission_id && !item.is_draft

            return (
              <Card
                key={item.assignment_id}
                className="bg-slate-800/40 border-slate-700/80 hover:border-slate-600 transition flex flex-col justify-between shadow-md"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/30">
                      {item.course_name}
                    </span>

                    {item.grading_status === 'graded' ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold">
                        Graded
                      </span>
                    ) : item.grading_status === 'grading' ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30 font-semibold animate-pulse">
                        AI Grading...
                      </span>
                    ) : isSubmitted ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/30 font-semibold">
                        Submitted
                      </span>
                    ) : isPast ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 font-semibold">
                        Deadline Passed
                      </span>
                    ) : item.submission_id && item.is_draft ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 font-semibold">
                        Draft Saved
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold">
                        Assigned
                      </span>
                    )}
                  </div>

                  <CardTitle className="text-base font-bold text-white mt-2">
                    {item.title}
                  </CardTitle>
                  {item.description && (
                    <CardDescription className="text-xs text-slate-400 line-clamp-2">
                      {item.description}
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
                      <span className={`font-medium ${isPast ? 'text-rose-400' : 'text-slate-200'}`}>
                        {new Date(item.deadline).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-400">
                      <span className="flex items-center gap-1">
                        <Award className="w-3.5 h-3.5 text-emerald-400" />
                        Total Marks:
                      </span>
                      <span className="font-mono text-slate-200">{item.total_marks} pts</span>
                    </div>

                    {item.grading_status === 'graded' && item.final_score !== null && (
                      <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                        <span className="font-semibold text-emerald-400">Score & Grade:</span>
                        <span className="font-mono font-bold text-emerald-400 text-sm">
                          {item.final_score} / {item.total_marks} ({item.percentage}%)
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex justify-end">
                    {isSubmitted ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenFeedback(item)}
                        className="w-full border-slate-700 text-slate-200 hover:bg-slate-800 text-xs flex items-center justify-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                        View AI Feedback & Report
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleOpenAttempt(item)}
                        disabled={isPast && !item.allow_late}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1"
                      >
                        {item.submission_id && item.is_draft ? 'Continue Draft' : 'Open Assignment'}
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* STUDENT FEEDBACK & AI EVALUATION MODAL */}
      {showFeedbackModal && feedbackAssignment && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <Card className="bg-slate-900 border-slate-700 w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <CardHeader className="border-b border-slate-800 pb-4 sticky top-0 bg-slate-900 z-10">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                    <Award className="w-5 h-5 text-emerald-400" />
                    AI Evaluation & Feedback: {feedbackAssignment.title}
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-400 mt-0.5">
                    Course: {feedbackAssignment.course_name} • Submitted:{' '}
                    {feedbackAssignment.submitted_at
                      ? new Date(feedbackAssignment.submitted_at).toLocaleString()
                      : 'N/A'}
                  </CardDescription>
                </div>
                <button
                  onClick={() => setShowFeedbackModal(false)}
                  className="text-slate-400 hover:text-white transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </CardHeader>

            <CardContent className="p-6 space-y-6">
              {isLoadingFeedback ? (
                <div className="p-8 text-center text-slate-400 flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                  <span className="text-xs">Loading feedback details...</span>
                </div>
              ) : (
                <>
                  {/* Hero Score Badge */}
                  {(() => {
                    const currentScore =
                      feedbackSubmission?.final_score !== undefined && feedbackSubmission?.final_score !== null
                        ? feedbackSubmission.final_score
                        : feedbackAssignment.final_score
                    const currentPct =
                      feedbackSubmission?.percentage !== undefined && feedbackSubmission?.percentage !== null
                        ? Number(feedbackSubmission.percentage)
                        : (feedbackAssignment.percentage ?? 0)

                    return (
                      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 flex items-center justify-between">
                        <div>
                          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            Final Evaluated Score
                          </span>
                          <p className="text-3xl font-mono font-bold text-emerald-400 mt-0.5">
                            {currentScore !== null ? currentScore : '—'} / {feedbackAssignment.total_marks}
                          </p>
                          <span className="text-xs text-slate-400">
                            Achievement Percentage: <strong>{currentPct}%</strong>
                          </span>
                        </div>

                        <div className="text-right">
                          {feedbackAssignment.is_late && (
                            <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-bold block mb-2">
                              Late Submission
                            </span>
                          )}
                          <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 font-bold">
                            {currentPct >= 85
                              ? 'Distinction'
                              : currentPct >= 70
                              ? 'Proficient'
                              : 'Satisfactory'}
                          </span>
                        </div>
                      </div>
                    )
                  })()}

                  {/* AI Academic Progress Report */}
                  {feedbackSubmission?.ai_overall_feedback && (
                    <Card className="bg-slate-950/40 border-slate-800 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-bold text-emerald-400">
                          <Sparkles className="w-4 h-4" />
                          Groq AI Academic Progress Report
                        </div>

                        {(feedbackSubmission.grading_status === 'grading_failed' ||
                          feedbackSubmission.ai_overall_feedback.includes('Grading error')) && (
                          <Button
                            size="sm"
                            disabled={isRetryingGrading}
                            onClick={handleRetryStudentGrading}
                            className="bg-amber-600 hover:bg-amber-700 text-white text-xs h-7 px-2.5 flex items-center gap-1.5 shadow"
                          >
                            <RefreshCw className={`w-3 h-3 ${isRetryingGrading ? 'animate-spin' : ''}`} />
                            {isRetryingGrading ? 'Retrying...' : 'Retry AI Evaluation'}
                          </Button>
                        )}
                      </div>

                      {retryMessage && (
                        <div className={`p-2 rounded text-xs ${retryMessage.includes('succeeded') ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'}`}>
                          {retryMessage}
                        </div>
                      )}

                      <p className="text-xs text-slate-300 leading-relaxed">
                        {feedbackSubmission.ai_overall_feedback}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                        {/* Strengths */}
                        <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                          <span className="text-[11px] font-bold text-emerald-400 uppercase">Key Strengths</span>
                          <ul className="mt-1.5 space-y-1 text-xs text-slate-300 list-disc list-inside">
                            {(feedbackSubmission.ai_strengths || []).map((s: string, idx: number) => (
                              <li key={idx}>{s}</li>
                            ))}
                          </ul>
                        </div>

                        {/* Areas for Improvement */}
                        <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                          <span className="text-[11px] font-bold text-amber-400 uppercase">Areas for Improvement</span>
                          <ul className="mt-1.5 space-y-1 text-xs text-slate-300 list-disc list-inside">
                            {(feedbackSubmission.ai_weaknesses || []).map((w: string, idx: number) => (
                              <li key={idx}>{w}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {/* Recommendations */}
                      {feedbackSubmission.ai_recommendations && feedbackSubmission.ai_recommendations.length > 0 && (
                        <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                          <span className="text-[11px] font-bold text-blue-400 uppercase">Recommended Study Topics</span>
                          <ul className="mt-1.5 space-y-1 text-xs text-slate-300 list-disc list-inside">
                            {feedbackSubmission.ai_recommendations.map((r: string, idx: number) => (
                              <li key={idx}>{r}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </Card>
                  )}

                  {/* Question Breakdown */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      Question Feedback Breakdown
                    </h3>

                    {feedbackAnswers.map((ans, idx) => {
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
                            <span className="font-mono text-xs font-bold text-emerald-400">
                              {ans.marks_awarded} / {ans.max_marks} pts
                            </span>
                          </div>

                          <div className="space-y-1">
                            <span className="text-[11px] text-slate-400 uppercase font-semibold">Your Submitted Answer:</span>
                            <div className="p-3 bg-slate-900 rounded-lg text-xs text-white font-mono whitespace-pre-wrap">
                              {ans.student_answer || <span className="italic text-slate-500">No answer provided</span>}
                            </div>
                          </div>

                          {ans.ai_feedback && (
                            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg space-y-1">
                              <span className="text-[11px] font-bold text-emerald-400 uppercase flex items-center gap-1">
                                <Sparkles className="w-3 h-3" />
                                AI Evaluation
                              </span>
                              <p className="text-xs text-slate-300">{ans.ai_feedback}</p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
