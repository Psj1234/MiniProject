'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Trash2, ChevronDown, Clock, Loader2, ArrowUpDown, ChevronRight, Eye, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// --- IMPORT OUR NEW COMPONENTS ---
import QuizAnalysis from './quiz-analysis'
import StudentAnswerModal from './student-answer-modal'

// 1. Types for the main quiz list (from get_professor_quiz_list)
interface ProfessorQuiz {
  id: string // This is a uuid
  title: string
  course_name: string
  topic_count: number
  question_count: number
  submission_count: number
  time_limit: number
}

// 2. Types for the student results (from get_quiz_student_results)
interface StudentQuizResult {
  quiz_result_id: string // uuid
  student_uid: number // This is the bigint student_id
  student_name: string
  score: number
  total_questions: number
  percentage: number
  time_taken_seconds: number
  submitted_at: string
}

// 3. Type for quiz questions
interface QuizQuestion {
  id: number
  question_text: string
  options: string[] // JSON parsed
  correct_answer: string
  difficulty: string
  topic_name: string
}

// 4. Types for the sorting state
type SortKey = keyof StudentQuizResult | null
type SortDirection = 'asc' | 'desc'

interface SortConfig {
  key: SortKey
  direction: SortDirection
}

interface ProfessorQuizzesProps {
  onCreateQuiz: () => void
}

const supabase = createClient()

