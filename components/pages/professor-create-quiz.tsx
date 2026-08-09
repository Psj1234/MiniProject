'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Trash2, Loader2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// --- 1. Define types for fetched data ---
interface Course {
  id: string // uuid
  name: string
}

interface AvailableTopic {
  id: string // uuid
  name: string
}

// --- 2. This is the UI state for each topic row ---
interface TopicRow {
  id: string // React key (e.g., Date.now())
  topic_id: string // The Topic's UUID from Supabase
  easy: number
  medium: number
  hard: number
}

// --- Helper type for the 'item' in handleCreateQuiz
interface TopicPayloadItem {
  topic_id: string
  numQuestions: number
  difficulty: string
}

interface ProfessorCreateQuizProps {
  onBack: () => void
}

const supabase = createClient()

export default function ProfessorCreateQuiz({ onBack }: ProfessorCreateQuizProps) {
  const [quizTitle, setQuizTitle] = useState('')
  const [selectedCourse, setSelectedCourse] = useState('') // Will store Course ID
  const [topicRows, setTopicRows] = useState<TopicRow[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [availableTopics, setAvailableTopics] = useState<AvailableTopic[]>([])
  const [isLoadingCourses, setIsLoadingCourses] = useState(true)
  const [isLoadingTopics, setIsLoadingTopics] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // New topic creation states
  const [showNewTopicInput, setShowNewTopicInput] = useState(false)
  const [newTopicName, setNewTopicName] = useState('')
  const [isCreatingTopic, setIsCreatingTopic] = useState(false)

  // --- 5. Data Fetching: Get Professor's Courses ---
  useEffect(() => {
    const fetchCourses = async () => {
      setIsLoadingCourses(true)
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setError("You must be logged in.")
        setIsLoadingCourses(false)
        return
      }

      const { data, error } = await supabase
        .from('course_teachers')
        .select('courses (id, name)') // Join with courses table
        .eq('teacher_id', user.id)

      if (error) {
        setError(`Failed to fetch courses: ${error.message}`)
      } else if (data) {
        const fetchedCourses = data
          .flatMap((item: { courses: Course[] | null }) => item.courses || [])
          .filter(Boolean) as Course[]
        setCourses(fetchedCourses)
      }
      setIsLoadingCourses(false)
    }

    fetchCourses()
  }, [])

  // --- 6. Data Fetching: Get Topics when Course changes ---
  useEffect(() => {
    if (!selectedCourse) {
      setAvailableTopics([])
      setTopicRows([]) // Clear topics rows if course is deselected
      setShowNewTopicInput(false)
      return
    }

    const fetchTopics = async () => {
      setIsLoadingTopics(true)
      setTopicRows([]) // Clear previous topics

      const { data, error } = await supabase
        .from('topics')
        .select('id, name')
        .eq('course_id', selectedCourse) // Get topics for the selected course

      if (error) {
        setError(`Failed to fetch topics: ${error.message}`)
      } else {
        setAvailableTopics(data)
      }
      setIsLoadingTopics(false)
    }

    fetchTopics()
  }, [selectedCourse])

  // --- 7. UI State Management ---
  const handleAddTopic = () => {
    const newTopicRow: TopicRow = {
      id: Date.now().toString(),
      topic_id: '', // Empty, user must select
      easy: 0,
      medium: 0,
      hard: 0,
    }
    setTopicRows([...topicRows, newTopicRow])
  }

  const handleRemoveTopic = (id: string) => {
    setTopicRows(topicRows.filter((t) => t.id !== id))
  }

  const handleTopicChange = (id: string, field: keyof TopicRow, value: string | number) => {
    setTopicRows(
      topicRows.map((t) => (t.id === id ? { ...t, [field]: value } : t))
    )
  }

  // --- NEW: Create new topic in database ---
  const handleCreateNewTopic = async () => {
    if (!newTopicName.trim()) {
      setError('Please enter a topic name.')
      return
    }

    if (!selectedCourse) {
      setError('Please select a course first.')
      return
    }

    setIsCreatingTopic(true)
    setError(null)

    try {
      const { data, error: insertError } = await supabase
        .from('topics')
        .insert({
          name: newTopicName.trim(),
          course_id: selectedCourse
        })
        .select('id, name')
        .single()

      if (insertError) throw insertError

      // Add the new topic to available topics
      setAvailableTopics([...availableTopics, data])
      
      // Clear the input and hide the form
      setNewTopicName('')
      setShowNewTopicInput(false)

      // Show success message briefly
      const tempError = error
      setError(`✓ Topic "${data.name}" created successfully!`)
      setTimeout(() => {
        if (error === `✓ Topic "${data.name}" created successfully!`) {
          setError(tempError)
        }
      }, 3000)
    } catch (err: any) {
      setError(`Failed to create topic: ${err.message}`)
    } finally {
      setIsCreatingTopic(false)
    }
  }

  // --- 8. The "Create Quiz" Function (Calls Edge Function) ---
  const handleCreateQuiz = async () => {
    if (!quizTitle || !selectedCourse || topicRows.length === 0) {
      setError('Please fill in Quiz Title, select a Course, and add at least one Topic.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    const topicsPayload = topicRows
      .flatMap((row) => [
        { topic_id: row.topic_id, numQuestions: row.easy, difficulty: 'easy' },
        { topic_id: row.topic_id, numQuestions: row.medium, difficulty: 'medium' },
        { topic_id: row.topic_id, numQuestions: row.hard, difficulty: 'hard' },
      ])
      .filter((item: TopicPayloadItem) => item.numQuestions > 0 && item.topic_id)

    if (topicsPayload.length === 0) {
      setError('Please add at least one question to a topic.')
      setIsSubmitting(false)
      return
    }

    try {
      const { data, error: funcError } = await supabase.functions.invoke('createQuiz', {
        body: {
          course_id: selectedCourse, // Pass course_id
          title: quizTitle,
          topics: topicsPayload,
        },
      })

      if (funcError) {
        // Try to parse the error message if it's a JSON string
        try {
          const errObj = JSON.parse(funcError.message)
          throw new Error(errObj.error || funcError.message)
        } catch (e) {
          throw new Error(funcError.message)
        }
      }

      // Success!
      alert(`Quiz "${quizTitle}" created successfully! Quiz ID: ${data.quizId}`)
      onBack() // Go back to the quiz list
    } catch (err: any) {
      console.error(err)
      setError(`Failed to create quiz: ${err.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const totalQuestions = topicRows.reduce((sum, t) => sum + t.easy + t.medium + t.hard, 0)

  // --- Render Logic ---
  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Create New Quiz</h2>
          <p className="text-slate-400">
            Define your quiz structure with topics and difficulty levels
          </p>
        </div>

        {/* --- Quiz Information Card --- */}
        <Card className="bg-slate-800 border-slate-700 mb-8">
          <CardHeader>
            <CardTitle className="text-white">Quiz Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Quiz Title */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Quiz Title
              </label>
              <Input
                type="text"
                placeholder="Enter quiz title"
                value={quizTitle}
                onChange={(e) => setQuizTitle(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>

            {/* Course Selection */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Course</label>
              <select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50"
                disabled={isLoadingCourses}
              >
                <option value="">
                  {isLoadingCourses ? 'Loading courses...' : 'Select a course'}
                </option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Info message about time limit */}
            <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/30">
              <p className="text-sm text-slate-300">
                ℹ️ Time limits will be set when you assign this quiz to students
              </p>
            </div>
          </CardContent>
        </Card>

        {/* --- Topics Section --- */}
        <Card className="bg-slate-800 border-slate-700 mb-8">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-white">Topics & Questions</CardTitle>
            <div className="flex gap-2">
              <Button
                onClick={() => setShowNewTopicInput(!showNewTopicInput)}
                variant="outline"
                className="border-slate-600 text-slate-200 hover:bg-slate-700"
                disabled={!selectedCourse || isLoadingTopics}
              >
                <Plus size={16} className="mr-2" />
                New Topic
              </Button>
              <Button
                onClick={handleAddTopic}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                disabled={!selectedCourse || isLoadingTopics}
              >
                + Add Topic
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedCourse && (
              <p className="text-slate-400 text-center py-8">
                Please select a course to add topics.
              </p>
            )}

            {/* NEW: Create Topic Form */}
            {showNewTopicInput && selectedCourse && (
              <div className="p-4 bg-slate-700/50 rounded-lg border border-blue-500/30 space-y-3">
                <label className="block text-sm font-medium text-slate-300">
                  Create New Topic
                </label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Enter topic name"
                    value={newTopicName}
                    onChange={(e) => setNewTopicName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateNewTopic()
                    }}
                    className="flex-1 bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                    disabled={isCreatingTopic}
                  />
                  <Button
                    onClick={handleCreateNewTopic}
                    disabled={isCreatingTopic || !newTopicName.trim()}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {isCreatingTopic ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Create'
                    )}
                  </Button>
                  <Button
                    onClick={() => {
                      setShowNewTopicInput(false)
                      setNewTopicName('')
                    }}
                    variant="ghost"
                    className="text-slate-400"
                    disabled={isCreatingTopic}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {selectedCourse && topicRows.length === 0 && !isLoadingTopics && !showNewTopicInput && (
              <p className="text-slate-400 text-center py-8">
                No topics added yet. Click "Add Topic" to begin.
              </p>
            )}

            {isLoadingTopics && (
              <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
              </div>
            )}

            {!isLoadingTopics &&
              topicRows.map((topic) => (
                <div
                  key={topic.id}
                  className="p-4 bg-slate-700/50 rounded-lg space-y-4 border border-slate-600"
                >
                  <div className="flex items-end gap-4">
                    {/* Topic Selection */}
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Topic
                      </label>
                      <select
                        value={topic.topic_id}
                        onChange={(e) =>
                          handleTopicChange(topic.id, 'topic_id', e.target.value)
                        }
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50"
                        disabled={isLoadingTopics}
                      >
                        <option value="">Select topic</option>
                        {availableTopics.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Easy Questions */}
                    <div className="w-24">
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Easy
                      </label>
                      <Input
                        type="number"
                        min="0"
                        value={topic.easy}
                        onChange={(e) =>
                          handleTopicChange(topic.id, 'easy', parseInt(e.target.value) || 0)
                        }
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                    </div>

                    {/* Medium Questions */}
                    <div className="w-24">
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Medium
                      </label>
                      <Input
                        type="number"
                        min="0"
                        value={topic.medium}
                        onChange={(e) =>
                          handleTopicChange(
                            topic.id,
                            'medium',
                            parseInt(e.target.value) || 0
                          )
                        }
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                    </div>

                    {/* Hard Questions */}
                    <div className="w-24">
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Hard
                      </label>
                      <Input
                        type="number"
                        min="0"
                        value={topic.hard}
                        onChange={(e) =>
                          handleTopicChange(topic.id, 'hard', parseInt(e.target.value) || 0)
                        }
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                    </div>

                    {/* Remove Button */}
                    <Button
                      onClick={() => handleRemoveTopic(topic.id)}
                      variant="ghost"
                      size="icon"
                      className="text-red-400 hover:bg-red-500/20 h-10 w-10"
                    >
                      <Trash2 size={18} />
                    </Button>
                  </div>
                </div>
              ))}

            {totalQuestions > 0 && !isLoadingTopics && (
              <div className="mt-6 p-4 bg-blue-500/10 rounded-lg border border-blue-500/30">
                <p className="text-slate-300">
                  Total Questions:{' '}
                  <span className="font-bold text-blue-400">{totalQuestions}</span>
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons & Error */}
        {error && (
          <p className={`text-center mb-4 ${error.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>
            {error}
          </p>
        )}

        <div className="flex gap-4">
          <Button
            onClick={onBack}
            variant="outline"
            className="flex-1 border-slate-600 text-slate-200 hover:bg-slate-700"
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateQuiz}
            disabled={
              !quizTitle ||
              !selectedCourse ||
              topicRows.length === 0 ||
              isSubmitting ||
              isLoadingTopics
            }
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isSubmitting ? 'Creating Quiz...' : 'Create Quiz'}
          </Button>
        </div>
      </div>
    </div>
  )
}