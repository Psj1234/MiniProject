'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { User, TrendingUp, TrendingDown, BookOpen, Clock, Sparkles, Brain, Target, AlertCircle, Trophy, Lightbulb, FileText, BarChart3 } from 'lucide-react'

interface StudentProfile {
  student_id: number
  full_name: string
  learner_tag: string | null
}

interface TopicPerformance {
  topic_name: string
  correct_answers: number
  total_questions: number
  avg_time_taken: number
  accuracy: number
}

interface SubjectPerformance {
  subject: string
  topics: TopicPerformance[]
  avgAccuracy: number
  avgTime: number
  totalQuestions: number
  correctAnswers: number
  weakestTopics: { name: string; accuracy: number }[]
  strongestTopics: { name: string; accuracy: number }[]
}

interface QuizResult {
  quiz_id: string
  quiz_title: string
  score: number
  total_questions: number
  percentage: number
  submitted_at: string
}

interface AIInsight {
  subject: string
  performance: string
  strengths: string[]
  improvements: string[]
  recommendation: string
}

interface DetailedSummary {
  overallPerformance: string
  keyInsights: string[]
  criticalAreas: string[]
  actionPlan: string
}

export default function StudentAICard() {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<StudentProfile | null>(null)
  const [subjectPerformance, setSubjectPerformance] = useState<SubjectPerformance[]>([])
  const [recentQuizzes, setRecentQuizzes] = useState<QuizResult[]>([])
  const [totalQuizzesTaken, setTotalQuizzesTaken] = useState(0)
  const [aiInsights, setAIInsights] = useState<AIInsight[]>([])
  const [detailedSummary, setDetailedSummary] = useState<DetailedSummary | null>(null)
  const [overallStrengths, setOverallStrengths] = useState<string[]>([])
  const [overallImprovements, setOverallImprovements] = useState<string[]>([])
  const [motivationalQuote, setMotivationalQuote] = useState('')
  const [generatingInsights, setGeneratingInsights] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    fetchStudentData()
  }, [])

  const fetchStudentData = async () => {
    try {
      setLoading(true)
      setError(null)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('No authenticated user found')
        return
      }

      console.log('✅ Authenticated user:', user.id)

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('student_id, full_name')
        .eq('id', user.id)
        .single()

      if (profileError) {
        setError('Profile fetch error: ' + profileError.message)
        return
      }

      if (!profileData?.student_id) {
        setError('No student_id found in profile')
        return
      }

      console.log('✅ Student profile:', profileData)

      const { data: enrollmentData, error: enrollError } = await supabase
        .from('enrollments')
        .select('learner_tag')
        .eq('student_id', profileData.student_id)
        .limit(1)
        .single()

      if (enrollError) {
        console.log('⚠️ No enrollment found or error:', enrollError)
      }

      console.log('✅ Learner tag:', enrollmentData?.learner_tag || 'none')

      setProfile({
        student_id: profileData.student_id,
        full_name: profileData.full_name,
        learner_tag: enrollmentData?.learner_tag || null
      })

      const { data: enrollments, error: enrollmentsError } = await supabase
        .from('enrollments')
        .select('course_id')
        .eq('student_id', profileData.student_id)

      if (enrollmentsError) {
        setError('Enrollments fetch error: ' + enrollmentsError.message)
        return
      }

      if (!enrollments || enrollments.length === 0) {
        console.log('⚠️ No enrollments found for this student')
        setLoading(false)
        return
      }

      console.log('✅ Enrolled in', enrollments.length, 'courses')

      const courseIds = enrollments.map(e => e.course_id)

      // Get course names for better subject identification
      const { data: coursesData } = await supabase
        .from('courses')
        .select('id, name')
        .in('id', courseIds)

      const courseMap = new Map(coursesData?.map(c => [c.id, c.name]) || [])

      const { data: topicData, error: topicError } = await supabase
        .from('student_answers')
        .select(`
          topic_id,
          is_correct,
          time_taken_seconds,
          topics!inner(name, course_id)
        `)
        .eq('student_uid', profileData.student_id)
        .in('topics.course_id', courseIds)

      if (topicError) {
        console.error('❌ Topic data fetch error:', topicError)
      } else {
        console.log('✅ Fetched', topicData?.length || 0, 'student answers')
      }

      // Group by subject (use course name as subject)
      const subjectMap = new Map<string, { topics: Map<string, { correct: number; total: number; time: number[] }> }>()
      
      let processedCount = 0
      topicData?.forEach((answer: any) => {
        const topicName = answer.topics.name
        const courseId = answer.topics.course_id
        const courseName = courseMap.get(courseId) || 'Unknown Subject'
        
        processedCount++
        
        // Extract subject from course name or topic name
        let subject = courseName
        
        // Try to extract subject from topic name if it contains subject info
        const subjectMatch = topicName.match(/Week \d+ - (.+)/) || topicName.match(/Week \d+ (.+)/)
        if (subjectMatch) {
          subject = subjectMatch[1]
        }
        
        if (!subjectMap.has(subject)) {
          subjectMap.set(subject, { topics: new Map() })
        }
        
        const subjectData = subjectMap.get(subject)!
        if (!subjectData.topics.has(topicName)) {
          subjectData.topics.set(topicName, { correct: 0, total: 0, time: [] })
        }
        
        const topic = subjectData.topics.get(topicName)!
        topic.total++
        if (answer.is_correct) topic.correct++
        topic.time.push(answer.time_taken_seconds || 0)
      })

      console.log('✅ Processed answers:', processedCount)
      console.log('✅ Subjects found:', subjectMap.size)
      console.log('✅ Subject names:', Array.from(subjectMap.keys()))

      // Process subjects
      const processedSubjects: SubjectPerformance[] = Array.from(subjectMap.entries()).map(([subject, data]) => {
        const topics: TopicPerformance[] = Array.from(data.topics.entries()).map(([name, topicData]) => {
          const avgTime = topicData.time.length > 0 
            ? Math.round(topicData.time.reduce((a, b) => a + b, 0) / topicData.time.length)
            : 0
          
          return {
            topic_name: name,
            correct_answers: topicData.correct,
            total_questions: topicData.total,
            avg_time_taken: avgTime,
            accuracy: topicData.total > 0 ? Math.round((topicData.correct / topicData.total) * 100) : 0
          }
        })

        const totalCorrect = topics.reduce((sum, t) => sum + t.correct_answers, 0)
        const totalQuestions = topics.reduce((sum, t) => sum + t.total_questions, 0)
        const avgAccuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0
        const avgTime = topics.length > 0 
          ? Math.round(topics.reduce((sum, t) => sum + t.avg_time_taken, 0) / topics.length)
          : 0

        // Find weakest and strongest topics
        const sortedTopics = [...topics].sort((a, b) => a.accuracy - b.accuracy)
        const weakestTopics = sortedTopics.slice(0, 3).map(t => ({ name: t.topic_name, accuracy: t.accuracy }))
        const strongestTopics = sortedTopics.slice(-3).reverse().map(t => ({ name: t.topic_name, accuracy: t.accuracy }))

        return {
          subject,
          topics,
          avgAccuracy,
          avgTime,
          totalQuestions,
          correctAnswers: totalCorrect,
          weakestTopics,
          strongestTopics
        }
      })

      console.log('✅ Processed subjects with details:', processedSubjects.map(s => ({
        name: s.subject,
        accuracy: s.avgAccuracy,
        questions: `${s.correctAnswers}/${s.totalQuestions}`
      })))

      setSubjectPerformance(processedSubjects)

      // Fetch ALL quiz results count for accurate total
      const { count: totalQuizCount, error: countError } = await supabase
        .from('quiz_results')
        .select('*', { count: 'exact', head: true })
        .eq('student_uid', profileData.student_id)

      if (!countError && totalQuizCount !== null) {
        setTotalQuizzesTaken(totalQuizCount)
        console.log('✅ Total quizzes taken:', totalQuizCount)
      }

      // Fetch recent 3 quiz results with quiz titles
      const { data: quizData, error: quizError } = await supabase
        .from('quiz_results')
        .select(`
          quiz_id,
          score,
          max_score,
          taken_at,
          quizzes!inner(title)
        `)
        .eq('student_uid', profileData.student_id)
        .order('taken_at', { ascending: false })
        .limit(3)

      if (quizError) {
        console.error('❌ Quiz results fetch error:', quizError)
      } else {
        console.log('✅ Fetched', quizData?.length || 0, 'recent quiz results')
      }

      const processedQuizzes: QuizResult[] = quizData?.map((q: any) => ({
        quiz_id: q.quiz_id,
        quiz_title: q.quizzes?.title || 'Quiz',
        score: q.score,
        total_questions: q.max_score,
        percentage: Math.round((q.score / q.max_score) * 100),
        submitted_at: new Date(q.taken_at).toLocaleDateString()
      })) || []

      console.log('✅ Processed quizzes:', processedQuizzes)

      setRecentQuizzes(processedQuizzes)

      if (processedSubjects.length > 0) {
        console.log('🤖 Starting AI insights generation...')
        console.log('📊 Subjects to process:', processedSubjects.map(s => s.subject))
        
        // Don't await here - call it but let it run in background
        generateAIInsights(profileData.full_name, enrollmentData?.learner_tag, processedSubjects, processedQuizzes)
      } else {
        console.log('⚠️ No subjects found')
        // Even with no subject data, try to generate insights from quiz data
        if (processedQuizzes.length > 0) {
          console.log('📝 Generating insights from quiz data only')
          generateAIInsights(profileData.full_name, enrollmentData?.learner_tag, [], processedQuizzes)
        }
      }

    } catch (error: any) {
      console.error('💥 Error fetching student data:', error)
      setError('Error fetching data: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const generateAIInsights = async (
    studentName: string,
    learnerTag: string | null,
    subjects: SubjectPerformance[],
    quizzes: QuizResult[]
  ) => {
    setGeneratingInsights(true)
    setError(null)

    try {
      const insights: AIInsight[] = []

      // Generate insights for each subject
      for (const subject of subjects) {
        try {
          console.log(`🤖 Generating AI insight for ${subject.subject}...`)
          
          // Prepare the detailed data format with more context
          const requestData = {
            type: 'subject-insight',
            data: {
              subject: subject.subject,
              avgAccuracy: subject.avgAccuracy,
              correctAnswers: subject.correctAnswers,
              totalQuestions: subject.totalQuestions,
              avgTime: subject.avgTime,
              learnerTag: learnerTag || 'Not Yet Classified',
              // Additional detailed data
              topicCount: subject.topics.length,
              weakestTopics: subject.weakestTopics,
              strongestTopics: subject.strongestTopics,
              topicBreakdown: subject.topics.map(t => ({
                name: t.topic_name,
                accuracy: t.accuracy,
                questions: t.total_questions,
                avgTime: t.avg_time_taken
              }))
            }
          }
          
          console.log('📤 Sending detailed request:', JSON.stringify(requestData, null, 2))
          
          const response = await supabase.functions.invoke('generate-ai-insights', {
            body: requestData
          })

          console.log(`📥 Response status for ${subject.subject}:`, response.status)
          console.log(`📥 Response error for ${subject.subject}:`, response.error)
          console.log(`📥 Response data for ${subject.subject}:`, response.data)

          // Check for error in response
          if (response.error) {
            console.error(`❌ Edge function returned error for ${subject.subject}:`, response.error)
            throw new Error(response.error.message || 'Edge function error')
          }

          // Check if data exists
          if (!response.data) {
            console.error(`❌ No data in response for ${subject.subject}`)
            throw new Error('No data received from edge function')
          }

          // Check if there's an error field in the data itself
          if (response.data.error) {
            console.error(`❌ Error in response data for ${subject.subject}:`, response.data.error)
            throw new Error(response.data.error)
          }

          // Get the insight field
          if (!response.data.insight) {
            console.error(`❌ No insight field in response for ${subject.subject}`)
            throw new Error('No insight field in response')
          }

          console.log(`✅ Raw insight string for ${subject.subject}:`, response.data.insight)

          // Parse the JSON insight
          let parsed
          try {
            // The edge function returns JSON as a string, so we need to parse it
            parsed = typeof response.data.insight === 'string' 
              ? JSON.parse(response.data.insight)
              : response.data.insight
            
            console.log(`✅ Parsed insight for ${subject.subject}:`, parsed)
          } catch (parseError: any) {
            console.error(`❌ JSON parse error for ${subject.subject}:`, parseError)
            console.error(`❌ Failed to parse string:`, response.data.insight)
            throw new Error(`Failed to parse insight JSON: ${parseError.message}`)
          }

          // Validate the parsed object has required fields
          if (!parsed.performance || !parsed.strengths || !parsed.improvements || !parsed.recommendation) {
            console.error(`❌ Parsed insight missing required fields for ${subject.subject}:`, parsed)
            throw new Error('Parsed insight missing required fields')
          }

          // Add the validated insight
          insights.push({
            subject: subject.subject,
            performance: parsed.performance,
            strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
            improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
            recommendation: parsed.recommendation
          })
          
          console.log(`✅ Successfully added insight for ${subject.subject}`)
        } catch (err: any) {
          console.error(`💥 Error generating insight for ${subject.subject}:`, err)
          console.error(`💥 Error message:`, err.message)
          
          // Add fallback insight based on performance
          const { avgAccuracy, correctAnswers, totalQuestions, weakestTopics, strongestTopics } = subject
          
          let performance = 'Good'
          let strengths: string[] = []
          let improvements: string[] = []
          let recommendation = ''

          if (avgAccuracy >= 85) {
            performance = 'Excellent'
            strengths = [
              `Exceptional mastery of ${subject.subject} with ${avgAccuracy}% accuracy`,
              strongestTopics.length > 0 ? `Outstanding performance in ${strongestTopics[0].name}` : `Consistently high scores across all topics`,
              `Strong problem-solving skills demonstrated across ${totalQuestions} questions`
            ]
            improvements = [
              `Challenge yourself with advanced problems and real-world applications`,
              `Consider peer tutoring to reinforce understanding`,
              weakestTopics.length > 0 ? `Fine-tune understanding in ${weakestTopics[0].name} for perfection` : `Explore advanced concepts beyond curriculum`
            ]
            recommendation = `Your excellence in ${subject.subject} is remarkable. Focus on mentoring others and tackling more complex problem sets to deepen mastery.`
          } else if (avgAccuracy >= 70) {
            performance = 'Good'
            strengths = [
              `Solid understanding of core ${subject.subject} concepts`,
              strongestTopics.length > 0 ? `Excellent grasp of ${strongestTopics[0].name} (${strongestTopics[0].accuracy}% accuracy)` : `Good progress with ${correctAnswers} correct answers`,
              `Consistent effort shown across ${totalQuestions} practice questions`
            ]
            improvements = [
              weakestTopics.length > 0 ? `Focus intensive review on ${weakestTopics[0].name} (${weakestTopics[0].accuracy}% accuracy)` : `Work on maintaining consistency across all topics`,
              `Practice more problems in areas below 75% accuracy`,
              `Review fundamental concepts to strengthen weak areas`
            ]
            recommendation = `You're on a strong trajectory in ${subject.subject}. Dedicate 30 minutes daily to practice problems in weaker topics, and you'll see significant improvement.`
          } else if (avgAccuracy >= 50) {
            performance = 'Fair'
            strengths = [
              `Making steady progress with ${correctAnswers} out of ${totalQuestions} questions correct`,
              strongestTopics.length > 0 ? `Show promise in ${strongestTopics[0].name}` : `Demonstrating consistent effort`,
              `Building foundational understanding of ${subject.subject}`
            ]
            improvements = [
              weakestTopics.length > 0 ? `Urgently address gaps in ${weakestTopics[0].name} (${weakestTopics[0].accuracy}% accuracy)` : `Focus on strengthening fundamental concepts`,
              `Seek help from teachers or tutors for challenging topics`,
              `Increase practice time and focus on conceptual clarity`
            ]
            recommendation = `In ${subject.subject}, prioritize understanding core concepts before attempting complex problems. Create a study schedule focusing on your weakest areas first.`
          } else {
            performance = 'Needs Work'
            strengths = [
              `Showing commitment by attempting ${totalQuestions} questions`,
              strongestTopics.length > 0 ? `Potential evident in ${strongestTopics[0].name}` : `Foundation ready for improvement`,
              `Opportunity for significant growth identified`
            ]
            improvements = [
              `Critically need focused revision of fundamental ${subject.subject} concepts`,
              weakestTopics.length > 0 ? `Start with basics in ${weakestTopics[0].name} before moving forward` : `Begin with simplified explanations and basic problems`,
              `Schedule regular tutoring sessions for personalized guidance`
            ]
            recommendation = `${subject.subject} requires immediate attention. Start with basic concepts using video tutorials and simple examples. Work with a tutor to build confidence step-by-step.`
          }

          insights.push({
            subject: subject.subject,
            performance,
            strengths: strengths.slice(0, 3),
            improvements: improvements.slice(0, 3),
            recommendation
          })
          
          console.log(`✅ Added fallback insight for ${subject.subject}`)
        }
      }

      console.log('✅ All insights generated:', insights.length)
      setAIInsights(insights)

      // Generate overall strengths and improvements
      const allStrengths = insights.flatMap(i => i.strengths)
      const allImprovements = insights.flatMap(i => i.improvements)
      
      // Get unique items
      const uniqueStrengths = [...new Set(allStrengths)]
      const uniqueImprovements = [...new Set(allImprovements)]
      
      console.log('✅ Overall strengths:', uniqueStrengths)
      console.log('✅ Overall improvements:', uniqueImprovements)
      
      setOverallStrengths(uniqueStrengths.slice(0, 3))
      setOverallImprovements(uniqueImprovements.slice(0, 3))

      // Generate detailed summary
      try {
        console.log('🤖 Generating detailed summary...')
        
        const summaryData = {
          type: 'detailed-summary',
          data: {
            studentName,
            learnerTag: learnerTag || 'Not Yet Classified',
            subjectInsights: insights.map(i => ({
              subject: i.subject,
              performance: i.performance,
              avgAccuracy: subjects.find(s => s.subject === i.subject)?.avgAccuracy || 0
            })),
            overallAccuracy: subjects.length > 0
              ? Math.round(subjects.reduce((sum, s) => sum + s.avgAccuracy, 0) / subjects.length)
              : 0,
            totalQuestions: subjects.reduce((sum, s) => sum + s.totalQuestions, 0),
            totalCorrect: subjects.reduce((sum, s) => sum + s.correctAnswers, 0),
            quizPerformance: quizzes.map(q => ({ title: q.quiz_title, percentage: q.percentage }))
          }
        }
        
        const summaryResponse = await supabase.functions.invoke('generate-ai-insights', {
          body: summaryData
        })

        if (!summaryResponse.error && summaryResponse.data?.summary) {
          const parsedSummary = typeof summaryResponse.data.summary === 'string' 
            ? JSON.parse(summaryResponse.data.summary)
            : summaryResponse.data.summary
          
          setDetailedSummary(parsedSummary)
          console.log('✅ Generated detailed summary')
        }
      } catch (err) {
        console.error('💥 Error generating summary:', err)
      }

      // Generate motivational quote
      const avgScore = quizzes.length > 0
        ? Math.round(quizzes.reduce((sum, q) => sum + q.percentage, 0) / quizzes.length)
        : subjects.length > 0
        ? Math.round(subjects.reduce((sum, s) => sum + s.avgAccuracy, 0) / subjects.length)
        : 0

      try {
        console.log('🤖 Generating motivational quote for avgScore:', avgScore)
        
        const quoteResponse = await supabase.functions.invoke('generate-ai-insights', {
          body: {
            type: 'motivational-quote',
            data: { avgScore }
          }
        })

        console.log('📥 Quote response status:', quoteResponse.status)
        console.log('📥 Quote response error:', quoteResponse.error)
        console.log('📥 Quote response data:', quoteResponse.data)

        if (quoteResponse.error) {
          console.error('❌ Error generating quote:', quoteResponse.error)
          throw quoteResponse.error
        }

        if (quoteResponse.data?.quote) {
          setMotivationalQuote(quoteResponse.data.quote)
          console.log('✅ Generated quote:', quoteResponse.data.quote)
        } else {
          throw new Error('No quote in response')
        }
      } catch (err) {
        console.error('💥 Error generating quote:', err)
        console.error('💥 Using fallback quote')
        
        // Fallback quotes
        let quote = 'Keep learning, keep growing!'
        if (avgScore >= 85) quote = 'Excellence is a habit. Keep it up!'
        else if (avgScore >= 70) quote = "You're on the right track!"
        else if (avgScore >= 50) quote = 'Progress over perfection!'
        else if (avgScore > 0) quote = 'Every expert was once a beginner.'
        
        setMotivationalQuote(quote)
        console.log('✅ Set fallback quote:', quote)
      }

    } catch (error: any) {
      console.error('💥 Critical error in generateAIInsights:', error)
      console.error('💥 Error message:', error.message)
      setError('Failed to generate AI insights: ' + error.message)
    } finally {
      setGeneratingInsights(false)
      console.log('✅ Finished generating insights')
    }
  }

  const getPerformanceColor = (performance: string) => {
    const lower = performance.toLowerCase()
    if (lower.includes('excellent')) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
    if (lower.includes('good')) return 'text-blue-400 bg-blue-500/10 border-blue-500/30'
    if (lower.includes('fair')) return 'text-amber-400 bg-amber-500/10 border-amber-500/30'
    return 'text-red-400 bg-red-500/10 border-red-500/30'
  }

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 80) return 'text-emerald-400'
    if (accuracy >= 60) return 'text-blue-400'
    if (accuracy >= 40) return 'text-amber-400'
    return 'text-red-400'
  }

  const getLearnerTagColor = (tag: string | null) => {
    if (tag === 'fast') return 'bg-blue-500/20 text-blue-300 border-blue-500/30'
    if (tag === 'slow') return 'bg-amber-500/20 text-amber-300 border-amber-500/30'
    return 'bg-slate-600/50 text-slate-300 border-slate-500/30'
  }

  const getLearnerTagLabel = (tag: string | null) => {
    if (tag === 'fast') return 'Fast Learner'
    if (tag === 'slow') return 'Slow Learner'
    return 'Moderate Learner'
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-slate-400 text-lg">Loading your AI insights...</div>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-12 pb-12 text-center">
            <AlertCircle className="mx-auto mb-4 text-slate-600" size={48} />
            <p className="text-slate-400 mb-4">No profile data found</p>
            <p className="text-sm text-slate-500">Please ensure you're logged in as a student</p>
            {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
          </CardContent>
        </Card>
      </div>
    )
  }

  const overallAccuracy = subjectPerformance.length > 0
    ? Math.round(subjectPerformance.reduce((sum, s) => sum + s.avgAccuracy, 0) / subjectPerformance.length)
    : 0

  const overallAvgTime = subjectPerformance.length > 0
    ? Math.round(subjectPerformance.reduce((sum, s) => sum + s.avgTime, 0) / subjectPerformance.length)
    : 0

  const avgQuizScore = recentQuizzes.length > 0
    ? Math.round(recentQuizzes.reduce((sum, q) => sum + q.percentage, 0) / recentQuizzes.length)
    : 0

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-4">
      {/* Error Display */}
      {error && (
        <Card className="bg-red-500/10 border-red-500/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-red-300">
              <AlertCircle size={20} />
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Brain className="text-blue-400" size={36} />
            AI Learning Insights
          </h1>
          <p className="text-slate-400 mt-1">Personalized analysis powered by AI</p>
        </div>
        <Button
          onClick={() => generateAIInsights(profile.full_name, profile.learner_tag, subjectPerformance, recentQuizzes)}
          disabled={generatingInsights || subjectPerformance.length === 0}
          className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
        >
          <Sparkles size={16} className="mr-2" />
          {generatingInsights ? 'Analyzing...' : 'Refresh Insights'}
        </Button>
      </div>

      {/* Motivational Quote */}
      {motivationalQuote && (
        <Card className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-500/20">
          <CardContent className="py-4">
            <div className="flex items-center justify-center gap-3">
              <Sparkles className="text-blue-400" size={20} />
              <p className="text-lg font-semibold text-white text-center">
                {motivationalQuote}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed Summary Box */}
      {detailedSummary && (
        <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <FileText className="text-purple-400" size={20} />
              Detailed Performance Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-slate-700/30 rounded-lg border border-slate-600">
              <p className="text-sm font-semibold text-purple-400 mb-2">Overall Performance</p>
              <p className="text-white">{detailedSummary.overallPerformance}</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <p className="text-sm font-semibold text-blue-400 mb-3 flex items-center gap-2">
                  <BarChart3 size={16} />
                  Key Insights
                </p>
                <ul className="space-y-2">
                  {detailedSummary.keyInsights.map((insight, idx) => (
                    <li key={idx} className="text-sm text-slate-300 flex items-start gap-2">
                      <span className="text-blue-400 mt-0.5">•</span>
                      <span>{insight}</span>
                    </li>
                  ))}
                </ul>
              </div>
              
              <div className="p-4 bg-amber-500/10 rounded-lg border border-amber-500/20">
                <p className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
                  <Target size={16} />
                  Critical Focus Areas
                </p>
                <ul className="space-y-2">
                  {detailedSummary.criticalAreas.map((area, idx) => (
                    <li key={idx} className="text-sm text-slate-300 flex items-start gap-2">
                      <span className="text-amber-400 mt-0.5">•</span>
                      <span>{area}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            
            <div className="p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <p className="text-sm font-semibold text-emerald-400 mb-2 flex items-center gap-2">
                <Lightbulb size={16} />
                Recommended Action Plan
              </p>
              <p className="text-white">{detailedSummary.actionPlan}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Bento Grid */}
      <div className="grid grid-cols-12 gap-3">
        {/* Profile Card */}
        <Card className="col-span-3 bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center mb-3">
                <User size={32} className="text-white" />
              </div>
              <h3 className="font-bold text-white text-lg mb-1">{profile.full_name}</h3>
              <p className="text-sm text-slate-400 mb-3">ID: {profile.student_id}</p>
              <span className={`text-xs px-3 py-1.5 rounded-full border font-medium ${getLearnerTagColor(profile.learner_tag)}`}>
                {getLearnerTagLabel(profile.learner_tag)}
              </span>
            </div>
            <div className="mt-6 pt-6 border-t border-slate-700 grid grid-cols-2 gap-3 text-center">
              <div>
                <p className="text-2xl font-bold text-white">{overallAccuracy}%</p>
                <p className="text-xs text-slate-400 mt-1">Accuracy</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{subjectPerformance.length}</p>
                <p className="text-xs text-slate-400 mt-1">Subjects</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quiz Summary Stats */}
        <Card className="col-span-3 bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-400 font-medium">Quiz Average</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <div>
                <p className={`text-3xl font-bold ${getAccuracyColor(avgQuizScore)}`}>{avgQuizScore}%</p>
                <p className="text-xs text-slate-500 mt-1">{recentQuizzes.length} recent quizzes</p>
              </div>
              <TrendingUp className="text-emerald-400" size={32} />
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3 bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-400 font-medium">Total Quizzes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold text-white">{totalQuizzesTaken}</p>
                <p className="text-xs text-slate-500 mt-1">Completed</p>
              </div>
              <BookOpen className="text-blue-400" size={32} />
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3 bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-400 font-medium">Avg Time/Q</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold text-white">{overallAvgTime}s</p>
                <p className="text-xs text-slate-500 mt-1">Per question</p>
              </div>
              <Clock className="text-amber-400" size={32} />
            </div>
          </CardContent>
        </Card>

        {/* Recent Quizzes */}
        <Card className="col-span-4 bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <BookOpen size={18} />
              Recent Test Scores
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentQuizzes.length > 0 ? (
              recentQuizzes.map((quiz, idx) => (
                <div key={idx} className="p-3 bg-slate-700/50 rounded-lg border border-slate-600">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">{quiz.quiz_title}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{quiz.submitted_at}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xl font-bold ${getAccuracyColor(quiz.percentage)}`}>
                        {quiz.percentage}%
                      </p>
                      <p className="text-xs text-slate-500">{quiz.score}/{quiz.total_questions}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">No quizzes taken yet</p>
            )}
          </CardContent>
        </Card>

        {/* Overall Strengths */}
        <Card className="col-span-4 bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Trophy className="text-emerald-400" size={18} />
              Your Strengths
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {overallStrengths.length > 0 ? (
              overallStrengths.map((strength, idx) => (
                <div key={idx} className="p-2.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                  <p className="text-sm text-emerald-300">✓ {strength}</p>
                </div>
              ))
            ) : (
              <div className="text-center py-4 space-y-2">
                {generatingInsights ? (
                  <>
                    <div className="animate-pulse flex justify-center">
                      <Sparkles className="text-blue-400" size={24} />
                    </div>
                    <p className="text-sm text-slate-400">Analyzing your performance...</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-slate-400">
                      {subjectPerformance.length === 0 
                        ? 'No subject data available yet'
                        : 'Click "Refresh Insights" to generate'}
                    </p>
                    {subjectPerformance.length === 0 && (
                      <p className="text-xs text-slate-500">
                        Complete topic-based assessments to see subject insights
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Areas to Improve */}
        <Card className="col-span-4 bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Target className="text-amber-400" size={18} />
              Areas to Improve
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {overallImprovements.length > 0 ? (
              overallImprovements.map((improvement, idx) => (
                <div key={idx} className="p-2.5 bg-amber-500/10 rounded-lg border border-amber-500/20">
                  <p className="text-sm text-amber-300">→ {improvement}</p>
                </div>
              ))
            ) : (
              <div className="text-center py-4 space-y-2">
                {generatingInsights ? (
                  <>
                    <div className="animate-pulse flex justify-center">
                      <Sparkles className="text-blue-400" size={24} />
                    </div>
                    <p className="text-sm text-slate-400">Analyzing areas for growth...</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-slate-400">
                      {subjectPerformance.length === 0 
                        ? 'No subject data available yet'
                        : 'Click "Refresh Insights" to generate'}
                    </p>
                    {subjectPerformance.length === 0 && (
                      <p className="text-xs text-slate-500">
                        Complete topic-based assessments to see improvement areas
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Subject Performance Cards */}
        {aiInsights.map((insight, idx) => (
          <Card key={idx} className="col-span-6 bg-slate-800 border-slate-700">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-white flex items-center gap-2">
                  <Brain className="text-blue-400" size={18} />
                  {insight.subject}
                </CardTitle>
                <span className={`text-xs px-3 py-1 rounded-full border font-medium ${getPerformanceColor(insight.performance)}`}>
                  {insight.performance}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Subject Stats */}
              <div className="grid grid-cols-3 gap-3">
                {subjectPerformance.find(s => s.subject === insight.subject) && (
                  <>
                    <div className="text-center p-2 bg-slate-700/50 rounded border border-slate-600">
                      <p className={`text-xl font-bold ${getAccuracyColor(subjectPerformance.find(s => s.subject === insight.subject)!.avgAccuracy)}`}>
                        {subjectPerformance.find(s => s.subject === insight.subject)!.avgAccuracy}%
                      </p>
                      <p className="text-xs text-slate-400 mt-1">Accuracy</p>
                    </div>
                    <div className="text-center p-2 bg-slate-700/50 rounded border border-slate-600">
                      <p className="text-xl font-bold text-white">
                        {subjectPerformance.find(s => s.subject === insight.subject)!.correctAnswers}/
                        {subjectPerformance.find(s => s.subject === insight.subject)!.totalQuestions}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">Questions</p>
                    </div>
                    <div className="text-center p-2 bg-slate-700/50 rounded border border-slate-600">
                      <p className="text-xl font-bold text-white">
                        {subjectPerformance.find(s => s.subject === insight.subject)!.avgTime}s
                      </p>
                      <p className="text-xs text-slate-400 mt-1">Avg Time</p>
                    </div>
                  </>
                )}
              </div>

              {/* AI Analysis */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-semibold text-emerald-400 mb-2 flex items-center gap-1">
                    <TrendingUp size={14} /> Strengths
                  </p>
                  <div className="space-y-1.5">
                    {insight.strengths.map((strength, i) => (
                      <p key={i} className="text-xs text-slate-300 bg-slate-700/30 p-2 rounded">• {strength}</p>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1">
                    <TrendingDown size={14} /> Improvements
                  </p>
                  <div className="space-y-1.5">
                    {insight.improvements.map((improvement, i) => (
                      <p key={i} className="text-xs text-slate-300 bg-slate-700/30 p-2 rounded">• {improvement}</p>
                    ))}
                  </div>
                </div>
              </div>

              {/* Recommendation */}
              <div className="pt-3 border-t border-slate-700">
                <p className="text-xs font-semibold text-blue-400 mb-2 flex items-center gap-1">
                  <Lightbulb size={14} /> AI Recommendation
                </p>
                <p className="text-sm text-white bg-blue-500/10 p-2.5 rounded-lg border border-blue-500/20">
                  {insight.recommendation}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}