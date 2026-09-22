/**
 * ==============================================================================
 * VidyaSetu Centralized Scoring Engine
 * Authoritative constants and formulas for Overall Student Performance Scoring
 * ==============================================================================
 */

// 1. Centralized Category Weights (Must sum to 1.00 / 100%)
export const SCORE_WEIGHTS = {
  academic: 0.30,           // 30% CGPA / Academic Performance
  quiz: 0.15,               // 15% Existing Quiz & Assessment Performance
  assignment: 0.10,         // 10% Professor Assignments & AI Evaluations
  hackathons: 0.15,         // 15% Hackathons
  codingCompetitions: 0.10, // 10% Coding Competitions
  research: 0.10,           // 10% Research & Publications
  internships: 0.05,        // 5%  Internships
  projects: 0.05            // 5%  Projects & Other Achievements
} as const

// 2. CGPA Configuration
export const CGPA_CONFIG = {
  defaultScale: 10.0,
  minCgpa: 0.0,
  maxCgpa: 10.0
} as const

// 3. Achievement Result Scoring Models (Normalized 0–100 per event result)
export const HACKATHON_RESULT_SCORES: Record<string, number> = {
  winner: 100,       // Winner / 1st Place
  runner_up: 90,     // 2nd Place / Runner Up
  third_place: 80,   // 3rd Place
  finalist: 65,      // Finalist / Top 5
  top_n: 55,         // Top 10 / Top N / Honorable Mention
  participant: 30    // Participant
}

export const CODING_COMPETITION_SCORES: Record<string, number> = {
  winner: 100,       // 1st Place / Global Winner
  top_three: 90,     // Top 3 / Top 1%
  top_ten: 75,       // Top 10 / Top 5%
  finalist: 60,      // Finalist / Top 10%
  participant: 35    // Ranked Participant
}

export const RESEARCH_RESULT_SCORES: Record<string, number> = {
  published_lead: 100, // Published (First Author / Lead)
  published_co: 85,    // Published (Co-Author / Contributor)
  accepted: 65,        // Accepted / Under Peer Review
  presentation: 50,    // Conference Presentation
  poster: 35           // Poster / Working Paper
}

export const INTERNSHIP_RESULT_SCORES: Record<string, number> = {
  long_term: 100,      // Completed (> 3 months / Lead Role)
  medium_term: 80,     // Completed (1–3 months)
  ongoing: 60,         // Ongoing / In Progress
  short_term: 40       // Short-term (< 1 month)
}

export const PROJECT_RESULT_SCORES: Record<string, number> = {
  major_technical: 100, // Major Technical / Open Source / Hackathon Project
  capstone: 80,         // Capstone / Full-Stack System
  mini_project: 60,     // Coursework / Mini Project
  verified_other: 50    // Other Verified Technical Achievement
}

export type AchievementCategory =
  | 'hackathon'
  | 'coding_competition'
  | 'research'
  | 'internship'
  | 'project'

export interface RawAchievement {
  id?: string
  category: AchievementCategory
  title: string
  organizer?: string
  date?: string
  result: string
  score?: number
  description?: string
  proof_url?: string
  verification_status?: 'pending' | 'verified' | 'rejected'
}

/**
 * Returns the individual event score (0–100) based on category and result.
 */
export function getIndividualAchievementScore(
  category: AchievementCategory,
  result: string
): number {
  const normalizedKey = result.toLowerCase().trim().replace(/[\s-]+/g, '_')

  switch (category) {
    case 'hackathon':
      return HACKATHON_RESULT_SCORES[normalizedKey] ?? 30
    case 'coding_competition':
      return CODING_COMPETITION_SCORES[normalizedKey] ?? 35
    case 'research':
      return RESEARCH_RESULT_SCORES[normalizedKey] ?? 35
    case 'internship':
      return INTERNSHIP_RESULT_SCORES[normalizedKey] ?? 40
    case 'project':
      return PROJECT_RESULT_SCORES[normalizedKey] ?? 50
    default:
      return 30
  }
}

