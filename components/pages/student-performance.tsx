'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { createClient } from '@/lib/supabase/client'

interface CoursePerformance {
  id: string
  name: string
  learningPace: string
  currentScore: number
  classAvg: number
  trend: { week: string; score: number }[]
}

interface AssessmentComparison {
  category: string
  myAvg: number
  classAvg: number
}

export default function StudentPerformance() {
  const [loading, setLoading] = useState(true)
  const [coursesPerformance, setCoursesPerformance] = useState<CoursePerformance[]>([])
  const [assessmentComparison, setAssessmentComparison] = useState<AssessmentComparison[]>([])
  const [stats, setStats] = useState({
    gpa: 0,
    bestCourse: '',
    bestScore: 0,
    rank: ''
  })

  const supabase = createClient()

  useEffect(() => {
    fetchPerformanceData()
  }, [])

  const fetchPerformanceData = async () => {
    try {
      setLoading(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('student_id')
        .eq('id', user.id)
        .single()

      if (!profile?.student_id) return

      // Get enrollments with course info
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select(`
          course_id,
          learner_tag,
          courses (
            id,
            name
          )
        `)
        .eq('student_id', profile.student_id)

      if (!enrollments || enrollments.length === 0) {
        setLoading(false)
        return
      }

      const courseIds = enrollments.map(e => e.course_id)

      // Get student's marks
      const { data: studentMarks } = await supabase
        .from('marks')
        .select('course_id, percentage, exam_type, created_at')
        .eq('student_uid', profile.student_id)
        .in('course_id', courseIds)
        .not('percentage', 'is', null)
        .order('created_at', { ascending: true })

      // Get class averages for each course
      const { data: allMarks } = await supabase
        .from('marks')
        .select('course_id, percentage, exam_type,student_uid')
        .in('course_id', courseIds)
        .not('percentage', 'is', null)

      // Process course performance
      const performances: CoursePerformance[] = enrollments.map(enrollment => {
        const course = enrollment.courses as any
        const myMarks = studentMarks?.filter(m => m.course_id === enrollment.course_id) || []
        const courseAllMarks = allMarks?.filter(m => m.course_id === enrollment.course_id) || []

        // Current score
        const currentScore = myMarks.length > 0
          ? Number(myMarks[myMarks.length - 1].percentage)
          : 0

        // Class average
        const classAvg = courseAllMarks.length > 0
          ? courseAllMarks.reduce((sum, m) => sum + Number(m.percentage), 0) / courseAllMarks.length
          : 0

        // Performance trend by exam_type
        const trendMap = new Map<string, number[]>()
        myMarks.forEach(mark => {
          if (mark.exam_type) {
            if (!trendMap.has(mark.exam_type)) {
              trendMap.set(mark.exam_type, [])
            }
            trendMap.get(mark.exam_type)!.push(Number(mark.percentage))
          }
        })

        const trend = Array.from(trendMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([week, scores]) => ({
            week,
            score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          }))

        let paceLabel = 'Moderate Learner'
        if (enrollment.learner_tag === 'fast') paceLabel = 'Fast Learner'
        else if (enrollment.learner_tag === 'slow') paceLabel = 'Slow Learner'

        return {
          id: course.id,
          name: course.name,
          learningPace: paceLabel,
          currentScore: Math.round(currentScore),
          classAvg: Math.round(classAvg),
          trend: trend.length > 0 ? trend : [{ week: 'No data', score: 0 }]
        }
      })

      // Calculate assessment breakdown
      const examTypeMap = new Map<string, { myScores: number[], allScores: number[] }>()
      
      studentMarks?.forEach(mark => {
        const type = mark.exam_type || 'Other'
        if (!examTypeMap.has(type)) {
          examTypeMap.set(type, { myScores: [], allScores: [] })
        }
        examTypeMap.get(type)!.myScores.push(Number(mark.percentage))
      })

      allMarks?.forEach(mark => {
        const type = mark.exam_type || 'Other'
        if (examTypeMap.has(type)) {
          examTypeMap.get(type)!.allScores.push(Number(mark.percentage))
        }
      })

      const comparison: AssessmentComparison[] = Array.from(examTypeMap.entries()).map(([category, data]) => ({
        category,
        myAvg: Math.round(data.myScores.reduce((a, b) => a + b, 0) / data.myScores.length),
        classAvg: Math.round(data.allScores.reduce((a, b) => a + b, 0) / data.allScores.length)
      }))

      // Calculate GPA (simplified: average of all scores / 25)
      const allScores = studentMarks?.map(m => Number(m.percentage)) || []
      const avgPercentage = allScores.length > 0
        ? allScores.reduce((a, b) => a + b, 0) / allScores.length
        : 0
      const gpa = (avgPercentage / 100) * 4

      // Find best course
      const bestCourse = performances.reduce((best, curr) => 
        curr.currentScore > best.currentScore ? curr : best
      , performances[0] || { name: 'N/A', currentScore: 0 })

      // Calculate rank (simplified)
      const totalStudents = new Set(allMarks?.map(m => m.student_uid)).size
      const betterStudents = allMarks?.filter(m => Number(m.percentage) > avgPercentage).length || 0
      const rankPercentile = totalStudents > 0 ? Math.round((betterStudents / totalStudents) * 100) : 0

      setCoursesPerformance(performances)
      setAssessmentComparison(comparison)
      setStats({
        gpa: Math.round(gpa * 100) / 100,
        bestCourse: bestCourse.name,
        bestScore: bestCourse.currentScore,
        rank: `Top ${rankPercentile}%`
      })

    } catch (error) {
      console.error('Error fetching performance data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-slate-400 text-lg">Loading performance data...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Performance Analytics</h1>
        <p className="text-slate-400">Track your academic progress across all courses</p>
      </div>

      <div className="space-y-6">
        {coursesPerformance.map((course) => (
          <Card key={course.id} className="bg-slate-800 border-slate-700">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-white">{course.name}</CardTitle>
                  <CardDescription className="text-slate-400">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium mt-2 ${
                      course.learningPace === 'Fast Learner' ? 'bg-blue-500/20 text-blue-300' :
                      course.learningPace === 'Moderate Learner' ? 'bg-green-500/20 text-green-300' :
                      'bg-amber-500/20 text-amber-300'
                    }`}>
                      {course.learningPace}
                    </span>
                  </CardDescription>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-blue-400">{course.currentScore}%</p>
                  <p className="text-xs text-slate-400">Class Avg: {course.classAvg}%</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {course.trend.length > 1 && course.trend[0].week !== 'No data' && (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={course.trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="week" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" domain={[0, 100]} />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }} />
                    <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} name="Your Score" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Overall Assessment Breakdown */}
      {assessmentComparison.length > 0 && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Assessment Performance</CardTitle>
            <CardDescription className="text-slate-400">Your scores vs class average across different assessments</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={assessmentComparison}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="category" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }} />
                <Legend />
                <Bar dataKey="myAvg" fill="#8b5cf6" name="Your Average" />
                <Bar dataKey="classAvg" fill="#ec4899" name="Class Average" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Statistics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-300">Overall GPA</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-white">{stats.gpa}</p>
            <p className="text-xs text-slate-400 mt-1">Out of 4.0</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-300">Best Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-white truncate">{stats.bestCourse}</p>
            <p className="text-xs text-slate-400 mt-1">{stats.bestScore}%</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-300">Class Ranking</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-white">{stats.rank}</p>
            <p className="text-xs text-slate-400 mt-1">Of all students</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}