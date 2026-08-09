'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'

interface Course {
  id: string
  name: string
  instructor: string
  credits: number
  semester: string
  pace: string
  progress: number
  status: 'Active' | 'Upcoming'
  code: string
}

export default function StudentCourses() {
  const [loading, setLoading] = useState(true)
  const [courses, setCourses] = useState<Course[]>([])
  
  const supabase = createClient()

  useEffect(() => {
    fetchCourses()
  }, [])

  const fetchCourses = async () => {
    try {
      setLoading(true)

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get student profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('student_id')
        .eq('id', user.id)
        .single()

      if (!profile?.student_id) return

      // Get enrollments with course details
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select(`
          course_id,
          learner_tag,
          courses (
            id,
            name,
            code,
            course_teachers (
              profiles (
                full_name
              )
            )
          )
        `)
        .eq('student_id', profile.student_id)

      if (!enrollments) return

      // Get marks to calculate progress
      const courseIds = enrollments.map(e => e.course_id)
      const { data: marks } = await supabase
        .from('marks')
        .select('course_id, percentage, exam_type')
        .eq('student_uid', profile.student_id)
        .in('course_id', courseIds)
        .not('percentage', 'is', null)

      // Process courses
      const processedCourses: Course[] = enrollments.map(enrollment => {
        const course = enrollment.courses as any
        const courseMarks = marks?.filter(m => m.course_id === enrollment.course_id) || []
        
        // Calculate progress based on number of assessments completed
        const totalExpectedTests = 10
        const progress = Math.min((courseMarks.length / totalExpectedTests) * 100, 100)

        // Determine pace label
        let paceLabel = 'Moderate Learner'
        if (enrollment.learner_tag === 'fast') paceLabel = 'Fast Learner'
        else if (enrollment.learner_tag === 'slow') paceLabel = 'Slow Learner'

        const instructor = course?.course_teachers?.[0]?.profiles?.full_name || 'TBA'

        return {
          id: course.id,
          name: course.name,
          instructor,
          credits: 3, // Default, you can add this to courses table if needed
          semester: 'Fall 2024', // You can calculate this from enrollment date
          pace: paceLabel,
          progress: Math.round(progress),
          status: 'Active' as const,
          code: course.code || 'N/A'
        }
      })

      setCourses(processedCourses)

    } catch (error) {
      console.error('Error fetching courses:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-slate-400 text-lg">Loading courses...</div>
        </div>
      </div>
    )
  }

  const activeCourses = courses.filter(c => c.status === 'Active')
  const upcomingCourses = courses.filter(c => c.status === 'Upcoming')

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Your Courses</h1>
        <p className="text-slate-400">View all enrolled and upcoming courses</p>
      </div>

      {/* Active Courses */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-white">Active Courses ({activeCourses.length})</h2>
        {activeCourses.length === 0 ? (
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="pt-6 text-center text-slate-400">
              No active courses found
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {activeCourses.map((course) => (
              <Card key={course.id} className="bg-slate-800 border-slate-700 hover:border-blue-500 transition cursor-pointer">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-white text-lg">{course.name}</h3>
                      <p className="text-sm text-slate-400">{course.instructor}</p>
                      <p className="text-xs text-slate-500 mt-1">{course.code}</p>
                    </div>
                    <div className="text-right">
                      <Badge 
                        variant="outline" 
                        className={`mb-2 ${
                          course.pace === 'Fast Learner' ? 'border-blue-500 text-blue-300' :
                          course.pace === 'Slow Learner' ? 'border-amber-500 text-amber-300' :
                          'border-green-500 text-green-300'
                        }`}
                      >
                        {course.pace}
                      </Badge>
                      <p className="text-sm text-slate-400">{course.credits} credits</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-300">Progress</span>
                      <span className="text-white font-medium">{course.progress}%</span>
                    </div>
                    <div className="w-full bg-slate-600 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all"
                        style={{ width: '${course.progress}%' }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Upcoming Courses */}
      {upcomingCourses.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-white">Upcoming Courses ({upcomingCourses.length})</h2>
          <div className="grid grid-cols-1 gap-4">
            {upcomingCourses.map((course) => (
              <Card key={course.id} className="bg-slate-800/50 border-slate-700 opacity-75">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-white text-lg">{course.name}</h3>
                      <p className="text-sm text-slate-400">{course.instructor}</p>
                      <p className="text-xs text-slate-500 mt-1">Starts in {course.semester}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant="secondary">{course.credits} credits</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}