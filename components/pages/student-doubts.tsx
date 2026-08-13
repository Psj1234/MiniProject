'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, ArrowRight, FileText, Loader2, Paperclip, Send } from 'lucide-react'

type DoubtStatus = 'pending' | 'answered' | 'closed'

interface CourseOption {
  id: string
  name: string
  code: string
  teacher_id: string
  teacher_name: string
}

interface DoubtSummary {
  id: string
  course_id: string
  title: string
  question: string
  status: DoubtStatus
  teacher_id: string
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

interface StudentProfile {
  student_id: number
  full_name: string
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

export default function StudentDoubts() {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<StudentProfile | null>(null)
  const [courses, setCourses] = useState<CourseOption[]>([])
  const [doubts, setDoubts] = useState<DoubtSummary[]>([])
  const [selectedDoubt, setSelectedDoubt] = useState<DoubtDetail | null>(null)
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [title, setTitle] = useState('')
  const [question, setQuestion] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)

  useEffect(() => {
    fetchInitialData()
  }, [])

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) || null,
    [courses, selectedCourseId]
  )

  const selectedDoubtCourse = useMemo(
    () => courses.find((course) => course.id === selectedDoubt?.course_id) || null,
    [courses, selectedDoubt?.course_id]
  )

  const fetchInitialData = async () => {
    try {
      setLoading(true)
      setError(null)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Not authenticated')
        return
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('student_id, full_name')
        .eq('id', user.id)
        .single()

      if (profileError) throw profileError
      if (!profileData?.student_id) throw new Error('Student profile not found')

      setProfile(profileData)

      const { data: enrollments, error: enrollmentsError } = await supabase
        .from('enrollments')
        .select(`
          course_id,
          courses (
            id,
            name,
            code,
            course_teachers (
              teacher_id,
              profiles (
                full_name
              )
            )
          )
        `)
        .eq('student_id', profileData.student_id)

      if (enrollmentsError) throw enrollmentsError

      const processedCourses = (enrollments || [])
        .map((enrollment: any) => {
          const course = enrollment.courses
          const teacher = course?.course_teachers?.[0]

          if (!course || !teacher?.teacher_id) return null

          return {
            id: course.id,
            name: course.name || 'Unknown Course',
            code: course.code || '',
            teacher_id: teacher.teacher_id,
            teacher_name: teacher.profiles?.full_name || 'Assigned Teacher',
          } as CourseOption
        })
        .filter(Boolean) as CourseOption[]

      setCourses(processedCourses)
      setSelectedCourseId((current) => current || processedCourses[0]?.id || '')

      await fetchMyDoubts(user.id)
    } catch (err: any) {
      console.error('Failed to load doubts:', err)
      setError(err.message || 'Failed to load doubts')
    } finally {
      setLoading(false)
    }
  }

  const fetchMyDoubts = async (userId: string) => {
    const { data, error: doubtsError } = await supabase
      .from('doubts')
      .select(`
        id,
        course_id,
        title,
        question,
        status,
        teacher_id,
        created_at,
        updated_at,
        answered_at,
        closed_at,
        reopened_at,
        attachment_name,
        attachment_type
      `)
      .eq('student_user_id', userId)
      .order('created_at', { ascending: false })

    if (doubtsError) throw doubtsError
    setDoubts((data || []) as DoubtSummary[])
  }

  const loadDoubtDetail = async (doubtId: string) => {
    try {
      setDetailLoading(true)
      setError(null)

      const { data, error: detailError } = await supabase
        .from('doubts')
        .select(`
          id,
          course_id,
          title,
          question,
          status,
          teacher_id,
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

  const handleCreateDoubt = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!profile) {
      setError('Student profile not found')
      return
    }

    if (!selectedCourse) {
      setError('Please select a course')
      return
    }

    if (!title.trim() || !question.trim()) {
      setError('Please enter a title and question')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const attachmentPayload = attachment ? await fileToDataUrl(attachment) : null
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error: insertError } = await supabase
        .from('doubts')
        .insert({
          student_user_id: user.id,
          student_id: profile.student_id,
          teacher_id: selectedCourse.teacher_id,
          course_id: selectedCourse.id,
          title: title.trim(),
          question: question.trim(),
          status: 'pending',
          attachment_name: attachmentPayload?.name || null,
          attachment_type: attachmentPayload?.type || null,
          attachment_data: attachmentPayload?.dataUrl || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (insertError) throw insertError

      setTitle('')
      setQuestion('')
      setAttachment(null)
      await fetchMyDoubts(user.id)

      if (data?.id) {
        await loadDoubtDetail(data.id)
      }
    } catch (err: any) {
      console.error('Failed to submit doubt:', err)
      setError(err.message || 'Failed to submit doubt')
    } finally {
      setSubmitting(false)
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
    setAttachment(file)
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
        <h1 className="text-3xl font-bold text-white mb-2">Doubt Resolution</h1>
        <p className="text-slate-400">Ask your teacher a question and track every response in one place.</p>
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

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Ask a Doubt</CardTitle>
              <CardDescription className="text-slate-400">Select your subject, write the question, and attach a file if needed.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateDoubt} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200">Course / Subject</label>
                  <select
                    value={selectedCourseId}
                    onChange={(event) => setSelectedCourseId(event.target.value)}
                    className="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    disabled={courses.length === 0}
                  >
                    {courses.length === 0 ? (
                      <option value="">No enrolled courses found</option>
                    ) : (
                      courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.name} {course.code ? `(${course.code})` : ''} - {course.teacher_name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200">Doubt Title</label>
                  <Input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Short title for your doubt"
                    className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200">Question</label>
                  <Textarea
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder="Describe your doubt in detail"
                    rows={6}
                    className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200">Optional Attachment</label>
                  <Input
                    type="file"
                    accept="image/*,.pdf,.doc,.docx,.txt"
                    onChange={handleAttachmentChange}
                    className="bg-slate-700 border-slate-600 text-white file:mr-4 file:rounded-md file:border-0 file:bg-slate-600 file:px-3 file:py-2 file:text-sm file:text-white"
                  />
                  {attachment && (
                    <p className="text-xs text-slate-400">
                      Selected: {attachment.name} ({Math.round(attachment.size / 1024)} KB)
                    </p>
                  )}
                </div>

                <Button type="submit" disabled={submitting || !selectedCourseId} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send size={16} className="mr-2" />}
                  Submit Doubt
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">My Doubts</CardTitle>
              <CardDescription className="text-slate-400">Only the doubts you submitted appear here.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {doubts.length === 0 ? (
                <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-6 text-center text-slate-400">
                  No doubts submitted yet.
                </div>
              ) : (
                doubts.map((doubt) => {
                  const course = courses.find((item) => item.id === doubt.course_id)

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
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-white">{doubt.title}</h3>
                            <Badge variant="outline" className={statusClasses[doubt.status]}>
                              {statusLabels[doubt.status]}
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-400 line-clamp-2">{doubt.question}</p>
                          <p className="text-xs text-slate-500">
                            {course?.name || 'Unknown Course'} • {course?.teacher_name || 'Assigned Teacher'}
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
        </div>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Doubt Details</CardTitle>
            <CardDescription className="text-slate-400">Open a doubt to see the full thread and teacher response.</CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedDoubt ? (
              <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-900/30 p-8 text-center text-slate-400">
                Select one of your doubts to view the full conversation.
              </div>
            ) : detailLoading ? (
              <div className="flex min-h-[420px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-semibold text-white">{selectedDoubt.title}</h3>
                      <p className="text-sm text-slate-400">{selectedDoubtCourse?.name || 'Course'}</p>
                    </div>
                    <Badge variant="outline" className={statusClasses[selectedDoubt.status]}>
                      {statusLabels[selectedDoubt.status]}
                    </Badge>
                  </div>

                  <div className="grid gap-3 rounded-lg border border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-300">
                    <div>
                      <span className="text-slate-500">Asked to:</span> {selectedDoubtCourse?.teacher_name || 'Assigned Teacher'}
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
                    <span className="font-medium">Your Question</span>
                  </div>
                  <p className="whitespace-pre-line text-slate-200">{selectedDoubt.question}</p>
                  {selectedDoubt.attachment_name && (
                    <div className="space-y-2 pt-2">
                      <p className="text-sm font-medium text-slate-300">Your Attachment</p>
                      {renderAttachmentPreview(selectedDoubt.attachment_data, selectedDoubt.attachment_type, selectedDoubt.attachment_name)}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <h4 className="text-lg font-semibold text-white">Teacher Response</h4>
                  {selectedDoubt.answers.length === 0 ? (
                    <div className="rounded-lg border border-slate-700 bg-slate-900/30 p-4 text-slate-400">
                      No answer yet. The doubt is currently {statusLabels[selectedDoubt.status].toLowerCase()}.
                    </div>
                  ) : (
                    selectedDoubt.answers.map((answer) => (
                      <div key={answer.id} className="space-y-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                        <div className="flex items-center justify-between gap-4 text-sm text-slate-400">
                          <span>Teacher response</span>
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