'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Clock, AlertCircle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Question {
  id: number
  text: string
  options: string[]
  correctAnswer: string
  difficulty?: string
  topic_id?: string
}

interface StudentTakeQuizProps {
  quizId: string
  onBack: () => void
}

interface QuestionTiming {
  questionId: number
  timeSpent: number
}

interface QuizData {
  title: string
  timeLimit: number
  questions: Question[]
}

export default function StudentTakeQuiz({ quizId, onBack }: StudentTakeQuizProps) {
  const [loading, setLoading] = useState(true)
  const [quiz, setQuiz] = useState<QuizData | null>(null)
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [answers, setAnswers] = useState<number[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [questionTimings, setQuestionTimings] = useState<QuestionTiming[]>([])
  const [questionStartTime, setQuestionStartTime] = useState(Date.now())
  const [timeUp, setTimeUp] = useState(false)
  const [studentId, setStudentId] = useState<number | null>(null)

  const supabase = createClient()

  useEffect(() => {
    fetchQuizData()
  }, [quizId])

  useEffect(() => {
    if (timeRemaining > 0 && !submitted) {
      const timer = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            setTimeUp(true)
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => clearInterval(timer)
    }
  }, [timeRemaining, submitted])

  const fetchQuizData = async () => {
    try {
      setLoading(true)

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        console.error('No user found')
        return
      }

      // Get student profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('student_id')
        .eq('id', user.id)
        .single()

      if (!profile?.student_id) {
        console.error('No student_id found')
        return
      }

      setStudentId(profile.student_id)

      // Get quiz details
      const { data: quizData, error: quizError } = await supabase
        .from('quizzes')
        .select('id, title, difficulty')
        .eq('id', quizId)
        .single()

      if (quizError) {
        console.error('Error fetching quiz:', quizError)
        return
      }

      // Get quiz assignment for time limit
      const { data: assignment } = await supabase
        .from('quiz_assignments')
        .select('time_limit_minutes')
        .eq('quiz_id', quizId)
        .single()

      const timeLimit = assignment?.time_limit_minutes || 30

      // Get question IDs first, then fetch questions
      const { data: quizQuestionLinks, error: linksError } = await supabase
        .from('quiz_questions')
        .select('question_id')
        .eq('quiz_id', quizId)

      if (linksError) {
        console.error('Error fetching question links:', linksError)
        return
      }

      if (!quizQuestionLinks || quizQuestionLinks.length === 0) {
        console.error('No questions found for this quiz')
        return
      }

      const questionIds = quizQuestionLinks.map(link => link.question_id)

      // Now fetch the actual questions
      const { data: questionsData, error: questionsError } = await supabase
        .from('questions')
        .select(`
          id,
          question_text,
          options,
          correct_answer,
          difficulty,
          topic_id
        `)
        .in('id', questionIds)

      if (questionsError) {
        console.error('Error fetching questions:', questionsError)
        return
      }

      // Process questions with robust option parsing
      const processedQuestions: Question[] = questionsData.map((q: any) => {
        let options: string[] = []
        
        try {
          if (typeof q.options === 'string') {
            const parsed = JSON.parse(q.options)
            if (Array.isArray(parsed)) {
              options = parsed
            } else if (parsed && typeof parsed === 'object') {
              // Handle object format like {"A": "...", "B": "...", "C": "...", "D": "..."}
              const keys = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
              options = keys
                .filter(key => parsed[key] !== undefined)
                .map(key => parsed[key])
            }
          } else if (Array.isArray(q.options)) {
            options = q.options
          } else if (q.options && typeof q.options === 'object') {
            // Handle object format like {"A": "...", "B": "...", "C": "...", "D": "..."}
            const keys = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
            options = keys
              .filter(key => q.options[key] !== undefined)
              .map(key => q.options[key])
          }
          
          // Ensure it's an array with content
          if (!Array.isArray(options) || options.length === 0) {
            console.error('Invalid options format for question:', q.id, q.options)
            options = []
          }
        } catch (error) {
          console.error('Error parsing options for question:', q.id, error)
          options = []
        }

        return {
          id: q.id,
          text: q.question_text || '',
          options,
          correctAnswer: q.correct_answer || '',
          difficulty: q.difficulty,
          topic_id: q.topic_id
        }
      })

      // Filter out questions with invalid options
      const validQuestions = processedQuestions.filter(q => q.options.length > 0)

      if (validQuestions.length === 0) {
        console.error('No valid questions found')
        return
      }

      console.log('✅ Quiz loaded:', {
        title: quizData.title,
        questions: validQuestions.length,
        timeLimit
      })

      setQuiz({
        title: quizData.title || 'Quiz',
        timeLimit,
        questions: validQuestions
      })

      setAnswers(new Array(validQuestions.length).fill(-1))
      setTimeRemaining(timeLimit * 60)
      setQuestionTimings(validQuestions.map(q => ({ questionId: q.id, timeSpent: 0 })))

    } catch (error) {
      console.error('Error loading quiz:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectAnswer = (optionIndex: number) => {
    const newAnswers = [...answers]
    newAnswers[currentQuestion] = optionIndex
    setAnswers(newAnswers)
  }

  const handleNext = () => {
    const timeSpent = Math.round((Date.now() - questionStartTime) / 1000)
    const updatedTimings = [...questionTimings]
    updatedTimings[currentQuestion].timeSpent += timeSpent
    setQuestionTimings(updatedTimings)
    setQuestionStartTime(Date.now())

    if (quiz && currentQuestion < quiz.questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1)
    }
  }

  const handlePrevious = () => {
    const timeSpent = Math.round((Date.now() - questionStartTime) / 1000)
    const updatedTimings = [...questionTimings]
    updatedTimings[currentQuestion].timeSpent += timeSpent
    setQuestionTimings(updatedTimings)
    setQuestionStartTime(Date.now())

    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1)
    }
  }

  const handleSubmit = async () => {
    if (!quiz || !studentId) return

    const timeSpent = Math.round((Date.now() - questionStartTime) / 1000)
    const updatedTimings = [...questionTimings]
    updatedTimings[currentQuestion].timeSpent += timeSpent
    setQuestionTimings(updatedTimings)

    // Calculate score
    const score = calculateScore()
    const maxScore = quiz.questions.length

    console.log('📝 Submitting quiz results:', { score, maxScore })

    try {
      // Save quiz result
      const { data: quizResult, error: resultError } = await supabase
        .from('quiz_results')
        .insert({
          quiz_id: quizId,
          student_uid: studentId,
          score,
          max_score: maxScore,
          taken_at: new Date().toISOString(),
          started_at: new Date(Date.now() - (quiz.timeLimit * 60 * 1000 - timeRemaining * 1000)).toISOString()
        })
        .select()
        .single()

      if (resultError) {
        console.error('Error saving quiz result:', resultError)
        throw resultError
      }

      // Save individual answers
      if (quizResult) {
        const answerRecords = quiz.questions.map((q, index) => {
          const selectedOption = answers[index] !== -1 ? q.options[answers[index]] : null
          const isCorrect = selectedOption === q.correctAnswer

          return {
            quiz_result_id: quizResult.id,
            question_id: q.id,
            selected_answer: selectedOption,
            is_correct: isCorrect,
            answered_at: new Date().toISOString(),
            time_taken_seconds: updatedTimings[index]?.timeSpent || 0,
            difficulty: q.difficulty,
            topic_id: q.topic_id,
            student_uid: studentId
          }
        })

        const { error: answersError } = await supabase
          .from('student_answers')
          .insert(answerRecords)

        if (answersError) {
          console.error('Error saving answers:', answersError)
          throw answersError
        }
      }

      console.log('✅ Quiz results saved successfully')
    } catch (error) {
      console.error('Error submitting quiz:', error)
      alert('Failed to submit quiz. Please try again.')
      return
    }

    setSubmitted(true)
  }

  const calculateScore = () => {
    if (!quiz) return 0
    return answers.reduce((score, answer, index) => {
      if (answer === -1) return score
      const selectedOption = quiz.questions[index].options[answer]
      return score + (selectedOption === quiz.questions[index].correctAnswer ? 1 : 0)
    }, 0)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Auto-submit when time runs out
  useEffect(() => {
    if (timeUp && !submitted) {
      handleSubmit()
    }
  }, [timeUp])

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-blue-400" />
          <div className="text-slate-400 text-lg">Loading quiz...</div>
        </div>
      </div>
    )
  }

  if (!quiz) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md bg-slate-800 border-slate-700">
          <CardContent className="pt-6 text-center">
            <p className="text-slate-400 mb-4">Quiz not found or unavailable</p>
            <Button onClick={onBack} className="bg-blue-600 hover:bg-blue-700">
              Back to Quizzes
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (submitted) {
    const score = calculateScore()
    const percentage = Math.round((score / quiz.questions.length) * 100)
    const totalTimeSpent = questionTimings.reduce((sum, t) => sum + t.timeSpent, 0)

    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-3xl bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-2xl text-white text-center">{quiz.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="text-center">
              <div className="text-6xl font-bold text-blue-400 mb-4">
                {score}/{quiz.questions.length}
              </div>
              <p className="text-2xl font-semibold text-white mb-2">Quiz Complete!</p>
              <p className="text-slate-400">
                You scored {percentage}% on this quiz
              </p>
              <p className="text-slate-400 text-sm mt-4 flex items-center justify-center gap-2">
                <Clock size={16} />
                Total time: {formatTime(totalTimeSpent)}
              </p>
            </div>

            <div className="bg-slate-700/50 rounded-lg p-6 space-y-4 max-h-[500px] overflow-y-auto">
              <h3 className="font-semibold text-white mb-4 sticky top-0 bg-slate-700/50 py-2 -mt-2">
                Answer Review
              </h3>
              {quiz.questions.map((q, index) => {
                const selectedAnswer = answers[index] !== -1 ? q.options[answers[index]] : null
                const isCorrect = selectedAnswer === q.correctAnswer
                const timeForQuestion = questionTimings[index]?.timeSpent || 0
                
                return (
                  <div key={q.id} className="border-b border-slate-600 pb-4 last:border-b-0">
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-sm text-slate-400 font-semibold">Question {index + 1}</p>
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock size={14} />
                        {formatTime(timeForQuestion)}
                      </span>
                    </div>
                    <p className="text-white font-medium mb-3">{q.text}</p>
                    
                    {/* Show all options with visual indicators */}
                    <div className="space-y-2 mb-3">
                      {q.options.map((option, optIndex) => {
                        const isSelectedAnswer = answers[index] === optIndex
                        const isCorrectAnswer = option === q.correctAnswer
                        
                        return (
                          <div
                            key={optIndex}
                            className={`p-3 rounded-lg border-2 ${
                              isCorrectAnswer
                                ? 'border-green-500 bg-green-500/10'
                                : isSelectedAnswer
                                ? 'border-red-500 bg-red-500/10'
                                : 'border-slate-600 bg-slate-700/30'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-slate-200">
                                <span className="font-semibold mr-2">
                                  {String.fromCharCode(65 + optIndex)}.
                                </span>
                                {option}
                              </span>
                              <div className="flex items-center gap-2">
                                {isSelectedAnswer && (
                                  <span className="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-300">
                                    Your Answer
                                  </span>
                                )}
                                {isCorrectAnswer && (
                                  <span className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-300">
                                    ✓ Correct
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Summary badge */}
                    <span
                      className={`inline-flex px-3 py-1 rounded text-sm font-semibold ${
                        isCorrect
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : selectedAnswer
                          ? 'bg-red-500/20 text-red-300'
                          : 'bg-slate-500/20 text-slate-300'
                      }`}
                    >
                      {isCorrect ? '✓ Correct' : selectedAnswer ? '✗ Incorrect' : '⊗ Not Answered'}
                    </span>
                  </div>
                )
              })}
            </div>

            <Button
              onClick={onBack}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              Back to Quizzes
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const question = quiz.questions[currentQuestion]
  const isTimeWarning = timeRemaining < 60
  const minutes = Math.floor(timeRemaining / 60)
  const seconds = timeRemaining % 60

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        {/* Quiz Header */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white mb-4">{quiz.title}</h2>
          <div className="flex items-center justify-between bg-slate-700/50 rounded-lg p-4">
            <div>
              <p className="text-sm text-slate-400">Progress</p>
              <p className="text-2xl font-bold text-white">
                Question {currentQuestion + 1} of {quiz.questions.length}
              </p>
            </div>
            <div className="w-48 bg-slate-700 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{
                  width: `${((currentQuestion + 1) / quiz.questions.length) * 100}%`,
                }}
              />
            </div>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              isTimeWarning ? 'bg-red-500/20 text-red-300' : 'bg-slate-700'
            }`}>
              <Clock size={18} />
              <span className="font-bold text-lg">
                {minutes}:{seconds.toString().padStart(2, '0')}
              </span>
            </div>
          </div>
          {isTimeWarning && (
            <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-300">
              <AlertCircle size={18} />
              <span className="text-sm">Time is running out!</span>
            </div>
          )}
        </div>

        {/* Question Navigation Grid */}
        <div className="mb-8 p-4 bg-slate-700/30 rounded-lg">
          <p className="text-sm text-slate-400 mb-3">Jump to question:</p>
          <div className="grid grid-cols-10 gap-2">
            {quiz.questions.map((_, index) => (
              <button
                key={index}
                onClick={() => {
                  const timeSpent = Math.round((Date.now() - questionStartTime) / 1000)
                  const updatedTimings = [...questionTimings]
                  updatedTimings[currentQuestion].timeSpent += timeSpent
                  setQuestionTimings(updatedTimings)
                  setQuestionStartTime(Date.now())
                  setCurrentQuestion(index)
                }}
                className={`h-10 rounded font-semibold transition ${
                  index === currentQuestion
                    ? 'bg-blue-600 text-white'
                    : answers[index] !== -1
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                }`}
              >
                {index + 1}
              </button>
            ))}
          </div>
        </div>

        {/* Question Card */}
        <Card className="bg-slate-800 border-slate-700 mb-8">
          <CardHeader>
            <CardTitle className="text-xl text-white">{question.text}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {question.options && question.options.length > 0 ? (
              question.options.map((option, index) => (
                <button
                  key={index}
                  onClick={() => handleSelectAnswer(index)}
                  className={`w-full p-4 rounded-lg border-2 transition text-left font-medium ${
                    answers[currentQuestion] === index
                      ? 'border-blue-500 bg-blue-500/20 text-white'
                      : 'border-slate-600 bg-slate-700/50 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <span className="inline-block w-8 h-8 rounded-full border-2 mr-3 text-center leading-6">
                    {String.fromCharCode(65 + index)}
                  </span>
                  {option}
                </button>
              ))
            ) : (
              <div className="text-slate-400 text-center p-4">
                No options available for this question
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation Buttons */}
        <div className="flex justify-between gap-4">
          <Button
            onClick={handlePrevious}
            disabled={currentQuestion === 0}
            className="bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-50"
          >
            Previous Question
          </Button>

          {currentQuestion === quiz.questions.length - 1 ? (
            <Button
              onClick={handleSubmit}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Submit Quiz
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Next Question
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}