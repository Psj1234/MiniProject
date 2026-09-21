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

/**
 * Maps topic queries to official working LeetCode tag pages or targeted search
 */
export function getLeetCodeUrl(query: string): string {
  const q = (query || '').toLowerCase()
  if (q.includes('tree') || q.includes('bst')) return 'https://leetcode.com/tag/tree/'
  if (q.includes('graph')) return 'https://leetcode.com/tag/graph/'
  if (q.includes('dynamic') || q.includes('dp')) return 'https://leetcode.com/tag/dynamic-programming/'
  if (q.includes('binary search')) return 'https://leetcode.com/tag/binary-search/'
  if (q.includes('hash') || q.includes('map')) return 'https://leetcode.com/tag/hash-table/'
  if (q.includes('stack')) return 'https://leetcode.com/tag/stack/'
  if (q.includes('queue')) return 'https://leetcode.com/tag/queue/'
  if (q.includes('heap') || q.includes('priority')) return 'https://leetcode.com/tag/heap-priority-queue/'
  if (q.includes('linked list') || q.includes('linkedlist')) return 'https://leetcode.com/tag/linked-list/'
  if (q.includes('recursion') || q.includes('backtrack')) return 'https://leetcode.com/tag/backtracking/'
  if (q.includes('sort')) return 'https://leetcode.com/tag/sorting/'
  if (q.includes('greedy')) return 'https://leetcode.com/tag/greedy/'
  if (q.includes('bit')) return 'https://leetcode.com/tag/bit-manipulation/'
  if (q.includes('trie')) return 'https://leetcode.com/tag/trie/'
  if (q.includes('string')) return 'https://leetcode.com/tag/string/'
  if (q.includes('array')) return 'https://leetcode.com/tag/array/'
  if (q.includes('sql') || q.includes('database')) return 'https://leetcode.com/tag/database/'
  if (q.includes('math')) return 'https://leetcode.com/tag/math/'

  return `https://www.google.com/search?q=${encodeURIComponent(`site:leetcode.com/problems ${query}`)}`
}

/**
 * Normalizes GeeksforGeeks links to ensure they open active articles and never 404
 */
export function getGeeksForGeeksUrl(rawUrl: string, topicOrTitle?: string): string {
  // If it's already a working site search, return it
  if (rawUrl && rawUrl.includes('google.com/search') && rawUrl.includes('geeksforgeeks.org')) {
    return rawUrl
  }

  let query = (topicOrTitle || '').trim()

  // If topicOrTitle is missing or generic, extract topic from the URL path slug
  if (rawUrl && (!query || query.toLowerCase() === 'geeksforgeeks' || query.length < 4)) {
    try {
      const parsed = new URL(rawUrl)
      const slug = parsed.pathname.replace(/^\/+|\/+$/g, '').replace(/[-_]+/g, ' ')
      if (slug) query = slug
    } catch {
      query = rawUrl.replace(/^https?:\/\/[^/]+\/?/i, '').replace(/[-_]+/g, ' ')
    }
  }

  // If rawUrl has a specific slug and topic is just the article title without context
  if (rawUrl && rawUrl.includes('geeksforgeeks.org/')) {
    try {
      const parsed = new URL(rawUrl)
      const slug = parsed.pathname.replace(/^\/+|\/+$/g, '').replace(/[-_]+/g, ' ')
      if (slug && slug.length > 5 && !query.includes(slug)) {
        query = `${query} ${slug}`
      }
    } catch {
      // ignore
    }
  }

  const cleanTopic = query
    .replace(/geeksforgeeks/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  return `https://www.google.com/search?q=${encodeURIComponent(`site:geeksforgeeks.org ${cleanTopic || 'computer science tutorial'}`)}`
}
