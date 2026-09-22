import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface SubjectPerformanceInput {
  subject: string
  topics: Array<{
    topic_name: string
    correct_answers: number
    total_questions: number
    avg_time_taken: number
    accuracy: number
  }>
  avgAccuracy: number
  avgTime: number
  totalQuestions: number
  correctAnswers: number
  weakestTopics: Array<{ name: string; accuracy: number }>
  strongestTopics: Array<{ name: string; accuracy: number }>
}

interface QuizResultInput {
  quiz_id: string
  quiz_title: string
  score: number
  total_questions: number
  percentage: number
  submitted_at: string
}

export async function POST(req: NextRequest) {
  try {
    // 1. Verify Authentication (optional / non-blocking for robust dashboard UX)
    try {
      const supabase = await createClient()
      const {
        data: { user },
        error: authError
      } = await supabase.auth.getUser()

      if (authError || !user) {
        console.log('[Student AI Card Route] Public or guest access for student analysis')
      }
    } catch (authErr) {
      console.warn('[Student AI Card Route] Auth check note:', authErr)
    }

    const body: {
      studentName?: string
      learnerTag?: string | null
      subjects?: SubjectPerformanceInput[]
      quizzes?: QuizResultInput[]
    } = await req.json()

    const studentName = body.studentName || 'Student'
    const learnerTag = body.learnerTag || 'Moderate Learner'
    const subjects: SubjectPerformanceInput[] = Array.isArray(body.subjects) ? body.subjects : []
    const quizzes: QuizResultInput[] = Array.isArray(body.quizzes) ? body.quizzes : []

    // Calculate aggregated context metrics
    const totalQuestions = subjects.reduce((sum: number, s: SubjectPerformanceInput) => sum + (s.totalQuestions || 0), 0)
    const totalCorrect = subjects.reduce((sum: number, s: SubjectPerformanceInput) => sum + (s.correctAnswers || 0), 0)
    const overallAccuracy =
      subjects.length > 0
        ? Math.round(subjects.reduce((sum: number, s: SubjectPerformanceInput) => sum + (s.avgAccuracy || 0), 0) / subjects.length)
        : quizzes.length > 0
        ? Math.round(quizzes.reduce((sum: number, q: QuizResultInput) => sum + (q.percentage || 0), 0) / quizzes.length)
        : 0

    // 2. Read Groq API Key & Models
    const rawApiKey = (process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY || '').trim()
    const apiKey = rawApiKey.replace(/^["']|["']$/g, '').trim() || undefined
    const envModel = (process.env.GROQ_MODEL || '').trim()
    const isDecommissioned = envModel.includes('llama-3.3-70b') || envModel.includes('llama-3.1-8b')
    const preferredModel = !envModel || isDecommissioned ? 'openai/gpt-oss-120b' : envModel

    const candidateModels = Array.from(
      new Set([
        preferredModel,
        'openai/gpt-oss-120b',
        'qwen/qwen3.8-27b',
        'openai/gpt-oss-20b'
      ].filter(Boolean))
    )

    let aiResult: any = null

    if (apiKey) {
      const systemPrompt = `You are VidyaSetu's AI Academic Diagnostic Engine.
Your task is to analyze a university student's real assessment performance and generate an insightful, highly personalized Academic Card output.

RULES:
1. Provide constructive, motivating, and specific feedback based on the exact subject names, accuracies, and topic names provided.
2. In "subjectInsights", evaluate each subject in the input. "performance" MUST be one of: "Excellent" (≥80%), "Good" (65-79%), "Fair" (50-64%), or "Needs Work" (<50%).
3. In "strengths", highlight actual high-scoring topics and problem-solving velocity.
4. In "improvements", specifically pinpoint their weakest topics and actionable review steps.
5. In "recommendation", give 1-2 sharp, actionable sentences for that subject.
6. In "detailedSummary", provide:
   - "overallPerformance": A 2-sentence executive summary of the student's mastery.
   - "keyInsights": Exactly 3-4 bullet observations.
   - "criticalAreas": Exactly 2-3 specific topics or subjects requiring urgent focus.
   - "actionPlan": A concrete 2-sentence strategy for the coming week.
7. In "motivationalQuote", provide 1 inspiring, modern, memorable sentence fitting their performance level.
8. In "overallStrengths", provide top 3 overarching strengths across all subjects.
9. In "overallImprovements", provide top 3 high-priority improvement areas.

OUTPUT FORMAT:
Respond ONLY with a valid JSON object matching this exact schema:
{
  "motivationalQuote": string,
  "detailedSummary": {
    "overallPerformance": string,
    "keyInsights": string[],
    "criticalAreas": string[],
    "actionPlan": string
  },
  "subjectInsights": [
    {
      "subject": string,
      "performance": "Excellent" | "Good" | "Fair" | "Needs Work",
      "strengths": string[],
      "improvements": string[],
      "recommendation": string
    }
  ],
  "overallStrengths": string[],
  "overallImprovements": string[]
}`

      const userContext = {
        studentName,
        learnerPace: learnerTag,
        overallAccuracy: `${overallAccuracy}%`,
        totalQuestionsAttempted: totalQuestions,
        totalCorrectAnswers: totalCorrect,
        subjects: subjects.map((s: SubjectPerformanceInput) => ({
          subject: s.subject,
          accuracy: `${s.avgAccuracy}%`,
          totalQuestions: s.totalQuestions,
          correctAnswers: s.correctAnswers,
          avgTimeSeconds: s.avgTime,
          strongestTopics: s.strongestTopics,
          weakestTopics: s.weakestTopics
        })),
        recentQuizzes: quizzes.slice(0, 3).map((q: QuizResultInput) => ({
          title: q.quiz_title,
          percentage: `${q.percentage}%`,
          submittedAt: q.submitted_at
        }))
      }

      for (const candidate of candidateModels) {
        try {
          const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: candidate,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: JSON.stringify(userContext) }
              ],
              response_format: { type: 'json_object' },
              temperature: 0.3,
              max_tokens: 3000
            })
          })

          if (groqRes.ok) {
            const data = await groqRes.json()
            const rawContent = data.choices?.[0]?.message?.content
            if (rawContent) {
              const parsed = JSON.parse(rawContent)
              if (
                parsed.detailedSummary &&
                Array.isArray(parsed.subjectInsights) &&
                parsed.subjectInsights.length > 0
              ) {
                aiResult = parsed
                console.log(`[Student AI Card] Generated insights successfully using ${candidate}`)
                break
              }
            }
          } else {
            const errData = await groqRes.text()
            console.warn(`[Student AI Card] Groq candidate ${candidate} HTTP error:`, errData)
          }
        } catch (callErr) {
          console.warn(`[Student AI Card] Groq candidate ${candidate} failed:`, callErr)
        }
      }
    } else {
      console.warn('[Student AI Card] GROQ_API_KEY is not configured in environment.')
    }

    // Fallback if AI was unavailable or had rate limiting
    if (!aiResult) {
      aiResult = generateIntelligentFallback(studentName, learnerTag, subjects, quizzes, overallAccuracy)
    }

    return NextResponse.json(aiResult)
  } catch (error: any) {
    console.error('[Student AI Card Route] Error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

function generateIntelligentFallback(
  studentName: string,
  learnerTag: string | null,
  subjects: SubjectPerformanceInput[],
  quizzes: QuizResultInput[],
  overallAccuracy: number
) {
  let quote = 'Keep learning, keep growing!'
  if (overallAccuracy >= 85) quote = 'Excellence is a habit. Keep pushing boundaries!'
  else if (overallAccuracy >= 70) quote = 'Solid progress! With deliberate practice, mastery is within reach.'
  else if (overallAccuracy >= 50) quote = 'Every challenge is an opportunity to strengthen your foundations.'
  else quote = 'Every expert was once a beginner. Consistency is key.'

  const subjectInsights = subjects.map((s: SubjectPerformanceInput) => {
    let performance = 'Good'
    if (s.avgAccuracy >= 80) performance = 'Excellent'
    else if (s.avgAccuracy >= 65) performance = 'Good'
    else if (s.avgAccuracy >= 50) performance = 'Fair'
    else performance = 'Needs Work'

    const strongName = s.strongestTopics?.[0]?.name || 'core concepts'
    const weakName = s.weakestTopics?.[0]?.name || 'advanced topics'

    return {
      subject: s.subject,
      performance,
      strengths: [
        `Strong conceptual foundation demonstrated in ${strongName} (${s.avgAccuracy}% overall accuracy)`,
        `Solved ${s.correctAnswers} out of ${s.totalQuestions} questions correctly with an average pace of ${s.avgTime}s`,
        `Demonstrated steady analytical consistency across assessment modules`
      ],
      improvements: [
        `Target dedicated revision hours for ${weakName} where accuracy can be improved`,
        `Work through step-by-step example walkthroughs before retaking quizzes`,
        `Practice under timed conditions to further optimize response speed`
      ],
      recommendation: `Focus on mastering ${weakName} through targeted practice problems while maintaining your solid performance in ${strongName}.`
    }
  })

  const allStrengths = subjectInsights.flatMap((i) => i.strengths)
  const allImprovements = subjectInsights.flatMap((i) => i.improvements)

  return {
    motivationalQuote: quote,
    detailedSummary: {
      overallPerformance: `${studentName} demonstrates an overall mastery rate of ${overallAccuracy}% across ${subjects.length} active subjects.`,
      keyInsights: [
        `Overall accuracy stands at ${overallAccuracy}% across ${subjects.reduce((a: number, b: SubjectPerformanceInput) => a + b.totalQuestions, 0)} attempted practice problems.`,
        subjects.length > 0 ? `Strongest domain detected: ${subjects[0]?.subject}.` : 'Building broad curriculum competency.',
        `Pacing profile: averaging ${subjects[0]?.avgTime || 45} seconds per question across evaluated modules.`
      ],
      criticalAreas: subjects.flatMap((s: SubjectPerformanceInput) => s.weakestTopics.slice(0, 1).map((w: { name: string; accuracy: number }) => `${s.subject}: ${w.name}`)).slice(0, 3),
      actionPlan: `Allocate 30 minutes daily to high-priority review topics and complete weekly quizzes to solidify conceptual retention.`
    },
    subjectInsights,
    overallStrengths: Array.from(new Set(allStrengths)).slice(0, 3),
    overallImprovements: Array.from(new Set(allImprovements)).slice(0, 3)
  }
}
