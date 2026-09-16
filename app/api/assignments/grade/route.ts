import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Admin client helper to perform trusted grading updates
function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createServerClient(url, key, {
    cookies: {
      getAll() { return [] },
      setAll() {}
    }
  })
}

interface QuestionEvaluation {
  question_id: string
  marks_awarded: number
  strengths: string[]
  weaknesses: string[]
  missing_points: string[]
  feedback: string
  reasoning_summary: string
}

interface OverallReport {
  strengths: string[]
  weaknesses: string[]
  topic_performance: Array<{ topic: string; level: string }>
  recommendations: string[]
  overall_feedback: string
}

export async function POST(req: NextRequest) {
  let submissionId: string | null = null

  try {
    const body = await req.json()
    submissionId = body?.submissionId

    if (!submissionId) {
      return NextResponse.json({ error: 'Missing submissionId' }, { status: 400 })
    }

    // 1. Authenticate caller
    const supabase = await createClient()
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminDb = getAdminSupabase()

    // 2. Fetch submission record
    const { data: submission, error: subError } = await adminDb
      .from('assignment_submissions')
      .select(`
        id,
        assignment_id,
        student_uid,
        student_user_id,
        is_draft,
        grading_status,
        assignments (
          id,
          title,
          description,
          total_marks,
          professor_id
        )
      `)
      .eq('id', submissionId)
      .single()

    if (subError || !submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

    const assignment = submission.assignments as any
    const isStudentOwner = submission.student_user_id === user.id
    const isProfessor = assignment?.professor_id === user.id

    if (!isStudentOwner && !isProfessor) {
      return NextResponse.json(
        { error: 'Forbidden: You do not have permission to grade this submission' },
        { status: 403 }
      )
    }

    // Prevent duplicate active grading jobs
    if (submission.grading_status === 'grading') {
      return NextResponse.json(
        { message: 'AI grading is already in progress for this submission', status: 'grading' },
        { status: 200 }
      )
    }

    // Mark status as 'grading'
    await adminDb
      .from('assignment_submissions')
      .update({ grading_status: 'grading', updated_at: new Date().toISOString() })
      .eq('id', submissionId)

    await adminDb
      .from('assignment_recipients')
      .update({ status: 'grading' })
      .eq('assignment_id', submission.assignment_id)
      .eq('student_uid', submission.student_uid)

    // 3. Fetch questions and student answers
    const { data: questions, error: qError } = await adminDb
      .from('assignment_questions')
      .select('*')
      .eq('assignment_id', submission.assignment_id)
      .order('order_num', { ascending: true })

    if (qError || !questions || questions.length === 0) {
      throw new Error('No questions found for this assignment.')
    }

    const { data: answers, error: aError } = await adminDb
      .from('assignment_answers')
      .select('*')
      .eq('submission_id', submissionId)

    const answerMap = new Map<string, any>()
    ;(answers || []).forEach((a) => answerMap.set(a.question_id, a))

    // 4. Separate Objective and Subjective Questions
    const objectiveQuestions = questions.filter((q) => q.question_type !== 'subjective')
    const subjectiveQuestions = questions.filter((q) => q.question_type === 'subjective')

    let totalMarksAwarded = 0
    let totalPossibleMarks = 0

    // Grade Objective Questions Deterministically (No Groq call needed)
    for (const q of objectiveQuestions) {
      const maxMarks = Number(q.max_marks || 1)
      totalPossibleMarks += maxMarks

      const studentAnsObj = answerMap.get(q.id)
      const rawAns = (studentAnsObj?.student_answer || '').trim()
      const expectedAns = (q.correct_answer || '').trim()

      const isCorrect =
        rawAns.length > 0 &&
        expectedAns.length > 0 &&
        rawAns.toLowerCase() === expectedAns.toLowerCase()

      const marksAwarded = isCorrect ? maxMarks : 0
      totalMarksAwarded += marksAwarded

      await adminDb.from('assignment_answers').upsert(
        {
          submission_id: submissionId,
          question_id: q.id,
          student_answer: rawAns,
          marks_awarded: marksAwarded,
          max_marks: maxMarks,
          is_objective: true,
          ai_feedback: isCorrect
            ? 'Correct answer selected.'
            : `Incorrect selection. Expected: "${expectedAns}".`,
          ai_strengths: isCorrect ? ['Accurate answer choice'] : [],
          ai_weaknesses: isCorrect ? [] : ['Incorrect answer choice'],
          ai_missing_points: [],
          ai_reasoning: `Objective evaluation: student chose "${rawAns}", expected "${expectedAns}".`,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'submission_id,question_id' }
      )
    }

    // 5. Grade Subjective Questions using Groq AI
    let subjectiveEvaluations: QuestionEvaluation[] = []
    let overallReport: OverallReport = {
      strengths: ['Demonstrated submission completion.'],
      weaknesses: [],
      topic_performance: [],
      recommendations: ['Review assigned coursework topics.'],
      overall_feedback: 'Assignment evaluated successfully.'
    }

    if (subjectiveQuestions.length > 0) {
      subjectiveQuestions.forEach((q) => {
        totalPossibleMarks += Number(q.max_marks || 10)
      })

      const rawApiKey = (process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY || '').trim()
      const apiKey = rawApiKey.replace(/^["']|["']$/g, '').trim() || undefined

      // Groq decommissioned llama-3.3-70b-versatile and llama-3.1-8b-instant in August 2026.
      // We automatically prioritize active production models and fall back gracefully.
      const envModel = (process.env.GROQ_MODEL || '').trim()
      const isDecommissioned = envModel.includes('llama-3.3-70b') || envModel.includes('llama-3.1-8b')
      const preferredModel = (!envModel || isDecommissioned) ? 'openai/gpt-oss-120b' : envModel

      console.log('GROQ_API_KEY detected:', Boolean(apiKey))
      if (apiKey) {
        console.log(
          `[Groq AI Grading] Evaluator initialized. Preferred model: "${preferredModel}" | Key length: ${apiKey.length} | Prefix: ${apiKey.slice(0, 4)}...`
        )
      } else {
        console.warn(
          '[Groq AI Grading] GROQ_API_KEY is not defined in environment variables (checked GROQ_API_KEY and NEXT_PUBLIC_GROQ_API_KEY). Using baseline fallback. If you recently modified .env.local, please restart your Next.js server.'
        )
      }

      if (!apiKey) {
        // Fallback if GROQ_API_KEY is not set yet in local environment
        for (const q of subjectiveQuestions) {
          const maxMarks = Number(q.max_marks || 10)
          const studentAnsObj = answerMap.get(q.id)
          const text = (studentAnsObj?.student_answer || '').trim()
          const lengthScore = Math.min(maxMarks, Math.max(1, Math.round((text.length / 100) * (maxMarks * 0.7))))
          totalMarksAwarded += lengthScore

          await adminDb.from('assignment_answers').upsert(
            {
              submission_id: submissionId,
              question_id: q.id,
              student_answer: text,
              marks_awarded: lengthScore,
              max_marks: maxMarks,
              is_objective: false,
              ai_feedback: 'Answer submitted. (GROQ_API_KEY not configured for live AI evaluation).',
              ai_strengths: ['Response provided.'],
              ai_weaknesses: [],
              ai_missing_points: [],
              ai_reasoning: 'Configured baseline evaluation.',
              updated_at: new Date().toISOString()
            },
            { onConflict: 'submission_id,question_id' }
          )
        }
      } else {
        // Construct detailed prompt for Groq
        const promptQuestions = subjectiveQuestions.map((q, idx) => {
          const ans = answerMap.get(q.id)?.student_answer || ''
          return {
            number: idx + 1,
            question_id: q.id,
            question_text: q.question_text,
            max_marks: Number(q.max_marks || 10),
            rubric: q.rubric || 'Grade based on accuracy, conceptual clarity, completeness, and reasoning.',
            student_answer: ans.trim().length > 0 ? ans : '(No answer provided by student)'
          }
        })

        const systemMessage = `You are a university professor and rigorous academic evaluator.
Evaluate the student's subjective assignment answers strictly according to the provided question, maximum marks, and rubric.
Do NOT hallucinate or invent criteria that were not specified.
Grade fairly and objectively: if an answer is thorough and correct, award high marks; if an answer is empty or incorrect, award low or zero marks.

CRITICAL: You MUST respond ONLY with a valid, parseable JSON object matching this exact TypeScript structure:
{
  "questions": [
    {
      "question_id": "string (must match the question_id provided)",
      "marks_awarded": number (between 0 and max_marks inclusive),
      "strengths": ["string", "string"],
      "weaknesses": ["string"],
      "missing_points": ["string"],
      "feedback": "constructive 1-2 sentence feedback explaining the score",
      "reasoning_summary": "concise explanation of why these marks were awarded"
    }
  ],
  "overall_report": {
    "strengths": ["string", "string"],
    "weaknesses": ["string"],
    "topic_performance": [
      { "topic": "string", "level": "Strong" | "Moderate" | "Needs Improvement" }
    ],
    "recommendations": ["string", "string"],
    "overall_feedback": "detailed 2-3 sentence academic summary of the student's submission"
  }
}`

        const userMessage = `Assignment Title: ${assignment?.title || 'Academic Assignment'}
Assignment Description: ${assignment?.description || 'N/A'}

QUESTIONS TO EVALUATE:
${JSON.stringify(promptQuestions, null, 2)}`

        // List of candidate models to attempt in order of preference
        const candidateModels = Array.from(
          new Set([
            preferredModel,
            'openai/gpt-oss-120b',
            'qwen/qwen3.6-27b',
            'openai/gpt-oss-20b'
          ].filter(Boolean))
        )

        let groqResponse: Response | null = null
        let usedModel = ''
        let lastErrorText = ''
        let lastStatus = 0
        let lastStatusText = ''

        // Resilient model invocation with automatic fallback on 404 / deprecation
        for (const candidate of candidateModels) {
          try {
            console.log(`[Groq AI Grading] Calling Groq API with model: "${candidate}"...`)
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
              },
              body: JSON.stringify({
                model: candidate,
                messages: [
                  { role: 'system', content: systemMessage },
                  { role: 'user', content: userMessage }
                ],
                response_format: { type: 'json_object' },
                temperature: 0.2,
                max_tokens: 4000
              })
            })

            if (res.ok) {
              groqResponse = res
              usedModel = candidate
              console.log(`[Groq AI Grading] Successfully evaluated using model: "${candidate}"`)
              break
            }

            lastStatus = res.status
            lastStatusText = res.statusText
            lastErrorText = await res.text()

            const isModelUnavailable =
              res.status === 404 ||
              lastErrorText.includes('does not exist') ||
              lastErrorText.includes('decommission') ||
              lastErrorText.includes('deprecated') ||
              lastErrorText.includes('not have access')

            if (isModelUnavailable) {
              console.warn(
                `[Groq AI Grading] Model "${candidate}" is unavailable or deprecated (Status ${res.status}). Attempting next candidate...`
              )
              continue
            } else {
              // If it's a non-model error (e.g. 401 auth or 429 quota), stop early
              break
            }
          } catch (fetchErr: any) {
            console.warn(`[Groq AI Grading] Model request failed for "${candidate}":`, fetchErr?.message || fetchErr)
          }
        }

        if (!groqResponse || !groqResponse.ok) {
          let parsedErrorDetail = lastErrorText || 'No response from any Groq model candidates.'
          try {
            const errJson = JSON.parse(lastErrorText)
            parsedErrorDetail = errJson.error?.message || errJson.message || lastErrorText
          } catch {
            // Keep raw response text if not JSON
          }

          let failureCategory = 'Groq API Error'
          if (lastStatus === 401) {
            failureCategory = 'Groq Authentication Error (Invalid or expired API Key)'
          } else if (lastStatus === 429) {
            failureCategory = 'Groq Rate Limit / Quota Exceeded'
          } else if (lastStatus === 400 || lastStatus === 404) {
            failureCategory = 'Groq Model/Request Error (Check model availability or deprecation)'
          }

          console.error(
            `[Groq AI Grading] ${failureCategory} [Status ${lastStatus} ${lastStatusText}]:`,
            parsedErrorDetail
          )

          throw new Error(`[Groq ${lastStatus}] ${failureCategory}: ${parsedErrorDetail}`)
        }

        const groqData = await groqResponse.json()
        const content = groqData.choices?.[0]?.message?.content

        if (!content) {
          console.error('[Groq AI Grading] Groq returned empty completion payload:', groqData)
          throw new Error('Groq returned an empty response.')
        }

        let parsedResult: any
        try {
          parsedResult = JSON.parse(content)
        } catch (jsonErr: any) {
          console.error('[Groq AI Grading] Failed to parse JSON response from Groq. Raw content:', content)
          throw new Error(`Groq returned invalid JSON structure: ${jsonErr.message}`)
        }

        subjectiveEvaluations = parsedResult.questions || []
        if (parsedResult.overall_report) {
          overallReport = parsedResult.overall_report
        }

        // Validate and persist each question's evaluation
        for (const q of subjectiveQuestions) {
          const maxMarks = Number(q.max_marks || 10)
          const evalItem = subjectiveEvaluations.find((e) => e.question_id === q.id)
          const studentAnsObj = answerMap.get(q.id)
          const rawText = studentAnsObj?.student_answer || ''

          let marksAwarded = 0
          if (evalItem && typeof evalItem.marks_awarded === 'number') {
            marksAwarded = Math.max(0, Math.min(maxMarks, evalItem.marks_awarded))
          } else if (rawText.trim().length === 0) {
            marksAwarded = 0
          } else {
            marksAwarded = Math.round(maxMarks * 0.5) // Safe fallback
          }

          totalMarksAwarded += marksAwarded

          await adminDb.from('assignment_answers').upsert(
            {
              submission_id: submissionId,
              question_id: q.id,
              student_answer: rawText,
              marks_awarded: marksAwarded,
              max_marks: maxMarks,
              is_objective: false,
              ai_strengths: evalItem?.strengths || [],
              ai_weaknesses: evalItem?.weaknesses || [],
              ai_missing_points: evalItem?.missing_points || [],
              ai_feedback: evalItem?.feedback || 'Subjective evaluation completed.',
              ai_reasoning: evalItem?.reasoning_summary || 'Evaluation grounded in question rubric.',
              updated_at: new Date().toISOString()
            },
            { onConflict: 'submission_id,question_id' }
          )
        }
      }
    }

    // 6. Compute Final Aggregate Scores
    const finalPercentage =
      totalPossibleMarks > 0
        ? Math.min(100, Math.max(0, Math.round((totalMarksAwarded / totalPossibleMarks) * 100 * 10) / 10))
        : 0

    // 7. Update assignment_submissions with final graded state
    const { error: updateSubError } = await adminDb
      .from('assignment_submissions')
      .update({
        grading_status: 'graded',
        ai_score: totalMarksAwarded,
        final_score: totalMarksAwarded,
        percentage: finalPercentage,
        ai_strengths: overallReport.strengths || [],
        ai_weaknesses: overallReport.weaknesses || [],
        ai_topic_performance: overallReport.topic_performance || [],
        ai_recommendations: overallReport.recommendations || [],
        ai_overall_feedback: overallReport.overall_feedback || 'Submission successfully graded.',
        graded_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', submissionId)

    if (updateSubError) {
      console.error('Failed to update submission score:', updateSubError)
      throw updateSubError
    }

    // 8. Update assignment_recipients status
    await adminDb
      .from('assignment_recipients')
      .update({ status: 'graded' })
      .eq('assignment_id', submission.assignment_id)
      .eq('student_uid', submission.student_uid)

    return NextResponse.json({
      success: true,
      submissionId,
      totalMarksAwarded,
      totalPossibleMarks,
      percentage: finalPercentage,
      overallReport
    })
  } catch (error: any) {
    console.error('Grading route exception:', error)

    // In case of error, update status to 'grading_failed' so the student/professor can safely retry
    try {
      const adminDb = getAdminSupabase()
      if (submissionId) {
        await adminDb
          .from('assignment_submissions')
          .update({
            grading_status: 'grading_failed',
            ai_overall_feedback: `Grading error: ${error.message || 'Unknown evaluation failure'}.`,
            updated_at: new Date().toISOString()
          })
          .eq('id', submissionId)

        const { data: sub } = await adminDb
          .from('assignment_submissions')
          .select('assignment_id, student_uid')
          .eq('id', submissionId)
          .single()

        if (sub) {
          await adminDb
            .from('assignment_recipients')
            .update({ status: 'grading_failed' })
            .eq('assignment_id', sub.assignment_id)
            .eq('student_uid', sub.student_uid)
        }
      }
    } catch (cleanupErr) {
      console.error('Error updating status to grading_failed:', cleanupErr)
    }

    return NextResponse.json(
      { error: error.message || 'Failed to complete AI grading' },
      { status: 500 }
    )
  }
}
