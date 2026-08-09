'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useMemo } from 'react'

// Define the shape of the student results
// This must match the type in ProfessorQuizzes.tsx
interface StudentQuizResult {
  quiz_result_id: string
  student_uid: number
  student_name: string
  score: number
  total_questions: number
  percentage: number
  time_taken_seconds: number
  submitted_at: string
}

interface QuizAnalysisProps {
  results: StudentQuizResult[]
}

// Helper to format time
const formatTime = (seconds: number) => {
  if (isNaN(seconds) || seconds === null) return "N/A"
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export default function QuizAnalysis({ results }: QuizAnalysisProps) {
  // Use memo to avoid recalculating on every render
  const stats = useMemo(() => {
    if (!results || results.length === 0) {
      return {
        avgPercentage: 0,
        avgTime: 0,
        scoreDistribution: [],
      }
    }

    const totalPercentage = results.reduce((acc, r) => acc + r.percentage, 0)
    const totalTime = results.reduce((acc, r) => acc + (r.time_taken_seconds || 0), 0)
    const validTimeResults = results.filter(r => r.time_taken_seconds !== null).length

    const distribution = [
      { name: '< 50%', count: 0 },
      { name: '50-69%', count: 0 },
      { name: '70-89%', count: 0 },
      { name: '90-100%', count: 0 },
    ]

    results.forEach(r => {
      if (r.percentage < 50) distribution[0].count++
      else if (r.percentage < 70) distribution[1].count++
      else if (r.percentage < 90) distribution[2].count++
      else distribution[3].count++
    })

    return {
      avgPercentage: Math.round(totalPercentage / results.length),
      avgTime: validTimeResults > 0 ? Math.round(totalTime / validTimeResults) : 0,
      scoreDistribution: distribution,
    }
  }, [results])

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white text-lg">Class Analysis</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Stats Cards */}
        <div className="md:col-span-1 space-y-4">
          <Card className="bg-slate-700/50 border-slate-600">
            <CardContent className="pt-6">
              <p className="text-sm text-slate-400 mb-1">Average Score</p>
              <p className="text-3xl font-bold text-blue-400">{stats.avgPercentage}%</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-700/50 border-slate-600">
            <CardContent className="pt-6">
              <p className="text-sm text-slate-400 mb-1">Average Time Taken</p>
              <p className="text-3xl font-bold text-white">{formatTime(stats.avgTime)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Bar Chart */}
        <div className="md:col-span-2">
          <p className="text-sm text-slate-400 mb-2">Score Distribution</p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.scoreDistribution} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={12} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                  labelStyle={{ color: '#f1f5f9' }}
                />
                <Bar dataKey="count" fill="#38bdf8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}