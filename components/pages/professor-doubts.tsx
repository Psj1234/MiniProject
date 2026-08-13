'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, ArrowRight, FileText, Loader2, Paperclip, Reply } from 'lucide-react'

type DoubtStatus = 'pending' | 'answered' | 'closed'

interface TeacherCourse {
  id: string
  name: string
  code: string
}

interface StudentNameMap {
  [userId: string]: {
    full_name: string
    student_id: number
  }
}

interface DoubtSummary {
  id: string
  student_user_id: string
  student_id: number
  course_id: string
  title: string
  question: string
  status: DoubtStatus
  created_at: string
  updated_at: string
  answered_at: string | null
  closed_at: string | null
  reopened_at: string | null
  attachment_name: string | null
  attachment_type: string | null
}

interface DoubtAnswer {
  id: string
  teacher_id: string
  answer: string
  attachment_name: string | null
  attachment_type: string | null
  attachment_data: string | null
  created_at: string
}

interface DoubtDetail extends DoubtSummary {
  attachment_data: string | null
  answers: DoubtAnswer[]
}

const supabase = createClient()

const statusClasses: Record<DoubtStatus, string> = {
  pending: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  answered: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  closed: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
}

const statusLabels: Record<DoubtStatus, string> = {
  pending: 'Pending',
  answered: 'Answered',
  closed: 'Closed',
}

const formatDateTime = (value: string | null) => {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const fileToDataUrl = (file: File) =>
  new Promise<{ name: string; type: string; dataUrl: string }>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      resolve({
        name: file.name,
        type: file.type || 'application/octet-stream',
        dataUrl: reader.result as string,
      })
    reader.onerror = () => reject(new Error('Failed to read attachment'))
    reader.readAsDataURL(file)
  })

const renderAttachmentPreview = (attachmentData: string | null, attachmentType: string | null, attachmentName: string | null) => {
  if (!attachmentData) {
    return attachmentName ? <p className="text-xs text-slate-400">{attachmentName}</p> : null
  }

  if (attachmentType?.startsWith('image/')) {
    return <img src={attachmentData} alt={attachmentName || 'Attachment'} className="max-h-72 rounded-lg border border-slate-600 object-contain bg-slate-900/50" />
  }

  if (attachmentType === 'application/pdf') {
    return <iframe src={attachmentData} title={attachmentName || 'Attachment'} className="h-72 w-full rounded-lg border border-slate-600 bg-slate-900/50" />
  }

  return (
    <a href={attachmentData} download={attachmentName || 'attachment'} className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700">
      <Paperclip size={16} />
      Download {attachmentName || 'attachment'}
    </a>
  )
}

