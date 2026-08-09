'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Menu, X } from 'lucide-react'
import StudentDashboard from './pages/student-dashboard'
import StudentCourses from './pages/student-courses'
import StudentPerformance from './pages/student-performance'
import StudentRecommendations from './pages/student-recommendations'
import StudentQuizzes from './pages/student-quizzes'
import StudentTakeQuiz from './pages/student-take-quiz'
import StudentResources from './pages/student-resources'
import StudentAICard from './pages/student-ai-card' // ✅ ADDED
import ProfessorDashboard from './pages/professor-dashboard'
import ProfessorClasses from './pages/professor-classes'
import ProfessorClassDetail from './pages/professor-class-detail'
import ProfessorQuizzes from './pages/professor-quizzes'
import ProfessorCreateQuiz from './pages/professor-create-quiz'
import ProfessorResources from './pages/professor-resources'

interface AppLayoutProps {
  userRole: 'student' | 'professor' | null
  onLogout: () => void
  children?: React.ReactNode
}

type StudentPage = 'dashboard' | 'courses' | 'performance' | 'recommendations' | 'quizzes' | 'take-quiz' | 'resources' | 'ai-card' // ✅ ADDED
type ProfessorPage = 'dashboard' | 'classes' | 'class-detail' | 'quizzes' | 'create-quiz' | 'resources'

export default function AppLayout({ userRole, onLogout }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [studentPage, setStudentPage] = useState<StudentPage>('dashboard')
  const [professorPage, setProfessorPage] = useState<ProfessorPage>('dashboard')
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null)
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null)

  const handleStudentNavigation = (page: StudentPage) => {
    setStudentPage(page)
  }

  const handleProfessorNavigation = (page: ProfessorPage, classId?: string, quizId?: string) => {
    setProfessorPage(page)
    if (classId) setSelectedClassId(classId)
    if (quizId) setSelectedQuizId(quizId)
  }

  const studentMenuItems = [
    { label: 'Dashboard', key: 'dashboard', icon: '📊' },
    { label: 'AI Card', key: 'ai-card', icon: '🤖' }, // ✅ ADDED
    { label: 'Courses', key: 'courses', icon: '📚' },
    { label: 'Performance', key: 'performance', icon: '📈' },
    { label: 'Quizzes', key: 'quizzes', icon: '✏' },
    { label: 'Resources', key: 'resources', icon: '📁' },
    { label: 'Recommendations', key: 'recommendations', icon: '💡' },
  ]

  const professorMenuItems = [
    { label: 'Analytics', key: 'dashboard', icon: '📊' },
    { label: 'Classes', key: 'classes', icon: '👥' },
    { label: 'Quizzes', key: 'quizzes', icon: '✏' },
    { label: 'Resources', key: 'resources', icon: '📁' },
  ]

  const currentMenuItems = userRole === 'student' ? studentMenuItems : professorMenuItems
  const menuKey = userRole === 'student' ? studentPage : professorPage

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800/50 backdrop-blur sticky top-0 z-40">
        <div className="px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              variant="ghost"
              size="icon"
              className="text-slate-300 hover:bg-slate-700"
            >
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white">Vidyamitra</h1>
              <p className="text-xs text-slate-400">
                {userRole === 'professor' ? 'Professor Dashboard' : 'Student Dashboard'}
              </p>
            </div>
          </div>
          <Button
            onClick={onLogout}
            variant="outline"
            className="border-slate-600 text-slate-200 hover:bg-slate-700"
          >
            Sign Out
          </Button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        {sidebarOpen && (
          <aside className="w-64 border-r border-slate-700 bg-slate-800/30 backdrop-blur p-6 min-h-screen">
            <nav className="space-y-2">
              {currentMenuItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => {
                    if (userRole === 'student') {
                      handleStudentNavigation(item.key as StudentPage)
                    } else {
                      handleProfessorNavigation(item.key as ProfessorPage)
                    }
                  }}
                  className={`w-full text-left px-4 py-3 rounded-lg transition font-medium text-sm ${
                    menuKey === item.key
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <span className="mr-2">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </nav>
          </aside>
        )}

        {/* Main Content */}
        <main className="flex-1">
          {userRole === 'student' ? (
            <>
              {studentPage === 'dashboard' && <StudentDashboard />}
              {studentPage === 'ai-card' && <StudentAICard />} {/* ✅ ADDED */}
              {studentPage === 'courses' && <StudentCourses />}
              {studentPage === 'performance' && <StudentPerformance />}
              {studentPage === 'quizzes' && (
                <StudentQuizzes onSelectQuiz={(quizId) => {
                  setSelectedQuizId(quizId)
                  handleStudentNavigation('take-quiz')
                }} />
              )}
              {studentPage === 'take-quiz' && selectedQuizId && (
                <StudentTakeQuiz quizId={selectedQuizId} onBack={() => handleStudentNavigation('quizzes')} />
              )}
              {studentPage === 'resources' && <StudentResources />}
              {studentPage === 'recommendations' && <StudentRecommendations />}
            </>
          ) : (
            <>
              {professorPage === 'dashboard' && <ProfessorDashboard />}
              {professorPage === 'classes' && (
                <ProfessorClasses onSelectClass={(classId) => handleProfessorNavigation('class-detail', classId)} />
              )}
              {professorPage === 'class-detail' && selectedClassId && (
                <ProfessorClassDetail classId={selectedClassId} onBack={() => handleProfessorNavigation('classes')} />
              )}
              {professorPage === 'quizzes' && (
                <ProfessorQuizzes onCreateQuiz={() => handleProfessorNavigation('create-quiz')} />
              )}
              {professorPage === 'create-quiz' && (
                <ProfessorCreateQuiz onBack={() => handleProfessorNavigation('quizzes')} />
              )}
              {professorPage === 'resources' && <ProfessorResources />}
            </>
          )}
        </main>
      </div>
    </div>
  )
}