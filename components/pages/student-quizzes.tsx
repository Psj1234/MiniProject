'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Clock, CheckCircle, TrendingUp, Loader2, ChevronRight, ArrowLeft, Target, Users, Trophy, AlertTriangle, Zap, Award, Filter } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Quiz {
  id: string
  title: string
  course: string
  course_id: string
  questions: number
  status: 'available' | 'completed'
  score?: number
  maxScore?: number
  percentage?: number
  timeLimit?: number
  availableUntil?: string
  quiz_result_id?: string
  time_taken_seconds?: number
}

interface QuestionAnalysis {
  id: number
  text: string
  options: string[]
  correctAnswer: string
  yourAnswer: string | null
  isCorrect: boolean
  timeSpent: number
  avgTimeSpent: number
  successRate: number
  difficulty?: string
  topic_id?: string
  topic_name?: string
}

interface TopicPerformance {
  topic_id: string
  topic_name: string
  correct: number
  total: number
  percentage: number
  classAverage?: number
  yourRank?: number
  totalStudents?: number
  percentile?: number
}

interface ClassRank {
  rank: number
  totalStudents: number
  percentile: number
}

interface KeyInsight {
  type: 'improve' | 'strong' | 'time' | 'difficulty'
  title: string
  description: string
  questions?: number[]
}

interface StudentQuizzesProps {
  onSelectQuiz: (quizId: string) => void
}

