'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  Users,
  GraduationCap,
  Sparkles,
  AlertTriangle,
  X,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  ArrowUpDown,
  RefreshCw,
  LayoutGrid,
  List,
  Award,
  Briefcase,
  Code2,
  FolderGit2,
  ExternalLink
} from 'lucide-react'
import {
  calculateOverallStudentScore,
  ScoreBreakdown,
  RawAchievement,
  SCORE_WEIGHTS,
  CGPA_CONFIG
} from '@/lib/scoring'

interface CourseItem {
  id: string
  name: string
  code: string | null
}

interface RankedStudent {
  student_id: number
  name: string
  course_id: string
  course_name: string
  course_code: string | null
  learner_tag: 'fast' | 'slow'
  cgpa: number | null
  quiz_score: number
  overall_score: number
  score_breakdown: ScoreBreakdown
  achievements_count: number
  assessments_count: number
  status: 'On Track' | 'Progressing' | 'At Risk'
}

interface AssessmentMark {
  id: number
  exam_type: string
  percentage: number
  grade: string | null
  created_at: string
  course_name?: string
}

interface QuizRecord {
  quiz_id: string
  quiz_title: string
  score: number
  max_score: number
  percentage: number
  taken_at: string
}

interface StudentDetailData {
  student: RankedStudent
  marks: AssessmentMark[]
  quizzes: QuizRecord[]
  achievements: RawAchievement[]
  loading: boolean
}

