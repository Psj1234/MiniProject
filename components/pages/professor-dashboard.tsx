'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { createClient } from '@/lib/supabase/client'

export default function ProfessorDashboard() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState({
    totalStudents: 0,
    classAverage: 0,
    fastLearners: 0,
    slowLearners: 0,
    moderateLearners: 0,
    courseCount: 0
  })
  const [performanceData, setPerformanceData] = useState<any[]>([])
  const [distributionData, setDistributionData] = useState<any[]>([])
  
  const supabase = createClient()

  useEffect(() => {
    fetchAnalytics()
  }, [])

  const fetchAnalytics = async () => {
    try {
      setLoading(true)
      setError(null)
      
      console.log('🔍 Starting analytics fetch...')
      
      // Get current user (teacher)
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      if (userError) {
        console.error('❌ Error getting user:', userError)
        setError('Failed to get user information')
        setLoading(false)
        return
      }

      if (!user) {
        console.log('⚠ No user logged in')
        setError('No user logged in')
        setLoading(false)
        return
      }

      console.log('✅ User found:', user.id)

      // Get teacher's courses
      const { data: teacherCourses, error: coursesError } = await supabase
        .from('course_teachers')
        .select('course_id')
        .eq('teacher_id', user.id)

      if (coursesError) {
        console.error('❌ Error fetching courses:', coursesError)
        setError('Failed to fetch courses: ' + coursesError.message)
        setLoading(false)
        return
      }

      console.log('📚 Teacher courses:', teacherCourses)

      const courseIds = teacherCourses?.map(ct => ct.course_id) || []
      
      if (courseIds.length === 0) {
        console.log('⚠ No courses found for this teacher')
        setError('No courses assigned to this teacher')
        setLoading(false)
        return
      }

      console.log('📋 Course IDs:', courseIds)

      // Get all enrollments for teacher's courses
      const { data: enrollments, error: enrollError } = await supabase
        .from('enrollments')
        .select('student_id, learner_tag, course_id')
        .in('course_id', courseIds)

      if (enrollError) {
        console.error('❌ Error fetching enrollments:', enrollError)
        setError('Failed to fetch enrollments: ' + enrollError.message)
        setLoading(false)
        return
      }

      console.log('👥 Enrollments found:', enrollments?.length)
      console.log('📊 Enrollments data:', enrollments)

      // Calculate basic stats
      const uniqueStudents = new Set(enrollments?.map(e => e.student_id) || [])
      const totalStudents = uniqueStudents.size
      
      // Count by learner tag
      const fastCount = enrollments?.filter(e => e.learner_tag === 'fast').length || 0
      const slowCount = enrollments?.filter(e => e.learner_tag === 'slow').length || 0
      const moderateCount = enrollments?.filter(e => !e.learner_tag || e.learner_tag === null).length || 0

      console.log('📈 Stats calculated:', {
        totalStudents,
        fastCount,
        slowCount,
        moderateCount
      })

      // Get marks for all students in these courses
      const { data: marks, error: marksError } = await supabase
        .from('marks')
        .select('student_uid, percentage, course_id, created_at, exam_type')
        .in('course_id', courseIds)
        .not('percentage', 'is', null)

      if (marksError) {
        console.error('❌ Error fetching marks:', marksError)
        // Don't return, continue with zero marks
      }

      console.log('📝 Marks found:', marks?.length || 0)

      // Calculate overall class average
      const validMarks = marks?.filter(m => m.percentage !== null && m.percentage !== undefined) || []
      const classAverage = validMarks.length > 0
        ? validMarks.reduce((sum, m) => sum + Number(m.percentage), 0) / validMarks.length
        : 0

      console.log('🎯 Class average:', classAverage)

      // Map student_id to learner_tag
      const studentTagMap = new Map<number, string>()
      enrollments?.forEach(e => {
        const tag = e.learner_tag || 'moderate'
        studentTagMap.set(e.student_id, tag)
      })

      // Calculate average scores by learner category
      const scoresByCategory = {
        fast: [] as number[],
        moderate: [] as number[],
        slow: [] as number[]
      }

      validMarks.forEach(mark => {
        const tag = studentTagMap.get(mark.student_uid) || 'moderate'
        const percentage = Number(mark.percentage)
        
        if (tag === 'fast') {
          scoresByCategory.fast.push(percentage)
        } else if (tag === 'slow') {
          scoresByCategory.slow.push(percentage)
        } else {
          scoresByCategory.moderate.push(percentage)
        }
      })

      const calcAvg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0

      console.log('📊 Scores by category:', {
        fast: scoresByCategory.fast.length,
        moderate: scoresByCategory.moderate.length,
        slow: scoresByCategory.slow.length
      })

      // Performance data for bar chart
      const performance = [
        {
          category: 'Fast Learners',
          students: fastCount,
          avgScore: Math.round(calcAvg(scoresByCategory.fast))
        },
        {
          category: 'Moderate Learners',
          students: moderateCount,
          avgScore: Math.round(calcAvg(scoresByCategory.moderate))
        },
        {
          category: 'Slow Learners',
          students: slowCount,
          avgScore: Math.round(calcAvg(scoresByCategory.slow))
        }
      ]

      console.log('📊 Performance data:', performance)

      // Distribution over time (using exam_type from marks table)
      const distributionByWeek: { [key: string]: any } = {}
      
      // Get all unique exam types (weeks) from marks
      const examTypes = new Set(validMarks.map(m => m.exam_type).filter(Boolean))
      const sortedExamTypes = Array.from(examTypes).sort()
      
      console.log('📅 Exam types found:', sortedExamTypes)

      // If we have exam types, use those
      if (sortedExamTypes.length > 0) {
        // Initialize each exam type (week)
        sortedExamTypes.forEach(examType => {
          const weekLabel = examType || 'Unknown'
          distributionByWeek[weekLabel] = {
            week: weekLabel,
            fastLearners: 0,
            moderate: 0,
            slowLearners: 0
          }
        })

        // Group marks by exam_type and count unique students per category
        const studentsPerWeek: { [key: string]: Set<number> } = {}
        
        validMarks.forEach(mark => {
          if (!mark.exam_type) return
          
          const weekLabel = mark.exam_type
          if (!studentsPerWeek[weekLabel]) {
            studentsPerWeek[weekLabel] = new Set()
          }
          studentsPerWeek[weekLabel].add(mark.student_uid)
        })

        // Count unique students per category per week
        Object.entries(studentsPerWeek).forEach(([weekLabel, studentSet]) => {
          studentSet.forEach(studentId => {
            const tag = studentTagMap.get(studentId) || 'moderate'
            if (tag === 'fast') {
              distributionByWeek[weekLabel].fastLearners++
            } else if (tag === 'slow') {
              distributionByWeek[weekLabel].slowLearners++
            } else {
              distributionByWeek[weekLabel].moderate++
            }
          })
        })
      } else {
        // Fallback: Use generic weeks with current enrollment data
        for (let i = 1; i <= 5; i++) {
          const weekLabel = 'Week ${i}'
          distributionByWeek[weekLabel] = {
            week: weekLabel,
            fastLearners: fastCount,
            moderate: moderateCount,
            slowLearners: slowCount
          }
        }
      }

      const distribution = Object.values(distributionByWeek)

      console.log('📈 Distribution data:', distribution)

      // Update state
      setStats({
        totalStudents,
        classAverage: Math.round(classAverage * 10) / 10,
        fastLearners: fastCount,
        slowLearners: slowCount,
        moderateLearners: moderateCount,
        courseCount: courseIds.length
      })
      setPerformanceData(performance)
      setDistributionData(distribution)

      console.log('✅ Analytics fetch complete!')

    } catch (error: any) {
      console.error('💥 Unexpected error:', error)
      setError('An unexpected error occurred: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-slate-400 text-lg">Loading analytics...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center space-y-4">
            <div className="text-red-400 text-lg">{error}</div>
            <button 
              onClick={fetchAnalytics}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Analytics Overview</h1>
        <p className="text-slate-400">View aggregated analytics across all your classes</p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-300">Total Students</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-white">{stats.totalStudents}</p>
            <p className="text-xs text-slate-400 mt-1">Across {stats.courseCount} course{stats.courseCount !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-300">Class Average</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-white">{stats.classAverage}%</p>
            <p className="text-xs text-slate-400 mt-1">Overall performance</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-300">Fast Learners</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-white">{stats.fastLearners}</p>
            <p className="text-xs text-slate-400 mt-1">
              {stats.totalStudents > 0 ? Math.round((stats.fastLearners / stats.totalStudents) * 100) : 0}% of total
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-300">Need Support</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-white">{stats.slowLearners}</p>
            <p className="text-xs text-slate-400 mt-1">Slow learners requiring assistance</p>
          </CardContent>
        </Card>
      </div>

      {/* Performance by Learning Pace */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Class Performance by Learning Pace</CardTitle>
          <CardDescription className="text-slate-400">Average scores and student distribution</CardDescription>
        </CardHeader>
        <CardContent>
          {performanceData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="category" stroke="#9ca3af" />
                <YAxis yAxisId="left" stroke="#9ca3af" />
                <YAxis yAxisId="right" orientation="right" stroke="#9ca3af" />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }} />
                <Legend />
                <Bar yAxisId="left" dataKey="avgScore" fill="#3b82f6" name="Avg Score (%)" />
                <Bar yAxisId="right" dataKey="students" fill="#10b981" name="Students" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-slate-400">
              No performance data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Learner Distribution Over Time */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Student Distribution Trend</CardTitle>
          <CardDescription className="text-slate-400">How student categories evolve each week</CardDescription>
        </CardHeader>
        <CardContent>
          {distributionData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={distributionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="week" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }} />
                <Legend />
                <Line type="monotone" dataKey="fastLearners" stroke="#3b82f6" strokeWidth={2} name="Fast Learners" />
                <Line type="monotone" dataKey="moderate" stroke="#10b981" strokeWidth={2} name="Moderate" />
                <Line type="monotone" dataKey="slowLearners" stroke="#f59e0b" strokeWidth={2} name="Slow Learners" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-slate-400">
              No distribution data available
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}