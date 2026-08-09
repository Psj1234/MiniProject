'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, X } from 'lucide-react'
// NEW: Import Tabs components
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'

// --- Define Data Types ---
interface StudentData {
  id: string; name: string; pace: string; score: number; assignments: string; assignmentsDone: number; status: string;
}
type SortKey = keyof StudentData
interface StatsData {
  totalStudents: number; avgScore: number; atRisk: number;
}
// For Tab 1: Topic Overview
interface TopicAnalyticsData {
  topic_name: string; topic_avg_accuracy: number; topic_avg_time: number;
  weakest_student_name: string; weakest_student_score: number;
  strongest_student_name: string; strongest_student_score: number;
}
// For Tab 2: Student Details
interface StudentTopicDetail {
  student_id: number; student_name: string; topic_name: string;
  correct_answers: number; total_questions: number; avg_time_taken: number;
}

const supabase = createClient()

interface ProfessorClassDetailProps {
  classId: string
  onBack: () => void
}

const formatPace = (pace: string) => {
  if (pace === 'fast') return 'Fast Learner'
  if (pace === 'slow') return 'Slow Learner'
  return 'Moderate Learner'
}

export default function ProfessorClassDetail({ classId, onBack }: ProfessorClassDetailProps) {
  // State for page data
  const [courseName, setCourseName] = useState('')
  const [professorName, setProfessorName] = useState('')
  const [stats, setStats] = useState<StatsData>({ totalStudents: 0, avgScore: 0, atRisk: 0 })
  const [students, setStudents] = useState<StudentData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });

  // State for analytics and reports
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false)
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false)
  const [isReportLoading, setIsReportLoading] = useState(false)
  
  // NEW: Separate state for each analytics view
  const [topicAnalyticsData, setTopicAnalyticsData] = useState<TopicAnalyticsData[] | null>(null)
  const [studentTopicDetailsData, setStudentTopicDetailsData] = useState<StudentTopicDetail[] | null>(null)

  // --- Main Data Fetching (useEffect) ---
  useEffect(() => {
    if (!classId) return
    const fetchData = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error("Not authenticated")
        const { data: courseData, error: courseError } = await supabase.from('courses').select('name, course_teachers(profiles(full_name))').eq('id', classId).eq('course_teachers.teacher_id', user.id).single()
        if (courseError) throw courseError
        if (!courseData) throw new Error("Course not found or you don't teach it.")
        setCourseName(courseData.name)
        // @ts-ignore
        setProfessorName(courseData.course_teachers[0]?.profiles?.full_name || 'Professor')
        const { data: enrolledStudents, error: studentsError } = await supabase.from('enrollments').select('student_id, learner_tag, profiles(full_name)').eq('course_id', classId)
        if (studentsError) throw studentsError
        if (!enrolledStudents) throw new Error("No students found for this course.")
        const { count: totalQuizzes, error: quizCountError } = await supabase.from('quizzes').select('*', { count: 'exact', head: true }).eq('course_id', classId)
        if (quizCountError) throw quizCountError
        const studentIds = enrolledStudents.map(s => s.student_id)
        const { data: marksData, error: marksError } = await supabase.from('marks').select('student_uid, percentage').eq('course_id', classId).in('student_uid', studentIds)
        if (marksError) throw marksError
        const { data: attemptsData, error: attemptsError } = await supabase.from('quiz_attempts').select('student_id, id, quizzes!inner(course_id)').in('student_id', studentIds).eq('quizzes.course_id', classId)
        if (attemptsError) throw attemptsError
        let totalScore = 0
        let atRiskCount = 0
        const processedStudents: StudentData[] = enrolledStudents.map(student => {
          const studentMarks = marksData?.filter(m => m.student_uid === student.student_id) || []
          const avgScore = studentMarks.length > 0 ? Math.round(studentMarks.reduce((acc, m) => acc + (m.percentage || 0), 0) / studentMarks.length) : 0
          totalScore += avgScore
          const studentAttempts = attemptsData?.filter(a => a.student_id === student.student_id) || []
          const assignments = `${studentAttempts.length}/${totalQuizzes || 0}`
          // @ts-ignore
          const pace = student.learner_tag || 'moderate'
          let status = 'Progressing'
          if (pace === 'fast') status = 'On Track'
          if (pace === 'slow') { status = 'At Risk'; atRiskCount++ }
          return {
            // @ts-ignore
            id: student.student_id.toString(),
            // @ts-ignore
            name: student.profiles?.full_name || 'Unknown Student',
            pace: pace, score: avgScore, assignments: assignments, assignmentsDone: studentAttempts.length, status: status,
          }
        })
        setStats({ totalStudents: enrolledStudents.length, avgScore: enrolledStudents.length > 0 ? Math.round(totalScore / enrolledStudents.length) : 0, atRisk: atRiskCount, })
        setStudents(processedStudents)
      } catch (err: any) { console.error("Error fetching class details:", err); setError(err.message) } finally { setIsLoading(false) }
    }
    fetchData()
  }, [classId])

  // --- Sorting Logic (useMemo) ---
  const sortedStudents = useMemo(() => {
    const sorted = [...students];
    sorted.sort((a, b) => {
      const aVal = a[sortConfig.key]; const bVal = b[sortConfig.key];
      let compare = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') { compare = aVal - bVal; } else { compare = String(aVal).localeCompare(String(bVal), undefined, { numeric: (sortConfig.key === 'id') }); }
      return sortConfig.direction === 'asc' ? compare : -compare;
    });
    return sorted;
  }, [students, sortConfig]);

  // --- Sorting Click Handlers ---
  const handleSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') { direction = 'desc'; }
    setSortConfig({ key, direction });
  };
  const getSortIndicator = (key: SortKey) => {
    if (sortConfig.key !== key) return null;
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
  };

  
  // --- Report/CSV Functions ---
  const downloadCSV = (content: string, fileName: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.href) { URL.revokeObjectURL(link.href); }
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Button 1: Export Main Student Table
  const handleExportCSV = () => {
    const headers = ['UID', 'Name', 'Learning Pace', 'Avg. Score', 'Quizzes Done', 'Status'];
    const rows = sortedStudents.map(s => [s.id, `"${s.name.replace(/"/g, '""')}"`, formatPace(s.pace), s.score, s.assignments, s.status].join(','));
    const csvContent = [headers.join(','), ...rows].join('\n');
    downloadCSV(csvContent, `${courseName.replace(/ /g, '_')}_students.csv`);
  }

  // Button 2: Download Topic Report
  const handleDownloadReport = async () => {
    setIsReportLoading(true);
    let dataToExport = topicAnalyticsData;
    if (!dataToExport) {
      // Fetch only the topic data if it's missing
      const { data } = await supabase.rpc('get_topic_level_analytics', { course_id_in: classId });
      dataToExport = data;
      setTopicAnalyticsData(data || []); // Save it
    }
    if (dataToExport && dataToExport.length > 0) {
      const headers = ['Topic', 'Avg. Accuracy (%)', 'Avg. Time (s)', 'Strongest Student', 'Score', 'Weakest Student', 'Score'];
      const rows = dataToExport.map(s => [`"${s.topic_name.replace(/"/g, '""')}"`, s.topic_avg_accuracy, s.topic_avg_time, `"${s.strongest_student_name.replace(/"/g, '""')}"`, s.strongest_student_score, `"${s.weakest_student_name.replace(/"/g, '""')}"`, s.weakest_student_score].join(','));
      const csvContent = [headers.join(','), ...rows].join('\n');
      downloadCSV(csvContent, `${courseName.replace(/ /g, '_')}_topic_report.csv`);
    } else { setError("No analytics data to download."); }
    setIsReportLoading(false);
  }

  // Button 3: Generate Analytics (Modal)
  const handleGenerateAnalytics = async () => {
    setShowAnalyticsModal(true);
    // Only fetch if we don't have the data already
    if (!topicAnalyticsData && !studentTopicDetailsData) {
      setIsAnalyticsLoading(true);
      setError(null);
      
      // NEW: Fetch both sets of data in parallel
      const [topicRes, studentRes] = await Promise.all([
        supabase.rpc('get_topic_level_analytics', { course_id_in: classId }),
        supabase.rpc('get_student_topic_details', { course_id_in: classId })
      ]);

      if (topicRes.error) {
        console.error("Topic analytics error:", topicRes.error)
        setError(topicRes.error.message);
      } else {
        setTopicAnalyticsData(topicRes.data || []);
      }

      if (studentRes.error) {
        console.error("Student details error:", studentRes.error)
        setError(studentRes.error.message);
      } else {
        setStudentTopicDetailsData(studentRes.data || []);
      }
      
      setIsAnalyticsLoading(false);
    }
  }


  // --- LOADING AND ERROR STATES ---
  if (isLoading) {
    return <div className="max-w-7xl mx-auto p-6 text-center"><p className="text-white text-lg">Loading class details...</p></div>
  }
  if (error) {
    return <div className="max-w-7xl mx-auto p-6 text-center"><p className="text-red-400">Error: {error}</p><Button onClick={onBack} variant="ghost" className="text-slate-300 mt-4"><ArrowLeft size={20} className="mr-2" /> Go Back</Button></div>
  }

  // --- JSX RENDER ---
  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* --- Header & Stats --- */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <Button onClick={onBack} variant="ghost" size="icon" className="text-slate-300 hover:bg-slate-700">
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-white">{courseName}</h1>
            <p className="text-slate-400">Student tracking and performance details</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg text-slate-200">Welcome, <strong>{professorName}</strong></p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-slate-300">Total Students</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-white">{stats.totalStudents}</p></CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-slate-300">Class Average</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-white">{stats.avgScore}%</p></CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-slate-300">Students At Risk</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-amber-400">{stats.atRisk}</p></CardContent>
        </Card>
      </div>

      {/* --- Student List Table --- */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Student Performance Tracking</CardTitle>
          <CardDescription className="text-slate-400">Individual student details and learning pace classification</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 font-semibold text-slate-300 cursor-pointer hover:text-white" onClick={() => handleSort('id')}>
                    UID{getSortIndicator('id')}
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-300 cursor-pointer hover:text-white" onClick={() => handleSort('name')}>
                    Name{getSortIndicator('name')}
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-300 cursor-pointer hover:text-white" onClick={() => handleSort('pace')}>
                    Learning Pace{getSortIndicator('pace')}
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-300 cursor-pointer hover:text-white" onClick={() => handleSort('score')}>
                    Avg. Score{getSortIndicator('score')}
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-300 cursor-pointer hover:text-white" onClick={() => handleSort('assignmentsDone')}>
                    Quizzes Done{getSortIndicator('assignmentsDone')}
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-300 cursor-pointer hover:text-white" onClick={() => handleSort('status')}>
                    Status{getSortIndicator('status')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedStudents.map((student) => (
                  <tr key={student.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition">
                    <td className="py-3 px-4 text-slate-400 font-mono">{student.id}</td>
                    <td className="py-3 px-4 text-white">{student.name}</td>
                    <td className="py-3 px-4">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        student.pace === 'fast' ? 'bg-blue-500/20 text-blue-300' :
                        student.pace === 'moderate' ? 'bg-green-500/20 text-green-300' :
                        'bg-amber-500/20 text-amber-300'
                      }`}>
                        {formatPace(student.pace)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-white font-medium">{student.score}%</td>
                    <td className="py-3 px-4 text-slate-400">{student.assignments}</td>
                    <td className="py-3 px-4">
                      <span className={`text-xs font-medium px-2 py-1 rounded ${
                        student.status === 'On Track' ? 'bg-green-500/20 text-green-300' :
                        student.status === 'Progressing' ? 'bg-blue-500/20 text-blue-300' :
                        'bg-red-500/20 text-red-300'
                      }`}>
                        {student.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* --- Reports Section (FUNCTIONAL) --- */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Class Reports</CardTitle>
          <CardDescription className="text-slate-400">Generate and download reports for this class</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button 
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleExportCSV}
          >
            Export Student Data (CSV)
          </Button>
          
          <Button 
            variant="outline" 
            className="w-full border-slate-600 text-slate-200 hover:bg-slate-700"
            onClick={handleDownloadReport}
            disabled={isReportLoading}
          >
            {isReportLoading ? 'Generating...' : 'Download Topic Report (CSV)'}
          </Button>

          <Button 
            variant="outline" 
            className="w-full border-slate-600 text-slate-200 hover:bg-slate-700"
            onClick={handleGenerateAnalytics}
          >
            Generate Topic Analytics
          </Button>
        </CardContent>
      </Card>

      {/* --- Analytics Modal (WIDER + TABS) --- */}
      {showAnalyticsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          {/* ✅ WIDER MODAL */}
          <Card className="w-full max-w-7xl h-[90vh] bg-slate-800 border-slate-700 flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-white">Detailed Class Analytics</CardTitle>
                <CardDescription className="text-slate-400">Topic-by-topic and student-by-student breakdown.</CardDescription>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-slate-400 hover:bg-slate-700"
                onClick={() => setShowAnalyticsModal(false)}
              >
                <X size={20} />
              </Button>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto">
              {isAnalyticsLoading ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-white text-lg">Loading analytics...</p>
                </div>
              ) : (
                // ✅ ADDED TABS
                <Tabs defaultValue="overview" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 bg-slate-700">
                    <TabsTrigger value="overview">Topic Overview</TabsTrigger>
                    <TabsTrigger value="details">Student Details</TabsTrigger>
                  </TabsList>
                  
                  {/* --- TAB 1: Topic Overview (Graph + Table) --- */}
                  <TabsContent value="overview" className="mt-4">
                    <div className="space-y-8">
                      {/* --- BAR CHART --- */}
                      <div>
                        <h3 className="text-lg font-semibold text-white mb-4">Topic Average Accuracy (%)</h3>
                        <div className="h-[300px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart 
                              data={topicAnalyticsData || []} // Fix for null data
                              margin={{ top: 5, right: 20, left: -20, bottom: 60 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                              <XAxis 
                                dataKey="topic_name" 
                                stroke="#9ca3af"
                                angle={-30} textAnchor="end" interval={0} fontSize={12}
                              />
                              <YAxis 
                                stroke="#9ca3af" domain={[0, 100]}
                                tickFormatter={(tick) => `${tick}%`}
                              />
                              <Tooltip 
                                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                                labelStyle={{ color: '#f9fafb' }}
                              />
                              <Bar dataKey="topic_avg_accuracy" name="Avg. Accuracy">
                                {topicAnalyticsData?.map((entry, index) => (
                                  <Cell 
                                    key={`cell-${index}`} 
                                    fill={entry.topic_avg_accuracy < 60 ? '#f87171' : '#34d399'} // Red/Green
                                  />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* --- TOPIC ANALYTICS TABLE --- */}
                      <div>
                        <h3 className="text-lg font-semibold text-white mb-4">Detailed Breakdown</h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-slate-600">
                                <th className="text-left py-3 px-4 font-semibold text-slate-300">Topic</th>
                                <th className="text-left py-3 px-4 font-semibold text-slate-300">Avg. Accuracy</th>
                                <th className="text-left py-3 px-4 font-semibold text-slate-300">Avg. Time</th>
                                <th className="text-left py-3 px-4 font-semibold text-slate-300">Strongest Student</th>
                                <th className="text-left py-3 px-4 font-semibold text-slate-300">Weakest Student</th>
                              </tr>
                            </thead>
                            <tbody>
                              {topicAnalyticsData?.map((row) => {
                                const isStruggling = row.topic_avg_accuracy < 60;
                                const isSlow = row.topic_avg_time > 90;
                                return (
                                  <tr key={row.topic_name} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                                    <td className="py-3 px-4 text-white font-medium">{row.topic_name}</td>
                                    <td className="py-3 px-4"><span className={isStruggling ? 'text-red-400' : 'text-green-400'}>{row.topic_avg_accuracy}%</span></td>
                                    <td className="py-3 px-4"><span className={isSlow ? 'text-amber-400' : 'text-slate-300'}>{row.topic_avg_time}s</span></td>
                                    <td className="py-3 px-4"><span className="text-green-400">{row.strongest_student_name}</span><span className="text-slate-400 ml-2">({row.strongest_student_score}%)</span></td>
                                    <td className="py-3 px-4"><span className="text-red-400">{row.weakest_student_name}</span><span className="text-slate-400 ml-2">({row.weakest_student_score}%)</span></td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                  
                  {/* --- TAB 2: Student Details --- */}
                  <TabsContent value="details" className="mt-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-600">
                            <th className="text-left py-3 px-4 font-semibold text-slate-300">Student</th>
                            <th className="text-left py-3 px-4 font-semibold text-slate-300">Topic</th>
                            <th className="text-left py-3 px-4 font-semibold text-slate-300">Accuracy</th>
                            <th className="text-left py-3 px-4 font-semibold text-slate-300">Avg. Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {studentTopicDetailsData?.map((row, index) => {
                            const accuracy = row.total_questions > 0 ? Math.round((row.correct_answers / row.total_questions) * 100) : 0;
                            const isStruggling = accuracy < 60;
                            const isSlow = row.avg_time_taken > 90; // Example: 90 seconds
                            return (
                              <tr key={`${row.student_id}-${row.topic_name}`} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                                <td className="py-3 px-4 text-white font-medium">{row.student_name}</td>
                                <td className="py-3 px-4 text-slate-300">{row.topic_name}</td>
                                <td className="py-3 px-4">
                                  <span className={isStruggling ? 'text-red-400' : 'text-green-400'}>
                                    {accuracy}%
                                  </span>
                                  <span className="text-slate-400 ml-2">({row.correct_answers}/{row.total_questions})</span>
                                </td>
                                <td className="py-3 px-4">
                                  <span className={isSlow ? 'text-amber-400' : 'text-slate-300'}>
                                    {row.avg_time_taken}s
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}