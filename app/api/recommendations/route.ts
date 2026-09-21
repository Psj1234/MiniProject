import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'

// Admin client helper to query tables
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

export interface ResourceItem {
  title: string
  platform: string
  url: string
  resource_type: string
  description: string
}

export interface RecommendationItem {
  id: string
  section: 'Improve Weak Areas' | 'Learn Next' | 'Practice' | 'Build' | 'Participate' | 'Explore'
  priority: 'High' | 'Medium' | 'Low'
  activity: string
  category: 'Hackathon' | 'Coding' | 'Certification' | 'Video' | 'Topic' | 'Project' | 'Revision' | 'Research' | 'Internship Prep' | 'Other'
  reason: string
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced'
  expectedBenefit: string
  suggestedNextStep: string
  estimatedHours?: string
  actionLabel?: string
  resourceUrl?: string
  resources?: ResourceItem[]
}

export interface PersonalizedPlan {
  planTitle: string
  summary: string
  learnerPaceAssessed: 'Fast Learner' | 'Medium Learner' | 'Slow Learner'
  keyFocusAreas: string[]
  recommendations: RecommendationItem[]
}

export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate student
    const supabase = await createClient()
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 })
    }

    const adminDb = getAdminSupabase()

    // 2. Fetch student profile
    const { data: profile, error: profError } = await adminDb
      .from('profiles')
      .select('id, student_id, full_name, cgpa')
      .eq('id', user.id)
      .single()

    if (profError || !profile) {
      return NextResponse.json({ error: 'Student profile not found.' }, { status: 404 })
    }

    const studentUid = profile.student_id
    if (!studentUid) {
      return NextResponse.json({ error: 'Student ID not configured on profile.' }, { status: 400 })
    }

    // 3. Fetch enrollments & existing learner classification
    const { data: enrollments } = await adminDb
      .from('enrollments')
      .select(`
        course_id,
        learner_tag,
        courses (
          id,
          name,
          code
        )
      `)
      .eq('student_id', studentUid)

    // Determine existing learner classification
    let learnerPace: 'Fast Learner' | 'Medium Learner' | 'Slow Learner' = 'Medium Learner'
    const fastCount = enrollments?.filter((e: any) => e.learner_tag === 'fast').length || 0
    const slowCount = enrollments?.filter((e: any) => e.learner_tag === 'slow').length || 0

    if (fastCount > 0 && fastCount >= slowCount) {
      learnerPace = 'Fast Learner'
    } else if (slowCount > 0 && slowCount > fastCount) {
      learnerPace = 'Slow Learner'
    } else {
      learnerPace = 'Medium Learner'
    }

    const enrolledCourseNames: string[] = (enrollments || [])
      .map((e: any) => e.courses?.name)
      .filter(Boolean)

    // 4. Fetch marks & quiz scores
    const { data: marksData } = await adminDb
      .from('marks')
      .select('percentage, exam_type')
      .eq('student_uid', studentUid)
      .not('percentage', 'is', null)

    const { data: quizData } = await adminDb
      .from('quiz_results')
      .select(`
        score,
        max_score,
        taken_at,
        quizzes (
          title
        )
      `)
      .eq('student_uid', studentUid)
      .order('taken_at', { ascending: false })

    let overallQuizAvg = 75
    if (marksData && marksData.length > 0) {
      const sum = marksData.reduce((acc: number, m: any) => acc + Number(m.percentage || 0), 0)
      overallQuizAvg = Math.round(sum / marksData.length)
    } else if (quizData && quizData.length > 0) {
      const validQuizzes = quizData.filter((q: any) => q.max_score > 0)
      if (validQuizzes.length > 0) {
        const sum = validQuizzes.reduce((acc: number, q: any) => acc + (q.score / q.max_score) * 100, 0)
        overallQuizAvg = Math.round(sum / validQuizzes.length)
      }
    }

    const recentQuizScores = (quizData || []).slice(0, 5).map((q: any) => ({
      title: q.quizzes?.title || 'Quiz Assessment',
      percentage: q.max_score > 0 ? Math.round((q.score / q.max_score) * 100) : 0
    }))

    // 5. Fetch student answers to extract real weak and strong topics
    const { data: answersData } = await adminDb
      .from('student_answers')
      .select(`
        is_correct,
        topics (
          name,
          courses (
            name
          )
        )
      `)
      .eq('student_uid', studentUid)

    const topicMap = new Map<string, { total: number; correct: number; course: string }>()
    if (answersData && answersData.length > 0) {
      answersData.forEach((a: any) => {
        const topicName = a.topics?.name || 'General Topic'
        const courseName = a.topics?.courses?.name || ''
        const cur = topicMap.get(topicName) || { total: 0, correct: 0, course: courseName }
        cur.total += 1
        if (a.is_correct) cur.correct += 1
        topicMap.set(topicName, cur)
      })
    }

    const weakTopics: { name: string; course?: string; accuracy?: number }[] = []
    const strongTopics: { name: string; course?: string; accuracy?: number }[] = []

    topicMap.forEach((stat, name) => {
      const acc = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0
      if (acc < 65) {
        weakTopics.push({ name, course: stat.course, accuracy: acc })
      } else if (acc >= 80) {
        strongTopics.push({ name, course: stat.course, accuracy: acc })
      }
    })

    weakTopics.sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))
    strongTopics.sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0))

    // 6. Fetch verified achievements
    let achievements: { category: string; title: string; result: string; organizer?: string }[] = []
    try {
      const { data: achData } = await adminDb
        .from('student_achievements')
        .select('category, title, organizer, result')
        .eq('student_uid', studentUid)
        .order('created_at', { ascending: false })

      if (achData) {
        achievements = achData.map((a: any) => ({
          category: a.category,
          title: a.title,
          result: a.result,
          organizer: a.organizer || undefined
        }))
      }
    } catch (e) {
      console.warn('Ach query note:', e)
    }

    // 7. Invoke Groq AI server-side
    const apiKey = (process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY || '').trim()
    const envModel = (process.env.GROQ_MODEL || '').trim()
    const preferredModel = envModel || 'qwen/qwen3.8-27b'

    const studentContext = {
      studentName: profile.full_name || 'Student',
      learnerPace,
      cgpa: profile.cgpa !== null && profile.cgpa !== undefined ? Number(profile.cgpa) : null,
      overallQuizAvg: `${overallQuizAvg}%`,
      enrolledCourses: enrolledCourseNames,
      weakTopics: weakTopics.slice(0, 5),
      strongTopics: strongTopics.slice(0, 5),
      recentQuizScores,
      existingAchievements: achievements.slice(0, 8)
    }

    let plan: PersonalizedPlan | null = null

    if (apiKey) {
      const systemPrompt = `You are VidyaMitra's AI Academic & Career Advisor.
Generate a strictly personalized, non-generic Recommendation Plan for a university student based on their real performance.

LEARNING PACE RULES:
1. "Fast Learner":
   - Highly challenging and advanced activities.
   - Recommend 6 to 9 items across sections.
   - Advanced topics, hard competitive coding (Codeforces/LeetCode Hard), high-tier hackathons, complex system design projects, research papers, advanced certifications.
   - Predominantly "Advanced" and "Intermediate" difficulty.
2. "Medium Learner":
   - Balanced intermediate progression.
   - Recommend 5 to 7 items.
   - Solidifying concepts, gradual new topics, moderate coding competitions, portfolio capstones, suitable certifications.
   - Predominantly "Intermediate" difficulty.
3. "Slow Learner":
   - DO NOT OVERLOAD. Recommend ONLY 3 to 5 items.
   - Prioritize REVISION of their identified weak areas and low-scoring topics before anything advanced.
   - Beginner-friendly videos, step-by-step practice sets, bite-sized mini projects, foundational reinforcement.
   - Predominantly "Beginner" difficulty.

CRITICAL RESOURCE REQUIREMENTS:
For EVERY single recommendation item, you MUST include 2 to 4 actual, high-quality, clickable learning resources in the "resources" array.
- For video-based and topic recommendations: specifically provide a topic-specific YouTube search or video URL:
  "https://www.youtube.com/results?search_query=..." (e.g. "https://www.youtube.com/results?search_query=software+requirements+specification+tutorial")
  NEVER return a generic URL like "https://youtube.com".
- For coding practice: provide topic-specific LeetCode or GeeksforGeeks URLs (e.g. "https://leetcode.com/problemset/all/?search=...").
- For documentation / tutorials: provide GeeksforGeeks, MDN, or official documentation search URLs.
- Each resource object MUST have:
  - "title": Specific descriptive title of the resource
  - "platform": "YouTube" | "GeeksforGeeks" | "LeetCode" | "freeCodeCamp" | "MDN Web Docs" | "Coursera" | "GitHub" | "Devpost" | "Other"
  - "url": Direct clickable HTTPS URL
  - "resource_type": "video" | "documentation" | "practice" | "course" | "article"
  - "description": 1 concise sentence explaining what this resource teaches the student.

OUTPUT FORMAT:
Respond ONLY with a valid JSON object matching this exact schema:
{
  "planTitle": string,
  "summary": string,
  "learnerPaceAssessed": "Fast Learner" | "Medium Learner" | "Slow Learner",
  "keyFocusAreas": string[],
  "recommendations": [
    {
      "id": string,
      "section": "Improve Weak Areas" | "Learn Next" | "Practice" | "Build" | "Participate" | "Explore",
      "priority": "High" | "Medium" | "Low",
      "activity": string,
      "category": "Hackathon" | "Coding" | "Certification" | "Video" | "Topic" | "Project" | "Revision" | "Research" | "Internship Prep" | "Other",
      "reason": string,
      "difficulty": "Beginner" | "Intermediate" | "Advanced",
      "expectedBenefit": string,
      "suggestedNextStep": string,
      "estimatedHours": string,
      "actionLabel": string,
      "resources": [
        {
          "title": string,
          "platform": string,
          "url": string,
          "resource_type": string,
          "description": string
        }
      ]
    }
  ]
}`

      const candidateModels = Array.from(
        new Set([
          preferredModel,
          'qwen/qwen3.8-27b',
          'openai/gpt-oss-120b',
          'openai/gpt-oss-20b'
        ].filter(Boolean))
      )

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
                { role: 'user', content: JSON.stringify(studentContext) }
              ],
              response_format: { type: 'json_object' },
              temperature: 0.2,
              max_tokens: 4000
            })
          })

          if (groqRes.ok) {
            const data = await groqRes.json()
            const rawContent = data.choices[0]?.message?.content
            if (rawContent) {
              const parsed = JSON.parse(rawContent)
              if (parsed.recommendations && Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0) {
                plan = parsed
                break
              }
            }
          }
        } catch (callErr) {
          console.warn(`Groq candidate ${candidate} failed:`, callErr)
        }
      }
    }

    // 8. Fallback synthesizer using student's actual profile if Groq was unavailable or rate-limited
    if (!plan) {
      plan = synthesizePersonalizedPlan(studentContext)
    }

    // 9. Guarantee every recommendation has valid, clickable resources
    if (plan && plan.recommendations) {
      plan.recommendations = plan.recommendations.map((rec: any, idx: number) => {
        if (!rec.id) {
          rec.id = `rec-${idx + 1}`
        }

        // Ensure resources array exists with useful clickable links
        if (!rec.resources || !Array.isArray(rec.resources) || rec.resources.length === 0) {
          const topicQuery = encodeURIComponent(rec.activity || 'tutorial')
          const videoQuery = encodeURIComponent(`${rec.activity} tutorial`)
          rec.resources = [
            {
              title: `${rec.activity} - Video Tutorial`,
              platform: 'YouTube',
              url: `https://www.youtube.com/results?search_query=${videoQuery}`,
              resource_type: 'video',
              description: `Visual walkthrough and step-by-step concept explanation for ${rec.activity}.`
            },
            {
              title: `${rec.activity} - Practice & Reference Guide`,
              platform: rec.category === 'Coding' ? 'LeetCode' : rec.category === 'Hackathon' ? 'Devpost' : 'GeeksforGeeks',
              url: rec.category === 'Coding'
                ? `https://leetcode.com/problemset/all/?search=${topicQuery}`
                : rec.category === 'Hackathon'
                ? `https://devpost.com/hackathons?search=${topicQuery}`
                : `https://www.google.com/search?q=${encodeURIComponent(rec.activity + ' tutorial geeksforgeeks documentation')}`,
              resource_type: rec.category === 'Coding' ? 'practice' : 'documentation',
              description: `Comprehensive practice problems, case studies, and reference notes.`
            }
          ]
        }

        // Set primary resourceUrl if not already set
        if (!rec.resourceUrl && rec.resources.length > 0) {
          rec.resourceUrl = rec.resources[0].url
        }

        return rec
      })
    }

    return NextResponse.json({
      success: true,
      plan,
      studentProfile: {
        name: profile.full_name,
        studentId: studentUid,
        cgpa: profile.cgpa,
        learnerPace,
        enrolledCoursesCount: enrolledCourseNames.length,
        achievementsCount: achievements.length,
        weakTopicsCount: weakTopics.length
      }
    })
  } catch (error: any) {
    console.error('Recommendations API error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to generate recommendations.' },
      { status: 500 }
    )
  }
}

