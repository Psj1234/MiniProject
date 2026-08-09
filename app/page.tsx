'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import StudentDashboard from '@/components/student-dashboard'
import ProfessorDashboard from '@/components/professor-dashboard'
import AppLayout from '@/components/app-layout'
import LandingPage from '@/components/landing-page'

type AuthState = 'login' | 'signup' | 'role-select'
type UserRole = 'student' | 'professor' | null

// ✅ Create Supabase client ONCE, outside the component
const supabase = createClient()

export default function Home() {
  const [authState, setAuthState] = useState<AuthState>('login')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userRole, setUserRole] = useState<UserRole>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showLanding, setShowLanding] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [studentId, setStudentId] = useState('')
  const router = useRouter()

  // Session check on page load
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (session) {
          const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)

          if (profileError) {
            console.error('Profile fetch error:', profileError)
            setError('Could not fetch profile: ' + profileError.message)
            setIsLoading(false)
            return
          }

          const profile = profiles && profiles.length > 0 ? profiles[0] : null

          // Create profile if not exists
          if (!profile) {
            console.log('Profile not found, creating one...')
            const { error: insertError } = await supabase
              .from('profiles')
              .insert({
                id: session.user.id,
                full_name: session.user.user_metadata?.full_name || '',
                updated_at: new Date().toISOString(),
              })

            if (insertError) {
              console.error('Failed to create profile:', insertError)
              setError('Failed to create profile: ' + insertError.message)
              setIsLoading(false)
              return
            }

            setAuthState('role-select')
            setIsAuthenticated(false)
            setShowLanding(false)
            setIsLoading(false)
            return
          }

          if (profile.role) {
            setUserRole(profile.role as UserRole)
            setIsAuthenticated(true)
            setShowLanding(false)
          } else {
            setAuthState('role-select')
            setIsAuthenticated(false)
            setShowLanding(false)
          }
        } else {
          setIsAuthenticated(false)
          setUserRole(null)
          setShowLanding(true)
        }
      } catch (err) {
        console.error('Session check error:', err)
        setError('Error checking session')
      } finally {
        setIsLoading(false)
      }
    }

    checkSession()

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN') checkSession()
        if (event === 'SIGNED_OUT') {
          setIsAuthenticated(false)
          setUserRole(null)
          setAuthState('login')
          setShowLanding(true)
          window.location.href = '/'
        }
      }
    )

    return () => authListener?.subscription.unsubscribe()
  }, [])

  // Handle login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setIsLoading(false)
      return
    }

    if (data.user) {
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)

      if (profileError) {
        console.error('Profile fetch error:', profileError)
        setError('Could not fetch profile: ' + profileError.message)
        setIsLoading(false)
        return
      }

      const profile = profiles && profiles.length > 0 ? profiles[0] : null

      if (!profile) {
        console.log('Profile not found, creating one...')
        const { error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: data.user.id,
            full_name: data.user.user_metadata?.full_name || '',
            updated_at: new Date().toISOString(),
          })

        if (insertError) {
          console.error('Failed to create profile:', insertError)
          setError('Failed to create profile: ' + insertError.message)
          setIsLoading(false)
          return
        }

        setAuthState('role-select')
        setIsAuthenticated(false)
        setIsLoading(false)
        return
      }

      if (profile.role) {
        setUserRole(profile.role as UserRole)
        setIsAuthenticated(true)
        setShowLanding(false)
      } else {
        setAuthState('role-select')
        setIsAuthenticated(false)
      }
    }

    setEmail('')
    setPassword('')
    setIsLoading(false)
  }

  // Handle signup
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    })

    if (error) {
      setError(error.message)
      setIsLoading(false)
      return
    }

    setAuthState('role-select')
    setName('')
    setEmail('')
    setPassword('')
    setIsLoading(false)
  }

  // Handle role selection + student_id update
  const handleRoleSelect = async (role: UserRole) => {
    setError(null)
    setIsLoading(true)

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setError('Error: Could not find user. Please log in again.')
      setAuthState('login')
      setIsLoading(false)
      return
    }

    const updateData: any = { role }
    if (role === 'student') updateData.student_id = studentId

    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', user.id)

    if (error) {
      console.error('Profile update error:', error)
      setError(error.message)
    } else {
      setUserRole(role)
      setIsAuthenticated(true)
      setAuthState('login')
      setShowLanding(false)
    }
    setIsLoading(false)
  }

  const handleLogout = async () => {
    setIsLoading(true)
    await supabase.auth.signOut()
    setIsAuthenticated(false)
    setUserRole(null)
    setAuthState('login')
    setEmail('')
    setPassword('')
    setName('')
    setStudentId('')
    setShowLanding(true)
    setIsLoading(false)
    window.location.href = '/'
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-white text-2xl">Loading...</div>
      </main>
    )
  }

  if (showLanding && !isAuthenticated) {
    return <LandingPage onGetStarted={() => { setShowLanding(false); setAuthState('signup') }} />
  }

  if (authState === 'role-select') {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-slate-800 border-slate-700">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl text-white">Complete Your Profile</CardTitle>
            <CardDescription className="text-slate-400">Enter your details and select your role</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200">Full Name</label>
              <Input
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                required
              />
            </div>

            <Tabs defaultValue="student" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-slate-700">
                <TabsTrigger value="student">Student</TabsTrigger>
                <TabsTrigger value="professor">Professor</TabsTrigger>
              </TabsList>

              <TabsContent value="student" className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200">Student ID</label>
                  <Input
                    type="text"
                    placeholder="e.g., STU12345"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                    required
                  />
                </div>
                <Button
                  onClick={() => handleRoleSelect('student')}
                  className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white text-lg font-semibold"
                  disabled={isLoading}
                >
                  {isLoading ? 'Creating Profile...' : 'Continue as Student'}
                </Button>
              </TabsContent>

              <TabsContent value="professor" className="space-y-4">
                <p className="text-sm text-slate-400">
                  As a professor, you'll be able to create courses, manage assignments, and track student progress.
                </p>
                <Button
                  onClick={() => handleRoleSelect('professor')}
                  className="w-full h-12 bg-purple-600 hover:bg-purple-700 text-white text-lg font-semibold"
                  disabled={isLoading}
                >
                  {isLoading ? 'Creating Profile...' : 'Continue as Professor'}
                </Button>
              </TabsContent>
            </Tabs>

            {error && <p className="text-sm text-red-400 text-center">{error}</p>}
          </CardContent>
        </Card>
      </main>
    )
  }

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-slate-800 border-slate-700">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl text-white">Vidyamitra</CardTitle>
            <CardDescription className="text-slate-400">
              Analytics-driven learning management system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={authState} onValueChange={(val) => setAuthState(val as 'login' | 'signup')}>
              <TabsList className="grid w-full grid-cols-2 bg-slate-700">
                <TabsTrigger value="login">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="space-y-4">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-200">Email</label>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-200">Password</label>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Signing In...' : 'Sign In'}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="space-y-4">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-200">Full Name</label>
                    <Input
                      type="text"
                      placeholder="John Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-200">Email</label>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-200">Password</label>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                      required
                      minLength={6}
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Signing Up...' : 'Sign Up'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
            {error && <p className="text-sm text-red-400 text-center pt-4">{error}</p>}
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <AppLayout userRole={userRole} onLogout={handleLogout}>
      {userRole === 'student' ? <StudentDashboard /> : <ProfessorDashboard />}
    </AppLayout>
  )
}
