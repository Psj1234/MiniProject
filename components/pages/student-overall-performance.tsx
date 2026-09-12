'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Trophy,
  Award,
  Sparkles,
  GraduationCap,
  Briefcase,
  BookOpen,
  Code2,
  FolderGit2,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Edit2,
  RefreshCw,
  ExternalLink,
  HelpCircle,
  FileText,
  X
} from 'lucide-react'
import {
  SCORE_WEIGHTS,
  CGPA_CONFIG,
  getIndividualAchievementScore,
  calculateOverallStudentScore,
  AchievementCategory,
  RawAchievement,
  ScoreBreakdown
} from '@/lib/scoring'

export default function StudentOverallPerformance() {
  const [supabase] = useState(() => createClient())

  // Loading and profile states
  const [isLoading, setIsLoading] = useState(true)
  const [studentProfile, setStudentProfile] = useState<{
    id: string
    student_id: number | null
    full_name: string
    cgpa: number | null
    learner_tag: 'fast' | 'slow' | null
  } | null>(null)

  // Academic and achievements states
  const [quizScore, setQuizScore] = useState<number>(0)
  const [achievements, setAchievements] = useState<RawAchievement[]>([])

  // CGPA prompt/modal state
  const [showCgpaModal, setShowCgpaModal] = useState(false)
  const [cgpaInput, setCgpaInput] = useState('')
  const [cgpaError, setCgpaError] = useState<string | null>(null)
  const [isSavingCgpa, setIsSavingCgpa] = useState(false)
  const [cgpaColumnMissing, setCgpaColumnMissing] = useState(false)

  // Add Achievement Modal State
  const [showAddModal, setShowAddModal] = useState(false)
  const [modalCategory, setModalCategory] = useState<AchievementCategory>('hackathon')
  const [formTitle, setFormTitle] = useState('')
  const [formOrganizer, setFormOrganizer] = useState('')
  const [formDate, setFormDate] = useState('')
  const [formResult, setFormResult] = useState('winner')
  const [formDescription, setFormDescription] = useState('')
  const [formProofUrl, setFormProofUrl] = useState('')
  const [isSubmittingAchievement, setIsSubmittingAchievement] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Active Category Filter for Achievements list
  const [activeListTab, setActiveListTab] = useState<AchievementCategory | 'all'>('all')

  // Fetch initial student data
  const fetchStudentData = async () => {
    try {
      setIsLoading(true)
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser()

      if (userError || !user) {
        setIsLoading(false)
        return
      }

      // 1. Fetch Student Profile (with fallback if cgpa column not in schema cache yet)
      let profileData: any = null
      const { data: pData, error: profError } = await supabase
        .from('profiles')
        .select('id, student_id, full_name, cgpa')
        .eq('id', user.id)
        .single()

      if (profError) {
        if (
          profError.message?.includes('cgpa') ||
          profError.details?.includes('cgpa') ||
          profError.code === 'PGRST204'
        ) {
          console.warn("Could not find 'cgpa' column in profiles schema cache. Falling back to query without cgpa.")
          setCgpaColumnMissing(true)
          const { data: fallbackData } = await supabase
            .from('profiles')
            .select('id, student_id, full_name')
            .eq('id', user.id)
            .single()
          profileData = fallbackData
        } else {
          console.error('Error fetching profile:', profError)
        }
      } else {
        profileData = pData
      }

      // 2. Fetch Learner Tag from enrollments
      let learnerTag: 'fast' | 'slow' | null = null
      if (profileData?.student_id) {
        const { data: enrollData } = await supabase
          .from('enrollments')
          .select('learner_tag')
          .eq('student_id', profileData.student_id)
          .not('learner_tag', 'is', null)
          .limit(1)

        if (enrollData && enrollData.length > 0) {
          learnerTag = enrollData[0].learner_tag as any
        }
      }

      const cgpaVal =
        profileData?.cgpa !== null && profileData?.cgpa !== undefined
          ? Number(profileData.cgpa)
          : null

      setStudentProfile({
        id: user.id,
        student_id: profileData?.student_id || null,
        full_name: profileData?.full_name || 'Student',
        cgpa: cgpaVal,
        learner_tag: learnerTag
      })

      // If CGPA is missing, trigger mandatory prompt
      if (cgpaVal === null) {
        setShowCgpaModal(true)
      }

      // 3. Fetch Quiz Score from marks or quiz_results
      if (profileData?.student_id) {
        const { data: marksData } = await supabase
          .from('marks')
          .select('percentage')
          .eq('student_uid', profileData.student_id)
          .not('percentage', 'is', null)

        if (marksData && marksData.length > 0) {
          const avg =
            marksData.reduce((acc, m) => acc + Number(m.percentage || 0), 0) / marksData.length
          setQuizScore(Math.round(avg * 10) / 10)
        } else {
          // Fallback check on quiz_results
          const { data: qrData } = await supabase
            .from('quiz_results')
            .select('score, max_score')
            .eq('student_uid', profileData.student_id)

          if (qrData && qrData.length > 0) {
            const percentages = qrData
              .filter((q) => q.max_score > 0)
              .map((q) => (q.score / q.max_score) * 100)
            if (percentages.length > 0) {
              const avg = percentages.reduce((a, b) => a + b, 0) / percentages.length
              setQuizScore(Math.round(avg * 10) / 10)
            }
          }
        }

        // 4. Fetch Achievements from student_achievements table
        try {
          const { data: achData, error: achError } = await supabase
            .from('student_achievements')
            .select('*')
            .eq('student_uid', profileData.student_id)
            .order('created_at', { ascending: false })

          if (!achError && achData) {
            const parsedAch: RawAchievement[] = achData.map((a: any) => ({
              id: a.id,
              category: a.category,
              title: a.title,
              organizer: a.organizer,
              date: a.date,
              result: a.result,
              score: Number(a.score || 0),
              description: a.description,
              proof_url: a.proof_url,
              verification_status: a.verification_status
            }))
            setAchievements(parsedAch)
          }
        } catch (e) {
          console.warn('student_achievements table may not be queried yet:', e)
        }
      }
    } catch (err) {
      console.error('Error fetching student overall data:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchStudentData()
  }, [])

  // Calculate Overall Score and Category Breakdown dynamically
  const scoreBreakdown: ScoreBreakdown = useMemo(() => {
    return calculateOverallStudentScore({
      cgpa: studentProfile?.cgpa ?? null,
      quizScore,
      achievements
    })
  }, [studentProfile?.cgpa, quizScore, achievements])

  // Save CGPA
  const handleSaveCgpa = async (e: React.FormEvent) => {
    e.preventDefault()
    setCgpaError(null)

    const parsed = parseFloat(cgpaInput)
    if (isNaN(parsed) || parsed < CGPA_CONFIG.minCgpa || parsed > CGPA_CONFIG.maxCgpa) {
      setCgpaError(`Please enter a valid CGPA between ${CGPA_CONFIG.minCgpa} and ${CGPA_CONFIG.maxCgpa}`)
      return
    }

    try {
      setIsSavingCgpa(true)
      if (!studentProfile?.id) return

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ cgpa: parsed })
        .eq('id', studentProfile.id)

      if (updateError) {
        if (
          updateError.message?.includes('cgpa') ||
          updateError.details?.includes('cgpa') ||
          updateError.code === 'PGRST204'
        ) {
          setCgpaColumnMissing(true)
          throw new Error(
            "The 'cgpa' column is missing from your 'profiles' table in Supabase. Please run the SQL migration in 'supabase/overall_performance_achievements.sql' in your Supabase SQL Editor."
          )
        }
        throw updateError
      }

      setStudentProfile((prev) => (prev ? { ...prev, cgpa: parsed } : null))
      setCgpaColumnMissing(false)
      setShowCgpaModal(false)
      setCgpaInput('')
    } catch (err: any) {
      console.error('Error saving CGPA:', err)
      setCgpaError(err.message || 'Failed to save CGPA. Please check database permissions.')
    } finally {
      setIsSavingCgpa(false)
    }
  }

  // Open Add Achievement Modal for specific category
  const handleOpenAddModal = (cat: AchievementCategory) => {
    setModalCategory(cat)
    setFormTitle('')
    setFormOrganizer('')
    setFormDate('')
    setFormDescription('')
    setFormProofUrl('')
    setFormError(null)

    // Set default result depending on category
    if (cat === 'hackathon') setFormResult('winner')
    else if (cat === 'coding_competition') setFormResult('winner')
    else if (cat === 'research') setFormResult('published_lead')
    else if (cat === 'internship') setFormResult('medium_term')
    else setFormResult('major_technical')

    setShowAddModal(true)
  }

  // Save new achievement to Supabase
  const handleSaveAchievement = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!formTitle.trim()) {
      setFormError('Achievement title is required.')
      return
    }

    if (!studentProfile?.student_id) {
      setFormError('No student ID associated with this profile.')
      return
    }

    try {
      setIsSubmittingAchievement(true)

      // Calculate score based on result
      const calculatedScore = getIndividualAchievementScore(modalCategory, formResult)

      const newRecord = {
        student_uid: studentProfile.student_id,
        user_id: studentProfile.id,
        category: modalCategory,
        title: formTitle.trim(),
        organizer: formOrganizer.trim() || null,
        date: formDate.trim() || null,
        result: formResult,
        score: calculatedScore,
        description: formDescription.trim() || null,
        proof_url: formProofUrl.trim() || null,
        verification_status: 'verified' // default verified for immediate dynamic ranking
      }

      const { data, error: insertError } = await supabase
        .from('student_achievements')
        .insert(newRecord)
        .select()
        .single()

      if (insertError) {
        throw insertError
      }

      // Add to local state
      if (data) {
        setAchievements((prev) => [
          {
            id: data.id,
            category: data.category,
            title: data.title,
            organizer: data.organizer,
            date: data.date,
            result: data.result,
            score: Number(data.score),
            description: data.description,
            proof_url: data.proof_url,
            verification_status: data.verification_status
          },
          ...prev
        ])
      }

      setShowAddModal(false)
    } catch (err: any) {
      console.error('Error adding achievement:', err)
      setFormError(err.message || 'Failed to save achievement. Please try again.')
    } finally {
      setIsSubmittingAchievement(false)
    }
  }

  // Delete an achievement
  const handleDeleteAchievement = async (id: string | undefined) => {
    if (!id) return
    if (!confirm('Are you sure you want to delete this achievement?')) return

    try {
      const { error: delError } = await supabase
        .from('student_achievements')
        .delete()
        .eq('id', id)

      if (delError) throw delError

      setAchievements((prev) => prev.filter((a) => a.id !== id))
    } catch (err) {
      console.error('Error deleting achievement:', err)
      alert('Failed to delete achievement.')
    }
  }

  // Helper labels
  const getCategoryMeta = (cat: AchievementCategory) => {
    switch (cat) {
      case 'hackathon':
        return {
          label: 'Hackathons',
          weightText: '15%',
          icon: <Trophy className="w-4 h-4 text-amber-400" />,
          color: 'text-amber-400',
          bg: 'bg-amber-500/10 border-amber-500/30'
        }
      case 'coding_competition':
        return {
          label: 'Coding Competitions',
          weightText: '10%',
          icon: <Code2 className="w-4 h-4 text-purple-400" />,
          color: 'text-purple-400',
          bg: 'bg-purple-500/10 border-purple-500/30'
        }
      case 'research':
        return {
          label: 'Research & Publications',
          weightText: '10%',
          icon: <BookOpen className="w-4 h-4 text-blue-400" />,
          color: 'text-blue-400',
          bg: 'bg-blue-500/10 border-blue-500/30'
        }
      case 'internship':
        return {
          label: 'Internships',
          weightText: '5%',
          icon: <Briefcase className="w-4 h-4 text-emerald-400" />,
          color: 'text-emerald-400',
          bg: 'bg-emerald-500/10 border-emerald-500/30'
        }
      case 'project':
        return {
          label: 'Projects & Technical Work',
          weightText: '5%',
          icon: <FolderGit2 className="w-4 h-4 text-teal-400" />,
          color: 'text-teal-400',
          bg: 'bg-teal-500/10 border-teal-500/30'
        }
    }
  }

  // Format Result text for UI
  const formatResultLabel = (result: string) => {
    return result
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto p-6 flex flex-col items-center justify-center min-h-[50vh] gap-3 text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-sm">Loading overall performance & achievements...</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      {/* --- Missing CGPA Database Column Banner --- */}
      {cgpaColumnMissing && (
        <Card className="bg-rose-500/15 border-rose-500/40 text-rose-200">
          <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-rose-400 shrink-0" />
              <div>
                <p className="font-bold text-sm text-white">
                  Database Notice: CGPA Column Missing in Supabase
                </p>
                <p className="text-xs text-rose-300/90 mt-0.5">
                  The <code className="bg-slate-900/60 px-1.5 py-0.5 rounded text-white font-mono">cgpa</code> column is not found in the <code className="bg-slate-900/60 px-1.5 py-0.5 rounded text-white font-mono">profiles</code> table. Run the script in <code className="bg-slate-900/60 px-1.5 py-0.5 rounded text-white font-mono">supabase/overall_performance_achievements.sql</code> in your Supabase SQL Editor.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* --- Mandatory CGPA Warning Banner if missing --- */}
      {!cgpaColumnMissing && studentProfile?.cgpa === null && (
        <Card className="bg-amber-500/15 border-amber-500/40 text-amber-200">
          <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-amber-400 shrink-0" />
              <div>
                <p className="font-bold text-sm text-white">
                  Compulsory Action: Add Your CGPA
                </p>
                <p className="text-xs text-amber-300/90 mt-0.5">
                  CGPA is required to calculate your authoritative Academic Score (30% weight) and finalize your Overall Performance Score.
                </p>
              </div>
            </div>
            <Button
              onClick={() => {
                setCgpaInput('')
                setCgpaError(null)
                setShowCgpaModal(true)
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shrink-0"
            >
              Enter CGPA Now
            </Button>
          </CardContent>
        </Card>
      )}

      {/* --- Page Header --- */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-700/80 pb-5">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Award className="w-7 h-7 text-blue-400" />
            My Overall Performance
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Comprehensive profile combining academic excellence, quiz mastery, and verified achievements
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <Button
            onClick={fetchStudentData}
            variant="outline"
            size="sm"
            className="border-slate-700 text-slate-300 hover:bg-slate-800 gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* --- Section 1: Hero Cards (Overall Score, CGPA, Learner Type) --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Overall Performance Score (0-100) */}
        <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700 shadow-xl relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Overall Student Performance Score
            </CardDescription>
            <CardTitle className="text-4xl font-extrabold text-white mt-1 flex items-baseline gap-2">
              <span className="text-blue-400">{scoreBreakdown.overallScore}</span>
              <span className="text-lg text-slate-500 font-normal">/ 100</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {/* Visual Progress Bar */}
            <div className="w-full bg-slate-700/60 rounded-full h-3 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 rounded-full transition-all duration-500"
                style={{ width: `${scoreBreakdown.overallScore}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 mt-2.5 flex items-center justify-between">
              <span>Weighted aggregate of all 7 components</span>
              <span className={scoreBreakdown.isComplete ? 'text-emerald-400' : 'text-amber-400'}>
                {scoreBreakdown.isComplete ? '● Complete' : '● CGPA Required'}
              </span>
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Student CGPA (30% Component) */}
        <Card className="bg-slate-800/90 border-slate-700 shadow-xl">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardDescription className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Academic CGPA (30%)
              </CardDescription>
              <CardTitle className="text-4xl font-extrabold text-white mt-1 flex items-baseline gap-2">
                {studentProfile?.cgpa !== null ? (
                  <>
                    <span className="text-emerald-400">{studentProfile?.cgpa}</span>
                    <span className="text-lg text-slate-500 font-normal">/ {CGPA_CONFIG.defaultScale}</span>
                  </>
                ) : (
                  <span className="text-lg text-amber-400 font-medium">Missing</span>
                )}
              </CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCgpaInput(studentProfile?.cgpa ? String(studentProfile.cgpa) : '')
                setCgpaError(null)
                setShowCgpaModal(true)
              }}
              className="border-slate-700 text-slate-300 hover:bg-slate-700 text-xs gap-1"
            >
              <Edit2 className="w-3.5 h-3.5" />
              {studentProfile?.cgpa !== null ? 'Update' : 'Set CGPA'}
            </Button>
          </CardHeader>
          <CardContent className="pt-2">
            <p className="text-xs text-slate-400">
              Contribution:{' '}
              <strong className="text-white">
                {scoreBreakdown.academic.contribution} / 30 pts
              </strong>
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Normalized on a {CGPA_CONFIG.defaultScale}-point grading scale
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Learner Classification */}
        <Card className="bg-slate-800/90 border-slate-700 shadow-xl">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Course Learning Pace
            </CardDescription>
            <div className="mt-2">
              {studentProfile?.learner_tag === 'fast' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  Fast Learner
                </span>
              ) : studentProfile?.learner_tag === 'slow' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  <GraduationCap className="w-4 h-4 text-amber-400" />
                  Slow Learner
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold bg-slate-700/60 text-slate-300 border border-slate-600/50">
                  Moderate Learner
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <p className="text-xs text-slate-400">
              Quiz Average: <strong className="text-white">{quizScore}%</strong>
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Independent pace classification based on coursework assessments
            </p>
          </CardContent>
        </Card>
      </div>

      {/* --- Section 2: Overall Score Breakdown (7 Components) --- */}
      <Card className="bg-slate-800/90 border-slate-700 shadow-xl">
        <CardHeader className="border-b border-slate-700/60 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                Score Breakdown & Contribution Weights
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Transparent calculation of all 7 weighted components summing to your 0–100 overall score
              </CardDescription>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/30">
                Total Weight: 100%
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Academic CGPA (30%) */}
            <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-emerald-400" />
                  Academic / CGPA
                </span>
                <span className="font-mono text-emerald-400 font-bold">
                  {scoreBreakdown.academic.contribution} / 30
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-400 h-full rounded-full transition-all"
                  style={{ width: `${(scoreBreakdown.academic.contribution / 30) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                Score: {scoreBreakdown.academic.score}% • Weight: 30%
              </p>
            </div>

            {/* 2. Quiz Performance (25%) */}
            <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-blue-400" />
                  Quiz & Tests
                </span>
                <span className="font-mono text-blue-400 font-bold">
                  {scoreBreakdown.quiz.contribution} / 25
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-400 h-full rounded-full transition-all"
                  style={{ width: `${(scoreBreakdown.quiz.contribution / 25) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                Score: {scoreBreakdown.quiz.score}% • Weight: 25%
              </p>
            </div>

            {/* 3. Hackathons (15%) */}
            <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  Hackathons
                </span>
                <span className="font-mono text-amber-400 font-bold">
                  {scoreBreakdown.hackathons.contribution} / 15
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-amber-400 h-full rounded-full transition-all"
                  style={{ width: `${(scoreBreakdown.hackathons.contribution / 15) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                {scoreBreakdown.hackathons.count} recorded • Cat: {scoreBreakdown.hackathons.score}%
              </p>
            </div>

            {/* 4. Coding Competitions (10%) */}
            <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Code2 className="w-4 h-4 text-purple-400" />
                  Coding Competitions
                </span>
                <span className="font-mono text-purple-400 font-bold">
                  {scoreBreakdown.coding.contribution} / 10
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-purple-400 h-full rounded-full transition-all"
                  style={{ width: `${(scoreBreakdown.coding.contribution / 10) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                {scoreBreakdown.coding.count} recorded • Cat: {scoreBreakdown.coding.score}%
              </p>
            </div>

            {/* 5. Research & Publications (10%) */}
            <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-sky-400" />
                  Research / Papers
                </span>
                <span className="font-mono text-sky-400 font-bold">
                  {scoreBreakdown.research.contribution} / 10
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-sky-400 h-full rounded-full transition-all"
                  style={{ width: `${(scoreBreakdown.research.contribution / 10) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                {scoreBreakdown.research.count} recorded • Cat: {scoreBreakdown.research.score}%
              </p>
            </div>

            {/* 6. Internships (5%) */}
            <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Briefcase className="w-4 h-4 text-emerald-400" />
                  Internships
                </span>
                <span className="font-mono text-emerald-400 font-bold">
                  {scoreBreakdown.internships.contribution} / 5
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-400 h-full rounded-full transition-all"
                  style={{ width: `${(scoreBreakdown.internships.contribution / 5) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                {scoreBreakdown.internships.count} recorded • Cat: {scoreBreakdown.internships.score}%
              </p>
            </div>

            {/* 7. Projects & Other (5%) */}
            <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <FolderGit2 className="w-4 h-4 text-teal-400" />
                  Projects & Technical
                </span>
                <span className="font-mono text-teal-400 font-bold">
                  {scoreBreakdown.projects.contribution} / 5
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-teal-400 h-full rounded-full transition-all"
                  style={{ width: `${(scoreBreakdown.projects.contribution / 5) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                {scoreBreakdown.projects.count} recorded • Cat: {scoreBreakdown.projects.score}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* --- Section 3: Add Achievements Quick Actions --- */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              My Achievements Portfolio
            </h2>
            <p className="text-xs text-slate-400">
              Add multiple hackathons, competitions, research publications, internships, and technical projects
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => handleOpenAddModal('hackathon')}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Hackathon
            </Button>
            <Button
              size="sm"
              onClick={() => handleOpenAddModal('coding_competition')}
              className="bg-purple-600 hover:bg-purple-700 text-white text-xs gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Competition
            </Button>
            <Button
              size="sm"
              onClick={() => handleOpenAddModal('research')}
              className="bg-sky-600 hover:bg-sky-700 text-white text-xs gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Research
            </Button>
            <Button
              size="sm"
              onClick={() => handleOpenAddModal('internship')}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Internship
            </Button>
            <Button
              size="sm"
              onClick={() => handleOpenAddModal('project')}
              className="bg-teal-600 hover:bg-teal-700 text-white text-xs gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Project
            </Button>
          </div>
        </div>

        {/* Filter buttons */}
        <div className="flex flex-wrap gap-1.5 border-b border-slate-700/80 pb-3">
          <button
            onClick={() => setActiveListTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeListTab === 'all'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            All Achievements ({achievements.length})
          </button>
          <button
            onClick={() => setActiveListTab('hackathon')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeListTab === 'hackathon'
                ? 'bg-amber-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Hackathons ({achievements.filter((a) => a.category === 'hackathon').length})
          </button>
          <button
            onClick={() => setActiveListTab('coding_competition')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeListTab === 'coding_competition'
                ? 'bg-purple-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Coding Competitions ({achievements.filter((a) => a.category === 'coding_competition').length})
          </button>
          <button
            onClick={() => setActiveListTab('research')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeListTab === 'research'
                ? 'bg-sky-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Research ({achievements.filter((a) => a.category === 'research').length})
          </button>
          <button
            onClick={() => setActiveListTab('internship')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeListTab === 'internship'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Internships ({achievements.filter((a) => a.category === 'internship').length})
          </button>
          <button
            onClick={() => setActiveListTab('project')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeListTab === 'project'
                ? 'bg-teal-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Projects ({achievements.filter((a) => a.category === 'project').length})
          </button>
        </div>

        {/* Achievements List */}
        {achievements.filter((a) => activeListTab === 'all' || a.category === activeListTab).length === 0 ? (
          <Card className="bg-slate-800/60 border-slate-700/60 p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-800 mx-auto flex items-center justify-center text-slate-500 mb-3">
              <Trophy className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-300">
              No {activeListTab === 'all' ? '' : activeListTab.replace('_', ' ')} achievements added yet
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Start adding your accomplishments to continuously boost your overall score and showcase your abilities to professors.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {achievements
              .filter((a) => activeListTab === 'all' || a.category === activeListTab)
              .map((ach) => {
                const meta = getCategoryMeta(ach.category)
                return (
                  <Card
                    key={ach.id || ach.title}
                    className="bg-slate-800/80 border-slate-700/80 hover:border-slate-600 transition shadow-md flex flex-col justify-between"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-lg ${meta.bg}`}>{meta.icon}</div>
                          <div>
                            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                              {meta.label}
                            </span>
                            <CardTitle className="text-base font-bold text-white mt-0.5 line-clamp-1" title={ach.title}>
                              {ach.title}
                            </CardTitle>
                          </div>
                        </div>

                        <button
                          onClick={() => handleDeleteAchievement(ach.id)}
                          className="text-slate-500 hover:text-rose-400 transition p-1"
                          title="Delete achievement"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-2.5 pt-0 text-xs text-slate-300">
                      {ach.organizer && (
                        <p className="text-slate-400">
                          Organizer / Platform: <strong className="text-slate-200">{ach.organizer}</strong>
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-1">
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-700/60 text-slate-200 border border-slate-600/60">
                          {formatResultLabel(ach.result)}
                        </span>
                        <span className="font-bold text-emerald-400">
                          Event Score: {ach.score} pts
                        </span>
                      </div>

                      {ach.description && (
                        <p className="text-slate-400 line-clamp-2 text-[11px] mt-1">
                          {ach.description}
                        </p>
                      )}

                      {ach.proof_url && (
                        <a
                          href={ach.proof_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:underline pt-1"
                        >
                          <ExternalLink className="w-3 h-3" /> View Certificate / Proof
                        </a>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
          </div>
        )}
      </div>

      {/* --- Modal 1: Mandatory / Edit CGPA --- */}
      {showCgpaModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-md bg-slate-900 border-slate-700 shadow-2xl">
            <CardHeader className="border-b border-slate-800 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-emerald-400" />
                  {studentProfile?.cgpa !== null ? 'Update CGPA' : 'Enter Compulsory CGPA'}
                </CardTitle>
                {studentProfile?.cgpa !== null && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowCgpaModal(false)}
                    className="text-slate-400 hover:bg-slate-800 rounded-full"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <CardDescription className="text-xs text-slate-400 mt-1">
                Enter your current cumulative GPA on a {CGPA_CONFIG.defaultScale}-point scale.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6 space-y-4">
              <form onSubmit={handleSaveCgpa} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300">
                    Cumulative GPA (0.00 – {CGPA_CONFIG.defaultScale}.00)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min={CGPA_CONFIG.minCgpa}
                    max={CGPA_CONFIG.maxCgpa}
                    placeholder="e.g. 8.65"
                    value={cgpaInput}
                    onChange={(e) => setCgpaInput(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white text-base"
                    required
                    autoFocus
                  />
                  <p className="text-[11px] text-slate-500">
                    Contributes 30% to your overall performance ranking.
                  </p>
                </div>

                {cgpaError && (
                  <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 p-2.5 rounded-md">
                    {cgpaError}
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  {studentProfile?.cgpa !== null && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCgpaModal(false)}
                      className="border-slate-700 text-slate-300 hover:bg-slate-800"
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isSavingCgpa}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                  >
                    {isSavingCgpa ? 'Saving...' : 'Save & Calculate Score'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* --- Modal 2: Add Achievement Modal --- */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-lg bg-slate-900 border-slate-700 shadow-2xl overflow-hidden">
            <CardHeader className="border-b border-slate-800 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                  <Plus className="w-5 h-5 text-blue-400" />
                  Add New Achievement
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowAddModal(false)}
                  className="text-slate-400 hover:bg-slate-800 rounded-full"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <CardDescription className="text-xs text-slate-400 mt-1">
                Your achievement result directly determines the category score without arbitrary self-rating.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6 space-y-4">
              <form onSubmit={handleSaveAchievement} className="space-y-4">
                {/* Category Select */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Achievement Category
                  </label>
                  <select
                    value={modalCategory}
                    onChange={(e) => {
                      const newCat = e.target.value as AchievementCategory
                      setModalCategory(newCat)
                      if (newCat === 'hackathon') setFormResult('winner')
                      else if (newCat === 'coding_competition') setFormResult('winner')
                      else if (newCat === 'research') setFormResult('published_lead')
                      else if (newCat === 'internship') setFormResult('medium_term')
                      else setFormResult('major_technical')
                    }}
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="hackathon">Hackathon (15% Weight)</option>
                    <option value="coding_competition">Coding Competition (10% Weight)</option>
                    <option value="research">Research & Publications (10% Weight)</option>
                    <option value="internship">Internship (5% Weight)</option>
                    <option value="project">Project / Technical Achievement (5% Weight)</option>
                  </select>
                </div>

                {/* Title */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Title / Event / Project Name *
                  </label>
                  <Input
                    type="text"
                    placeholder={
                      modalCategory === 'hackathon'
                        ? 'e.g. Smart India Hackathon 2024'
                        : modalCategory === 'coding_competition'
                        ? 'e.g. CodeChef Starters 110'
                        : modalCategory === 'research'
                        ? 'e.g. Neural Machine Translation for Indic Languages'
                        : modalCategory === 'internship'
                        ? 'e.g. Software Engineering Intern'
                        : 'e.g. AI-Powered Recommendation Engine'
                    }
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white text-sm"
                    required
                  />
                </div>

                {/* Organizer / Organization */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">
                      Organizer / Company / Platform
                    </label>
                    <Input
                      type="text"
                      placeholder="e.g. IEEE / Google / LeetCode"
                      value={formOrganizer}
                      onChange={(e) => setFormOrganizer(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">
                      Date / Year
                    </label>
                    <Input
                      type="text"
                      placeholder="e.g. Oct 2024"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white text-sm"
                    />
                  </div>
                </div>

                {/* Result / Outcome Dropdown (determines achievement score) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span>Result / Position *</span>
                    <span className="text-[11px] text-emerald-400 font-bold">
                      Yields: {getIndividualAchievementScore(modalCategory, formResult)} pts
                    </span>
                  </label>
                  <select
                    value={formResult}
                    onChange={(e) => setFormResult(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  >
                    {modalCategory === 'hackathon' && (
                      <>
                        <option value="winner">Winner / 1st Place (100 pts)</option>
                        <option value="runner_up">Runner Up / 2nd Place (90 pts)</option>
                        <option value="third_place">3rd Place (80 pts)</option>
                        <option value="finalist">Finalist / Top 5 (65 pts)</option>
                        <option value="top_n">Top 10 / Honorable Mention (55 pts)</option>
                        <option value="participant">Participant (30 pts)</option>
                      </>
                    )}

                    {modalCategory === 'coding_competition' && (
                      <>
                        <option value="winner">1st Place / Global Winner (100 pts)</option>
                        <option value="top_three">Top 3 / Top 1% (90 pts)</option>
                        <option value="top_ten">Top 10 / Top 5% (75 pts)</option>
                        <option value="finalist">Finalist / Top 10% (60 pts)</option>
                        <option value="participant">Ranked Participant (35 pts)</option>
                      </>
                    )}

                    {modalCategory === 'research' && (
                      <>
                        <option value="published_lead">Published (First Author / Lead) (100 pts)</option>
                        <option value="published_co">Published (Co-Author) (85 pts)</option>
                        <option value="accepted">Accepted / Under Review (65 pts)</option>
                        <option value="presentation">Conference Presentation (50 pts)</option>
                        <option value="poster">Poster / Working Paper (35 pts)</option>
                      </>
                    )}

                    {modalCategory === 'internship' && (
                      <>
                        <option value="long_term">Completed (Over 3 months / Lead Role) (100 pts)</option>
                        <option value="medium_term">Completed (1–3 months) (80 pts)</option>
                        <option value="ongoing">Ongoing / In Progress (60 pts)</option>
                        <option value="short_term">Short-term (Under 1 month) (40 pts)</option>
                      </>
                    )}

                    {modalCategory === 'project' && (
                      <>
                        <option value="major_technical">Major Technical / Open Source Project (100 pts)</option>
                        <option value="capstone">Capstone / Full-Stack System (80 pts)</option>
                        <option value="mini_project">Coursework / Mini Project (60 pts)</option>
                        <option value="verified_other">Other Verified Technical Achievement (50 pts)</option>
                      </>
                    )}
                  </select>
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Brief Description / Project Details
                  </label>
                  <Input
                    type="text"
                    placeholder="Describe your role, technologies used, or outcome..."
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white text-sm"
                  />
                </div>

                {/* Proof URL */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Proof / Certificate / Project URL (Optional)
                  </label>
                  <Input
                    type="url"
                    placeholder="https://..."
                    value={formProofUrl}
                    onChange={(e) => setFormProofUrl(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white text-sm"
                  />
                </div>

                {formError && (
                  <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 p-2.5 rounded-md">
                    {formError}
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddModal(false)}
                    className="border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isSubmittingAchievement}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                  >
                    {isSubmittingAchievement ? 'Saving...' : 'Add Achievement'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
