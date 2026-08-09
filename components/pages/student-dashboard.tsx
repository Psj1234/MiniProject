'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { createClient } from '@/lib/supabase/client'

interface SubjectData {
  id: string
  name: string
  pace: string
  score: number
  progress: number
  instructor: string
  performanceTrend: { week: string; score: number }[]
}

export default function StudentDashboard() {
  const [loading, setLoading] = useState(true)
  const [subjectsData, setSubjectsData] = useState<SubjectData[]>([])
  const [stats, setStats] = useState({
    avgScore: 0,
    enrolledCourses: 0,
    fastCourses: 0,
    studyHours: 24.5
  })

  const supabase = createClient()

  useEffect(() => {
    fetchStudentData()
  }, [])

  const fetchStudentData = async () => {
    try {
      setLoading(true)

      console.log('🔍 Fetching student dashboard data...')

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      if (userError) {
        console.error('❌ Error getting user:', userError)
        setLoading(false)
        return
      }

      if (!user) {
        console.log('⚠ No user logged in')
        setLoading(false)
        return
      }

      console.log('✅ User found:', user.id)

      // Get student profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('student_id')
        .eq('id', user.id)
        .single()

      if (profileError) {
        console.error('❌ Error fetching profile:', profileError)
        setLoading(false)
        return
      }

      if (!profile?.student_id) {
        console.log('⚠ No student_id found')
        setLoading(false)
        return
      }

      console.log('👤 Student ID:', profile.student_id)

      // Get enrollments with course info
      const { data: enrollments, error: enrollError } = await supabase
        .from('enrollments')
        .select(`
          course_id,
          learner_tag,
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
        .eq('student_id', profile.student_id)

      if (enrollError) {
        console.error('❌ Error fetching enrollments:', enrollError)
        setLoading(false)
        return
      }

      if (!enrollments || enrollments.length === 0) {
        console.log('⚠ No enrollments found')
        setLoading(false)
        return
      }

      console.log('📚 Enrollments found:', enrollments.length)

      // Get marks for all enrolled courses
      const courseIds = enrollments.map(e => e.course_id)
      const { data: marks, error: marksError } = await supabase
        .from('marks')
        .select('course_id, percentage, exam_type, created_at')
        .eq('student_uid', profile.student_id)
        .in('course_id', courseIds)
        .not('percentage', 'is', null)
        .order('created_at', { ascending: true })

      if (marksError) {
        console.error('❌ Error fetching marks:', marksError)
      }

      console.log('📝 Marks found:', marks?.length || 0)

      // Process data for each subject
      const subjects: SubjectData[] = enrollments.map(enrollment => {
        const course = enrollment.courses as any
        const courseMarks = marks?.filter(m => m.course_id === enrollment.course_id) || []
        

        // Calculate current score (latest or average)
        const currentScore = courseMarks.length > 0
          ? Number(courseMarks[courseMarks.length - 1].percentage)
          : 0

        // Calculate progress (percentage of assessments completed)
        const totalExpectedTests = 10 // You can adjust this
        const progress = Math.min((courseMarks.length / totalExpectedTests) * 100, 100)

        // Group marks by exam_type for trend
        const trendMap = new Map<string, number[]>()
        courseMarks.forEach(mark => {
          if (mark.exam_type) {
            if (!trendMap.has(mark.exam_type)) {
              trendMap.set(mark.exam_type, [])
            }
            trendMap.get(mark.exam_type)!.push(Number(mark.percentage))
          }
        })

        // Create performance trend
        const performanceTrend = Array.from(trendMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([week, scores]) => ({
            week,
            score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          }))

        // Get instructor name
        const instructor = course?.course_teachers?.[0]?.profiles?.full_name || 'Unknown'

        // Determine pace label
        let paceLabel = 'Moderate Learner'
        if (enrollment.learner_tag === 'fast') paceLabel = 'Fast Learner'
        else if (enrollment.learner_tag === 'slow') paceLabel = 'Slow Learner'

        return {
          id: course.id,
          name: course.name,
          pace: paceLabel,
          score: Math.round(currentScore),
          progress: Math.round(progress),
          instructor,
          performanceTrend: performanceTrend.length > 0 ? performanceTrend : [{ week: 'No data', score: 0 }]
        }
      })

      // Calculate stats
      const avgScore = subjects.length > 0
        ? Math.round(subjects.reduce((sum, s) => sum + s.score, 0) / subjects.length)
        : 0

      const fastCourses = subjects.filter(s => s.pace.includes('Fast')).length

      console.log('✅ Dashboard data processed:', {
        subjects: subjects.length,
        avgScore,
        fastCourses
      })

      setSubjectsData(subjects)
      setStats({
        avgScore,
        enrolledCourses: subjects.length,
        fastCourses,
        studyHours: 24.5 // This would need to come from a time tracking feature
      })

    } catch (error) {
      console.error('💥 Error fetching student data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-slate-400 text-lg">Loading your dashboard...</div>
        </div>
      </div>
    )
  }

  if (subjectsData.length === 0) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex flex-col items-center justify-center h-64 space-y-4">
          <div className="text-slate-400 text-lg">No courses enrolled yet</div>
          <button 
            onClick={fetchStudentData}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-300">Average Score</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-white">{stats.avgScore}%</p>
            <p className="text-xs text-slate-400 mt-1">Across all courses</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-300">Enrolled Courses</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-white">{stats.enrolledCourses}</p>
            <p className="text-xs text-slate-400 mt-1">Active this semester</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-300">Fast Learner In</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-400">{stats.fastCourses}</p>
            <p className="text-xs text-slate-400 mt-1">Subjects</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-300">Study Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-white">{stats.studyHours}</p>
            <p className="text-xs text-slate-400 mt-1">This week</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-Subject Performance */}
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-white">Course Performance Breakdown</h2>
        {subjectsData.map((subject) => (
          <Card key={subject.id} className="bg-slate-800 border-slate-700">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-white">{subject.name}</CardTitle>
                  <CardDescription className="text-slate-400">
                    Instructor: {subject.instructor}
                  </CardDescription>
                </div>
                <span className={`text-sm font-semibold px-3 py-1 rounded-full whitespace-nowrap ${
                  subject.pace.includes('Fast') ? 'bg-blue-500/20 text-blue-300' :
                  subject.pace.includes('Moderate') ? 'bg-green-500/20 text-green-300' :
                  'bg-amber-500/20 text-amber-300'
                }`}>
                  {subject.pace}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Score and Progress */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-300 mb-2">Current Score</p>
                  <p className="text-3xl font-bold text-white">{subject.score}%</p>
                </div>
                <div>
                  <p className="text-sm text-slate-300 mb-2">Course Progress</p>
                  <div className="space-y-2">
                    <p className="text-2xl font-bold text-white">{subject.progress}%</p>
                    <div className="w-full bg-slate-600 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all"
                        style={{ width: '${subject.progress}%' }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Performance Trend for this subject */}
              {subject.performanceTrend.length > 1 && subject.performanceTrend[0].week !== 'No data' && (
                <div>
                  <p className="text-sm font-semibold text-slate-300 mb-4">Performance Trend</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={subject.performanceTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="week" stroke="#9ca3af" style={{ fontSize: '12px' }} />
                      <YAxis stroke="#9ca3af" style={{ fontSize: '12px' }} domain={[0, 100]} />
                      <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }} />
                      <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}