export default function StudentQuizzes({ onSelectQuiz }: StudentQuizzesProps) {
  const [view, setView] = useState<'list' | 'analysis'>('list')
  const [loading, setLoading] = useState(true)
  const [availableQuizzes, setAvailableQuizzes] = useState<Quiz[]>([])
  const [completedQuizzes, setCompletedQuizzes] = useState<Quiz[]>([])
  
  // Analysis state
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [selectedQuizId, setSelectedQuizId] = useState('')
  const [selectedResultId, setSelectedResultId] = useState('')
  const [quizTitle, setQuizTitle] = useState('')
  const [questions, setQuestions] = useState<QuestionAnalysis[]>([])
  const [filteredQuestions, setFilteredQuestions] = useState<QuestionAnalysis[]>([])
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all')
  const [overallStats, setOverallStats] = useState({
    score: 0,
    maxScore: 0,
    percentage: 0,
    totalTime: 0,
    avgTime: 0
  })
  const [topicPerformance, setTopicPerformance] = useState<TopicPerformance[]>([])
  const [classRank, setClassRank] = useState<ClassRank | null>(null)
  const [keyInsights, setKeyInsights] = useState<KeyInsight[]>([])
  
  const supabase = createClient()

  useEffect(() => {
    fetchQuizzes()
  }, [])

  useEffect(() => {
    if (difficultyFilter === 'all') {
      setFilteredQuestions(questions)
    } else {
      setFilteredQuestions(questions.filter(q => q.difficulty?.toLowerCase() === difficultyFilter))
    }
  }, [difficultyFilter, questions])

  const fetchQuizzes = async () => {
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

      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('course_id')
        .eq('student_id', profile.student_id)

      if (!enrollments || enrollments.length === 0) {
        setLoading(false)
        return
      }

      const courseIds = enrollments.map(e => e.course_id)

      const { data: allQuizzes } = await supabase
        .from('quizzes')
        .select(`
          id,
          title,
          course_id,
          courses (
            name
          )
        `)
        .in('course_id', courseIds)

      if (!allQuizzes || allQuizzes.length === 0) {
        setLoading(false)
        return
      }

      const quizIds = allQuizzes.map(q => q.id)

      const { data: quizAssignments } = await supabase
        .from('quiz_assignments')
        .select('quiz_id, available_from, available_until, time_limit_minutes')
        .in('quiz_id', quizIds)
        .in('course_id', courseIds)

      const { data: quizResults } = await supabase
        .from('quiz_results')
        .select('id, quiz_id, score, max_score, taken_at')
        .eq('student_uid', profile.student_id)
        .in('quiz_id', quizIds)

      const { data: questionCounts } = await supabase
        .from('quiz_questions')
        .select('quiz_id')
        .in('quiz_id', quizIds)

      const questionCountMap = questionCounts?.reduce((acc: any, item) => {
        acc[item.quiz_id] = (acc[item.quiz_id] || 0) + 1
        return acc
      }, {}) || {}

      const now = new Date().toISOString()
      const available: Quiz[] = []
      const completed: Quiz[] = []

      for (const quiz of allQuizzes) {
        const quizData = quiz as any
        const course = quizData.courses as any
        const assignment = quizAssignments?.find(a => a.quiz_id === quiz.id)
        const result = quizResults?.find(r => r.quiz_id === quiz.id)
        const questionCount = questionCountMap[quiz.id] || 0

        const quizObj: Quiz = {
          id: quiz.id,
          title: quiz.title || 'Untitled Quiz',
          course: course?.name || 'Unknown Course',
          course_id: quiz.course_id,
          questions: questionCount,
          status: result ? 'completed' : 'available',
          timeLimit: assignment?.time_limit_minutes,
          availableUntil: assignment?.available_until
        }

        if (result) {
          quizObj.score = result.score
          quizObj.maxScore = result.max_score
          quizObj.percentage = result.score && result.max_score 
            ? Math.round((result.score / result.max_score) * 100) 
            : 0
          quizObj.quiz_result_id = result.id

          const { data: answerTimings } = await supabase
            .from('student_answers')
            .select('time_taken_seconds')
            .eq('quiz_result_id', result.id)

          if (answerTimings && answerTimings.length > 0) {
            quizObj.time_taken_seconds = answerTimings.reduce(
              (sum, a) => sum + (a.time_taken_seconds || 0), 
              0
            )
          }

          completed.push(quizObj)
        } else {
          const isAvailable = !assignment || 
            ((!assignment.available_from || assignment.available_from <= now) &&
             (!assignment.available_until || assignment.available_until >= now))

          if (isAvailable) {
            available.push(quizObj)
          }
        }
      }

      setAvailableQuizzes(available)
      setCompletedQuizzes(completed)

    } catch (error) {
      console.error('Error fetching quizzes:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchAnalysis = async (quizId: string, quizResultId: string) => {
    try {
      setAnalysisLoading(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('student_id')
        .eq('id', user.id)
        .single()

      if (!profile?.student_id) return

      // Get quiz data
      const { data: quizData } = await supabase
        .from('quizzes')
        .select('title, course_id')
        .eq('id', quizId)
        .single()

      if (quizData) {
        setQuizTitle(quizData.title || 'Quiz Analysis')
      }

      // Get class ranking
      const { data: allResults } = await supabase
        .rpc('get_quiz_student_results', { quiz_id_in: quizId })

      if (allResults && allResults.length > 0) {
        const sortedResults = [...allResults].sort((a, b) => b.percentage - a.percentage)
        const myRank = sortedResults.findIndex(r => r.student_uid === profile.student_id) + 1
        const percentile = Math.round(((sortedResults.length - myRank + 1) / sortedResults.length) * 100)
        
        setClassRank({
          rank: myRank,
          totalStudents: sortedResults.length,
          percentile
        })
      }

      // Get result data
      const { data: result } = await supabase
        .from('quiz_results')
        .select('score, max_score')
        .eq('id', quizResultId)
        .single()

      // Get your answers
      const { data: yourAnswers } = await supabase
        .from('student_answers')
        .select('question_id, selected_answer, is_correct, time_taken_seconds')
        .eq('quiz_result_id', quizResultId)

      console.log('Your answers:', yourAnswers)

      if (!yourAnswers || yourAnswers.length === 0) {
        console.error('No answers found for quiz result:', quizResultId)
        return
      }

      const questionIds = yourAnswers.map(a => a.question_id)
      
      // Get questions data
      const { data: questionsData } = await supabase
        .from('questions')
        .select('id, question_text, options, correct_answer, difficulty, topic_id, topics(name)')
        .in('id', questionIds)

      console.log('Questions data:', questionsData)

      // Get all answers for comparison
      const { data: allAnswers } = await supabase
        .from('student_answers')
        .select('question_id, is_correct, time_taken_seconds')
        .in('question_id', questionIds)

      // Build topic performance
      const topicMap = new Map<string, { correct: number, total: number, name: string }>()
      
      const analysisData: QuestionAnalysis[] = questionsData?.map((q: any) => {
        const yourAnswer = yourAnswers.find(a => a.question_id === q.id)
        const otherAnswers = allAnswers?.filter(a => a.question_id === q.id) || []

        console.log(`Question ${q.id}:`, {
          rawOptions: q.options,
          yourAnswerRaw: yourAnswer?.selected_answer,
          correctAnswer: q.correct_answer,
          isCorrect: yourAnswer?.is_correct
        })

        let options: string[] = []
        let optionsMap: { [key: string]: string } = {}
        
        try {
          // Parse options from JSON
          let parsedOptions: any = q.options
          
          if (typeof q.options === 'string') {
            parsedOptions = JSON.parse(q.options)
          }
          
          if (Array.isArray(parsedOptions)) {
            // Options are already an array
            options = parsedOptions
            // Create map: A->option[0], B->option[1], etc.
            parsedOptions.forEach((opt: string, idx: number) => {
              optionsMap[String.fromCharCode(65 + idx)] = opt
            })
          } else if (parsedOptions && typeof parsedOptions === 'object') {
            // Options are an object like {A: "...", B: "...", etc.}
            const keys = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
            options = keys
              .filter(key => parsedOptions[key] !== undefined)
              .map(key => parsedOptions[key])
            optionsMap = parsedOptions
          }
        } catch (error) {
          console.error('Error parsing options for question', q.id, error)
        }

        // The selected_answer might be stored as "A", "B", etc. or as the actual text
        // We need to normalize this
        let normalizedYourAnswer: string | null = null
        let normalizedCorrectAnswer: string = q.correct_answer || ''
        
        if (yourAnswer?.selected_answer) {
          const answer = yourAnswer.selected_answer
          // Check if it's a letter (A, B, C, etc.)
          if (answer.length === 1 && answer.match(/[A-H]/i)) {
            // It's a letter, convert to actual text
            normalizedYourAnswer = optionsMap[answer.toUpperCase()] || answer
          } else {
            // It's already the text
            normalizedYourAnswer = answer
          }
        }

        // Normalize correct answer too
        if (normalizedCorrectAnswer.length === 1 && normalizedCorrectAnswer.match(/[A-H]/i)) {
          normalizedCorrectAnswer = optionsMap[normalizedCorrectAnswer.toUpperCase()] || normalizedCorrectAnswer
        }

        console.log(`Question ${q.id} normalized:`, {
          options,
          optionsMap,
          normalizedYourAnswer,
          normalizedCorrectAnswer
        })

        const avgTime = otherAnswers.length > 0
          ? Math.round(
              otherAnswers.reduce((sum, a) => sum + (a.time_taken_seconds || 0), 0) / otherAnswers.length
            )
          : 0

        const correctCount = otherAnswers.filter(a => a.is_correct).length
        const successRate = otherAnswers.length > 0
          ? Math.round((correctCount / otherAnswers.length) * 100)
          : 0

        // Track topic performance
        const topicName = q.topics?.name || 'Uncategorized'
        const topicId = q.topic_id || 'uncategorized'
        if (!topicMap.has(topicId)) {
          topicMap.set(topicId, { correct: 0, total: 0, name: topicName })
        }
        const topicStats = topicMap.get(topicId)!
        topicStats.total++
        if (yourAnswer?.is_correct) topicStats.correct++

        return {
          id: q.id,
          text: q.question_text || '',
          options,
          correctAnswer: normalizedCorrectAnswer,
          yourAnswer: normalizedYourAnswer,
          isCorrect: yourAnswer?.is_correct || false,
          timeSpent: yourAnswer?.time_taken_seconds || 0,
          avgTimeSpent: avgTime,
          successRate,
          difficulty: q.difficulty,
          topic_id: q.topic_id,
          topic_name: topicName
        }
      }) || []

      setQuestions(analysisData)

      // Build topic performance array with peer comparison
      const topicPerf: TopicPerformance[] = []
      
      for (const [id, stats] of topicMap.entries()) {
        const yourPercentage = Math.round((stats.correct / stats.total) * 100)
        
        // Get all students' performance on this topic
        const topicQuestionIds = analysisData
          .filter(q => q.topic_id === id)
          .map(q => q.id)
        
        if (topicQuestionIds.length > 0) {
          // Get all answers for questions in this topic
          const { data: allTopicAnswers } = await supabase
            .from('student_answers')
            .select('student_uid, is_correct, question_id')
            .in('question_id', topicQuestionIds)
          
          if (allTopicAnswers && allTopicAnswers.length > 0) {
            // Group by student
            const studentScores = new Map<number, { correct: number, total: number }>()
            
            allTopicAnswers.forEach(answer => {
              if (!studentScores.has(answer.student_uid)) {
                studentScores.set(answer.student_uid, { correct: 0, total: 0 })
              }
              const studentData = studentScores.get(answer.student_uid)!
              studentData.total++
              if (answer.is_correct) studentData.correct++
            })
            
            // Calculate percentages for all students
            const studentPercentages = Array.from(studentScores.entries()).map(([uid, data]) => ({
              student_uid: uid,
              percentage: (data.correct / data.total) * 100
            }))
            
            // Sort by percentage (descending)
            studentPercentages.sort((a, b) => b.percentage - a.percentage)
            
            // Find your rank
            const yourRank = studentPercentages.findIndex(s => s.student_uid === profile.student_id) + 1
            const totalStudents = studentPercentages.length
            
            // Calculate class average
            const classAverage = studentPercentages.reduce((sum, s) => sum + s.percentage, 0) / totalStudents
            
            // Calculate percentile (what % of students you scored better than)
            const percentile = Math.round(((totalStudents - yourRank + 1) / totalStudents) * 100)
            
            topicPerf.push({
              topic_id: id,
              topic_name: stats.name,
              correct: stats.correct,
              total: stats.total,
              percentage: yourPercentage,
              classAverage: Math.round(classAverage),
              yourRank,
              totalStudents,
              percentile
            })
          } else {
            // No comparison data available
            topicPerf.push({
              topic_id: id,
              topic_name: stats.name,
              correct: stats.correct,
              total: stats.total,
              percentage: yourPercentage
            })
          }
        }
      }
      
      setTopicPerformance(topicPerf)

      // Calculate insights
      const insights: KeyInsight[] = []

      // Areas to improve: questions you got wrong but most got right
      const missedEasy = analysisData
        .map((q, idx) => ({ ...q, idx }))
        .filter(q => !q.isCorrect && q.successRate >= 70)
      if (missedEasy.length > 0) {
        insights.push({
          type: 'improve',
          title: 'Areas to Improve',
          description: `You missed ${missedEasy.length} question(s) that most students got right`,
          questions: missedEasy.map(q => q.idx)
        })
      }

      // Strong performance: difficult questions you got right
      const nailedHard = analysisData
        .map((q, idx) => ({ ...q, idx }))
        .filter(q => q.isCorrect && q.successRate <= 50)
      if (nailedHard.length > 0) {
        insights.push({
          type: 'strong',
          title: 'Strong Performance',
          description: `You got ${nailedHard.length} difficult question(s) right that most students missed`,
          questions: nailedHard.map(q => q.idx)
        })
      }

      // Time management
      const totalTime = yourAnswers.reduce((sum, a) => sum + (a.time_taken_seconds || 0), 0)
      const avgQuestionTime = yourAnswers.length > 0 ? Math.round(totalTime / yourAnswers.length) : 0
      const fastQuestions = analysisData.filter(q => q.avgTimeSpent > 0 && q.timeSpent < q.avgTimeSpent * 0.7).length
      const slowQuestions = analysisData.filter(q => q.avgTimeSpent > 0 && q.timeSpent > q.avgTimeSpent * 1.5).length
      
      if (fastQuestions > slowQuestions) {
        insights.push({
          type: 'time',
          title: 'Time Management',
          description: `You're faster than average on ${fastQuestions} questions - good pacing!`
        })
      } else if (slowQuestions > 3) {
        insights.push({
          type: 'time',
          title: 'Time Management',
          description: `You took longer than average on ${slowQuestions} questions - consider practicing speed`
        })
      }

      // Difficulty breakdown
      const easyCorrect = analysisData.filter(q => q.difficulty?.toLowerCase() === 'easy' && q.isCorrect).length
      const easyTotal = analysisData.filter(q => q.difficulty?.toLowerCase() === 'easy').length
      const hardCorrect = analysisData.filter(q => q.difficulty?.toLowerCase() === 'hard' && q.isCorrect).length
      const hardTotal = analysisData.filter(q => q.difficulty?.toLowerCase() === 'hard').length

      if (easyTotal > 0 && hardTotal > 0) {
        const easyPct = Math.round((easyCorrect / easyTotal) * 100)
        const hardPct = Math.round((hardCorrect / hardTotal) * 100)
        insights.push({
          type: 'difficulty',
          title: 'Difficulty Breakdown',
          description: `Easy: ${easyPct}% correct | Hard: ${hardPct}% correct`
        })
      }

      setKeyInsights(insights)

      setOverallStats({
        score: result?.score || 0,
        maxScore: result?.max_score || 0,
        percentage: result?.score && result?.max_score 
          ? Math.round((result.score / result.max_score) * 100) 
          : 0,
        totalTime,
        avgTime: avgQuestionTime
      })

    } catch (error) {
      console.error('Error fetching analysis:', error)
    } finally {
      setAnalysisLoading(false)
    }
  }

  const handleViewAnalysis = async (quizId: string, quizResultId: string) => {
    setSelectedQuizId(quizId)
    setSelectedResultId(quizResultId)
    setView('analysis')
    await fetchAnalysis(quizId, quizResultId)
  }

  const handleBackToList = () => {
    setView('list')
    setSelectedQuizId('')
    setSelectedResultId('')
    setDifficultyFilter('all')
  }

  const formatTime = (seconds?: number) => {
    if (!seconds) return 'N/A'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return null
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    })
  }

  const getPerformanceColor = (percentage: number) => {
    if (percentage >= 80) return 'text-green-400'
    if (percentage >= 60) return 'text-yellow-400'
    return 'text-red-400'
  }

  const getDifficultyColor = (difficulty?: string) => {
    switch (difficulty?.toLowerCase()) {
      case 'easy': return 'bg-green-500/20 text-green-300 border-green-500/30'
      case 'medium': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
      case 'hard': return 'bg-red-500/20 text-red-300 border-red-500/30'
      default: return 'bg-slate-500/20 text-slate-300 border-slate-500/30'
    }
  }

  const getTimePerformanceBadge = (yourTime: number, avgTime: number) => {
    if (avgTime === 0) return null
    const ratio = yourTime / avgTime
    
    if (ratio < 0.7) {
      return { icon: '⚡', label: 'Very Fast', color: 'text-blue-400' }
    } else if (ratio < 1.0) {
      return { icon: '🏃', label: 'Fast', color: 'text-green-400' }
    } else if (ratio <= 1.5) {
      return { icon: '📊', label: 'Average', color: 'text-slate-400' }
    } else {
      return { icon: '🐢', label: 'Slow', color: 'text-orange-400' }
    }
  }

  const getPercentileColor = (percentile: number) => {
    if (percentile >= 90) return 'text-green-400'
    if (percentile >= 75) return 'text-blue-400'
    if (percentile >= 50) return 'text-yellow-400'
    if (percentile >= 25) return 'text-orange-400'
    return 'text-red-400'
  }

  const getPercentileLabel = (percentile: number) => {
    if (percentile >= 90) return 'Top 10%'
    if (percentile >= 75) return 'Top 25%'
    if (percentile >= 50) return 'Top 50%'
    if (percentile >= 25) return 'Bottom 50%'
    return 'Bottom 25%'
  }

  const getComparisonText = (yourScore: number, classAvg: number) => {
    const diff = yourScore - classAvg
    if (Math.abs(diff) < 3) return 'On par with class'
    if (diff > 0) return `${Math.abs(Math.round(diff))}% above average`
    return `${Math.abs(Math.round(diff))}% below average`
  }

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'improve': return <AlertTriangle className="text-yellow-400" size={20} />
      case 'strong': return <Award className="text-green-400" size={20} />
      case 'time': return <Clock className="text-blue-400" size={20} />
      case 'difficulty': return <Target className="text-purple-400" size={20} />
      default: return null
    }
  }

  // ANALYSIS VIEW
  if (view === 'analysis') {
    if (analysisLoading) {
      return (
        <div className="p-8 flex items-center justify-center min-h-screen">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-blue-400" />
            <div className="text-slate-400 text-lg">Loading analysis...</div>
          </div>
        </div>
      )
    }

    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="mb-8">
          <Button
            onClick={handleBackToList}
            variant="ghost"
            className="mb-4 text-slate-400 hover:text-white"
          >
            <ArrowLeft size={16} className="mr-2" />
            Back to Quizzes
          </Button>
          <h2 className="text-3xl font-bold text-white mb-2">{quizTitle}</h2>
          <p className="text-slate-400">Detailed Performance Analysis</p>
        </div>

        {/* Overall Stats */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <Target className="text-blue-400" size={20} />
                <span className="text-xs text-slate-400">Score</span>
              </div>
              <div className={`text-3xl font-bold ${getPerformanceColor(overallStats.percentage)}`}>
                {overallStats.percentage}%
              </div>
              <div className="text-sm text-slate-400 mt-1">
                {overallStats.score}/{overallStats.maxScore} correct
              </div>
            </CardContent>
          </Card>

          {classRank && (
            <Card className="bg-gradient-to-br from-yellow-900/30 to-slate-800 border-yellow-700/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <Trophy className="text-yellow-400" size={20} />
                  <span className="text-xs text-slate-400">Class Rank</span>
                </div>
                <div className="text-3xl font-bold text-yellow-400">
                  #{classRank.rank}
                </div>
                <div className="text-sm text-slate-400 mt-1">
                  out of {classRank.totalStudents} students
                </div>
                <div className="text-xs text-yellow-300 mt-1">
                  Top {100 - classRank.percentile}%
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <Clock className="text-purple-400" size={20} />
                <span className="text-xs text-slate-400">Total Time</span>
              </div>
              <div className="text-3xl font-bold text-white">
                {formatTime(overallStats.totalTime)}
              </div>
              <div className="text-sm text-slate-400 mt-1">
                Avg: {formatTime(overallStats.avgTime)}/question
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp className="text-green-400" size={20} />
                <span className="text-xs text-slate-400">Questions</span>
              </div>
              <div className="text-3xl font-bold text-white">
                {questions.length}
              </div>
              <div className="text-sm text-slate-400 mt-1">
                Total attempted
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <Users className="text-orange-400" size={20} />
                <span className="text-xs text-slate-400">Correct</span>
              </div>
              <div className="text-3xl font-bold text-white">
                {questions.filter(q => q.isCorrect).length}
              </div>
              <div className="text-sm text-slate-400 mt-1">
                Questions right
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Topic Performance & Key Insights */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Topic Performance */}
          {topicPerformance.length > 0 && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Target className="text-blue-400" size={20} />
                  Performance by Topic
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Your score vs class average on each topic
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {topicPerformance.map((topic) => (
                  <div key={topic.topic_id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-300 font-medium">{topic.topic_name}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${getPerformanceColor(topic.percentage)}`}>
                          {topic.percentage}%
                        </span>
                        {topic.classAverage !== undefined && (
                          <span className="text-xs text-slate-500">
                            (avg: {topic.classAverage}%)
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2.5 relative">
                      <div 
                        className={`h-2.5 rounded-full transition-all ${
                          topic.percentage >= 80 ? 'bg-green-500' :
                          topic.percentage >= 60 ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${topic.percentage}%` }}
                      />
                      {/* Class average marker */}
                      {topic.classAverage !== undefined && (
                        <div 
                          className="absolute top-0 h-2.5 w-1 bg-white opacity-70"
                          style={{ left: `${topic.classAverage}%` }}
                          title={`Class average: ${topic.classAverage}%`}
                        />
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">
                        {topic.correct} / {topic.total} questions correct
                      </span>
                      {topic.classAverage !== undefined && (
                        <span className={`font-semibold ${
                          topic.percentage > topic.classAverage ? 'text-green-400' :
                          topic.percentage < topic.classAverage ? 'text-red-400' :
                          'text-slate-400'
                        }`}>
                          {getComparisonText(topic.percentage, topic.classAverage)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Key Insights */}
          {keyInsights.length > 0 && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Zap className="text-yellow-400" size={20} />
                  Key Insights
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {keyInsights.map((insight, idx) => (
                  <div 
                    key={idx}
                    className="p-4 rounded-lg bg-slate-700/50 border border-slate-600 hover:border-slate-500 transition"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {getInsightIcon(insight.type)}
                      </div>
                      <div className="flex-1">
                        <h4 className="text-white font-semibold text-sm mb-1">
                          {insight.title}
                        </h4>
                        <p className="text-slate-400 text-sm">
                          {insight.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Peer Comparison Dashboard */}
        {topicPerformance.some(t => t.percentile !== undefined) && (
          <Card className="bg-gradient-to-br from-blue-900/20 to-slate-800 border-blue-700/50 mb-8">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Users className="text-blue-400" size={24} />
                Peer Comparison Dashboard
              </CardTitle>
              <CardDescription className="text-slate-400">
                See how you rank compared to your classmates on each topic
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {topicPerformance
                  .filter(t => t.percentile !== undefined)
                  .sort((a, b) => (b.percentile || 0) - (a.percentile || 0))
                  .map((topic) => (
                  <div 
                    key={topic.topic_id}
                    className="bg-slate-800/50 rounded-lg p-5 border border-slate-700 hover:border-blue-500/50 transition"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h4 className="text-white font-semibold text-base mb-1">
                          {topic.topic_name}
                        </h4>
                        <div className="flex items-center gap-2">
                          <span className={`text-2xl font-bold ${getPerformanceColor(topic.percentage)}`}>
                            {topic.percentage}%
                          </span>
                          <span className="text-slate-400 text-sm">
                            vs {topic.classAverage}% avg
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-xl font-bold ${getPercentileColor(topic.percentile!)}`}>
                          #{topic.yourRank}
                        </div>
                        <div className="text-xs text-slate-400">
                          of {topic.totalStudents}
                        </div>
                      </div>
                    </div>

                    {/* Percentile visualization */}
                    <div className="space-y-2 mb-3">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>Your Ranking</span>
                        <span className={`font-semibold ${getPercentileColor(topic.percentile!)}`}>
                          {getPercentileLabel(topic.percentile!)}
                        </span>
                      </div>
                      <div className="relative w-full h-3 bg-gradient-to-r from-red-500/30 via-yellow-500/30 via-blue-500/30 to-green-500/30 rounded-full">
                        {/* Your position marker */}
                        <div 
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-blue-500 shadow-lg"
                          style={{ left: `${topic.percentile}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>Bottom</span>
                        <span>Top</span>
                      </div>
                    </div>

                    {/* Performance indicator */}
                    <div className={`text-center py-2 px-3 rounded-lg text-sm font-medium ${
                      topic.percentage > (topic.classAverage || 0) + 10
                        ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                        : topic.percentage < (topic.classAverage || 0) - 10
                        ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                        : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    }`}>
                      {topic.percentage > (topic.classAverage || 0) + 10
                        ? '🏆 Excelling in this topic!'
                        : topic.percentage < (topic.classAverage || 0) - 10
                        ? '📚 Focus area - needs improvement'
                        : '👍 Performing at class level'}
                    </div>

                    {/* Quick stats */}
                    <div className="mt-3 pt-3 border-t border-slate-700 flex justify-between text-xs text-slate-400">
                      <span>{topic.correct}/{topic.total} correct</span>
                      <span className={`font-semibold ${
                        topic.percentage > (topic.classAverage || 0) ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {topic.percentage > (topic.classAverage || 0) ? '↑' : '↓'} 
                        {Math.abs(topic.percentage - (topic.classAverage || 0))}% vs avg
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Difficulty Filter */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex items-center gap-2 text-slate-400">
            <Filter size={18} />
            <span className="text-sm font-medium">Filter by difficulty:</span>
          </div>
          <div className="flex gap-2">
            {['all', 'easy', 'medium', 'hard'].map((diff) => (
              <Button
                key={diff}
                onClick={() => setDifficultyFilter(diff)}
                variant={difficultyFilter === diff ? 'default' : 'outline'}
                size="sm"
                className={`capitalize ${
                  difficultyFilter === diff 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-300 border-slate-600'
                }`}
              >
                {diff}
                {diff !== 'all' && (
                  <span className="ml-2 text-xs opacity-70">
                    ({questions.filter(q => q.difficulty?.toLowerCase() === diff).length})
                  </span>
                )}
                {diff === 'all' && (
                  <span className="ml-2 text-xs opacity-70">
                    ({questions.length})
                  </span>
                )}
              </Button>
            ))}
          </div>
        </div>

        {/* Questions Analysis */}
        <div className="space-y-6">
          <h3 className="text-xl font-semibold text-white mb-4">
            Question Analysis 
            <span className="text-slate-400 text-base ml-2 font-normal">
              (Showing {filteredQuestions.length} of {questions.length})
            </span>
          </h3>
          {filteredQuestions.map((q, index) => {
            const timeBadge = getTimePerformanceBadge(q.timeSpent, q.avgTimeSpent)
            const actualIndex = questions.findIndex(qu => qu.id === q.id)
            
            return (
              <Card key={q.id} className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <div className="flex items-start justify-between mb-2">
                    <CardTitle className="text-lg text-white flex-1">
                      <span className="text-slate-400 font-normal">Q{actualIndex + 1}.</span> {q.text}
                    </CardTitle>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {q.topic_name && (
                        <span className="px-2 py-1 rounded text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          📚 {q.topic_name}
                        </span>
                      )}
                      {q.difficulty && (
                        <span className={`px-2 py-1 rounded text-xs font-semibold border ${getDifficultyColor(q.difficulty)}`}>
                          Difficulty: {q.difficulty}
                        </span>
                      )}
                      {timeBadge && (
                        <span className={`px-2 py-1 rounded text-xs font-semibold bg-slate-700/50 border border-slate-600 ${timeBadge.color}`}>
                          {timeBadge.icon} Speed: {timeBadge.label}
                        </span>
                      )}
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        q.isCorrect 
                          ? 'bg-green-500/20 text-green-300' 
                          : 'bg-red-500/20 text-red-300'
                      }`}>
                        {q.isCorrect ? '✓ Correct' : '✗ Incorrect'}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    {q.options.map((option, optIndex) => {
                      const isYourAnswer = q.yourAnswer === option
                      const isCorrectAnswer = q.correctAnswer === option
                      
                      return (
                        <div
                          key={optIndex}
                          className={`p-4 rounded-lg border-2 transition ${
                            isCorrectAnswer
                              ? 'border-green-500 bg-green-500/20'
                              : isYourAnswer
                              ? 'border-red-500 bg-red-500/20'
                              : 'border-slate-600 bg-slate-700/30'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 flex-1">
                              <span className={`flex items-center justify-center w-8 h-8 rounded-full border-2 font-semibold ${
                                isCorrectAnswer
                                  ? 'border-green-500 text-green-300 bg-green-500/10'
                                  : isYourAnswer
                                  ? 'border-red-500 text-red-300 bg-red-500/10'
                                  : 'border-slate-500 text-slate-400'
                              }`}>
                                {String.fromCharCode(65 + optIndex)}
                              </span>
                              <span className={`${
                                isCorrectAnswer || isYourAnswer ? 'text-white font-medium' : 'text-slate-300'
                              }`}>
                                {option}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {isYourAnswer && !isCorrectAnswer && (
                                <span className="text-xs px-2 py-1 rounded bg-red-500/30 text-red-200 font-semibold">
                                  Your Answer
                                </span>
                              )}
                              {isYourAnswer && isCorrectAnswer && (
                                <span className="text-xs px-2 py-1 rounded bg-green-500/30 text-green-200 font-semibold">
                                  ✓ Your Answer
                                </span>
                              )}
                              {isCorrectAnswer && !isYourAnswer && (
                                <span className="text-xs px-2 py-1 rounded bg-green-500/30 text-green-200 font-semibold">
                                  ✓ Correct Answer
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {!q.yourAnswer && (
                    <div className="p-3 rounded-lg bg-slate-700/50 border border-slate-600">
                      <p className="text-slate-400 text-sm">
                        ⊗ You did not answer this question
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-700">
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <Clock size={16} className="text-slate-400" />
                        <span className="text-xs text-slate-400">Your Time</span>
                      </div>
                      <div className="text-lg font-bold text-white">
                        {formatTime(q.timeSpent)}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <Users size={16} className="text-slate-400" />
                        <span className="text-xs text-slate-400">Avg Time</span>
                      </div>
                      <div className="text-lg font-bold text-white">
                        {formatTime(q.avgTimeSpent)}
                      </div>
                      <div className={`text-xs mt-1 ${
                        q.timeSpent < q.avgTimeSpent ? 'text-green-400' : 
                        q.timeSpent === q.avgTimeSpent ? 'text-slate-400' :
                        'text-yellow-400'
                      }`}>
                        {q.timeSpent < q.avgTimeSpent ? '⚡ Faster than average' : 
                         q.timeSpent === q.avgTimeSpent ? 'Average pace' :
                         '🐢 Slower than average'}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <TrendingUp size={16} className="text-slate-400" />
                        <span className="text-xs text-slate-400">Success Rate</span>
                      </div>
                      <div className={`text-lg font-bold ${getPerformanceColor(q.successRate)}`}>
                        {q.successRate}%
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        of students got this right
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <div className="mt-8 flex justify-center">
          <Button
            onClick={handleBackToList}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <ArrowLeft size={16} className="mr-2" />
            Back to Quizzes
          </Button>
        </div>
      </div>
    )
  }

  // LIST VIEW
  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-12 w-12 animate-spin text-blue-400" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">My Quizzes</h2>
        <p className="text-slate-400">Attempt quizzes and view your results</p>
      </div>

      {availableQuizzes.length === 0 && completedQuizzes.length === 0 ? (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6 text-center text-slate-400">
            No quizzes available at the moment
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {availableQuizzes.length > 0 && (
            <div>
              <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Clock className="text-blue-400" size={24} />
                Available Quizzes ({availableQuizzes.length})
              </h3>
              <div className="grid gap-4">
                {availableQuizzes.map((quiz) => (
                  <Card 
                    key={quiz.id} 
                    className="bg-slate-800 border-slate-700 hover:border-blue-500/50 transition cursor-pointer"
                    onClick={() => onSelectQuiz(quiz.id)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-white text-lg">{quiz.title}</CardTitle>
                          <CardDescription className="text-slate-400">{quiz.course}</CardDescription>
                          <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                            {quiz.timeLimit && (
                              <span className="flex items-center gap-1">
                                <Clock size={14} />
                                {quiz.timeLimit} minutes
                              </span>
                            )}
                            {quiz.availableUntil && (
                              <span>Due: {formatDate(quiz.availableUntil)}</span>
                            )}
                          </div>
                        </div>
                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300">
                          Available
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-400">Questions</p>
                        <p className="text-2xl font-bold text-white">{quiz.questions}</p>
                      </div>
                      <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                        Start Quiz
                        <ChevronRight size={16} className="ml-1" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {completedQuizzes.length > 0 && (
            <div>
              <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <CheckCircle className="text-green-400" size={24} />
                Completed Quizzes ({completedQuizzes.length})
              </h3>
              <div className="grid gap-4">
                {completedQuizzes.map((quiz) => (
                  <Card 
                    key={quiz.id} 
                    className="bg-slate-800 border-slate-700 hover:border-green-500/50 transition"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-white text-lg">{quiz.title}</CardTitle>
                          <CardDescription className="text-slate-400">{quiz.course}</CardDescription>
                        </div>
                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-500/20 text-green-300">
                          Completed
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between">
                      <div className="flex items-center gap-8">
                        <div>
                          <p className="text-sm text-slate-400">Questions</p>
                          <p className="text-lg font-semibold text-white">{quiz.questions}</p>
                        </div>
                        <div>
                          <p className="text-sm text-slate-400">Your Score</p>
                          <p className="text-3xl font-bold text-green-400">
                            {quiz.percentage}%
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-slate-400">Score</p>
                          <p className="text-lg font-semibold text-white">
                            {quiz.score}/{quiz.maxScore}
                          </p>
                        </div>
                        {quiz.time_taken_seconds && (
                          <div>
                            <p className="text-sm text-slate-400">Time Taken</p>
                            <p className="text-lg font-semibold text-white flex items-center gap-1">
                              <Clock size={16} />
                              {formatTime(quiz.time_taken_seconds)}
                            </p>
                          </div>
                        )}
                      </div>
                      <Button 
                        onClick={(e) => {
                          e.stopPropagation()
                          if (quiz.quiz_result_id) {
                            handleViewAnalysis(quiz.id, quiz.quiz_result_id)
                          }
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <TrendingUp size={16} className="mr-2" />
                        View Analysis
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}