export default function LearnerPerformance() {
  const [supabase] = useState(() => createClient())

  // Filters State
  const [courses, setCourses] = useState<CourseItem[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState<string>('all')
  const [availablePeriods, setAvailablePeriods] = useState<string[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all')
  const [limitOption, setLimitOption] = useState<'5' | '10' | '20' | 'custom'>('10')
  const [customLimit, setCustomLimit] = useState<string>('15')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [viewMode, setViewMode] = useState<'tabs' | 'grid'>('tabs')
  const [activeCategoryTab, setActiveCategoryTab] = useState<'top-slow' | 'bottom-slow' | 'top-fast' | 'bottom-fast'>('top-fast')

  // Data Loading State
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Raw Database Data
  const [allStudents, setAllStudents] = useState<RankedStudent[]>([])

  // Modal State for Clicked Student
  const [selectedStudentDetail, setSelectedStudentDetail] = useState<StudentDetailData | null>(null)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)

  // Compute active numeric limit
  const activeLimit = useMemo(() => {
    if (limitOption === 'custom') {
      const parsed = parseInt(customLimit, 10)
      return isNaN(parsed) || parsed <= 0 ? 10 : parsed
    }
    return parseInt(limitOption, 10)
  }, [limitOption, customLimit])

  // Fetch courses and ranking data for the authenticated professor
  const fetchData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      // 1. Get authenticated user (professor)
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser()

      if (userError || !user) {
        throw new Error('You must be logged in as a professor to view this page.')
      }

      // 2. Fetch courses assigned to this professor
      const { data: teacherCourses, error: coursesError } = await supabase
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

      if (coursesError) {
        throw new Error(`Failed to load courses: ${coursesError.message}`)
      }

      if (!teacherCourses || teacherCourses.length === 0) {
        setCourses([])
        setAllStudents([])
        setIsLoading(false)
        return
      }

      const formattedCourses: CourseItem[] = teacherCourses
        .map((tc: any) => tc.courses)
        .filter(Boolean)
        .map((c: any) => ({
          id: c.id,
          name: c.name,
          code: c.code || null
        }))

      setCourses(formattedCourses)
      const teacherCourseIds = formattedCourses.map((c) => c.id)

      // 3. Fetch enrollments for all courses taught by the professor
      // Include student profile with CGPA (with fallback if cgpa column not in schema cache yet)
      let enrollments: any[] = []
      const { data: enrData, error: enrollmentsError } = await supabase
        .from('enrollments')
        .select(`
          student_id,
          learner_tag,
          course_id,
          courses (
            id,
            name,
            code
          ),
          profiles (
            id,
            full_name,
            student_id,
            cgpa
          )
        `)
        .in('course_id', teacherCourseIds)
        .in('learner_tag', ['slow', 'fast'])

      if (enrollmentsError) {
        if (
          enrollmentsError.message?.includes('cgpa') ||
          enrollmentsError.details?.includes('cgpa') ||
          enrollmentsError.code === 'PGRST204'
        ) {
          console.warn("Could not find 'cgpa' column in profiles schema cache. Retrying without cgpa...")
          const { data: fallbackEnr, error: fbError } = await supabase
            .from('enrollments')
            .select(`
              student_id,
              learner_tag,
              course_id,
              courses (
                id,
                name,
                code
              ),
              profiles (
                id,
                full_name,
                student_id
              )
            `)
            .in('course_id', teacherCourseIds)
            .in('learner_tag', ['slow', 'fast'])

          if (fbError) {
            throw new Error(`Failed to load student enrollments: ${fbError.message}`)
          }
          enrollments = fallbackEnr || []
        } else {
          throw new Error(`Failed to load student enrollments: ${enrollmentsError.message}`)
        }
      } else {
        enrollments = enrData || []
      }

      const allStudentIds = Array.from(new Set((enrollments || []).map((e: any) => e.student_id)))

      // 4. Fetch marks for those courses
      const { data: marksData, error: marksError } = await supabase
        .from('marks')
        .select('id, student_uid, course_id, percentage, exam_type, grade, created_at')
        .in('course_id', teacherCourseIds)
        .not('percentage', 'is', null)

      if (marksError) {
        console.warn('Could not fetch marks:', marksError.message)
      }

      // 5. Fetch achievements from student_achievements
      let achievementsData: any[] = []
      try {
        if (allStudentIds.length > 0) {
          const { data: achRes } = await supabase
            .from('student_achievements')
            .select('*')
            .in('student_uid', allStudentIds)
          achievementsData = achRes || []
        }
      } catch (e) {
        console.warn('student_achievements query notice:', e)
      }

      // 5b. Fetch assignment submissions from assignment_submissions
      let assignmentSubmissionsData: any[] = []
      try {
        if (allStudentIds.length > 0) {
          const { data: subRes } = await supabase
            .from('assignment_submissions')
            .select('student_uid, percentage, grading_status, is_draft')
            .in('student_uid', allStudentIds)
            .eq('is_draft', false)
            .eq('grading_status', 'graded')
          assignmentSubmissionsData = subRes || []
        }
      } catch (e) {
        console.warn('assignment_submissions query notice in learner-performance:', e)
      }

      // 6. Extract available assessment periods (e.g. week1, week2, week3, etc.)
      const periodsSet = new Set<string>()
      marksData?.forEach((m) => {
        if (m.exam_type) {
          periodsSet.add(m.exam_type)
        }
      })
      const sortedPeriods = Array.from(periodsSet).sort()
      setAvailablePeriods(sortedPeriods)

      // 7. Process each enrollment into a student ranking record using the unified scoring engine
      const processedStudents: RankedStudent[] = (enrollments || []).map((enrollment: any) => {
        const studentId = enrollment.student_id
        const courseId = enrollment.course_id
        const courseObj = enrollment.courses
        const profileObj = enrollment.profiles

        // Filter student's marks for this specific course
        const studentCourseMarks = (marksData || []).filter(
          (m) => m.student_uid === studentId && m.course_id === courseId
        )

        // Calculate average percentage score across assessments
        const avgQuizScore =
          studentCourseMarks.length > 0
            ? Math.round(
                studentCourseMarks.reduce((acc, m) => acc + Number(m.percentage || 0), 0) /
                  studentCourseMarks.length
              )
            : 0

        // Calculate student's assignment average
        const studentAssigns = assignmentSubmissionsData.filter(
          (s: any) => s.student_uid === studentId
        )
        const avgAssignmentScore =
          studentAssigns.length > 0
            ? Math.round(
                studentAssigns.reduce((acc: number, s: any) => acc + Number(s.percentage || 0), 0) /
                  studentAssigns.length
              )
            : null

        // Parse student achievements
        const studentAchievements: RawAchievement[] = (achievementsData || [])
          .filter((a: any) => a.student_uid === studentId)
          .map((a: any) => ({
            id: a.id,
            category: a.category,
            title: a.title,
            organizer: a.organizer,
            date: a.date,
            result: a.result,
            score: Number(a.score || 0),
            description: a.description,
            proof_url: a.proof_url,
            verification_status: a.verification_status
          }))

        const cgpaVal =
          profileObj?.cgpa !== null && profileObj?.cgpa !== undefined
            ? Number(profileObj.cgpa)
            : null

        // Unified score calculation (Academic 30%, Quiz 15%, Assignments 10%, Achievements 45%)
        const breakdown = calculateOverallStudentScore({
          cgpa: cgpaVal,
          quizScore: avgQuizScore,
          assignmentScore: avgAssignmentScore,
          achievements: studentAchievements
        })

        const tag = (enrollment.learner_tag as 'fast' | 'slow') || 'slow'

        let status: 'On Track' | 'Progressing' | 'At Risk' = 'Progressing'
        if (tag === 'fast') {
          status = breakdown.overallScore >= 75 ? 'On Track' : 'Progressing'
        } else {
          status = breakdown.overallScore < 50 ? 'At Risk' : 'Progressing'
        }

        return {
          student_id: studentId,
          name: profileObj?.full_name || `Student #${studentId}`,
          course_id: courseId,
          course_name: courseObj?.name || 'Assigned Course',
          course_code: courseObj?.code || null,
          learner_tag: tag,
          cgpa: cgpaVal,
          quiz_score: avgQuizScore,
          overall_score: breakdown.overallScore,
          score_breakdown: breakdown,
          achievements_count: studentAchievements.length,
          assessments_count: studentCourseMarks.length,
          status
        }
      })

      setAllStudents(processedStudents)
    } catch (err: any) {
      console.error('Error fetching learner ranking data:', err)
      setError(err.message || 'An error occurred while loading learner rankings.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Filter students based on Course, Assessment Period, and Search Query
  const filteredStudents = useMemo(() => {
    return allStudents.filter((student) => {
      // Course filter
      if (selectedCourseId !== 'all' && student.course_id !== selectedCourseId) {
        return false
      }

      // Search query filter (matches student name or roll number)
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase().trim()
        const matchesName = student.name.toLowerCase().includes(query)
        const matchesId = student.student_id.toString().includes(query)
        const matchesCourse = student.course_name.toLowerCase().includes(query)
        if (!matchesName && !matchesId && !matchesCourse) {
          return false
        }
      }

      return true
    })
  }, [allStudents, selectedCourseId, searchQuery])

  // Summary Statistics calculated dynamically from the filtered dataset
  const summaryStats = useMemo(() => {
    const totalStudents = filteredStudents.length
    const fastLearners = filteredStudents.filter((s) => s.learner_tag === 'fast')
    const slowLearners = filteredStudents.filter((s) => s.learner_tag === 'slow')

    const avgScore =
      totalStudents > 0
        ? Math.round(filteredStudents.reduce((acc, s) => acc + s.overall_score, 0) / totalStudents)
        : 0

    // Find highest and lowest performer
    let highest: RankedStudent | null = null
    let lowest: RankedStudent | null = null

    if (totalStudents > 0) {
      const sortedByScore = [...filteredStudents].sort((a, b) => b.overall_score - a.overall_score)
      highest = sortedByScore[0]
      lowest = sortedByScore[sortedByScore.length - 1]
    }

    return {
      totalStudents,
      totalFastLearners: fastLearners.length,
      totalSlowLearners: slowLearners.length,
      averagePerformance: avgScore,
      highestPerformer: highest,
      lowestPerformer: lowest
    }
  }, [filteredStudents])

  // Segregate and order into the four target categories based on overall_score:
  // 1. Top Slow Learners (DESC)
  // 2. Bottom Slow Learners (ASC)
  // 3. Top Fast Learners (DESC)
  // 4. Bottom Fast Learners (ASC)
  const categories = useMemo(() => {
    const slowStudents = filteredStudents.filter((s) => s.learner_tag === 'slow')
    const fastStudents = filteredStudents.filter((s) => s.learner_tag === 'fast')

    // Top Slow: highest scores within slow group
    const topSlow = [...slowStudents]
      .sort((a, b) => b.overall_score - a.overall_score || a.name.localeCompare(b.name))
      .slice(0, activeLimit)

    // Bottom Slow: lowest scores within slow group
    const bottomSlow = [...slowStudents]
      .sort((a, b) => a.overall_score - b.overall_score || a.name.localeCompare(b.name))
      .slice(0, activeLimit)

    // Top Fast: highest scores within fast group
    const topFast = [...fastStudents]
      .sort((a, b) => b.overall_score - a.overall_score || a.name.localeCompare(b.name))
      .slice(0, activeLimit)

    // Bottom Fast: lowest scores within fast group
    const bottomFast = [...fastStudents]
      .sort((a, b) => a.overall_score - b.overall_score || a.name.localeCompare(b.name))
      .slice(0, activeLimit)

    return {
      topSlow,
      bottomSlow,
      topFast,
      bottomFast,
      totalSlowCount: slowStudents.length,
      totalFastCount: fastStudents.length
    }
  }, [filteredStudents, activeLimit])

  // Open detailed student view modal and fetch their assessment, quiz, and achievement history
  const handleOpenStudentDetail = async (student: RankedStudent) => {
    setSelectedStudentDetail({
      student,
      marks: [],
      quizzes: [],
      achievements: [],
      loading: true
    })
    setIsModalOpen(true)

    try {
      // 1. Fetch assessment marks
      let marksQuery = supabase
        .from('marks')
        .select(`
          id,
          percentage,
          exam_type,
          grade,
          created_at,
          courses (
            name
          )
        `)
        .eq('student_uid', student.student_id)
        .eq('course_id', student.course_id)
        .order('created_at', { ascending: true })

      if (selectedPeriod !== 'all') {
        marksQuery = marksQuery.eq('exam_type', selectedPeriod)
      }

      const { data: marksRes, error: marksErr } = await marksQuery

      // 2. Fetch quiz results
      const { data: quizRes, error: quizErr } = await supabase
        .from('quiz_results')
        .select(`
          quiz_id,
          score,
          max_score,
          taken_at,
          quizzes (
            title,
            course_id
          )
        `)
        .eq('student_uid', student.student_id)
        .order('taken_at', { ascending: false })

      // 3. Fetch achievements
      let studentAchs: RawAchievement[] = []
      try {
        const { data: achRes } = await supabase
          .from('student_achievements')
          .select('*')
          .eq('student_uid', student.student_id)
          .order('created_at', { ascending: false })

        if (achRes) {
          studentAchs = achRes.map((a: any) => ({
            id: a.id,
            category: a.category,
            title: a.title,
            organizer: a.organizer,
            date: a.date,
            result: a.result,
            score: Number(a.score || 0),
            description: a.description,
            proof_url: a.proof_url,
            verification_status: a.verification_status
          }))
        }
      } catch (e) {
        console.warn('Could not fetch student achievements:', e)
      }

      if (marksErr) console.warn('Error fetching student marks detail:', marksErr)
      if (quizErr) console.warn('Error fetching student quiz detail:', quizErr)

      const formattedMarks: AssessmentMark[] = (marksRes || []).map((m: any) => ({
        id: m.id,
        exam_type: m.exam_type || 'Assessment',
        percentage: Number(m.percentage || 0),
        grade: m.grade,
        created_at: m.created_at,
        course_name: m.courses?.name
      }))

      const formattedQuizzes: QuizRecord[] = (quizRes || [])
        .filter((q: any) => {
          if (!q.quizzes) return true
          return q.quizzes.course_id === student.course_id
        })
        .map((q: any) => ({
          quiz_id: q.quiz_id,
          quiz_title: q.quizzes?.title || 'Course Quiz',
          score: Number(q.score || 0),
          max_score: Number(q.max_score || 10),
          percentage: q.max_score > 0 ? Math.round((q.score / q.max_score) * 100) : 0,
          taken_at: q.taken_at
        }))

      setSelectedStudentDetail({
        student,
        marks: formattedMarks,
        quizzes: formattedQuizzes,
        achievements: studentAchs,
        loading: false
      })
    } catch (err) {
      console.error('Error fetching detailed student info:', err)
      setSelectedStudentDetail((prev) => (prev ? { ...prev, loading: false } : null))
    }
  }

  // Helper: Badge formatting
  const getLearnerBadge = (tag: 'fast' | 'slow') => {
    if (tag === 'fast') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
          <Sparkles className="w-3 h-3 text-emerald-400" />
          Fast Learner
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
        <GraduationCap className="w-3 h-3 text-amber-400" />
        Slow Learner
      </span>
    )
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400'
    if (score >= 60) return 'text-blue-400'
    if (score >= 45) return 'text-amber-400'
    return 'text-rose-400'
  }

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-emerald-500/15 border-emerald-500/30'
    if (score >= 60) return 'bg-blue-500/15 border-blue-500/30'
    if (score >= 45) return 'bg-amber-500/15 border-amber-500/30'
    return 'bg-rose-500/15 border-rose-500/30'
  }

  const getRankBadge = (rankIndex: number) => {
    if (rankIndex === 0) {
      return (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold">
          1
        </span>
      )
    }
    if (rankIndex === 1) {
      return (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-400/20 text-slate-300 border border-slate-400/40 text-xs font-bold">
          2
        </span>
      )
    }
    if (rankIndex === 2) {
      return (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/40 text-xs font-bold">
          3
        </span>
      )
    }
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 text-slate-400 text-xs font-medium border border-slate-700">
        {rankIndex + 1}
      </span>
    )
  }

  // Render Table of Ranked Students
  const renderRankedTable = (
    studentsList: RankedStudent[],
    emptyMessage: string,
    categoryType: 'top-slow' | 'bottom-slow' | 'top-fast' | 'bottom-fast'
  ) => {
    if (studentsList.length === 0) {
      return (
        <div className="py-12 text-center text-slate-400">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-800 flex items-center justify-center text-slate-500">
            <Users className="w-6 h-6" />
          </div>
          <p className="text-sm font-medium">{emptyMessage}</p>
          <p className="text-xs text-slate-500 mt-1">
            Try adjusting your course filter or search keywords.
          </p>
        </div>
      )
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-700/80 text-xs font-semibold uppercase tracking-wider text-slate-400 bg-slate-800/40">
              <th className="py-3 px-4 w-16 text-center">Rank</th>
              <th className="py-3 px-4">Student</th>
              <th className="py-3 px-4">Roll / ID</th>
              <th className="py-3 px-4">Course</th>
              <th className="py-3 px-4 text-center">CGPA (30%)</th>
              <th className="py-3 px-4 text-center">Quiz (25%)</th>
              <th className="py-3 px-4 text-center">Achievements</th>
              <th className="py-3 px-4 text-center">Overall Score</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-sm">
            {studentsList.map((student, idx) => (
              <tr
                key={`${student.student_id}-${student.course_id}-${categoryType}-${idx}`}
                onClick={() => handleOpenStudentDetail(student)}
                className="group hover:bg-slate-700/40 transition-colors cursor-pointer"
              >
                <td className="py-3.5 px-4 text-center">
                  <div className="flex items-center justify-center">{getRankBadge(idx)}</div>
                </td>
                <td className="py-3.5 px-4 font-medium text-white group-hover:text-blue-400 transition-colors">
                  <div className="flex items-center gap-2">
                    <span>{student.name}</span>
                  </div>
                </td>
                <td className="py-3.5 px-4 text-slate-300 font-mono text-xs">
                  {student.student_id}
                </td>
                <td className="py-3.5 px-4 text-slate-300">
                  <span className="truncate max-w-[160px] block" title={student.course_name}>
                    {student.course_name}
                  </span>
                </td>
                <td className="py-3.5 px-4 text-center text-xs">
                  {student.cgpa !== null ? (
                    <span className="text-emerald-400 font-semibold">{student.cgpa}</span>
                  ) : (
                    <span className="text-slate-500 italic">Pending</span>
                  )}
                </td>
                <td className="py-3.5 px-4 text-center text-xs text-slate-300 font-medium">
                  {student.quiz_score}%
                </td>
                <td className="py-3.5 px-4 text-center">
                  {student.achievements_count > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                      <Trophy className="w-3 h-3" />
                      {student.achievements_count}
                    </span>
                  ) : (
                    <span className="text-slate-500 text-xs">0</span>
                  )}
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span
                    className={`inline-block px-2.5 py-1 rounded-md text-xs font-bold border ${getScoreBg(
                      student.overall_score
                    )} ${getScoreColor(student.overall_score)}`}
                  >
                    {student.overall_score}%
                  </span>
                </td>
                <td className="py-3.5 px-4 text-right">
                  <span className="text-xs text-blue-400 group-hover:underline font-medium">
                    View Details →
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // Render Category Card for Grid View
  const renderCategoryCard = (
    title: string,
    subtitle: string,
    icon: React.ReactNode,
    studentsList: RankedStudent[],
    emptyMessage: string,
    badgeColor: string,
    categoryType: 'top-slow' | 'bottom-slow' | 'top-fast' | 'bottom-fast'
  ) => {
    return (
      <Card className="bg-slate-800/80 border-slate-700 shadow-lg backdrop-blur flex flex-col h-full">
        <CardHeader className="border-b border-slate-700/60 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${badgeColor}`}>{icon}</div>
              <div>
                <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                  {title}
                </CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  {subtitle} • Showing up to {activeLimit} students
                </CardDescription>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-700/60 text-slate-300 border border-slate-600/50">
              {studentsList.length} Students
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0 flex-1 flex flex-col">
          {renderRankedTable(studentsList, emptyMessage, categoryType)}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* --- Section Title & Controls --- */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Learner Performance & Rankings</h2>
              <p className="text-sm text-slate-400">
                Authoritative rankings combining academic CGPA (30%), coursework quizzes (25%), and achievements (45%)
              </p>
            </div>
          </div>
        </div>

        {/* View switcher & refresh */}
        <div className="flex items-center gap-2 self-start lg:self-center">
          <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg p-1">
            <button
              onClick={() => setViewMode('tabs')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition ${
                viewMode === 'tabs'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Tabs View"
            >
              <List className="w-3.5 h-3.5" />
              Tabs
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition ${
                viewMode === 'grid'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Grid View (All 4 Categories)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Grid
            </button>
          </div>

          <Button
            onClick={fetchData}
            variant="outline"
            size="sm"
            disabled={isLoading}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* --- Filters Toolbar --- */}
      <Card className="bg-slate-800/90 border-slate-700 shadow-md">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-center">
            {/* Filter 1: Course/Class Dropdown */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-blue-400" />
                Course / Class
              </label>
              <select
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Courses ({courses.length})</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name} {course.code ? `(${course.code})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter 2: Assessment Period */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                Assessment Period
              </label>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Periods (Overall)</option>
                {availablePeriods.map((period) => (
                  <option key={period} value={period}>
                    {period.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter 3: Number of Students Selector & Custom Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <ArrowUpDown className="w-3.5 h-3.5 text-amber-400" />
                Display Limit
              </label>
              <div className="flex gap-2">
                <select
                  value={limitOption}
                  onChange={(e) => setLimitOption(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="5">Top/Bottom: 5</option>
                  <option value="10">Top/Bottom: 10</option>
                  <option value="20">Top/Bottom: 20</option>
                  <option value="custom">Custom Number...</option>
                </select>

                {limitOption === 'custom' && (
                  <Input
                    type="number"
                    min="1"
                    max="500"
                    value={customLimit}
                    onChange={(e) => setCustomLimit(e.target.value)}
                    placeholder="#"
                    className="w-24 bg-slate-900 border-slate-700 text-white text-sm"
                  />
                )}
              </div>
            </div>

            {/* Filter 4: Search Box */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-purple-400" />
                Search Student
              </label>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Search name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-900 border-slate-700 text-white text-sm pr-8"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* --- Error State --- */}
      {error && (
        <Card className="bg-red-500/10 border-red-500/30">
          <CardContent className="p-4 flex items-center justify-between text-red-300 text-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={fetchData}
              className="border-red-500/40 text-red-200 hover:bg-red-500/20"
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* --- Summary Statistics Banner --- */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Students */}
        <Card className="bg-slate-800/80 border-slate-700">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-slate-400">Total Students</p>
            <p className="text-2xl font-bold text-white mt-1">{summaryStats.totalStudents}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Enrolled learners</p>
          </CardContent>
        </Card>

        {/* Total Fast Learners */}
        <Card className="bg-slate-800/80 border-slate-700">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-slate-400 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emerald-400" />
              Fast Learners
            </p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">
              {summaryStats.totalFastLearners}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {summaryStats.totalStudents > 0
                ? Math.round((summaryStats.totalFastLearners / summaryStats.totalStudents) * 100)
                : 0}
              % of class
            </p>
          </CardContent>
        </Card>

        {/* Total Slow Learners */}
        <Card className="bg-slate-800/80 border-slate-700">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-slate-400 flex items-center gap-1">
              <GraduationCap className="w-3 h-3 text-amber-400" />
              Slow Learners
            </p>
            <p className="text-2xl font-bold text-amber-400 mt-1">
              {summaryStats.totalSlowLearners}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {summaryStats.totalStudents > 0
                ? Math.round((summaryStats.totalSlowLearners / summaryStats.totalStudents) * 100)
                : 0}
              % of class
            </p>
          </CardContent>
        </Card>

        {/* Average Performance */}
        <Card className="bg-slate-800/80 border-slate-700">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-slate-400">Overall Average</p>
            <p className="text-2xl font-bold text-blue-400 mt-1">
              {summaryStats.averagePerformance}%
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Academic + Achievements</p>
          </CardContent>
        </Card>

        {/* Highest Performer */}
        <Card className="bg-slate-800/80 border-slate-700">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-slate-400 flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-emerald-400" />
              Highest Performer
            </p>
            {summaryStats.highestPerformer ? (
              <>
                <p className="text-lg font-bold text-emerald-400 truncate mt-1" title={summaryStats.highestPerformer.name}>
                  {summaryStats.highestPerformer.name}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Overall: <strong className="text-white">{summaryStats.highestPerformer.overall_score}%</strong>
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-500 mt-2">No records</p>
            )}
          </CardContent>
        </Card>

        {/* Lowest Performer */}
        <Card className="bg-slate-800/80 border-slate-700">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-slate-400 flex items-center gap-1">
              <TrendingDown className="w-3 h-3 text-rose-400" />
              Lowest Performer
            </p>
            {summaryStats.lowestPerformer ? (
              <>
                <p className="text-lg font-bold text-rose-400 truncate mt-1" title={summaryStats.lowestPerformer.name}>
                  {summaryStats.lowestPerformer.name}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Overall: <strong className="text-white">{summaryStats.lowestPerformer.overall_score}%</strong>
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-500 mt-2">No records</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* --- Main Content: Tabs View vs Grid View --- */}
      {isLoading ? (
        <Card className="bg-slate-800 border-slate-700 p-12 text-center">
          <div className="flex flex-col items-center justify-center gap-3 text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm font-medium">Computing authoritative overall rankings...</p>
          </div>
        </Card>
      ) : viewMode === 'tabs' ? (
        /* Tabs View */
        <Card className="bg-slate-800/90 border-slate-700 shadow-xl overflow-hidden">
          <Tabs
            value={activeCategoryTab}
            onValueChange={(val: any) => setActiveCategoryTab(val)}
            className="w-full"
          >
            <div className="border-b border-slate-700 bg-slate-900/50 p-2 sm:p-3">
              <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full bg-slate-800/80 h-auto p-1 gap-1">
                <TabsTrigger
                  value="top-fast"
                  className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white text-xs sm:text-sm py-2 px-3 flex items-center justify-center gap-1.5"
                >
                  <TrendingUp className="w-4 h-4 text-emerald-300" />
                  <span>Top Fast</span>
                  <span className="ml-1 text-[11px] opacity-80">({categories.topFast.length})</span>
                </TabsTrigger>

                <TabsTrigger
                  value="bottom-fast"
                  className="data-[state=active]:bg-slate-700 data-[state=active]:text-white text-xs sm:text-sm py-2 px-3 flex items-center justify-center gap-1.5"
                >
                  <TrendingDown className="w-4 h-4 text-slate-300" />
                  <span>Bottom Fast</span>
                  <span className="ml-1 text-[11px] opacity-80">({categories.bottomFast.length})</span>
                </TabsTrigger>

                <TabsTrigger
                  value="top-slow"
                  className="data-[state=active]:bg-amber-600 data-[state=active]:text-white text-xs sm:text-sm py-2 px-3 flex items-center justify-center gap-1.5"
                >
                  <TrendingUp className="w-4 h-4 text-amber-300" />
                  <span>Top Slow</span>
                  <span className="ml-1 text-[11px] opacity-80">({categories.topSlow.length})</span>
                </TabsTrigger>

                <TabsTrigger
                  value="bottom-slow"
                  className="data-[state=active]:bg-rose-600 data-[state=active]:text-white text-xs sm:text-sm py-2 px-3 flex items-center justify-center gap-1.5"
                >
                  <TrendingDown className="w-4 h-4 text-rose-300" />
                  <span>Bottom Slow</span>
                  <span className="ml-1 text-[11px] opacity-80">({categories.bottomSlow.length})</span>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Tab 1: Top Fast Learners */}
            <TabsContent value="top-fast" className="m-0 focus-visible:outline-none">
              <div className="p-4 border-b border-slate-700/60 bg-slate-800/30 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    Top Fast Learners
                  </h3>
                  <p className="text-xs text-slate-400">
                    Highest-performing fast learners sorted descending by overall student performance score
                  </p>
                </div>
                <span className="text-xs text-slate-400 bg-slate-900/60 px-3 py-1 rounded border border-slate-700">
                  Showing top {Math.min(activeLimit, categories.topFast.length)} of{' '}
                  {categories.totalFastCount} fast learners
                </span>
              </div>
              {renderRankedTable(
                categories.topFast,
                'No fast learners found for the selected filter.',
                'top-fast'
              )}
            </TabsContent>

            {/* Tab 2: Bottom Fast Learners */}
            <TabsContent value="bottom-fast" className="m-0 focus-visible:outline-none">
              <div className="p-4 border-b border-slate-700/60 bg-slate-800/30 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-slate-400" />
                    Bottom Fast Learners
                  </h3>
                  <p className="text-xs text-slate-400">
                    Lowest-performing fast learners sorted ascending by overall student performance score
                  </p>
                </div>
                <span className="text-xs text-slate-400 bg-slate-900/60 px-3 py-1 rounded border border-slate-700">
                  Showing bottom {Math.min(activeLimit, categories.bottomFast.length)} of{' '}
                  {categories.totalFastCount} fast learners
                </span>
              </div>
              {renderRankedTable(
                categories.bottomFast,
                'No fast learners found for the selected filter.',
                'bottom-fast'
              )}
            </TabsContent>

            {/* Tab 3: Top Slow Learners */}
            <TabsContent value="top-slow" className="m-0 focus-visible:outline-none">
              <div className="p-4 border-b border-slate-700/60 bg-slate-800/30 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-amber-400" />
                    Top Slow Learners
                  </h3>
                  <p className="text-xs text-slate-400">
                    Highest-performing students within the slow-learner group (Score DESC)
                  </p>
                </div>
                <span className="text-xs text-slate-400 bg-slate-900/60 px-3 py-1 rounded border border-slate-700">
                  Showing top {Math.min(activeLimit, categories.topSlow.length)} of{' '}
                  {categories.totalSlowCount} slow learners
                </span>
              </div>
              {renderRankedTable(
                categories.topSlow,
                'No slow learners found for the selected filter.',
                'top-slow'
              )}
            </TabsContent>

            {/* Tab 4: Bottom Slow Learners */}
            <TabsContent value="bottom-slow" className="m-0 focus-visible:outline-none">
              <div className="p-4 border-b border-slate-700/60 bg-slate-800/30 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    Bottom Slow Learners
                  </h3>
                  <p className="text-xs text-slate-400">
                    Lowest-performing students within the slow-learner group requiring immediate intervention
                  </p>
                </div>
                <span className="text-xs text-slate-400 bg-slate-900/60 px-3 py-1 rounded border border-slate-700">
                  Showing bottom {Math.min(activeLimit, categories.bottomSlow.length)} of{' '}
                  {categories.totalSlowCount} slow learners
                </span>
              </div>
              {renderRankedTable(
                categories.bottomSlow,
                'No slow learners found for the selected filter.',
                'bottom-slow'
              )}
            </TabsContent>
          </Tabs>
        </Card>
      ) : (
        /* Grid View: All 4 cards simultaneously */
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Card 1: Top Slow Learners */}
          {renderCategoryCard(
            'Top Slow Learners',
            'Highest-performing within slow learner group (Score DESC)',
            <GraduationCap className="w-5 h-5 text-amber-300" />,
            categories.topSlow,
            'No slow learners found.',
            'bg-amber-500/20 text-amber-300',
            'top-slow'
          )}

          {/* Card 2: Bottom Slow Learners */}
          {renderCategoryCard(
            'Bottom Slow Learners',
            'Lowest-performing within slow learner group (Score ASC)',
            <AlertTriangle className="w-5 h-5 text-rose-300" />,
            categories.bottomSlow,
            'No slow learners found.',
            'bg-rose-500/20 text-rose-300',
            'bottom-slow'
          )}

          {/* Card 3: Top Fast Learners */}
          {renderCategoryCard(
            'Top Fast Learners',
            'Highest-performing fast learners (Score DESC)',
            <Sparkles className="w-5 h-5 text-emerald-300" />,
            categories.topFast,
            'No fast learners found.',
            'bg-emerald-500/20 text-emerald-300',
            'top-fast'
          )}

          {/* Card 4: Bottom Fast Learners */}
          {renderCategoryCard(
            'Bottom Fast Learners',
            'Lowest-performing fast learners (Score ASC)',
            <TrendingDown className="w-5 h-5 text-blue-300" />,
            categories.bottomFast,
            'No fast learners found.',
            'bg-blue-500/20 text-blue-300',
            'bottom-fast'
          )}
        </div>
      )}

      {/* --- Student Detail Modal (Expanded with Full Achievements & Breakdown) --- */}
      {isModalOpen && selectedStudentDetail && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-4xl bg-slate-900 border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <CardHeader className="border-b border-slate-800 bg-slate-800/60 pb-4 flex flex-row items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-xl font-bold text-white">
                    {selectedStudentDetail.student.name}
                  </CardTitle>
                  {getLearnerBadge(selectedStudentDetail.student.learner_tag)}
                </div>
                <CardDescription className="text-xs text-slate-400 mt-1">
                  Roll / Student ID: <span className="text-slate-200 font-mono font-semibold">{selectedStudentDetail.student.student_id}</span> • Course: <span className="text-slate-200 font-medium">{selectedStudentDetail.student.course_name}</span>
                </CardDescription>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:bg-slate-800 hover:text-white rounded-full"
              >
                <X className="w-5 h-5" />
              </Button>
            </CardHeader>

            {/* Modal Content */}
            <CardContent className="p-6 overflow-y-auto space-y-6">
              {/* Quick Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-800/80 border border-slate-700/60 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-400">Overall Score</p>
                  <p
                    className={`text-2xl font-bold mt-1 ${getScoreColor(
                      selectedStudentDetail.student.overall_score
                    )}`}
                  >
                    {selectedStudentDetail.student.overall_score}%
                  </p>
                </div>

                <div className="bg-slate-800/80 border border-slate-700/60 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-400">Academic CGPA (30%)</p>
                  <p className="text-xl font-bold text-emerald-400 mt-1">
                    {selectedStudentDetail.student.cgpa !== null ? (
                      `${selectedStudentDetail.student.cgpa} / 10`
                    ) : (
                      <span className="text-slate-500 text-sm">Missing</span>
                    )}
                  </p>
                </div>

                <div className="bg-slate-800/80 border border-slate-700/60 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-400">Quiz Average (25%)</p>
                  <p className="text-2xl font-bold text-blue-400 mt-1">
                    {selectedStudentDetail.student.quiz_score}%
                  </p>
                </div>

                <div className="bg-slate-800/80 border border-slate-700/60 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-400">Achievements (45%)</p>
                  <p className="text-2xl font-bold text-amber-400 mt-1">
                    {selectedStudentDetail.student.achievements_count}
                  </p>
                </div>
              </div>

              {/* 7-part Component Breakdown */}
              <div className="bg-slate-800/50 border border-slate-800 rounded-xl p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Score Weight Contribution Breakdown
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block">CGPA (30%)</span>
                    <span className="font-bold text-emerald-400 text-sm mt-0.5 block">
                      {selectedStudentDetail.student.score_breakdown.academic.contribution} / 30
                    </span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block">Quiz & Tests (25%)</span>
                    <span className="font-bold text-blue-400 text-sm mt-0.5 block">
                      {selectedStudentDetail.student.score_breakdown.quiz.contribution} / 25
                    </span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block">Hackathons (15%)</span>
                    <span className="font-bold text-amber-400 text-sm mt-0.5 block">
                      {selectedStudentDetail.student.score_breakdown.hackathons.contribution} / 15
                    </span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block">Coding (10%)</span>
                    <span className="font-bold text-purple-400 text-sm mt-0.5 block">
                      {selectedStudentDetail.student.score_breakdown.coding.contribution} / 10
                    </span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block">Research (10%)</span>
                    <span className="font-bold text-sky-400 text-sm mt-0.5 block">
                      {selectedStudentDetail.student.score_breakdown.research.contribution} / 10
                    </span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block">Internships (5%)</span>
                    <span className="font-bold text-emerald-400 text-sm mt-0.5 block">
                      {selectedStudentDetail.student.score_breakdown.internships.contribution} / 5
                    </span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block">Projects (5%)</span>
                    <span className="font-bold text-teal-400 text-sm mt-0.5 block">
                      {selectedStudentDetail.student.score_breakdown.projects.contribution} / 5
                    </span>
                  </div>
                  <div className="bg-slate-900/80 p-2.5 rounded-lg border border-blue-500/40 flex flex-col justify-center">
                    <span className="text-slate-300 block font-semibold">Total Overall</span>
                    <span className="font-extrabold text-white text-base mt-0.5 block">
                      {selectedStudentDetail.student.overall_score} / 100
                    </span>
                  </div>
                </div>
              </div>

              {selectedStudentDetail.loading ? (
                <div className="py-12 text-center text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-400" />
                  <p className="text-xs">Loading complete student profile...</p>
                </div>
              ) : (
                <>
                  {/* Section 1: Extracurricular & Technical Achievements */}
                  <div>
                    <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-amber-400" />
                      Extracurricular & Technical Achievements ({selectedStudentDetail.achievements.length})
                    </h4>

                    {selectedStudentDetail.achievements.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {selectedStudentDetail.achievements.map((ach, aIdx) => (
                          <div
                            key={ach.id || aIdx}
                            className="bg-slate-800/80 border border-slate-700 p-3 rounded-lg text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-white truncate max-w-[200px]" title={ach.title}>
                                {ach.title}
                              </span>
                              <span className="text-amber-400 font-bold">
                                {ach.score} pts
                              </span>
                            </div>
                            <p className="text-slate-400 text-[11px]">
                              {ach.category.toUpperCase().replace('_', ' ')} • Result: <strong className="text-slate-200">{ach.result}</strong>
                            </p>
                            {ach.organizer && (
                              <p className="text-slate-400 text-[11px]">
                                Organizer: {ach.organizer}
                              </p>
                            )}
                            {ach.proof_url && (
                              <a
                                href={ach.proof_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-blue-400 hover:underline text-[11px] pt-1"
                              >
                                <ExternalLink className="w-3 h-3" /> Proof Document
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 rounded-lg bg-slate-800/40 border border-slate-800 text-center text-xs text-slate-400">
                        No extracurricular achievements recorded yet for this student.
                      </div>
                    )}
                  </div>

                  {/* Section 2: Assessment / Marks History */}
                  <div>
                    <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-blue-400" />
                      Course Assessment Marks ({selectedStudentDetail.marks.length})
                    </h4>

                    {selectedStudentDetail.marks.length > 0 ? (
                      <div className="border border-slate-800 rounded-lg overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-800/80 text-slate-400 border-b border-slate-800">
                            <tr>
                              <th className="py-2.5 px-3">Exam / Assessment</th>
                              <th className="py-2.5 px-3 text-center">Percentage</th>
                              <th className="py-2.5 px-3 text-center">Grade</th>
                              <th className="py-2.5 px-3 text-right">Recorded Date</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {selectedStudentDetail.marks.map((m) => (
                              <tr key={m.id} className="hover:bg-slate-800/40">
                                <td className="py-2.5 px-3 text-slate-200 font-medium">
                                  {m.exam_type.toUpperCase()}
                                </td>
                                <td className="py-2.5 px-3 text-center font-bold text-white">
                                  <span
                                    className={`px-2 py-0.5 rounded ${getScoreBg(m.percentage)} ${getScoreColor(
                                      m.percentage
                                    )}`}
                                  >
                                    {m.percentage}%
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-center text-slate-300">
                                  {m.grade || '-'}
                                </td>
                                <td className="py-2.5 px-3 text-right text-slate-400">
                                  {new Date(m.created_at).toLocaleDateString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="p-4 rounded-lg bg-slate-800/40 border border-slate-800 text-center text-xs text-slate-400">
                        No individual assessment marks recorded yet for this course.
                      </div>
                    )}
                  </div>

                  {/* Section 3: Quiz Results History */}
                  <div>
                    <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-emerald-400" />
                      Quiz Attempts ({selectedStudentDetail.quizzes.length})
                    </h4>

                    {selectedStudentDetail.quizzes.length > 0 ? (
                      <div className="border border-slate-800 rounded-lg overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-800/80 text-slate-400 border-b border-slate-800">
                            <tr>
                              <th className="py-2.5 px-3">Quiz Title</th>
                              <th className="py-2.5 px-3 text-center">Raw Score</th>
                              <th className="py-2.5 px-3 text-center">Percentage</th>
                              <th className="py-2.5 px-3 text-right">Taken At</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {selectedStudentDetail.quizzes.map((q, qIdx) => (
                              <tr key={`${q.quiz_id}-${qIdx}`} className="hover:bg-slate-800/40">
                                <td className="py-2.5 px-3 text-slate-200 font-medium">
                                  {q.quiz_title}
                                </td>
                                <td className="py-2.5 px-3 text-center text-slate-300">
                                  {q.score} / {q.max_score}
                                </td>
                                <td className="py-2.5 px-3 text-center font-bold">
                                  <span
                                    className={`px-2 py-0.5 rounded ${getScoreBg(q.percentage)} ${getScoreColor(
                                      q.percentage
                                    )}`}
                                  >
                                    {q.percentage}%
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-right text-slate-400">
                                  {new Date(q.taken_at).toLocaleDateString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="p-4 rounded-lg bg-slate-800/40 border border-slate-800 text-center text-xs text-slate-400">
                        No quiz attempts recorded for this student in this course.
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>

            {/* Modal Footer */}
            <div className="border-t border-slate-800 p-4 bg-slate-800/40 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsModalOpen(false)}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Close
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