export default function ProfessorDoubts() {
  const [loading, setLoading] = useState(true)
  const [listLoading, setListLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [courses, setCourses] = useState<TeacherCourse[]>([])
  const [studentNames, setStudentNames] = useState<StudentNameMap>({})
  const [doubts, setDoubts] = useState<DoubtSummary[]>([])
  const [selectedDoubt, setSelectedDoubt] = useState<DoubtDetail | null>(null)
  const [answerText, setAnswerText] = useState('')
  const [answerAttachment, setAnswerAttachment] = useState<File | null>(null)

  useEffect(() => {
    fetchTeacherDoubts()
  }, [])

  const courseMap = useMemo(
    () =>
      courses.reduce<Record<string, TeacherCourse>>((accumulator, course) => {
        accumulator[course.id] = course
        return accumulator
      }, {}),
    [courses]
  )

  const fetchTeacherDoubts = async () => {
    try {
      setLoading(true)
      setError(null)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Not authenticated')
        return
      }

      const { data: teacherCourses, error: coursesError } = await supabase
        .from('course_teachers')
        .select('course_id, courses(id, name, code)')
        .eq('teacher_id', user.id)

      if (coursesError) throw coursesError

      const processedCourses = (teacherCourses || [])
        .map((item: any) => {
          const course = item.courses
          if (!course) return null
          return {
            id: course.id,
            name: course.name || 'Unknown Course',
            code: course.code || '',
          } as TeacherCourse
        })
        .filter(Boolean) as TeacherCourse[]

      setCourses(processedCourses)

      const courseIds = processedCourses.map((course) => course.id)
      if (courseIds.length === 0) {
        setDoubts([])
        setLoading(false)
        return
      }

      const { data: doubtsData, error: doubtsError } = await supabase
        .from('doubts')
        .select(`
          id,
          student_user_id,
          student_id,
          course_id,
          title,
          question,
          status,
          created_at,
          updated_at,
          answered_at,
          closed_at,
          reopened_at,
          attachment_name,
          attachment_type
        `)
        .eq('teacher_id', user.id)
        .in('course_id', courseIds)
        .order('created_at', { ascending: false })

      if (doubtsError) throw doubtsError

      const studentUserIds = [...new Set((doubtsData || []).map((doubt: any) => doubt.student_user_id))]
      if (studentUserIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name, student_id')
          .in('id', studentUserIds)

        if (profilesError) throw profilesError

        const map = (profiles || []).reduce<StudentNameMap>((accumulator, profile: any) => {
          accumulator[profile.id] = {
            full_name: profile.full_name || 'Unknown Student',
            student_id: profile.student_id,
          }
          return accumulator
        }, {})

        setStudentNames(map)
      }

      setDoubts((doubtsData || []) as DoubtSummary[])

      if (doubtsData?.length) {
        await loadDoubtDetail(doubtsData[0].id)
      }
    } catch (err: any) {
      console.error('Failed to load teacher doubts:', err)
      setError(err.message || 'Failed to load student doubts')
    } finally {
      setLoading(false)
    }
  }

  const loadDoubtDetail = async (doubtId: string) => {
    try {
      setDetailLoading(true)
      setError(null)

      const { data, error: detailError } = await supabase
        .from('doubts')
        .select(`
          id,
          student_user_id,
          student_id,
          course_id,
          title,
          question,
          status,
          created_at,
          updated_at,
          answered_at,
          closed_at,
          reopened_at,
          attachment_name,
          attachment_type,
          attachment_data,
          doubt_answers (
            id,
            teacher_id,
            answer,
            attachment_name,
            attachment_type,
            attachment_data,
            created_at
          )
        `)
        .eq('id', doubtId)
        .single()

      if (detailError) throw detailError

      const detailRow = data as any
      const answers = ((detailRow?.doubt_answers || []) as DoubtAnswer[]).sort(
        (left: DoubtAnswer, right: DoubtAnswer) =>
          new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
      )

      const { doubt_answers, ...doubtFields } = detailRow

      setSelectedDoubt({
        ...doubtFields,
        answers,
      })
    } catch (err: any) {
      console.error('Failed to load doubt details:', err)
      setError(err.message || 'Failed to load doubt details')
    } finally {
      setDetailLoading(false)
    }
  }

  const refreshAfterAction = async (doubtId: string) => {
    await fetchTeacherDoubts()
    await loadDoubtDetail(doubtId)
  }

  const handleAnswer = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!selectedDoubt) return
    if (!answerText.trim()) {
      setError('Please enter an answer')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const attachmentPayload = answerAttachment ? await fileToDataUrl(answerAttachment) : null

      const { error: insertError } = await supabase
        .from('doubt_answers')
        .insert({
          doubt_id: selectedDoubt.id,
          teacher_id: user.id,
          answer: answerText.trim(),
          attachment_name: attachmentPayload?.name || null,
          attachment_type: attachmentPayload?.type || null,
          attachment_data: attachmentPayload?.dataUrl || null,
          created_at: new Date().toISOString(),
        })

      if (insertError) throw insertError

      const { error: updateError } = await supabase
        .from('doubts')
        .update({
          status: 'answered',
          answered_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedDoubt.id)
        .eq('teacher_id', user.id)

      if (updateError) throw updateError

      setAnswerText('')
      setAnswerAttachment(null)
      await refreshAfterAction(selectedDoubt.id)
    } catch (err: any) {
      console.error('Failed to save answer:', err)
      setError(err.message || 'Failed to save answer')
    } finally {
      setSaving(false)
    }
  }

  const updateStatus = async (status: DoubtStatus) => {
    if (!selectedDoubt) return

    setSaving(true)
    setError(null)

    try {
      const payload: Record<string, string> = {
        status,
        updated_at: new Date().toISOString(),
      }

      if (status === 'answered') payload.answered_at = new Date().toISOString()
      if (status === 'closed') payload.closed_at = new Date().toISOString()
      if (status === 'pending') payload.reopened_at = new Date().toISOString()

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { error: updateError } = await supabase
        .from('doubts')
        .update(payload)
        .eq('id', selectedDoubt.id)
        .eq('teacher_id', user.id)

      if (updateError) throw updateError

      await refreshAfterAction(selectedDoubt.id)
    } catch (err: any) {
      console.error('Failed to update doubt status:', err)
      setError(err.message || 'Failed to update doubt status')
    } finally {
      setSaving(false)
    }
  }

  const handleAttachmentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null
    if (file && file.size > 10 * 1024 * 1024) {
      setError('Attachment must be smaller than 10MB')
      event.target.value = ''
      return
    }

    setError(null)
    setAnswerAttachment(file)
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Student Doubts</h1>
        <p className="text-slate-400">Review only the doubts assigned to your courses and respond to students here.</p>
      </div>

      {error && (
        <Card className="bg-red-500/10 border-red-500/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-red-300">
              <AlertCircle size={18} />
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_1.05fr]">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Assigned Doubts</CardTitle>
            <CardDescription className="text-slate-400">These are filtered to your own courses only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {listLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
              </div>
            ) : doubts.length === 0 ? (
              <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-6 text-center text-slate-400">
                No doubts have been assigned to you yet.
              </div>
            ) : (
              doubts.map((doubt) => {
                const course = courseMap[doubt.course_id]
                const student = studentNames[doubt.student_user_id]

                return (
                  <button
                    key={doubt.id}
                    onClick={() => loadDoubtDetail(doubt.id)}
                    className={`w-full rounded-lg border p-4 text-left transition ${
                      selectedDoubt?.id === doubt.id ? 'border-blue-500 bg-blue-500/10' : 'border-slate-700 bg-slate-900/30 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-white">{doubt.title}</h3>
                          <Badge variant="outline" className={statusClasses[doubt.status]}>
                            {statusLabels[doubt.status]}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-400 line-clamp-2">{doubt.question}</p>
                        <p className="text-xs text-slate-500">
                          {student?.full_name || 'Unknown Student'} • {student?.student_id || doubt.student_id} • {course?.name || 'Unknown Course'}
                        </p>
                      </div>
                      <ArrowRight size={16} className="mt-1 text-slate-500" />
                    </div>
                  </button>
                )
              })
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Doubt Detail & Response</CardTitle>
            <CardDescription className="text-slate-400">Answer, attach files, and update the current status.</CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedDoubt ? (
              <div className="flex min-h-[520px] items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-900/30 p-8 text-center text-slate-400">
                Select a doubt to review the student question and respond.
              </div>
            ) : detailLoading ? (
              <div className="flex min-h-[520px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-semibold text-white">{selectedDoubt.title}</h3>
                      <p className="text-sm text-slate-400">{courseMap[selectedDoubt.course_id]?.name || 'Course'}</p>
                    </div>
                    <Badge variant="outline" className={statusClasses[selectedDoubt.status]}>
                      {statusLabels[selectedDoubt.status]}
                    </Badge>
                  </div>

                  <div className="grid gap-3 rounded-lg border border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-300">
                    <div>
                      <span className="text-slate-500">Student:</span> {studentNames[selectedDoubt.student_user_id]?.full_name || 'Unknown Student'}
                    </div>
                    <div>
                      <span className="text-slate-500">Student ID:</span> {studentNames[selectedDoubt.student_user_id]?.student_id || selectedDoubt.student_id}
                    </div>
                    <div>
                      <span className="text-slate-500">Created:</span> {formatDateTime(selectedDoubt.created_at)}
                    </div>
                    <div>
                      <span className="text-slate-500">Updated:</span> {formatDateTime(selectedDoubt.updated_at)}
                    </div>
                    <div>
                      <span className="text-slate-500">Answered:</span> {formatDateTime(selectedDoubt.answered_at)}
                    </div>
                    <div>
                      <span className="text-slate-500">Closed:</span> {formatDateTime(selectedDoubt.closed_at)}
                    </div>
                    <div>
                      <span className="text-slate-500">Reopened:</span> {formatDateTime(selectedDoubt.reopened_at)}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-900/40 p-4">
                  <div className="flex items-center gap-2 text-slate-300">
                    <FileText size={16} />
                    <span className="font-medium">Student Question</span>
                  </div>
                  <p className="whitespace-pre-line text-slate-200">{selectedDoubt.question}</p>
                  {selectedDoubt.attachment_name && (
                    <div className="space-y-2 pt-2">
                      <p className="text-sm font-medium text-slate-300">Student Attachment</p>
                      {renderAttachmentPreview(selectedDoubt.attachment_data, selectedDoubt.attachment_type, selectedDoubt.attachment_name)}
                    </div>
                  )}
                </div>

                <form onSubmit={handleAnswer} className="space-y-4 rounded-lg border border-slate-700 bg-slate-900/40 p-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-200">Write Answer</label>
                    <Textarea
                      value={answerText}
                      onChange={(event) => setAnswerText(event.target.value)}
                      rows={6}
                      className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                      placeholder="Type your explanation or solution here"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-200">Optional Attachment</label>
                    <input
                      type="file"
                      accept="image/*,.pdf,.doc,.docx,.txt"
                      onChange={handleAttachmentChange}
                      className="block w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white file:mr-4 file:rounded-md file:border-0 file:bg-slate-600 file:px-3 file:py-2 file:text-white"
                    />
                    {answerAttachment && <p className="text-xs text-slate-400">Selected: {answerAttachment.name}</p>}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Reply size={16} className="mr-2" />}
                      Save Answer
                    </Button>
                    <Button type="button" variant="outline" disabled={saving} onClick={() => updateStatus('pending')} className="border-slate-600 text-slate-200 hover:bg-slate-700">
                      Reopen
                    </Button>
                    <Button type="button" variant="outline" disabled={saving} onClick={() => updateStatus('answered')} className="border-slate-600 text-slate-200 hover:bg-slate-700">
                      Mark Answered
                    </Button>
                    <Button type="button" variant="outline" disabled={saving} onClick={() => updateStatus('closed')} className="border-slate-600 text-slate-200 hover:bg-slate-700">
                      Close
                    </Button>
                  </div>
                </form>

                <div className="space-y-3">
                  <h4 className="text-lg font-semibold text-white">Answer History</h4>
                  {selectedDoubt.answers.length === 0 ? (
                    <div className="rounded-lg border border-slate-700 bg-slate-900/30 p-4 text-slate-400">
                      No answers have been posted yet.
                    </div>
                  ) : (
                    selectedDoubt.answers.map((answer) => (
                      <div key={answer.id} className="space-y-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                        <div className="flex items-center justify-between gap-4 text-sm text-slate-400">
                          <span>Your response</span>
                          <span>{formatDateTime(answer.created_at)}</span>
                        </div>
                        <p className="whitespace-pre-line text-slate-200">{answer.answer}</p>
                        {answer.attachment_name && (
                          <div className="space-y-2 pt-1">
                            <p className="text-sm font-medium text-slate-300">Attachment</p>
                            {renderAttachmentPreview(answer.attachment_data, answer.attachment_type, answer.attachment_name)}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}