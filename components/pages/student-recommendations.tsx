'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sparkles,
  Trophy,
  Award,
  BookOpen,
  Code2,
  FolderGit2,
  RefreshCw,
  Briefcase,
  Video,
  Search,
  Filter,
  ArrowRight,
  Clock,
  Target,
  Zap,
  CheckCircle2,
  AlertCircle,
  Compass,
  ExternalLink,
  PlayCircle,
  FileText,
  Globe
} from 'lucide-react'
import type { PersonalizedPlan, RecommendationItem, ResourceItem } from '@/app/api/recommendations/route'

const SECTION_OPTIONS = [
  'All Sections',
  'Improve Weak Areas',
  'Learn Next',
  'Practice',
  'Build',
  'Participate',
  'Explore'
] as const

const PRIORITY_OPTIONS = ['All', 'High', 'Medium', 'Low'] as const

interface StudentProfileMeta {
  name: string
  studentId: number | null
  cgpa: number | null
  learnerPace: 'Fast Learner' | 'Medium Learner' | 'Slow Learner'
  enrolledCoursesCount: number
  achievementsCount: number
  weakTopicsCount: number
}

// Ensure all recommendations always contain clickable resources
function ensureResourcesOnPlan(rawPlan: PersonalizedPlan | null): PersonalizedPlan | null {
  if (!rawPlan || !rawPlan.recommendations) return rawPlan
  return {
    ...rawPlan,
    recommendations: rawPlan.recommendations.map((rec, idx) => {
      const existingResources = rec.resources && Array.isArray(rec.resources) && rec.resources.length > 0
        ? rec.resources
        : null

      if (existingResources) {
        return {
          ...rec,
          id: rec.id || `rec-${idx + 1}`,
          resourceUrl: rec.resourceUrl || existingResources[0].url
        }
      }

      const topicQuery = encodeURIComponent(rec.activity || 'computer science tutorial')
      const videoQuery = encodeURIComponent(`${rec.activity} tutorial`)
      const defaultResources: ResourceItem[] = [
        {
          title: `${rec.activity} - Video Tutorial`,
          platform: 'YouTube',
          url: `https://www.youtube.com/results?search_query=${videoQuery}`,
          resource_type: 'video',
          description: `Visual walkthrough and step-by-step conceptual explanation for ${rec.activity}.`
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

      return {
        ...rec,
        id: rec.id || `rec-${idx + 1}`,
        resourceUrl: rec.resourceUrl || defaultResources[0].url,
        resources: defaultResources
      }
    })
  }
}

export default function StudentRecommendations() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [plan, setPlan] = useState<PersonalizedPlan | null>(null)
  const [studentMeta, setStudentMeta] = useState<StudentProfileMeta | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  // Filters & State
  const [selectedSection, setSelectedSection] = useState<string>('All Sections')
  const [selectedPriority, setSelectedPriority] = useState<string>('All')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [completedItems, setCompletedItems] = useState<Record<string, boolean>>({})

  // Fetch plan from API route
  const loadPlan = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      setError(null)

      // Try reading cached plan for instant display
      if (!isRefresh && typeof window !== 'undefined') {
        const cached = localStorage.getItem('vidyamitra_student_rec_plan')
        const cachedMeta = localStorage.getItem('vidyamitra_student_rec_meta')
        const cachedTime = localStorage.getItem('vidyamitra_student_rec_time')
        if (cached) {
          try {
            const parsedPlan = JSON.parse(cached)
            const safePlan = ensureResourcesOnPlan(parsedPlan)
            if (safePlan) {
              setPlan(safePlan)
              if (cachedMeta) setStudentMeta(JSON.parse(cachedMeta))
              if (cachedTime) setLastUpdated(cachedTime)
              setLoading(false)
            }
          } catch (e) {
            // continue fetching fresh
          }
        }
      }

      const res = await fetch('/api/recommendations', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })

      const data = await res.json()

      if (res.ok && data.success && data.plan) {
        const validatedPlan = ensureResourcesOnPlan(data.plan)
        setPlan(validatedPlan)
        setStudentMeta(data.studentProfile || null)
        const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        setLastUpdated(timeString)

        if (typeof window !== 'undefined' && validatedPlan) {
          localStorage.setItem('vidyamitra_student_rec_plan', JSON.stringify(validatedPlan))
          if (data.studentProfile) {
            localStorage.setItem('vidyamitra_student_rec_meta', JSON.stringify(data.studentProfile))
          }
          localStorage.setItem('vidyamitra_student_rec_time', timeString)
        }
      } else {
        if (!plan) {
          setError(data.error || 'Failed to generate recommendations.')
        }
      }
    } catch (err: any) {
      console.error('Failed to load recommendation plan:', err)
      if (!plan) {
        setError(err?.message || 'Error communicating with recommendations engine.')
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadPlan()
  }, [])

  const toggleItemCompleted = (id: string) => {
    setCompletedItems((prev) => ({
      ...prev,
      [id]: !prev[id]
    }))
  }

  // Filter recommendations
  const filteredRecommendations = useMemo(() => {
    if (!plan?.recommendations) return []

    return plan.recommendations.filter((item) => {
      // Section filter
      if (selectedSection !== 'All Sections' && item.section !== selectedSection) {
        return false
      }

      // Priority filter
      if (selectedPriority !== 'All' && item.priority !== selectedPriority) {
        return false
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchTitle = item.activity.toLowerCase().includes(query)
        const matchReason = item.reason.toLowerCase().includes(query)
        const matchCategory = item.category?.toLowerCase().includes(query)
        const matchBenefit = item.expectedBenefit.toLowerCase().includes(query)
        if (!matchTitle && !matchReason && !matchCategory && !matchBenefit) {
          return false
        }
      }

      return true
    })
  }, [plan, selectedSection, selectedPriority, searchQuery])

  // Count items per section
  const sectionCounts = useMemo(() => {
    const counts: Record<string, number> = { 'All Sections': plan?.recommendations?.length || 0 }
    plan?.recommendations?.forEach((rec) => {
      counts[rec.section] = (counts[rec.section] || 0) + 1
    })
    return counts
  }, [plan])

  // Category Icon
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Hackathon':
        return <Trophy className="h-5 w-5 text-amber-400" />
      case 'Coding':
        return <Code2 className="h-5 w-5 text-blue-400" />
      case 'Certification':
        return <Award className="h-5 w-5 text-emerald-400" />
      case 'Video':
        return <Video className="h-5 w-5 text-rose-400" />
      case 'Topic':
        return <BookOpen className="h-5 w-5 text-indigo-400" />
      case 'Project':
        return <FolderGit2 className="h-5 w-5 text-cyan-400" />
      case 'Revision':
        return <RefreshCw className="h-5 w-5 text-amber-500" />
      case 'Research':
        return <Compass className="h-5 w-5 text-purple-400" />
      case 'Internship Prep':
        return <Briefcase className="h-5 w-5 text-teal-400" />
      default:
        return <Sparkles className="h-5 w-5 text-blue-400" />
    }
  }

  // Priority Styling
  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'High':
        return (
          <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/40 text-xs px-2.5 py-0.5 font-medium">
            High Priority
          </Badge>
        )
      case 'Medium':
        return (
          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-xs px-2.5 py-0.5 font-medium">
            Medium Priority
          </Badge>
        )
      case 'Low':
        return (
          <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/40 text-xs px-2.5 py-0.5 font-medium">
            Low Priority
          </Badge>
        )
      default:
        return null
    }
  }

  // Difficulty Styling
  const getDifficultyBadge = (difficulty: string) => {
    switch (difficulty) {
      case 'Advanced':
        return (
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
            Advanced
          </span>
        )
      case 'Intermediate':
        return (
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
            Intermediate
          </span>
        )
      case 'Beginner':
        return (
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            Beginner Friendly
          </span>
        )
      default:
        return null
    }
  }

  // Resource Icon & Platform badge
  const renderPlatformBadge = (platform: string, resourceType: string) => {
    const p = (platform || '').toLowerCase()
    if (p.includes('youtube') || resourceType === 'video') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
          <PlayCircle className="h-3 w-3 text-rose-400" />
          {platform || 'YouTube'}
        </span>
      )
    }
    if (p.includes('leetcode') || p.includes('codeforces') || resourceType === 'practice') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
          <Code2 className="h-3 w-3 text-amber-400" />
          {platform || 'Practice'}
        </span>
      )
    }
    if (p.includes('geeksforgeeks') || p.includes('gfg') || p.includes('mdn') || resourceType === 'documentation') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
          <FileText className="h-3 w-3 text-emerald-400" />
          {platform || 'Documentation'}
        </span>
      )
    }
    if (p.includes('github') || p.includes('git')) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
          <FolderGit2 className="h-3 w-3 text-cyan-400" />
          {platform || 'GitHub'}
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
        <Globe className="h-3 w-3 text-blue-400" />
        {platform || 'Resource'}
      </span>
    )
  }

  // Pace badge info
  const pace = plan?.learnerPaceAssessed || studentMeta?.learnerPace || 'Medium Learner'
  const getPaceBadgeDetails = () => {
    if (pace === 'Fast Learner') {
      return {
        label: 'Fast Learner',
        icon: '🚀',
        color: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
        strategyNote:
          'High-velocity roadmap: Advanced competitive programming, system design, research contributions, and top-tier hackathons tailored to your rapid pace.'
      }
    } else if (pace === 'Slow Learner') {
      return {
        label: 'Slow Learner',
        icon: '🌱',
        color: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        strategyNote:
          'Focused & manageable plan: Prioritizing revision of identified weak topics with bite-sized practice, video walkthroughs, and zero cognitive overload.'
      }
    } else {
      return {
        label: 'Medium Learner',
        icon: '⚖️',
        color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        strategyNote:
          'Balanced progression: Solidifying course foundations, intermediate coding challenges, portfolio capstones, and industry certifications.'
      }
    }
  }

  const paceDetails = getPaceBadgeDetails()

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      {/* Top Banner & Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700 p-6 md:p-8 shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-3xl">💡</span>
              <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
                Personalized Recommendation Plan
              </h1>
              <Badge className={`text-sm px-3 py-1 font-semibold flex items-center gap-1.5 ${paceDetails.color}`}>
                <span>{paceDetails.icon}</span>
                <span>{paceDetails.label}</span>
              </Badge>
            </div>
            <p className="text-slate-300 text-sm md:text-base max-w-3xl leading-relaxed">
              Tailored specifically to your real academic performance, quiz accuracy, weak areas, verified achievements, and your existing learning pace. Powered by Groq AI.
            </p>

            {/* Strategy Banner */}
            <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 text-sm flex items-start gap-3">
              <div className="p-1 rounded bg-blue-500/20 text-blue-400 mt-0.5">
                <Target className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <span className="font-medium text-slate-200">Pace Strategy: </span>
                <span className="text-slate-400">{paceDetails.strategyNote}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col gap-3 shrink-0">
            <Button
              onClick={() => loadPlan(true)}
              disabled={refreshing}
              className="bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center gap-2 shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Generating with Groq...' : 'Refresh Plan'}
            </Button>
            {lastUpdated && (
              <span className="text-xs text-slate-400 text-center">
                Updated at {lastUpdated}
              </span>
            )}
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-700/60">
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3">
            <p className="text-xs text-slate-400 font-medium">CGPA</p>
            <p className="text-xl font-bold text-white mt-1">
              {studentMeta?.cgpa !== null && studentMeta?.cgpa !== undefined ? studentMeta.cgpa : 'N/A'}
            </p>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3">
            <p className="text-xs text-slate-400 font-medium">Achievements Verified</p>
            <p className="text-xl font-bold text-amber-400 mt-1">
              {studentMeta?.achievementsCount ?? 0}
            </p>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3">
            <p className="text-xs text-slate-400 font-medium">Weak Topics Targeted</p>
            <p className="text-xl font-bold text-rose-400 mt-1">
              {studentMeta?.weakTopicsCount ?? 0}
            </p>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3">
            <p className="text-xs text-slate-400 font-medium">Active Recommendations</p>
            <p className="text-xl font-bold text-blue-400 mt-1">
              {plan?.recommendations?.length ?? 0}
            </p>
          </div>
        </div>
      </div>

      {/* Focus Areas Highlights */}
      {plan?.keyFocusAreas && plan.keyFocusAreas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5 p-4 rounded-xl bg-slate-800/60 border border-slate-700/70">
          <span className="text-xs uppercase tracking-wider font-semibold text-slate-400 flex items-center gap-1.5 mr-1">
            <Zap className="h-3.5 w-3.5 text-amber-400" /> Focus Pillars:
          </span>
          {plan.keyFocusAreas.map((area, idx) => (
            <span
              key={idx}
              className="px-3 py-1 text-xs font-medium rounded-full bg-slate-700/70 text-slate-200 border border-slate-600/60"
            >
              {area}
            </span>
          ))}
        </div>
      )}

      {/* Filter and Search Controls */}
      <div className="space-y-4">
        {/* Section Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-700">
          {SECTION_OPTIONS.map((sec) => {
            const isSelected = selectedSection === sec
            const count = sectionCounts[sec] || 0
            return (
              <button
                key={sec}
                onClick={() => setSelectedSection(sec)}
                className={`whitespace-nowrap px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/80'
                }`}
              >
                <span>{sec}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    isSelected ? 'bg-blue-700 text-white' : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Priority & Search Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
              <Filter className="h-3.5 w-3.5" /> Priority:
            </span>
            <div className="flex gap-1.5">
              {PRIORITY_OPTIONS.map((p) => (
                <button
                  key={p}
                  onClick={() => setSelectedPriority(p)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                    selectedPriority === p
                      ? 'bg-slate-700 text-white border border-slate-500'
                      : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-700'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Search activities or topics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-9 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading && !plan && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="bg-slate-800/60 border-slate-700 animate-pulse">
              <CardContent className="p-6">
                <div className="h-6 bg-slate-700 rounded w-1/3 mb-4" />
                <div className="h-4 bg-slate-700 rounded w-3/4 mb-2" />
                <div className="h-4 bg-slate-700 rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && !plan && (
        <Card className="bg-rose-950/20 border-rose-800 text-rose-300 p-6">
          <div className="flex items-start gap-4">
            <AlertCircle className="h-6 w-6 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-rose-200">Unable to generate plan</h3>
              <p className="text-sm mt-1 text-rose-300">{error}</p>
              <Button
                onClick={() => loadPlan(true)}
                variant="outline"
                className="mt-4 border-rose-700 text-rose-200 hover:bg-rose-900/40 cursor-pointer"
              >
                Retry Generation
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Recommendation Items List */}
      <div className="space-y-6">
        {filteredRecommendations.length === 0 && !loading && (
          <div className="text-center py-16 px-4 bg-slate-800/30 rounded-2xl border border-slate-800">
            <p className="text-slate-400 text-base">No recommendations matching your current filters.</p>
            <Button
              variant="link"
              onClick={() => {
                setSelectedSection('All Sections')
                setSelectedPriority('All')
                setSearchQuery('')
              }}
              className="text-blue-400 hover:text-blue-300 mt-2 cursor-pointer"
            >
              Reset Filters
            </Button>
          </div>
        )}

        {filteredRecommendations.map((item) => {
          const isDone = completedItems[item.id] || false
          const primaryUrl = (item.resources && item.resources[0]?.url) || item.resourceUrl || ''

          return (
            <Card
              key={item.id}
              className={`border transition-all duration-200 ${
                isDone
                  ? 'bg-slate-900/60 border-slate-800 opacity-70'
                  : 'bg-slate-800/90 hover:bg-slate-800 border-slate-700/80 hover:border-slate-600 shadow-lg'
              }`}
            >
              <CardContent className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                  {/* Left Column: Icon + Core Content */}
                  <div className="flex items-start gap-4 flex-1">
                    {/* Category Icon */}
                    <div className="p-3 rounded-xl bg-slate-700/70 border border-slate-600/50 shrink-0 mt-1">
                      {getCategoryIcon(item.category)}
                    </div>

                    <div className="space-y-4 flex-1">
                      {/* Section, Category, Priority & Difficulty Badges */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider bg-slate-700/40 px-2 py-0.5 rounded border border-slate-700">
                          {item.section}
                        </span>
                        <span className="text-xs font-semibold text-slate-300 bg-slate-700/80 px-2.5 py-0.5 rounded-full border border-slate-600">
                          {item.category}
                        </span>
                        {getPriorityBadge(item.priority)}
                        {getDifficultyBadge(item.difficulty)}
                        {item.estimatedHours && (
                          <span className="text-xs text-slate-400 flex items-center gap-1 ml-auto">
                            <Clock className="h-3 w-3" /> {item.estimatedHours}
                          </span>
                        )}
                      </div>

                      {/* Recommended Activity Title */}
                      <h3
                        className={`text-lg md:text-xl font-bold tracking-tight text-white ${
                          isDone ? 'line-through text-slate-400' : ''
                        }`}
                      >
                        {item.activity}
                      </h3>

                      {/* Reason & Profile Justification */}
                      <div className="rounded-lg bg-slate-900/60 border border-slate-700/60 p-3 text-sm space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-400">
                          <Target className="h-3.5 w-3.5" />
                          <span>Why this is recommended for you:</span>
                        </div>
                        <p className="text-slate-300 text-sm leading-relaxed pl-5">
                          {item.reason}
                        </p>
                      </div>

                      {/* Expected Benefit & Suggested Next Step */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="bg-slate-800/70 rounded-lg p-3 border border-slate-700/60">
                          <p className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                            <Sparkles className="h-3 w-3" /> Expected Benefit:
                          </p>
                          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                            {item.expectedBenefit}
                          </p>
                        </div>

                        <div className="bg-slate-800/70 rounded-lg p-3 border border-slate-700/60">
                          <p className="text-xs font-semibold text-sky-400 flex items-center gap-1">
                            <ArrowRight className="h-3 w-3" /> Suggested Next Step:
                          </p>
                          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                            {item.suggestedNextStep}
                          </p>
                        </div>
                      </div>

                      {/* Prominent Learning Resources & Clickable Links Section */}
                      {item.resources && item.resources.length > 0 && (
                        <div className="rounded-xl bg-slate-900/80 border border-blue-900/40 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <BookOpen className="h-4 w-4 text-blue-400" />
                              <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                                Curated Learning Resources & Clickable Links
                              </span>
                              <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-[10px] px-1.5 py-0">
                                {item.resources.length} Links
                              </Badge>
                            </div>
                            <span className="text-[11px] text-slate-400 hidden sm:inline">
                              Opens directly in new tab
                            </span>
                          </div>

                          <div className="space-y-2.5">
                            {item.resources.map((res, rIdx) => (
                              <div
                                key={rIdx}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-slate-800/90 border border-slate-700 hover:border-slate-600 transition-all"
                              >
                                <div className="space-y-1 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    {renderPlatformBadge(res.platform, res.resource_type)}
                                    <a
                                      href={res.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm font-semibold text-white hover:text-blue-400 transition-colors inline-flex items-center gap-1.5"
                                    >
                                      <span>{res.title}</span>
                                      <ExternalLink className="h-3 w-3 text-slate-400 hover:text-blue-400 shrink-0" />
                                    </a>
                                  </div>
                                  {res.description && (
                                    <p className="text-xs text-slate-300 leading-relaxed pl-0.5">
                                      {res.description}
                                    </p>
                                  )}
                                </div>

                                <a
                                  href={res.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-sm shrink-0 cursor-pointer"
                                >
                                  <span>{res.resource_type === 'video' ? 'Watch Video' : 'Open Resource'}</span>
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Quick Action Controls */}
                  <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between lg:justify-start gap-3 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-700">
                    <button
                      onClick={() => toggleItemCompleted(item.id)}
                      className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition flex items-center gap-1.5 cursor-pointer ${
                        isDone
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                          : 'bg-slate-700/50 text-slate-400 border-slate-600 hover:text-white hover:bg-slate-700'
                      }`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {isDone ? 'Completed' : 'Mark as Done'}
                    </button>

                    {primaryUrl && (
                      <a
                        href={primaryUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/30 transition-all cursor-pointer"
                      >
                        <Compass className="h-4 w-4" />
                        <span>{item.actionLabel || 'Explore Topic'}</span>
                        <ExternalLink className="h-3.5 w-3.5 ml-0.5" />
                      </a>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