/**
 * Aggregates multiple achievement scores in a single category into a normalized 0–100 category score.
 * Formula uses diminishing-return accumulation:
 * Category Score = min(100, S_1 + S_2/2 + S_3/4 + S_4/8 + ...)
 * where S_1 >= S_2 >= S_3 are ordered achievement scores.
 *
 * Prevents spamming low-value participations while rewarding high placements and multiple achievements.
 */
export function aggregateCategoryScore(scores: number[]): number {
  if (!scores || scores.length === 0) return 0

  // Filter valid scores and sort descending
  const validScores = scores
    .map((s) => Math.max(0, Math.min(100, Number(s) || 0)))
    .sort((a, b) => b - a)

  if (validScores.length === 0) return 0

  let aggregate = validScores[0] // Anchor on top achievement
  let divisor = 2

  for (let i = 1; i < validScores.length; i++) {
    aggregate += validScores[i] / divisor
    divisor *= 2 // Diminishing return factor
  }

  // Bound strictly between 0 and 100
  return Math.min(100, Math.max(0, Math.round(aggregate * 10) / 10))
}

/**
 * Converts a student's CGPA into a normalized 0–100 academic score.
 */
export function calculateAcademicScore(
  cgpa: number | null | undefined,
  maxScale: number = CGPA_CONFIG.defaultScale
): number | null {
  if (cgpa === null || cgpa === undefined || isNaN(cgpa)) {
    return null
  }
  const clampedCgpa = Math.max(CGPA_CONFIG.minCgpa, Math.min(maxScale, Number(cgpa)))
  return Math.round((clampedCgpa / maxScale) * 100 * 10) / 10
}

export interface ScoreComponents {
  cgpa: number | null
  quizScore: number
  assignmentScore?: number | null
  achievements: RawAchievement[]
}

export interface ScoreBreakdown {
  academic: { score: number; contribution: number; maxContribution: number; isMissing: boolean }
  quiz: { score: number; contribution: number; maxContribution: number }
  assignment: { score: number; contribution: number; maxContribution: number; isMissing: boolean }
  hackathons: { score: number; contribution: number; maxContribution: number; count: number }
  coding: { score: number; contribution: number; maxContribution: number; count: number }
  research: { score: number; contribution: number; maxContribution: number; count: number }
  internships: { score: number; contribution: number; maxContribution: number; count: number }
  projects: { score: number; contribution: number; maxContribution: number; count: number }
  overallScore: number
  isComplete: boolean // false if compulsory CGPA is missing
}

/**
 * Master calculation function for Overall Student Performance Score (0–100)
 */
