'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const subjectsData = [
  {
    id: 1,
    name: 'Web Development Fundamentals',
    pace: 'Fast Learner',
    score: 92,
    progress: 85,
    instructor: 'Dr. Sarah Chen',
    performanceTrend: [
      { week: 'Week 1', score: 78 },
      { week: 'Week 2', score: 82 },
      { week: 'Week 3', score: 87 },
      { week: 'Week 4', score: 92 },
    ]
  },
  {
    id: 2,
    name: 'Data Structures & Algorithms',
    pace: 'Moderate Learner',
    score: 74,
    progress: 62,
    instructor: 'Prof. Michael Kumar',
    performanceTrend: [
      { week: 'Week 1', score: 65 },
      { week: 'Week 2', score: 68 },
      { week: 'Week 3', score: 71 },
      { week: 'Week 4', score: 74 },
    ]
  },
  {
    id: 3,
    name: 'Database Design',
    pace: 'Slow Learner',
    score: 58,
    progress: 45,
    instructor: 'Prof. Emma Watson',
    performanceTrend: [
      { week: 'Week 1', score: 52 },
      { week: 'Week 2', score: 54 },
      { week: 'Week 3', score: 56 },
      { week: 'Week 4', score: 58 },
    ]
  },
]

export default function StudentDashboard() {
  const avgScore = Math.round(subjectsData.reduce((sum, s) => sum + s.score, 0) / subjectsData.length)
  const fastCourses = subjectsData.filter(s => s.pace.includes('Fast')).length

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-300">Average Score</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-white">{avgScore}%</p>
            <p className="text-xs text-slate-400 mt-1">Across all courses</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-300">Enrolled Courses</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-white">{subjectsData.length}</p>
            <p className="text-xs text-slate-400 mt-1">Active this semester</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-300">Fast Learner In</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-400">{fastCourses}</p>
            <p className="text-xs text-slate-400 mt-1">Subjects</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-300">Study Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-white">24.5</p>
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
                        style={{ width: `${subject.progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Performance Trend for this subject */}
              <div>
                <p className="text-sm font-semibold text-slate-300 mb-4">Performance Trend</p>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={subject.performanceTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="week" stroke="#9ca3af" style={{ fontSize: '12px' }} />
                    <YAxis stroke="#9ca3af" style={{ fontSize: '12px' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }} />
                    <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* AI Recommendations */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">AI-Powered Recommendations</CardTitle>
          <CardDescription className="text-slate-400">Personalized learning suggestions based on your pace in each subject</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-sm text-white">
              <span className="font-semibold">Web Development:</span> You're progressing fast! Consider peer tutoring opportunities or advanced topics.
            </p>
          </div>
          <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
            <p className="text-sm text-white">
              <span className="font-semibold">Data Structures:</span> Steady progress. Keep up your current pace and attend office hours for clarification.
            </p>
          </div>
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <p className="text-sm text-white">
              <span className="font-semibold">Database Design:</span> Consider joining study groups. Additional practice problems are available in course materials.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