export default function ProfessorQuizzes({ onCreateQuiz }: ProfessorQuizzesProps) {
  // Main quiz list state
  const [quizzes, setQuizzes] = useState<ProfessorQuiz[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // State for the expanded quiz
  const [expandedQuizId, setExpandedQuizId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'results' | 'questions'>('results')
  const [studentResults, setStudentResults] = useState<StudentQuizResult[]>([])
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([])
  const [isResultsLoading, setIsResultsLoading] = useState(false)
  const [isQuestionsLoading, setIsQuestionsLoading] = useState(false)

  // State for delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  
  // State for sorting the student list
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: 'percentage',
    direction: 'desc',
  })
  
  // State for the student answer modal
  const [selectedResult, setSelectedResult] = useState<StudentQuizResult | null>(null)


  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds === null) return "N/A"
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // --- Data Fetching ---

  useEffect(() => {
    const fetchQuizzes = async () => {
      setIsLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError("You must be logged in.")
        setIsLoading(false)
        return
      }

      const { data, error: rpcError } = await supabase.rpc(
        'get_professor_quiz_list',
        { prof_id: user.id }
      )

      if (rpcError) {
        console.error("RPC Error:", rpcError)
        setError(`Failed to fetch quizzes: ${rpcError.message}`)
      } else {
        setQuizzes(data || [])
      }
      setIsLoading(false)
    }

    fetchQuizzes()
  }, [])

  const fetchStudentResults = async (quizId: string) => {
    setIsResultsLoading(true)
    setStudentResults([]) 

    const { data, error: rpcError } = await supabase.rpc(
      'get_quiz_student_results',
      { quiz_id_in: quizId }
    )

    if (rpcError) {
      console.error(rpcError)
    } else {
      setStudentResults(data || [])
    }
    setIsResultsLoading(false)
  }

  const fetchQuizQuestions = async (quizId: string) => {
    setIsQuestionsLoading(true)
    setQuizQuestions([])

    // First get the question IDs for this quiz
    const { data: quizQuestionsData, error: quizQuestionsError } = await supabase
      .from('quiz_questions')
      .select('question_id')
      .eq('quiz_id', quizId)

    if (quizQuestionsError) {
      console.error('Error fetching quiz questions:', quizQuestionsError)
      setIsQuestionsLoading(false)
      return
    }

    const questionIds = quizQuestionsData.map(item => item.question_id)

    if (questionIds.length === 0) {
      setIsQuestionsLoading(false)
      return
    }

    // Now fetch the actual question details
    const { data, error } = await supabase
      .from('questions')
      .select(`
        id,
        question_text,
        options,
        correct_answer,
        difficulty,
        topics (
          name
        )
      `)
      .in('id', questionIds)

    if (error) {
      console.error('Error fetching questions:', error)
    } else if (data) {
      const formattedQuestions: QuizQuestion[] = data.map((item: any) => ({
        id: item.id,
        question_text: item.question_text,
        options: JSON.parse(item.options),
        correct_answer: item.correct_answer,
        difficulty: item.difficulty,
        topic_name: item.topics?.name || 'Unknown Topic'
      }))
      setQuizQuestions(formattedQuestions)
    }
    setIsQuestionsLoading(false)
  }

  const handleExpandToggle = (quizId: string) => {
    const newExpandedId = expandedQuizId === quizId ? null : quizId
    setExpandedQuizId(newExpandedId)
    setActiveTab('results') // Reset to results tab

    if (newExpandedId !== null) {
      fetchStudentResults(newExpandedId)
    }
  }

  const handleTabChange = (tab: 'results' | 'questions') => {
    setActiveTab(tab)
    if (tab === 'questions' && expandedQuizId && quizQuestions.length === 0) {
      fetchQuizQuestions(expandedQuizId)
    }
  }

  // --- HANDLERS FOR FEATURES ---

  const handleSort = (key: SortKey) => {
    let direction: SortDirection = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const sortedResults = useMemo(() => {
    if (!studentResults) return []
    
    return [...studentResults].sort((a, b) => {
      if (!sortConfig.key) return 0

      const aValue = a[sortConfig.key]
      const bValue = b[sortConfig.key]

      if (aValue === null || aValue === undefined) return 1
      if (bValue === null || bValue === undefined) return -1

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1
      }
      return 0
    })
  }, [studentResults, sortConfig])

  const handleStudentClick = (result: StudentQuizResult) => {
    setSelectedResult(result)
  }

  // --- DELETE FUNCTIONALITY ---
  const handleDeleteClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent expanding the quiz card
    setDeleteConfirmId(id)
  }

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId) return
    
    setIsDeleting(true)
    try {
      // Delete quiz_questions first (foreign key constraint)
      const { error: questionsError } = await supabase
        .from('quiz_questions')
        .delete()
        .eq('quiz_id', deleteConfirmId)

      if (questionsError) throw questionsError

      // Delete quiz_assignments if any
      const { error: assignmentsError } = await supabase
        .from('quiz_assignments')
        .delete()
        .eq('quiz_id', deleteConfirmId)

      if (assignmentsError) throw assignmentsError

      // Delete the quiz itself
      const { error: quizError } = await supabase
        .from('quizzes')
        .delete()
        .eq('id', deleteConfirmId)

      if (quizError) throw quizError

      // Update UI
      setQuizzes(quizzes.filter((q) => q.id !== deleteConfirmId))
      setDeleteConfirmId(null)
      setError(null)
    } catch (err: any) {
      setError(`Failed to delete quiz: ${err.message}`)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDeleteCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleteConfirmId(null)
  }

  // --- Render Logic ---

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="mx-auto h-12 w-12 animate-spin text-blue-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 text-center"><p className="text-red-400">{error}</p></div>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Quiz Management</h2>
          <p className="text-slate-400">Create and manage quizzes for your courses</p>
        </div>
        <Button onClick={onCreateQuiz} className="bg-blue-600 hover:bg-blue-700 text-white">
          Create New Quiz
        </Button>
      </div>

      {/* Quiz List */}
      {quizzes.length === 0 ? (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-12 pb-12 text-center">
            <p className="text-slate-400 mb-4">No quizzes created yet</p>
            <Button onClick={onCreateQuiz} className="bg-blue-600 hover:bg-blue-700 text-white">
              Create Your First Quiz
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {quizzes.map((quiz) => (
            <div key={quiz.id}>
              {/* Main Quiz Card */}
              <Card className="bg-slate-800 border-slate-700 hover:border-slate-600 transition">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-white">{quiz.title}</CardTitle>
                      <CardDescription className="text-slate-400">{quiz.course_name}</CardDescription>
                    </div>
                    {deleteConfirmId === quiz.id ? (
                      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          onClick={handleDeleteConfirm}
                          disabled={isDeleting}
                          size="sm"
                          className="bg-red-600 hover:bg-red-700 text-white"
                        >
                          {isDeleting ? <Loader2 size={14} className="animate-spin" /> : 'Confirm'}
                        </Button>
                        <Button
                          onClick={handleDeleteCancel}
                          disabled={isDeleting}
                          size="sm"
                          variant="ghost"
                          className="text-slate-400"
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        onClick={(e) => handleDeleteClick(quiz.id, e)}
                        variant="ghost"
                        size="icon"
                        className="text-red-400 hover:bg-red-500/20"
                      >
                        <Trash2 size={18} />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <div className="flex items-center gap-8">
                    <div><p className="text-sm text-slate-400">Topics</p><p className="text-lg font-semibold text-white">{quiz.topic_count}</p></div>
                    <div><p className="text-sm text-slate-400">Questions</p><p className="text-lg font-semibold text-white">{quiz.question_count}</p></div>
                    <div><p className="text-sm text-slate-400">Time Limit</p><p className="text-lg font-semibold text-white flex items-center gap-1"><Clock size={16} /> {quiz.time_limit}m</p></div>
                    <div><p className="text-sm text-slate-400">Submissions</p><p className="text-lg font-semibold text-white">{quiz.submission_count}</p></div>
                  </div>
                  <Button onClick={() => handleExpandToggle(quiz.id)} className="bg-slate-700 hover:bg-slate-600 text-white">
                    <ChevronDown size={18} className={`transition ${expandedQuizId === quiz.id ? 'rotate-180' : ''}`} />
                  </Button>
                </CardContent>
              </Card>

              {/* --- EXPANDED VIEW --- */}
              {expandedQuizId === quiz.id && (
                <div className="bg-slate-700/30 border border-slate-600 mt-2 rounded-lg p-4 space-y-4">
                  {/* Tab Navigation */}
                  <div className="flex gap-2 border-b border-slate-600">
                    <button
                      onClick={() => handleTabChange('results')}
                      className={`px-4 py-2 font-medium transition ${
                        activeTab === 'results'
                          ? 'text-blue-400 border-b-2 border-blue-400'
                          : 'text-slate-400 hover:text-slate-300'
                      }`}
                    >
                      Student Results ({studentResults.length})
                    </button>
                    <button
                      onClick={() => handleTabChange('questions')}
                      className={`px-4 py-2 font-medium transition flex items-center gap-2 ${
                        activeTab === 'questions'
                          ? 'text-blue-400 border-b-2 border-blue-400'
                          : 'text-slate-400 hover:text-slate-300'
                      }`}
                    >
                      <Eye size={16} />
                      View Questions ({quiz.question_count})
                    </button>
                  </div>

                  {/* Tab Content */}
                  {activeTab === 'results' ? (
                    isResultsLoading ? (
                      <div className="flex items-center justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
                        <p className="ml-3 text-slate-300">Loading student results...</p>
                      </div>
                    ) : studentResults.length === 0 ? (
                      <p className="text-slate-400 text-center py-4">No submissions yet</p>
                    ) : (
                      <>
                        <QuizAnalysis results={studentResults} />
                        <Card className="bg-slate-800 border-slate-700">
                          <CardHeader>
                            <CardTitle className="text-white text-lg">Student Results ({sortedResults.length})</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-10 gap-4 px-4 py-2 border-b border-slate-600 text-sm font-medium text-slate-400">
                              <Button variant="ghost" className="col-span-3 p-0 justify-start hover:text-white" onClick={() => handleSort('student_name')}>
                                Name <ArrowUpDown size={14} className="ml-2" />
                              </Button>
                              <Button variant="ghost" className="col-span-2 p-0 justify-start hover:text-white" onClick={() => handleSort('student_uid')}>
                                Student ID <ArrowUpDown size={14} className="ml-2" />
                              </Button>
                              <Button variant="ghost" className="col-span-2 p-0 justify-end hover:text-white" onClick={() => handleSort('percentage')}>
                                Score <ArrowUpDown size={14} className="ml-2" />
                              </Button>
                              <Button variant="ghost" className="col-span-2 p-0 justify-end hover:text-white" onClick={() => handleSort('time_taken_seconds')}>
                                Time Taken <ArrowUpDown size={14} className="ml-2" />
                              </Button>
                              <div className="col-span-1"></div>
                            </div>
                            <div className="space-y-2 mt-2 max-h-96 overflow-y-auto">
                              {sortedResults.map((result) => (
                                <div
                                  key={result.quiz_result_id}
                                  className="grid grid-cols-10 gap-4 p-4 rounded-lg bg-slate-700/30 items-center cursor-pointer hover:bg-slate-700/60"
                                  onClick={() => handleStudentClick(result)}
                                >
                                  <p className="col-span-3 text-white font-medium">{result.student_name}</p>
                                  <p className="col-span-2 text-slate-400">{result.student_uid}</p>
                                  <p className="col-span-2 text-right text-xl font-bold text-blue-400">{result.percentage}%</p>
                                  <p className="col-span-2 text-right text-slate-300 flex items-center justify-end gap-1">
                                    <Clock size={14} />
                                    {formatTime(result.time_taken_seconds)}
                                  </p>
                                  <ChevronRight size={18} className="text-slate-500 col-span-1 justify-self-end" />
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      </>
                    )
                  ) : (
                    // Questions Tab
                    isQuestionsLoading ? (
                      <div className="flex items-center justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
                        <p className="ml-3 text-slate-300">Loading questions...</p>
                      </div>
                    ) : quizQuestions.length === 0 ? (
                      <p className="text-slate-400 text-center py-4">No questions found</p>
                    ) : (
                      <div className="space-y-4">
                        {quizQuestions.map((question, index) => (
                          <Card key={question.id} className="bg-slate-800 border-slate-700">
                            <CardHeader className="pb-3">
                              <div className="flex items-start justify-between">
                                <CardTitle className="text-white text-base">
                                  Question {index + 1}
                                </CardTitle>
                                <div className="flex gap-2">
                                  <span className="px-2 py-1 text-xs rounded-full bg-blue-500/20 text-blue-400">
                                    {question.topic_name}
                                  </span>
                                  <span className={`px-2 py-1 text-xs rounded-full ${
                                    question.difficulty === 'easy' ? 'bg-green-500/20 text-green-400' :
                                    question.difficulty === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                                    'bg-red-500/20 text-red-400'
                                  }`}>
                                    {question.difficulty}
                                  </span>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <p className="text-slate-200 text-lg">{question.question_text}</p>
                              <div className="space-y-2">
                                {question.options.map((option, optIndex) => (
                                  <div
                                    key={optIndex}
                                    className={`p-3 rounded-lg border ${
                                      option === question.correct_answer
                                        ? 'bg-green-500/10 border-green-500/50 text-green-300'
                                        : 'bg-slate-700/50 border-slate-600 text-slate-300'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">{String.fromCharCode(65 + optIndex)}.</span>
                                      <span>{option}</span>
                                      {option === question.correct_answer && (
                                        <span className="ml-auto text-xs bg-green-500/20 px-2 py-1 rounded">
                                          Correct Answer
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Student Answer Modal */}
      {selectedResult && (
        <StudentAnswerModal
          quizResultId={selectedResult.quiz_result_id}
          studentName={selectedResult.student_name}
          onClose={() => setSelectedResult(null)}
        />
      )}
    </div>
  )
}