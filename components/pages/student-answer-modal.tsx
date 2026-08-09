'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { Loader2, X, Check, Clock } from 'lucide-react'

// Define the shape of an answer (from get_student_quiz_answers)
interface StudentAnswer {
  question_text: string
  selected_answer: string
  correct_answer: string
  is_correct: boolean
  time_taken_seconds: number
  topic_name: string
}

interface StudentAnswerModalProps {
  quizResultId: string
  studentName: string
  onClose: () => void
}

const supabase = createClient()

export default function StudentAnswerModal({
  quizResultId,
  studentName,
  onClose,
}: StudentAnswerModalProps) {
  const [answers, setAnswers] = useState<StudentAnswer[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchAnswers = async () => {
      if (!quizResultId) return;
      setIsLoading(true)
      const { data, error } = await supabase.rpc(
        'get_student_quiz_answers',
        { quiz_result_id_in: quizResultId }
      )

      if (error) {
        console.error("Failed to fetch answers:", error)
      } else {
        setAnswers(data || [])
      }
      setIsLoading(false)
    }

    fetchAnswers()
  }, [quizResultId])

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl bg-slate-800 border-slate-700 max-h-[90vh] flex flex-col">
        <CardHeader className="flex-shrink-0 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-white text-xl">Answer Details</CardTitle>
              <CardDescription className="text-slate-400">{studentName}</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="text-slate-400 hover:bg-slate-700">
              <X size={20} />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex-grow overflow-y-auto space-y-3 pt-4">
          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
            </div>
          ) : (
            answers.map((answer, idx) => (
              <div key={idx} className="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-white font-medium flex-1 pr-4">
                    {idx + 1}. {answer.question_text}
                  </p>
                  <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded-full ml-4 whitespace-nowrap">
                    {answer.topic_name || 'General'}
                  </span>
                </div>

                <div className="space-y-2">
                  <div className={`flex items-start p-2 rounded ${
                    answer.is_correct 
                      ? 'bg-emerald-500/10' 
                      : 'bg-red-500/10'
                  }`}>
                    <span className="mr-2 mt-1 flex-shrink-0">
                      {answer.is_correct 
                        ? <Check size={16} className="text-emerald-400" /> 
                        : <X size={16} className="text-red-400" />}
                    </span>
                    <div>
                      <p className="text-sm text-slate-400">Selected Answer</p>
                      <p className="text-white">{answer.selected_answer}</p>
                    </div>
                  </div>

                  {!answer.is_correct && (
                    <div className="flex items-start p-2 rounded bg-slate-600/50">
                      <Check size={16} className="text-emerald-400 mr-2 mt-1 flex-shrink-0" />
                      <div>
                        <p className="text-sm text-slate-400">Correct Answer</p>
                        <p className="text-white">{answer.correct_answer}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end text-sm text-slate-400 mt-2">
                  <Clock size={14} className="mr-1" />
                  <span>Time: {answer.time_taken_seconds}s</span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}