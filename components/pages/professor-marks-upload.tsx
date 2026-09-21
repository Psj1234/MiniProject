'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Search,
  BookOpen,
  Calendar,
  Layers,
  GraduationCap,
  Sparkles,
  RefreshCw,
  Clock
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  parseMarksCsv,
  calculateGrade,
  type ExamType,
  type MarkRecord,
  type ParsedStudentMark
} from '@/lib/marks'

interface CourseItem {
  id: string
  name: string
  code: string
}

interface ProfessorMarksUploadProps {
  initialCourseId?: string | null
  onBackToClasses?: () => void
}

const supabase = createClient()

export default function ProfessorMarksUpload({
  initialCourseId,
  onBackToClasses
}: ProfessorMarksUploadProps) {
  // Course Selection
  const [courses, setCourses] = useState<CourseItem[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState<string>(initialCourseId || '')
  const [isLoadingCourses, setIsLoadingCourses] = useState(true)

  // Exam Selection: ISE, MSE, ESE
  const [selectedExamType, setSelectedExamType] = useState<ExamType>('mse')
  const [maxMarksInput, setMaxMarksInput] = useState<string>('100')

  // CSV State & Upload
  const [isParsing, setIsParsing] = useState(false)
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [parsedRecords, setParsedRecords] = useState<ParsedStudentMark[]>([])
  const [fileName, setFileName] = useState<string>('')
  const [isSaving, setIsSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Existing Marks List
  const [existingMarks, setExistingMarks] = useState<MarkRecord[]>([])
  const [isLoadingMarks, setIsLoadingMarks] = useState(false)
  const [tableFilterExam, setTableFilterExam] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // 1. Fetch Teacher's Courses
  useEffect(() => {
    async function loadCourses() {
      try {
        setIsLoadingCourses(true)
        const { data: { user } } = await supabase.auth.getUser()

        let courseList: CourseItem[] = []
        if (user) {
          const { data: teacherCourses } = await supabase
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

          if (teacherCourses && teacherCourses.length > 0) {
            courseList = teacherCourses
              .map((tc: any) => tc.courses)
              .filter(Boolean)
          }
        }

        // Fallback: If no direct assignments found, load active courses
        if (courseList.length === 0) {
          const { data: allCourses } = await supabase
            .from('courses')
            .select('id, name, code')
            .order('name')
          courseList = allCourses || []
        }

        setCourses(courseList)
        if (courseList.length > 0 && !selectedCourseId) {
          setSelectedCourseId(initialCourseId || courseList[0].id)
        }
      } catch (err) {
        console.error('Error fetching courses:', err)
      } finally {
        setIsLoadingCourses(false)
      }
    }
    loadCourses()
  }, [initialCourseId])

  // 2. Fetch Existing Marks for the Selected Course
  const fetchCourseMarks = async (courseId: string) => {
    if (!courseId) return
    try {
      setIsLoadingMarks(true)
      const { data: marksData, error } = await supabase
        .from('marks')
        .select(`
          id,
          student_uid,
          course_id,
          percentage,
          exam_type,
          grade,
          created_at
        `)
        .eq('course_id', courseId)
        .order('created_at', { ascending: false })

      if (error) {
        console.warn('Error querying marks:', error.message)
        setExistingMarks([])
        return
      }

      // Fetch student profile names
      const studentUids = Array.from(new Set((marksData || []).map((m: any) => m.student_uid)))
      let nameMap: Record<number, string> = {}
      if (studentUids.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('student_id, full_name')
          .in('student_id', studentUids)

        if (profs) {
          profs.forEach((p: any) => {
            if (p.student_id) nameMap[p.student_id] = p.full_name
          })
        }
      }

      const formatted: MarkRecord[] = (marksData || []).map((m: any) => ({
        id: m.id,
        student_uid: m.student_uid,
        course_id: m.course_id,
        percentage: Number(m.percentage || 0),
        exam_type: (m.exam_type || 'mse').toLowerCase() as ExamType,
        grade: m.grade || calculateGrade(Number(m.percentage || 0)),
        created_at: m.created_at,
        profiles: {
          student_id: m.student_uid,
          full_name: nameMap[m.student_uid] || `Student #${m.student_uid}`
        }
      }))

      setExistingMarks(formatted)
    } catch (err) {
      console.error('Failed to load marks:', err)
    } finally {
      setIsLoadingMarks(false)
    }
  }

  useEffect(() => {
    if (selectedCourseId) {
      fetchCourseMarks(selectedCourseId)
    }
  }, [selectedCourseId])

  // 3. Handle File Input & Parse CSV
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setStatusMessage(null)
    setIsParsing(true)

    try {
      const text = await file.text()
      const maxVal = Number(maxMarksInput) || 100
      const res = parseMarksCsv(text, maxVal)

      setParsedRecords(res.records)
      setParseErrors(res.errors)

      if (res.records.length === 0 && res.errors.length === 0) {
        setParseErrors(['No valid student rows found in the CSV file.'])
      }
    } catch (err: any) {
      setParseErrors([`Failed to read file: ${err.message}`])
      setParsedRecords([])
    } finally {
      setIsParsing(false)
    }
  }

  // 4. Save Parsed Marks to Database
  const handleSaveMarks = async () => {
    if (!selectedCourseId) {
      setStatusMessage({ type: 'error', text: 'Please select a course first.' })
      return
    }
    if (parsedRecords.length === 0) {
      setStatusMessage({ type: 'error', text: 'No parsed student marks to upload.' })
      return
    }

    setIsSaving(true)
    setStatusMessage(null)

    try {
      // Query existing marks for this course and exam_type to handle upserts safely
      const { data: currentCourseMarks, error: fetchErr } = await supabase
        .from('marks')
        .select('id, student_uid')
        .eq('course_id', selectedCourseId)
        .eq('exam_type', selectedExamType)

      if (fetchErr) {
        console.warn('Notice while checking existing marks:', fetchErr.message)
      }

      const existingMap = new Map<number, string>()
      ;(currentCourseMarks || []).forEach((m: any) => {
        existingMap.set(Number(m.student_uid), m.id)
      })

      const updates: any[] = []
      const inserts: any[] = []

      parsedRecords.forEach((rec) => {
        const existingId = existingMap.get(rec.student_id)
        const payload = {
          student_uid: rec.student_id,
          course_id: selectedCourseId,
          percentage: rec.percentage,
          exam_type: selectedExamType,
          grade: rec.grade,
          created_at: new Date().toISOString()
        }

        if (existingId) {
          updates.push({ id: existingId, ...payload })
        } else {
          inserts.push(payload)
        }
      })

      // Run batch inserts
      if (inserts.length > 0) {
        const { error: insErr } = await supabase.from('marks').insert(inserts)
        if (insErr) throw insErr
      }

      // Run batch updates
      if (updates.length > 0) {
        for (const item of updates) {
          const { error: upErr } = await supabase
            .from('marks')
            .update({
              percentage: item.percentage,
              grade: item.grade,
              created_at: item.created_at
            })
            .eq('id', item.id)
          if (upErr) throw upErr
        }
      }

      const totalUpdated = updates.length
      const totalInserted = inserts.length
      setStatusMessage({
        type: 'success',
        text: `Successfully saved ${selectedExamType.toUpperCase()} marks! (${totalInserted} new added, ${totalUpdated} updated). Overall student performance and rankings are automatically synchronized.`
      })

      // Reset file input & refresh marks
      setParsedRecords([])
      setFileName('')
      setParseErrors([])
      fetchCourseMarks(selectedCourseId)
    } catch (err: any) {
      console.error('Error saving marks:', err)
      setStatusMessage({
        type: 'error',
        text: `Failed to save marks: ${err.message || 'Database error'}`
      })
    } finally {
      setIsSaving(false)
    }
  }

  // 5. Delete an individual mark
  const handleDeleteMark = async (markId?: string) => {
    if (!markId) return
    if (!confirm('Are you sure you want to remove this mark entry?')) return

    try {
      const { error } = await supabase.from('marks').delete().eq('id', markId)
      if (error) throw error
      setExistingMarks((prev) => prev.filter((m) => m.id !== markId))
    } catch (err: any) {
      alert(`Failed to delete record: ${err.message}`)
    }
  }

  // 6. Download Sample CSV
  const handleDownloadSampleCsv = () => {
    const csvContent = `student_id,marks,max_marks\n2023300001,25,30\n2023300002,28,30\n2023300003,21,30`
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `sample_${selectedExamType}_marks.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Filtered marks for the view table
  const filteredMarks = useMemo(() => {
    return existingMarks.filter((m) => {
      if (tableFilterExam !== 'all' && m.exam_type !== tableFilterExam) {
        return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const idMatch = String(m.student_uid).includes(q)
        const nameMatch = m.profiles?.full_name?.toLowerCase().includes(q) || false
        if (!idMatch && !nameMatch) return false
      }
      return true
    })
  }, [existingMarks, tableFilterExam, searchQuery])

  // Count stats
  const countIse = existingMarks.filter((m) => m.exam_type === 'ise').length
  const countMse = existingMarks.filter((m) => m.exam_type === 'mse').length
  const countEse = existingMarks.filter((m) => m.exam_type === 'ese').length

  const selectedCourse = courses.find((c) => c.id === selectedCourseId)

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700 p-6 md:p-8 shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-3xl">📝</span>
              <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
                Bulk Marks Upload
              </h1>
              <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-xs px-2.5 py-0.5">
                MSE / ISE / ESE
              </Badge>
            </div>
            <p className="text-slate-300 text-sm md:text-base max-w-3xl leading-relaxed">
              Upload CSV assessment marks for your course. Upload for <strong>ISE</strong>, <strong>MSE</strong>, and <strong>ESE</strong> (total 3 exam rounds). Uploaded marks immediately sync to each student's <strong>Overall Performance</strong> and class rankings.
            </p>
          </div>

          {onBackToClasses && (
            <Button
              onClick={onBackToClasses}
              variant="outline"
              className="border-slate-600 text-slate-300 hover:bg-slate-700 shrink-0"
            >
              Back to Classes
            </Button>
          )}
        </div>

        {/* Quick Exam Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-700/60">
          <div className="bg-slate-800/60 border border-sky-500/30 rounded-xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-sky-400 uppercase tracking-wider">Round 1</span>
              <p className="text-lg font-bold text-white mt-0.5">ISE (In-Semester)</p>
              <p className="text-xs text-slate-400 mt-1">{countIse} student marks recorded</p>
            </div>
            <Badge className="bg-sky-500/20 text-sky-300 border-sky-500/30 text-sm px-2.5 py-1">
              ISE
            </Badge>
          </div>

          <div className="bg-slate-800/60 border border-amber-500/30 rounded-xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Round 2</span>
              <p className="text-lg font-bold text-white mt-0.5">MSE (Mid-Semester)</p>
              <p className="text-xs text-slate-400 mt-1">{countMse} student marks recorded</p>
            </div>
            <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-sm px-2.5 py-1">
              MSE
            </Badge>
          </div>

          <div className="bg-slate-800/60 border border-purple-500/30 rounded-xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">Round 3</span>
              <p className="text-lg font-bold text-white mt-0.5">ESE (End-Semester)</p>
              <p className="text-xs text-slate-400 mt-1">{countEse} student marks recorded</p>
            </div>
            <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-sm px-2.5 py-1">
              ESE
            </Badge>
          </div>
        </div>
      </div>

      {/* Course & Exam Configuration Card */}
      <Card className="bg-slate-800/80 border-slate-700 shadow-lg">
        <CardHeader>
          <CardTitle className="text-white text-xl flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-blue-400" /> Select Subject & Exam Round
          </CardTitle>
          <CardDescription className="text-slate-400">
            Choose the course, select which exam round you are uploading marks for, and configure the exam max marks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Course Dropdown */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-blue-400" /> Subject / Course
              </label>
              <select
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                disabled={isLoadingCourses}
                className="w-full h-10 px-3 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Exam Round Selector (ISE, MSE, ESE) */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-amber-400" /> Examination Round
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-slate-900 border border-slate-700">
                {(['ise', 'mse', 'ese'] as const).map((type) => {
                  const isSelected = selectedExamType === type
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setSelectedExamType(type)
                        setStatusMessage(null)
                      }}
                      className={`py-1.5 rounded-md text-xs font-bold transition uppercase cursor-pointer ${
                        isSelected
                          ? type === 'ise'
                            ? 'bg-sky-600 text-white shadow'
                            : type === 'mse'
                            ? 'bg-amber-600 text-white shadow'
                            : 'bg-purple-600 text-white shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {type}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Max Marks Input */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <GraduationCap className="h-3.5 w-3.5 text-emerald-400" /> Default Max Marks
              </label>
              <Input
                type="number"
                min="1"
                max="500"
                value={maxMarksInput}
                onChange={(e) => setMaxMarksInput(e.target.value)}
                placeholder="e.g. 100 (or 30 for MSE)"
                className="bg-slate-900 border-slate-700 text-white h-10"
              />
            </div>
          </div>

          {/* Status Message */}
          {statusMessage && (
            <div
              className={`p-4 rounded-xl border flex items-start gap-3 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                  : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
              )}
              <p className="text-sm">{statusMessage.text}</p>
            </div>
          )}

          {/* Drag & Drop Upload Zone */}
          <div className="space-y-4 pt-2">
            <div className="border-2 border-dashed border-slate-600 hover:border-blue-500 rounded-xl p-8 text-center bg-slate-900/40 transition-colors">
              <input
                type="file"
                accept=".csv"
                id="marks-csv-input"
                onChange={handleFileChange}
                className="hidden"
                disabled={isSaving || isParsing}
              />
              <label htmlFor="marks-csv-input" className="cursor-pointer block space-y-2">
                <FileSpreadsheet className="h-10 w-10 text-blue-400 mx-auto" />
                <p className="text-slate-200 font-semibold text-base">
                  {fileName ? `Selected: ${fileName}` : `Click to choose or drag & drop CSV for ${selectedExamType.toUpperCase()}`}
                </p>
                <p className="text-xs text-slate-400">
                  Required columns: <code className="text-blue-400 bg-slate-800 px-1 py-0.5 rounded">student_id</code>, <code className="text-emerald-400 bg-slate-800 px-1 py-0.5 rounded">marks</code> (optional: <code className="text-slate-300 bg-slate-800 px-1 py-0.5 rounded">max_marks</code>)
                </p>
              </label>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400 bg-slate-900/60 p-3 rounded-lg border border-slate-700/60">
              <span>
                Need the right format? Use the standard template with student IDs and score values.
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDownloadSampleCsv}
                className="text-blue-400 hover:text-blue-300 hover:bg-slate-800 text-xs flex items-center gap-1.5 h-8 shrink-0 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" /> Download Sample CSV
              </Button>
            </div>
          </div>

          {/* Validation Errors Notice */}
          {parseErrors.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/40 text-amber-200 space-y-1 text-xs">
              <p className="font-semibold flex items-center gap-1.5 text-amber-300">
                <AlertCircle className="h-4 w-4" /> CSV Validation Notices ({parseErrors.length}):
              </p>
              <ul className="list-disc pl-5 space-y-0.5 text-amber-200/90 max-h-32 overflow-y-auto">
                {parseErrors.slice(0, 10).map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
                {parseErrors.length > 10 && (
                  <li>...and {parseErrors.length - 10} more rows skipped.</li>
                )}
              </ul>
            </div>
          )}

          {/* Parsed Preview Table & Save Action */}
          {parsedRecords.length > 0 && (
            <div className="space-y-4 pt-2 border-t border-slate-700/80">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-emerald-400" />
                    Parsed {parsedRecords.length} Student Records for {selectedExamType.toUpperCase()}
                  </h4>
                  <p className="text-xs text-slate-400">
                    Average Score: {(parsedRecords.reduce((a, b) => a + b.percentage, 0) / parsedRecords.length).toFixed(1)}% | Ready to save to course database.
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      setParsedRecords([])
                      setFileName('')
                    }}
                    variant="outline"
                    size="sm"
                    className="border-slate-600 text-slate-300 hover:bg-slate-700 text-xs"
                    disabled={isSaving}
                  >
                    Clear
                  </Button>
                  <Button
                    onClick={handleSaveMarks}
                    disabled={isSaving}
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {isSaving ? 'Saving to Database...' : `Save ${selectedExamType.toUpperCase()} Marks`}
                  </Button>
                </div>
              </div>

              {/* Mini Preview Strip */}
              <div className="max-h-48 overflow-y-auto border border-slate-700 rounded-lg bg-slate-900/60 scrollbar-thin scrollbar-thumb-slate-700">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-800 text-slate-300 sticky top-0 border-b border-slate-700">
                    <tr>
                      <th className="p-2.5">Student ID</th>
                      <th className="p-2.5">Marks Obtained</th>
                      <th className="p-2.5">Max Marks</th>
                      <th className="p-2.5">Percentage</th>
                      <th className="p-2.5">Letter Grade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-200">
                    {parsedRecords.slice(0, 15).map((r, i) => (
                      <tr key={i} className="hover:bg-slate-800/40">
                        <td className="p-2 font-mono font-medium">{r.student_id}</td>
                        <td className="p-2">{r.marks}</td>
                        <td className="p-2 text-slate-400">{r.max_marks}</td>
                        <td className="p-2 font-semibold text-emerald-400">{r.percentage}%</td>
                        <td className="p-2">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-bold">
                            {r.grade}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsedRecords.length > 15 && (
                <p className="text-[11px] text-slate-400 text-center">
                  Showing first 15 of {parsedRecords.length} records. All {parsedRecords.length} will be saved.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recorded Marks Management Table */}
      <Card className="bg-slate-800/80 border-slate-700 shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-white text-xl flex items-center gap-2">
                <span>📊</span> Recorded Assessment Marks ({existingMarks.length})
              </CardTitle>
              <CardDescription className="text-slate-400">
                Current examination marks stored for {selectedCourse ? `${selectedCourse.code} (${selectedCourse.name})` : 'this course'}.
              </CardDescription>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => selectedCourseId && fetchCourseMarks(selectedCourseId)}
              disabled={isLoadingMarks}
              className="border-slate-600 text-slate-300 hover:bg-slate-700 text-xs flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoadingMarks ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>

          {/* Filter & Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-slate-700/60 mt-4">
            {/* Exam Round Filters */}
            <div className="flex items-center gap-1.5">
              {[
                { label: 'All Rounds', val: 'all' },
                { label: `ISE (${countIse})`, val: 'ise' },
                { label: `MSE (${countMse})`, val: 'mse' },
                { label: `ESE (${countEse})`, val: 'ese' }
              ].map((tab) => (
                <button
                  key={tab.val}
                  onClick={() => setTableFilterExam(tab.val)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    tableFilterExam === tab.val
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                type="text"
                placeholder="Search by student ID or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 h-8 text-xs"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoadingMarks ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-400" />
              Loading marks records...
            </div>
          ) : filteredMarks.length === 0 ? (
            <div className="py-12 text-center text-slate-400 bg-slate-900/30 rounded-xl border border-slate-800">
              <p className="text-base font-medium">No marks found matching your filter.</p>
              <p className="text-xs text-slate-500 mt-1">
                Upload a CSV above to record student marks for this course.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-700">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-900 text-slate-300 text-xs uppercase tracking-wider border-b border-slate-700">
                  <tr>
                    <th className="p-3">Student ID</th>
                    <th className="p-3">Student Name</th>
                    <th className="p-3">Exam Round</th>
                    <th className="p-3">Percentage Score</th>
                    <th className="p-3">Grade</th>
                    <th className="p-3">Recorded Date</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60 bg-slate-800/60 text-slate-200">
                  {filteredMarks.map((mark) => (
                    <tr key={mark.id} className="hover:bg-slate-700/30 transition">
                      <td className="p-3 font-mono font-bold text-white">
                        {mark.student_uid}
                      </td>
                      <td className="p-3 font-medium text-slate-200">
                        {mark.profiles?.full_name || `Student #${mark.student_uid}`}
                      </td>
                      <td className="p-3">
                        <Badge
                          className={`text-xs font-bold uppercase ${
                            mark.exam_type === 'ise'
                              ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                              : mark.exam_type === 'mse'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                          }`}
                        >
                          {mark.exam_type}
                        </Badge>
                      </td>
                      <td className="p-3 font-bold text-emerald-400">
                        {mark.percentage}%
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-slate-700/70 border border-slate-600 font-bold text-xs text-white">
                          {mark.grade || calculateGrade(mark.percentage)}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-slate-400 flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3" />
                        {mark.created_at
                          ? new Date(mark.created_at).toLocaleDateString()
                          : 'Recorded'}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleDeleteMark(mark.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                          title="Delete mark"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
