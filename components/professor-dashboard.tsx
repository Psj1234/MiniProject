'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const classPerformanceData = [
  { category: 'Fast Learners', students: 35, avgScore: 88 },
  { category: 'Moderate Learners', students: 50, avgScore: 75 },
  { category: 'Slow Learners', students: 15, avgScore: 62 },
]

const studentDistribution = [
  { week: 'Week 1', fastLearners: 20, moderate: 45, slowLearners: 10 },
  { week: 'Week 2', fastLearners: 28, moderate: 50, slowLearners: 12 },
  { week: 'Week 3', fastLearners: 32, moderate: 48, slowLearners: 15 },
  { week: 'Week 4', fastLearners: 35, moderate: 50, slowLearners: 15 },
  { week: 'Week 5', fastLearners: 35, moderate: 50, slowLearners: 15 },
]

const classesData = [
  { id: 1, name: 'Web Development Fundamentals', students: 100, avgScore: 82, fastLearners: 35 },
  { id: 2, name: 'Data Structures & Algorithms', students: 85, avgScore: 76, fastLearners: 28 },
  { id: 3, name: 'Database Design', students: 72, avgScore: 71, fastLearners: 22 },
]

const studentListData = [
  { id: 1, name: 'Alice Johnson', pace: 'Fast Learner', score: 92, assignments: '15/15' },
  { id: 2, name: 'Bob Smith', pace: 'Moderate Learner', score: 78, assignments: '14/15' },
  { id: 3, name: 'Carol Davis', pace: 'Fast Learner', score: 88, assignments: '15/15' },
  { id: 4, name: 'David Lee', pace: 'Slow Learner', score: 65, assignments: '12/15' },
  { id: 5, name: 'Emma Wilson', pace: 'Moderate Learner', score: 74, assignments: '13/15' },
]

export default function ProfessorDashboard() {
  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-300">Total Students</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-white">257</p>
            <p className="text-xs text-slate-400 mt-1">Across 3 courses</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-300">Class Average</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-white">76.3%</p>
            <p className="text-xs text-slate-400 mt-1">Overall performance</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-300">Fast Learners</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-white">85</p>
            <p className="text-xs text-slate-400 mt-1">33% of total</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-300">Need Support</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-white">42</p>
            <p className="text-xs text-slate-400 mt-1">Slow learners requiring assistance</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different views */}
      <Tabs defaultValue="analytics" className="space-y-4">
        <TabsList className="bg-slate-700 border border-slate-600">
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="classes">Classes</TabsTrigger>
          <TabsTrigger value="students">Students</TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="space-y-6">
          {/* Performance by Learning Pace */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Class Performance by Learning Pace</CardTitle>
              <CardDescription className="text-slate-400">Average scores and student distribution</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={classPerformanceData}>
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
            </CardContent>
          </Card>

          {/* Learner Distribution Over Time */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Student Distribution Trend</CardTitle>
              <CardDescription className="text-slate-400">How student categories evolve each week</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={studentDistribution}>
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="classes" className="space-y-6">
          {/* Classes Overview */}
          <div className="space-y-4">
            {classesData.map((course) => (
              <Card key={course.id} className="bg-slate-800 border-slate-700">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-white text-lg">{course.name}</h3>
                      <p className="text-sm text-slate-400">{course.students} students enrolled</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-white">{course.avgScore}%</p>
                      <p className="text-xs text-slate-400">Class average</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-3 bg-slate-700/50 rounded-lg border border-slate-600">
                      <p className="text-xs text-slate-400">Fast Learners</p>
                      <p className="text-lg font-semibold text-blue-400">{course.fastLearners}</p>
                    </div>
                    <div className="p-3 bg-slate-700/50 rounded-lg border border-slate-600">
                      <p className="text-xs text-slate-400">Moderate</p>
                      <p className="text-lg font-semibold text-green-400">{Math.round(course.students * 0.5)}</p>
                    </div>
                    <div className="p-3 bg-slate-700/50 rounded-lg border border-slate-600">
                      <p className="text-xs text-slate-400">Need Support</p>
                      <p className="text-lg font-semibold text-amber-400">{Math.round(course.students * 0.15)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="students" className="space-y-6">
          {/* Student List */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Student Performance List</CardTitle>
              <CardDescription className="text-slate-400">Current student status and engagement</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-4 font-semibold text-slate-300">Name</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-300">Learning Pace</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-300">Score</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-300">Assignments</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-300">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentListData.map((student) => (
                      <tr key={student.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition">
                        <td className="py-3 px-4 text-white">{student.name}</td>
                        <td className="py-3 px-4">
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                            student.pace === 'Fast Learner' ? 'bg-blue-500/20 text-blue-300' :
                            student.pace === 'Moderate Learner' ? 'bg-green-500/20 text-green-300' :
                            'bg-amber-500/20 text-amber-300'
                          }`}>
                            {student.pace}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-white font-medium">{student.score}%</td>
                        <td className="py-3 px-4 text-slate-400">{student.assignments}</td>
                        <td className="py-3 px-4">
                          <span className={`text-xs font-medium px-2 py-1 rounded ${
                            student.score >= 80 ? 'bg-green-500/20 text-green-300' :
                            student.score >= 70 ? 'bg-blue-500/20 text-blue-300' :
                            'bg-red-500/20 text-red-300'
                          }`}>
                            {student.score >= 80 ? 'On Track' : student.score >= 70 ? 'Progressing' : 'At Risk'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