/**
 * Deterministic personalized fallback based strictly on real student data
 */
function synthesizePersonalizedPlan(context: any): PersonalizedPlan {
  const { learnerPace, weakTopics, strongTopics, enrolledCourses, cgpa, overallQuizAvg } = context
  const items: RecommendationItem[] = []

  const primaryWeak = weakTopics[0]?.name || (enrolledCourses[0] ? `${enrolledCourses[0]} Fundamentals` : 'Data Structures')
  const secondaryWeak = weakTopics[1]?.name || (enrolledCourses[1] ? `${enrolledCourses[1]} Practice` : 'Algorithmic Logic')
  const strongTopic = strongTopics[0]?.name || (enrolledCourses[0] || 'Web Technologies')

  if (learnerPace === 'Slow Learner') {
    items.push({
      id: 'rec-slow-1',
      section: 'Improve Weak Areas',
      priority: 'High',
      activity: `Step-by-step revision of ${primaryWeak}`,
      category: 'Revision',
      reason: `Identified as your lowest-scoring topic in recent assessments (${weakTopics[0]?.accuracy !== undefined ? weakTopics[0].accuracy + '%' : 'needs attention'}).`,
      difficulty: 'Beginner',
      expectedBenefit: `Master core foundations in ${primaryWeak} before advancing to higher complexity tasks.`,
      suggestedNextStep: `Review lecture notes and attempt the starter practice exercises on ${primaryWeak}.`,
      estimatedHours: '3 hours',
      actionLabel: `Revise ${primaryWeak}`,
      resourceUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${primaryWeak} full course tutorial`)}`,
      resources: [
        {
          title: `${primaryWeak} Complete Beginner Tutorial`,
          platform: 'YouTube',
          url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${primaryWeak} full course beginner tutorial`)}`,
          resource_type: 'video',
          description: `Structured, step-by-step video breakdown of ${primaryWeak} foundations.`
        },
        {
          title: `${primaryWeak} Article & Revision Guide`,
          platform: 'GeeksforGeeks',
          url: `https://www.google.com/search?q=${encodeURIComponent(`${primaryWeak} geeksforgeeks tutorial notes`)}`,
          resource_type: 'article',
          description: `Clear textual notes, diagrams, and annotated code examples.`
        },
        {
          title: `${primaryWeak} Foundational Practice Exercises`,
          platform: 'freeCodeCamp',
          url: `https://www.google.com/search?q=${encodeURIComponent(`${primaryWeak} beginner practice questions freecodecamp`)}`,
          resource_type: 'practice',
          description: `Interactive bite-sized problems designed to solidify comprehension.`
        }
      ]
    })

    if (weakTopics.length > 1) {
      items.push({
        id: 'rec-slow-2',
        section: 'Improve Weak Areas',
        priority: 'High',
        activity: `Guided practice exercises on ${secondaryWeak}`,
        category: 'Topic',
        reason: `Your quiz results indicated conceptual ambiguities in ${secondaryWeak}.`,
        difficulty: 'Beginner',
        expectedBenefit: `Clarify misunderstandings with guided exercises.`,
        suggestedNextStep: `Complete the curated beginner practice worksheet.`,
        estimatedHours: '2 hours',
        actionLabel: `Practice ${secondaryWeak}`,
        resourceUrl: `https://www.google.com/search?q=${encodeURIComponent(`Guided practice exercises on ${secondaryWeak}`)}`,
        resources: [
          {
            title: `${secondaryWeak} Guided Practice & Walkthrough`,
            platform: 'YouTube',
            url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${secondaryWeak} practice problems walkthrough`)}`,
            resource_type: 'video',
            description: `Instructor-led walkthrough of common questions and solutions.`
          },
          {
            title: `${secondaryWeak} Step-by-Step Problem Set`,
            platform: 'GeeksforGeeks',
            url: `https://www.google.com/search?q=${encodeURIComponent(`${secondaryWeak} practice problems geeksforgeeks`)}`,
            resource_type: 'practice',
            description: `Graded exercises to build confidence without overwhelming.`
          }
        ]
      })
    }

    items.push({
      id: 'rec-slow-3',
      section: 'Practice',
      priority: 'Medium',
      activity: `Visual & Video Walkthrough: ${primaryWeak} Explained Simply`,
      category: 'Video',
      reason: `Visual explanations provide intuitive mental models suited for ${primaryWeak}.`,
      difficulty: 'Beginner',
      expectedBenefit: `Grasp complex principles through real-world visual demonstrations.`,
      suggestedNextStep: `Watch the concept walkthrough video and take personal summary notes.`,
      estimatedHours: '45 mins',
      actionLabel: 'Watch Walkthrough',
      resourceUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${primaryWeak} Explained Simply animated`)}`,
      resources: [
        {
          title: `${primaryWeak} Explained Visually & Intuitively`,
          platform: 'YouTube',
          url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${primaryWeak} Explained Simply animated`)}`,
          resource_type: 'video',
          description: `Visual animation demonstrating how ${primaryWeak} operates under the hood.`
        },
        {
          title: `Interactive Visualizer for ${primaryWeak}`,
          platform: 'VisuAlgo',
          url: `https://visualgo.net/en`,
          resource_type: 'documentation',
          description: `Interactive animation tool allowing step-by-step tracing.`
        }
      ]
    })

    items.push({
      id: 'rec-slow-4',
      section: 'Build',
      priority: 'Low',
      activity: `Mini Practical Implementation: Basic ${primaryWeak} Program`,
      category: 'Project',
      reason: `Applying learned concepts in a low-stakes mini project cements understanding without overwhelming.`,
      difficulty: 'Beginner',
      expectedBenefit: `Hands-on proof of mastery without high pressure.`,
      suggestedNextStep: `Code a straightforward demo script demonstrating core mechanics.`,
      estimatedHours: '4 hours',
      actionLabel: 'Explore Project Ideas',
      resourceUrl: `https://github.com/search?q=${encodeURIComponent(`Basic ${primaryWeak} starter project`)}`,
      resources: [
        {
          title: `Basic ${primaryWeak} Starter Code & Examples`,
          platform: 'GitHub',
          url: `https://github.com/search?q=${encodeURIComponent(`Basic ${primaryWeak} beginner repository`)}`,
          resource_type: 'practice',
          description: `Curated starter repositories and boilerplate code for beginners.`
        },
        {
          title: `${primaryWeak} Hands-On Coding Tutorial`,
          platform: 'YouTube',
          url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`Build beginner project with ${primaryWeak}`)}`,
          resource_type: 'video',
          description: `Step-by-step video coding session from blank canvas to working program.`
        }
      ]
    })
  } else if (learnerPace === 'Fast Learner') {
    items.push({
      id: 'rec-fast-1',
      section: 'Learn Next',
      priority: 'High',
      activity: `Advanced Microservices & Distributed Architecture with ${strongTopic}`,
      category: 'Topic',
      reason: `With your rapid learning pace and strong accuracy in ${strongTopic}, you are primed for advanced system design.`,
      difficulty: 'Advanced',
      expectedBenefit: `Master high-concurrency systems, eventual consistency, and scalable cloud architectures.`,
      suggestedNextStep: `Explore system design blueprints and benchmark latency trade-offs.`,
      estimatedHours: '8 hours',
      actionLabel: 'Explore Architecture',
      resourceUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(`Distributed Systems System Design Architecture ${strongTopic}`)}`,
      resources: [
        {
          title: `Distributed Systems & Microservices Deep Dive`,
          platform: 'YouTube',
          url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`Distributed Systems System Design Architecture ${strongTopic}`)}`,
          resource_type: 'video',
          description: `Architectural principles for high-throughput, fault-tolerant distributed backends.`
        },
        {
          title: `System Design Primer & Case Studies`,
          platform: 'GitHub',
          url: `https://github.com/donnemartin/system-design-primer`,
          resource_type: 'documentation',
          description: `Comprehensive industry guide to scalable architectures, caching, and sharding.`
        }
      ]
    })

    items.push({
      id: 'rec-fast-2',
      section: 'Participate',
      priority: 'High',
      activity: `National-Level Open Innovation Hackathon (Smart India / Devpost)`,
      category: 'Hackathon',
      reason: `Your competitive profile and rapid problem-solving speed make you an ideal contender for top tier podium finishes.`,
      difficulty: 'Advanced',
      expectedBenefit: `Industry visibility, mentorship, and high-prestige additions to your technical portfolio.`,
      suggestedNextStep: `Form a multidisciplinary team and submit a prototype addressing AI or sustainable tech.`,
      estimatedHours: '36 hours',
      actionLabel: 'Find Hackathons',
      resourceUrl: `https://devpost.com/hackathons`,
      resources: [
        {
          title: `Devpost Upcoming Global Hackathons`,
          platform: 'Devpost',
          url: `https://devpost.com/hackathons`,
          resource_type: 'practice',
          description: `Live competitions with industry prizes, sponsors, and developer mentorship.`
        },
        {
          title: `Winning Hackathon Strategies & Case Studies`,
          platform: 'YouTube',
          url: `https://www.youtube.com/results?search_query=how+to+win+a+hackathon+project+presentation`,
          resource_type: 'video',
          description: `Proven strategies on ideation, rapid MVP building, and compelling judging pitches.`
        }
      ]
    })

    items.push({
      id: 'rec-fast-3',
      section: 'Practice',
      priority: 'Medium',
      activity: `Competitive Programming: Graph Algorithms & Dynamic Programming Mastery`,
      category: 'Coding',
      reason: `Fast learners benefit from high-rating Codeforces/LeetCode contest challenges to prepare for top-tier engineering interviews.`,
      difficulty: 'Advanced',
      expectedBenefit: `Optimal algorithmic problem-solving under strict time constraints.`,
      suggestedNextStep: `Tackle 3 LeetCode Hard problems involving segment trees or DP with bitmasking.`,
      estimatedHours: '6 hours',
      actionLabel: 'Solve LeetCode Hard',
      resourceUrl: `https://leetcode.com/problemset/all/?difficulty=HARD&search=Graph`,
      resources: [
        {
          title: `LeetCode Hard: Graph & DP Problem Set`,
          platform: 'LeetCode',
          url: `https://leetcode.com/problemset/all/?difficulty=HARD&search=Graph`,
          resource_type: 'practice',
          description: `Curated high-difficulty algorithmic challenges tested by leading tech companies.`
        },
        {
          title: `Advanced DP & Graph Algorithms Masterclass`,
          platform: 'YouTube',
          url: `https://www.youtube.com/results?search_query=advanced+dynamic+programming+graph+algorithms+competitive+programming`,
          resource_type: 'video',
          description: `Deep theoretical proofs and memory-efficient implementations in C++/Python.`
        }
      ]
    })

    items.push({
      id: 'rec-fast-4',
      section: 'Build',
      priority: 'High',
      activity: `Production-Grade End-to-End AI Web Application with Real-Time Pipelines`,
      category: 'Project',
      reason: `Leverage your strengths to create an open-source tool with automated CI/CD and production telemetry.`,
      difficulty: 'Advanced',
      expectedBenefit: `Distinguished GitHub showcase project demonstrating end-to-end full-stack mastery.`,
      suggestedNextStep: `Draft the architecture schema and initialize the GitHub repository.`,
      estimatedHours: '20 hours',
      actionLabel: 'View Architecture Guides',
      resourceUrl: `https://github.com/search?q=production+ai+application+nextjs`,
      resources: [
        {
          title: `Full-Stack AI Application Architecture Tutorial`,
          platform: 'YouTube',
          url: `https://www.youtube.com/results?search_query=full+stack+ai+application+nextjs+fastapi+production`,
          resource_type: 'video',
          description: `Complete architectural walkthrough: streaming responses, vector DB, and secure auth.`
        },
        {
          title: `Open-Source Production AI Templates`,
          platform: 'GitHub',
          url: `https://github.com/search?q=fullstack+ai+agent+template`,
          resource_type: 'documentation',
          description: `Reference implementations featuring robust test suites and Docker deployment scripts.`
        }
      ]
    })

    items.push({
      id: 'rec-fast-5',
      section: 'Explore',
      priority: 'Medium',
      activity: `Author & Submit Research Paper to IEEE / Scopus Indexed Conference`,
      category: 'Research',
      reason: `Elevate your academic standing (CGPA: ${cgpa ?? 'Active'}) through novel experimental evaluation in your course domain.`,
      difficulty: 'Advanced',
      expectedBenefit: `Peer-reviewed publication credential invaluable for higher studies and R&D roles.`,
      suggestedNextStep: `Consult faculty advisor with a preliminary literature review and hypothesis.`,
      estimatedHours: '30 hours',
      actionLabel: 'Explore Research Papers',
      resourceUrl: `https://ieeexplore.ieee.org/search/searchresult.jsp?queryText=computer+science`,
      resources: [
        {
          title: `IEEE Xplore Digital Library`,
          platform: 'IEEE',
          url: `https://ieeexplore.ieee.org/search/searchresult.jsp?queryText=computer+science`,
          resource_type: 'documentation',
          description: `Search state-of-the-art peer-reviewed publications and conference proceedings.`
        },
        {
          title: `How to Write & Publish a Strong Computer Science Research Paper`,
          platform: 'YouTube',
          url: `https://www.youtube.com/results?search_query=how+to+write+publish+computer+science+research+paper+ieee`,
          resource_type: 'video',
          description: `Step-by-step guidance on structuring methodology, experimental results, and literature review.`
        }
      ]
    })
  } else {
    // Medium Learner
    items.push({
      id: 'rec-med-1',
      section: 'Improve Weak Areas',
      priority: 'High',
      activity: `Targeted Reinforcement on ${primaryWeak}`,
      category: 'Revision',
      reason: `Your assessment scores indicate you understand the fundamentals but need focused practice on edge cases in ${primaryWeak}.`,
      difficulty: 'Intermediate',
      expectedBenefit: `Bridge conceptual gaps and push your score consistently above 85%.`,
      suggestedNextStep: `Work through intermediate problem sets and review incorrect quiz questions.`,
      estimatedHours: '4 hours',
      actionLabel: `Revise ${primaryWeak}`,
      resourceUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${primaryWeak} complete tutorial and examples`)}`,
      resources: [
        {
          title: `${primaryWeak} In-Depth Video Masterclass`,
          platform: 'YouTube',
          url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${primaryWeak} complete tutorial and examples`)}`,
          resource_type: 'video',
          description: `Comprehensive video tutorial covering core principles, real-world examples, and pitfalls.`
        },
        {
          title: `${primaryWeak} Comprehensive Notes & Cheat Sheet`,
          platform: 'GeeksforGeeks',
          url: `https://www.google.com/search?q=${encodeURIComponent(`${primaryWeak} geeksforgeeks tutorial guide`)}`,
          resource_type: 'documentation',
          description: `In-depth documentation with annotated code and key edge-case breakdowns.`
        }
      ]
    })

    items.push({
      id: 'rec-med-2',
      section: 'Learn Next',
      priority: 'High',
      activity: `Deep Dive into State Management & API Integration in ${enrolledCourses[0] || 'Modern Web Apps'}`,
      category: 'Topic',
      reason: `Logical next milestone to transition from foundational coursework to production-ready capabilities.`,
      difficulty: 'Intermediate',
      expectedBenefit: `Ability to architect full-fledged responsive applications with dynamic APIs.`,
      suggestedNextStep: `Implement a clean CRUD interface integrating RESTful endpoints.`,
      estimatedHours: '6 hours',
      actionLabel: 'Learn State Management',
      resourceUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(`State Management API Integration ${enrolledCourses[0] || 'Web Development'}`)}`,
      resources: [
        {
          title: `Modern State Management & Async Data Fetching`,
          platform: 'YouTube',
          url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`State Management API Integration tutorial ${enrolledCourses[0] || 'React'}`)}`,
          resource_type: 'video',
          description: `Practical walkthrough connecting frontend UI with backend REST/GraphQL APIs.`
        },
        {
          title: `MDN Web Docs: Working with APIs`,
          platform: 'MDN Web Docs',
          url: `https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Client-side_web_APIs/Introduction`,
          resource_type: 'documentation',
          description: `Official developer guide explaining HTTP methods, headers, and async patterns.`
        }
      ]
    })

    items.push({
      id: 'rec-med-3',
      section: 'Practice',
      priority: 'Medium',
      activity: `Data Structures & Algorithms: Trees, Hash Maps, and Binary Search Practice`,
      category: 'Coding',
      reason: `Consistent intermediate coding practice builds problem-solving intuition without causing burnout.`,
      difficulty: 'Intermediate',
      expectedBenefit: `Fluent execution of standard interview coding patterns.`,
      suggestedNextStep: `Solve 10 Medium LeetCode/HackerRank problems over the next week.`,
      estimatedHours: '5 hours',
      actionLabel: 'Practice on LeetCode',
      resourceUrl: `https://leetcode.com/problemset/all/?difficulty=MEDIUM&search=Tree`,
      resources: [
        {
          title: `LeetCode Medium: Tree & Binary Search Problem Set`,
          platform: 'LeetCode',
          url: `https://leetcode.com/problemset/all/?difficulty=MEDIUM&search=Tree`,
          resource_type: 'practice',
          description: `Standard interview question set focusing on traversal and binary search patterns.`
        },
        {
          title: `Binary Search & Tree Algorithms Explained`,
          platform: 'freeCodeCamp',
          url: `https://www.youtube.com/results?search_query=freecodecamp+binary+search+tree+data+structures`,
          resource_type: 'video',
          description: `Comprehensive visual course demonstrating time-complexity optimizations.`
        }
      ]
    })

    items.push({
      id: 'rec-med-4',
      section: 'Build',
      priority: 'Medium',
      activity: `Full-Stack Capstone Project with Database Persistence`,
      category: 'Project',
      reason: `Consolidates your coursework into a tangible portfolio item with user authentication and database schemas.`,
      difficulty: 'Intermediate',
      expectedBenefit: `Comprehensive project portfolio asset highlighting full-stack proficiency.`,
      suggestedNextStep: `Design the database schema and wireframe key user flows.`,
      estimatedHours: '12 hours',
      actionLabel: 'Explore Project Ideas',
      resourceUrl: `https://github.com/search?q=fullstack+capstone+project+portfolio`,
      resources: [
        {
          title: `Full-Stack Application Development Tutorial`,
          platform: 'YouTube',
          url: `https://www.youtube.com/results?search_query=full+stack+web+development+project+with+database`,
          resource_type: 'video',
          description: `Complete project build incorporating relational database, authentication, and deployment.`
        },
        {
          title: `Curated Capstone Project Templates`,
          platform: 'GitHub',
          url: `https://github.com/search?q=fullstack+capstone+template`,
          resource_type: 'documentation',
          description: `High-quality boilerplate repos to jumpstart your portfolio project.`
        }
      ]
    })

    items.push({
      id: 'rec-med-5',
      section: 'Participate',
      priority: 'Low',
      activity: `University or Regional College Hackathon Participation`,
      category: 'Hackathon',
      reason: `Collaborative hackathon environments build confidence, teamwork, and agile development instincts.`,
      difficulty: 'Intermediate',
      expectedBenefit: `Hands-on team coding experience and networking with peers.`,
      suggestedNextStep: `Register for upcoming semester hackathon with classmates.`,
      estimatedHours: '24 hours',
      actionLabel: 'Find Hackathons',
      resourceUrl: `https://devpost.com/hackathons`,
      resources: [
        {
          title: `Devpost Student & College Hackathons`,
          platform: 'Devpost',
          url: `https://devpost.com/hackathons`,
          resource_type: 'practice',
          description: `Discover upcoming online and regional hackathons with open student registrations.`
        },
        {
          title: `First Time Hackathon Survival Guide`,
          platform: 'YouTube',
          url: `https://www.youtube.com/results?search_query=first+time+hackathon+guide+tips`,
          resource_type: 'video',
          description: `Key insights on team coordination, fast prototyping, and time management.`
        }
      ]
    })

    items.push({
      id: 'rec-med-6',
      section: 'Explore',
      priority: 'Medium',
      activity: `Industry Recognized Professional Certification (AWS / Google Cloud Associate)`,
      category: 'Certification',
      reason: `Complements your academic progress (${overallQuizAvg} quiz average) with industry-standard credentials.`,
      difficulty: 'Intermediate',
      expectedBenefit: `Verified cloud & system skills sought after by internship recruiters.`,
      suggestedNextStep: `Review exam guide and complete fundamental cloud computing modules.`,
      estimatedHours: '15 hours',
      actionLabel: 'View Certification Guide',
      resourceUrl: `https://cloud.google.com/learn/certification/cloud-digital-leader`,
      resources: [
        {
          title: `Google Cloud Certification Learning Paths`,
          platform: 'Google Cloud',
          url: `https://cloud.google.com/learn/certification/cloud-digital-leader`,
          resource_type: 'course',
          description: `Official learning path covering core infrastructure, storage, and IAM security.`
        },
        {
          title: `Free Cloud Associate Full Course`,
          platform: 'freeCodeCamp',
          url: `https://www.youtube.com/results?search_query=freecodecamp+cloud+practitioner+full+course`,
          resource_type: 'video',
          description: `Complete 12-hour video tutorial covering all exam blueprint domains.`
        }
      ]
    })
  }

  return {
    planTitle: `${context.studentName}'s Personalized Learning & Career Roadmap`,
    summary: `Tailored specifically for your pace as a ${learnerPace}. This plan prioritizes ${
      learnerPace === 'Slow Learner'
        ? 'reinforcing core foundations and eliminating weak spots with focused, manageable tasks'
        : learnerPace === 'Fast Learner'
        ? 'high-impact advanced engineering, competitive contests, and cutting-edge projects'
        : 'balanced intermediate skill acceleration, portfolio development, and consistent practice'
    }.`,
    learnerPaceAssessed: learnerPace,
    keyFocusAreas: [
      primaryWeak,
      learnerPace === 'Fast Learner' ? 'Competitive Programming' : 'Core Foundations',
      learnerPace === 'Slow Learner' ? 'Concept Revision' : 'Full-Stack Development',
      'Hands-on Projects'
    ],
    recommendations: items
  }
}