export function calculateOverallStudentScore(components: ScoreComponents): ScoreBreakdown {
  // 1. Academic / CGPA
  const academicScore = calculateAcademicScore(components.cgpa)
  const isAcademicMissing = academicScore === null
  const effectiveAcademicScore = academicScore ?? 0
  const academicContribution =
    Math.round(effectiveAcademicScore * SCORE_WEIGHTS.academic * 10) / 10

  // 2. Existing Quiz / Assessment Performance & 3. Assignment Performance
  const normalizedQuizScore = Math.max(0, Math.min(100, Number(components.quizScore) || 0))
  const hasAssignmentScore =
    components.assignmentScore !== undefined && components.assignmentScore !== null
  const normalizedAssignmentScore = hasAssignmentScore
    ? Math.max(0, Math.min(100, Number(components.assignmentScore)))
    : 0

  let quizContribution = 0
  let assignmentContribution = 0

  if (hasAssignmentScore) {
    // Both quiz (15%) and assignments (10%) are active
    quizContribution = Math.round(normalizedQuizScore * SCORE_WEIGHTS.quiz * 10) / 10
    assignmentContribution =
      Math.round(normalizedAssignmentScore * SCORE_WEIGHTS.assignment * 10) / 10
  } else {
    // If student has no assignments yet, quizzes dynamically absorb the 10% weight (15% + 10% = 25%)
    // so the student is not penalized for not having assignments yet
    quizContribution =
      Math.round(normalizedQuizScore * (SCORE_WEIGHTS.quiz + SCORE_WEIGHTS.assignment) * 10) / 10
    assignmentContribution = 0
  }

  // 4. Extracurricular Categories
  const achievements = components.achievements || []

  // Group achievements by category
  const hackathons = achievements.filter((a) => a.category === 'hackathon')
  const coding = achievements.filter((a) => a.category === 'coding_competition')
  const research = achievements.filter((a) => a.category === 'research')
  const internships = achievements.filter((a) => a.category === 'internship')
  const projects = achievements.filter((a) => a.category === 'project')

  // Calculate category scores using individual result scores + diminishing return
  const hackathonScores = hackathons.map((a) =>
    a.score !== undefined && a.score !== null ? a.score : getIndividualAchievementScore(a.category, a.result)
  )
  const codingScores = coding.map((a) =>
    a.score !== undefined && a.score !== null ? a.score : getIndividualAchievementScore(a.category, a.result)
  )
  const researchScores = research.map((a) =>
    a.score !== undefined && a.score !== null ? a.score : getIndividualAchievementScore(a.category, a.result)
  )
  const internshipScores = internships.map((a) =>
    a.score !== undefined && a.score !== null ? a.score : getIndividualAchievementScore(a.category, a.result)
  )
  const projectScores = projects.map((a) =>
    a.score !== undefined && a.score !== null ? a.score : getIndividualAchievementScore(a.category, a.result)
  )

  const hackathonCatScore = aggregateCategoryScore(hackathonScores)
  const codingCatScore = aggregateCategoryScore(codingScores)
  const researchCatScore = aggregateCategoryScore(researchScores)
  const internshipCatScore = aggregateCategoryScore(internshipScores)
  const projectCatScore = aggregateCategoryScore(projectScores)

  const hackathonContribution =
    Math.round(hackathonCatScore * SCORE_WEIGHTS.hackathons * 10) / 10
  const codingContribution =
    Math.round(codingCatScore * SCORE_WEIGHTS.codingCompetitions * 10) / 10
  const researchContribution =
    Math.round(researchCatScore * SCORE_WEIGHTS.research * 10) / 10
  const internshipContribution =
    Math.round(internshipCatScore * SCORE_WEIGHTS.internships * 10) / 10
  const projectContribution =
    Math.round(projectCatScore * SCORE_WEIGHTS.projects * 10) / 10

  // 5. Overall Score Sum
  const rawOverall =
    academicContribution +
    quizContribution +
    assignmentContribution +
    hackathonContribution +
    codingContribution +
    researchContribution +
    internshipContribution +
    projectContribution

  const overallScore = Math.min(100, Math.max(0, Math.round(rawOverall * 10) / 10))

  return {
    academic: {
      score: effectiveAcademicScore,
      contribution: academicContribution,
      maxContribution: SCORE_WEIGHTS.academic * 100,
      isMissing: isAcademicMissing
    },
    quiz: {
      score: normalizedQuizScore,
      contribution: quizContribution,
      maxContribution: (hasAssignmentScore ? SCORE_WEIGHTS.quiz : SCORE_WEIGHTS.quiz + SCORE_WEIGHTS.assignment) * 100
    },
    assignment: {
      score: normalizedAssignmentScore,
      contribution: assignmentContribution,
      maxContribution: SCORE_WEIGHTS.assignment * 100,
      isMissing: !hasAssignmentScore
    },
    hackathons: {
      score: hackathonCatScore,
      contribution: hackathonContribution,
      maxContribution: SCORE_WEIGHTS.hackathons * 100,
      count: hackathons.length
    },
    coding: {
      score: codingCatScore,
      contribution: codingContribution,
      maxContribution: SCORE_WEIGHTS.codingCompetitions * 100,
      count: coding.length
    },
    research: {
      score: researchCatScore,
      contribution: researchContribution,
      maxContribution: SCORE_WEIGHTS.research * 100,
      count: research.length
    },
    internships: {
      score: internshipCatScore,
      contribution: internshipContribution,
      maxContribution: SCORE_WEIGHTS.internships * 100,
      count: internships.length
    },
    projects: {
      score: projectCatScore,
      contribution: projectContribution,
      maxContribution: SCORE_WEIGHTS.projects * 100,
      count: projects.length
    },
    overallScore,
    isComplete: !isAcademicMissing
  }
}
