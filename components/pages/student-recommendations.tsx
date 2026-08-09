'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, TrendingUp, BookOpen, Users } from 'lucide-react'

const recommendations = [
  {
    id: 1,
    subject: 'Web Development',
    type: 'Advanced',
    title: 'Explore Advanced Frontend Frameworks',
    description: 'You\'re excelling in Web Development. Consider exploring React Advanced Patterns or Next.js to deepen your expertise.',
    action: 'View Advanced Course',
    priority: 'high',
    icon: TrendingUp
  },
  {
    id: 2,
    subject: 'Data Structures & Algorithms',
    type: 'Support',
    title: 'Join Study Group',
    description: 'Your performance is steady. Joining our study group for Data Structures could help you move from moderate to fast learner pace.',
    action: 'Find Study Group',
    priority: 'medium',
    icon: Users
  },
  {
    id: 3,
    subject: 'Database Design',
    type: 'Intensive',
    title: 'Personalized Tutoring Recommended',
    description: 'You\'re progressing slower in Database Design. We recommend 1-on-1 tutoring sessions with Prof. Emma Watson.',
    action: 'Schedule Tutor Session',
    priority: 'high',
    icon: AlertCircle
  },
  {
    id: 4,
    subject: 'General',
    type: 'Resource',
    title: 'Study Materials for Slow-Paced Learning',
    description: 'We\'ve curated additional practice problems and video explanations tailored to your learning pace.',
    action: 'Access Resources',
    priority: 'medium',
    icon: BookOpen
  },
  {
    id: 5,
    subject: 'Web Development',
    type: 'Peer Learning',
    title: 'Become a Peer Tutor',
    description: 'Your excellence in Web Development makes you a great candidate to help other students. Earn extra credit!',
    action: 'Apply as Tutor',
    priority: 'low',
    icon: Users
  },
]

export default function StudentRecommendations() {
  const sortedRecommendations = recommendations.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 }
    return priorityOrder[a.priority as keyof typeof priorityOrder] - priorityOrder[b.priority as keyof typeof priorityOrder]
  })

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">AI-Powered Recommendations</h1>
        <p className="text-slate-400">Personalized suggestions based on your learning pace and performance</p>
      </div>

      <div className="space-y-4">
        {sortedRecommendations.map((rec) => {
          const IconComponent = rec.icon
          const priorityColor = rec.priority === 'high' ? 'border-red-500/30 bg-red-500/5' : rec.priority === 'medium' ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-blue-500/30 bg-blue-500/5'
          const badgeColor = rec.priority === 'high' ? 'bg-red-500/20 text-red-300 border-red-500/30' : rec.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' : 'bg-blue-500/20 text-blue-300 border-blue-500/30'

          return (
            <Card key={rec.id} className={`bg-slate-800 border-slate-700 hover:border-blue-500 transition cursor-pointer ${priorityColor}`}>
              <CardContent className="pt-6">
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center h-12 w-12 rounded-lg bg-slate-700">
                      <IconComponent size={24} className="text-blue-400" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold text-white text-lg">{rec.title}</h3>
                        <p className="text-sm text-slate-400">{rec.subject}</p>
                      </div>
                      <Badge variant="outline" className={badgeColor}>{rec.type}</Badge>
                    </div>
                    <p className="text-slate-300 text-sm mb-4">{rec.description}</p>
                    <button className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition">
                      {rec.action}
                    </button>
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
