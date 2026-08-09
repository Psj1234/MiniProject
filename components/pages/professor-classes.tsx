'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronRight, Upload, Plus, Trash2 } from 'lucide-react' // Added Plus & Trash2
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// ... (Interface definitions are the same) ...
interface ProfessorCourseStats {
  course_id: string; course_name: string; student_count: number; avg_score: number;
  fast_learners: number; slow_learners: number; moderate_learners: number;
}
interface ProfessorClassesProps {
  onSelectClass: (classId: string) => void
}

const supabase = createClient()

export default function ProfessorClasses({ onSelectClass }: ProfessorClassesProps) {
  const [classes, setClasses] = useState<ProfessorCourseStats[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // State for Upload Modal
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null)
  const [uploadMessage, setUploadMessage] = useState('')
  const [isUploading, setIsUploading] = useState(false)

  // State for Create Course Modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createStep, setCreateStep] = useState<'create' | 'enroll'>('create')
  const [newCourseName, setNewCourseName] = useState('')
  const [newCourseCode, setNewCourseCode] = useState('')
  const [newlyCreatedCourse, setNewlyCreatedCourse] = useState<{id: string, name: string} | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // --- NEW: State for Delete Course Modal ---
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [courseToDelete, setCourseToDelete] = useState<ProfessorCourseStats | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Fetches the list of courses
  const fetchCourses = async () => {
    setIsLoading(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError("Not authenticated. Please log in.")
      setIsLoading(false)
      return
    }
    const { data, error: rpcError } = await supabase.rpc(
      'get_professor_courses_with_stats', 
      { professor_id_in: user.id }
    )
    if (rpcError) {
      console.error(rpcError)
      setError(`Failed to fetch classes: ${rpcError.message}`)
    } else {
      setClasses(data)
    }
    setIsLoading(false)
  }
  
  useEffect(() => {
    fetchCourses()
  }, [])

  // Handles bulk student CSV upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, classId: string) => {
    // ... (This function is unchanged) ...
    const file = e.target.files?.[0]; if (!file || !classId) return;
    setIsUploading(true); setUploadMessage('Processing file...');
    try {
      const text = await file.text(); const lines = text.split('\n').filter(line => line.trim() !== '');
      if (lines.length <= 1) { setUploadMessage('Error: File is empty or has no student data.'); setIsUploading(false); return }
      const header = lines[0].split(',').map(h => h.trim().toLowerCase()); const uidIndex = header.indexOf('student_id');
      if (uidIndex === -1) { setUploadMessage("Error: CSV must have a 'student_id' column."); setIsUploading(false); return }
      const studentRecordsToInsert = lines.slice(1).map(line => {
        const values = line.split(','); const uid = values[uidIndex].trim();
        if (!uid || isNaN(Number(uid))) { return null }
        return { course_id: classId, student_id: Number(uid) }
      }).filter(r => r !== null);
      if (studentRecordsToInsert.length === 0) { setUploadMessage("Error: No valid student IDs found in the file."); setIsUploading(false); return }
      // ✅ THIS IS THE FIX
const { error: insertError } = await supabase.from('enrollments').upsert(
  studentRecordsToInsert,
  {
    onConflict: 'student_id, course_id', // Specify the columns that create the conflict
    ignoreDuplicates: true              // This achieves "DO NOTHING"
  }
);
      if (insertError) { setUploadMessage(`Error: ${insertError.message}`) } else { setUploadMessage(`Successfully enrolled ${studentRecordsToInsert.length} students!`) }
    } catch (err: any) { setUploadMessage(`Error processing file: ${err.message}`) }
    setIsUploading(false);
    setTimeout(() => { setShowUploadModal(false); setUploadMessage('') }, 3000);
  }

  // Handles creating a new course
  const handleCreateCourse = async (e: React.FormEvent) => {
    // ... (This function is unchanged) ...
    e.preventDefault(); setIsCreating(true); setCreateError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setCreateError("You must be logged in to create a course."); setIsCreating(false); return }
    const { data: newCourse, error: courseError } = await supabase.from('courses').insert({ name: newCourseName, code: newCourseCode }).select('id, name').single();
    if (courseError) { setCreateError(`Failed to create course: ${courseError.message}`); setIsCreating(false); return }
    const { error: teacherError } = await supabase.from('course_teachers').insert({ course_id: newCourse.id, teacher_id: user.id });
    if (teacherError) { setCreateError(`Failed to assign teacher: ${teacherError.message}`); setIsCreating(false); return }
    setNewlyCreatedCourse(newCourse); setCreateStep('enroll'); setIsCreating(false);
  }

  // Handles enrolling a division into the new course
  const handleEnrollDivision = async (division: 'A' | 'B' | 'Both') => {
    // ... (This function is unchanged) ...
    if (!newlyCreatedCourse) return; setIsCreating(true); setCreateError(null);
    try {
      if (division === 'A' || division === 'Both') {
        const { error: rpcError } = await supabase.rpc('enroll_division_in_course', { p_course_id: newlyCreatedCourse.id, p_division_id: 'A' });
        if (rpcError) throw rpcError;
      }
      if (division === 'B' || division === 'Both') {
         const { error: rpcError } = await supabase.rpc('enroll_division_in_course', { p_course_id: newlyCreatedCourse.id, p_division_id: 'B' });
        if (rpcError) throw rpcError;
      }
      closeCreateModal(); await fetchCourses();
    } catch (err: any) { setCreateError(`Failed to enroll students: ${err.message}`) } finally { setIsCreating(false) }
  }

  // Closes and resets the create modal
  const closeCreateModal = () => {
    // ... (This function is unchanged) ...
    setShowCreateModal(false); setCreateStep('create'); setNewCourseName(''); setNewCourseCode('');
    setNewlyCreatedCourse(null); setCreateError(null); setIsCreating(false);
  }

  // --- NEW: Handle Deleting the Course ---
  const handleDeleteCourse = async () => {
    if (!courseToDelete) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      // Call the new SQL function
      const { error: rpcError } = await supabase.rpc('delete_course_as_teacher', {
        course_id_in: courseToDelete.course_id
      });

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      // Success: Remove the course from the state to update UI
      setClasses(prevClasses => 
        prevClasses.filter(c => c.course_id !== courseToDelete.course_id)
      );
      closeDeleteModal();

    } catch (err: any) {
      setDeleteError(`Failed to delete course: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  }

  // --- NEW: Helper to reset and close delete modal ---
  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setCourseToDelete(null);
    setDeleteError(null);
    setIsDeleting(false);
  }

  if (isLoading) {
    return <div className="max-w-7xl mx-auto p-6 text-center"><p className="text-white text-lg">Loading your classes...</p></div>
  }

  if (error) {
    return <div className="max-w-7xl mx-auto p-6 text-center"><p className="text-red-400">Error: {error}</p></div>
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Your Classes</h1>
          <p className="text-slate-400">Click on a class to view student tracking and detailed reports</p>
        </div>
        <Button 
          className="bg-blue-600 hover:bg-blue-700 text-white"
          onClick={() => setShowCreateModal(true)}
        >
          <Plus size={16} className="mr-2" />
          Create New Course
        </Button>
      </div>

      {/* --- Course List --- */}
      <div className="space-y-4">
        {classes.map((course) => (
          <div key={course.course_id} className="space-y-2">
            <Card 
              className="bg-slate-800 border-slate-700 hover:border-blue-500 transition cursor-pointer"
              onClick={() => onSelectClass(course.course_id)}
            >
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-white text-lg mb-2">{course.course_name}</h3>
                    <p className="text-sm text-slate-400 mb-4">{course.student_count} students enrolled</p>
                    <div className="grid grid-cols-4 gap-4">
                      {/* ... (stats boxes are unchanged) ... */}
                      <div className="p-3 bg-slate-700/50 rounded-lg border border-slate-600"><p className="text-xs text-slate-400">Class Average</p><p className="text-lg font-semibold text-blue-400">{course.avg_score}%</p></div>
                      <div className="p-3 bg-slate-700/50 rounded-lg border border-slate-600"><p className="text-xs text-slate-400">Fast Learners</p><p className="text-lg font-semibold text-blue-400">{course.fast_learners}</p></div>
                      <div className="p-3 bg-slate-700/50 rounded-lg border border-slate-600"><p className="text-xs text-slate-400">Moderate</p><p className="text-lg font-semibold text-green-400">{course.moderate_learners}</p></div>
                      <div className="p-3 bg-slate-700/50 rounded-lg border border-slate-600"><p className="text-xs text-slate-400">Need Support</p><p className="text-lg font-semibold text-amber-400">{course.slow_learners}</p></div>
                    </div>
                  </div>
                  <ChevronRight className="text-slate-400 flex-shrink-0 mt-2" size={24} />
                </div>
              </CardContent>
            </Card>

            {/* --- NEW: Button Group --- */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => {
                  setSelectedClassId(course.course_id)
                  setShowUploadModal(true)
                }}
                variant="outline"
                className="w-full border-slate-600 text-slate-200 hover:bg-slate-700"
              >
                <Upload size={16} className="mr-2" />
                Bulk Add Students (CSV)
              </Button>
              <Button
                onClick={() => {
                  setCourseToDelete(course)
                  setShowDeleteModal(true)
                }}
                variant="destructive"
                className="w-full bg-red-900/40 text-red-400 border border-red-900/50 hover:bg-red-900/60"
              >
                <Trash2 size={16} className="mr-2" />
                Delete Course
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* --- Upload Modal (Unchanged) --- */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md bg-slate-800 border-slate-700">
            {/* ... (content is unchanged) ... */}
            <CardContent className="pt-6 space-y-4">
              <h3 className="text-xl font-semibold text-white">Upload Student List</h3>
              <p className="text-sm text-slate-400">Upload a CSV file with student IDs. Must match `student_id` in the `profiles` table.</p>
              {uploadMessage && (<div className={`p-3 border rounded text-sm ${uploadMessage.startsWith('Error') ? 'bg-red-500/20 border-red-500/30 text-red-300' : 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'}`}>{uploadMessage}</div>)}
              <div className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center">
                <input type="file" accept=".csv" onChange={(e) => handleFileUpload(e, selectedClassId!)} className="hidden" id="csv-upload" disabled={isUploading} />
                <label htmlFor="csv-upload" className={`cursor-pointer ${isUploading ? 'opacity-50' : ''}`}>
                  <Upload className="mx-auto mb-2 text-slate-400" size={32} />
                  <p className="text-slate-300 font-medium">Click to upload CSV</p>
                  <p className="text-xs text-slate-500 mt-1">or drag and drop</p>
                </label>
              </div>
              <div className="text-sm text-slate-400 bg-slate-700/30 p-3 rounded">
                <p className="font-semibold text-slate-300 mb-2">Sample CSV format:</p>
                <pre className="text-xs">student_id{'\n'}2023300001{'\n'}2023300002</pre>
              </div>
              <div className="flex gap-3">
                <Button onClick={() => setShowUploadModal(false)} variant="outline" className="flex-1 border-slate-600 text-slate-200 hover:bg-slate-700" disabled={isUploading}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* --- Create Course Modal (Unchanged) --- */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md bg-slate-800 border-slate-700">
            {/* ... (content is unchanged) ... */}
            {createStep === 'create' && (
              <form onSubmit={handleCreateCourse}>
                <CardHeader><CardTitle className="text-white">Create New Course</CardTitle><CardDescription className="text-slate-400">Enter the details for your new course.</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2"><label className="text-sm font-medium text-slate-200">Course Name</label><Input type="text" placeholder="e.g., Advanced Databases" value={newCourseName} onChange={(e) => setNewCourseName(e.target.value)} className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500" required /></div>
                  <div className="space-y-2"><label className="text-sm font-medium text-slate-200">Course Code</label><Input type="text" placeholder="e.g., CS404" value={newCourseCode} onChange={(e) => setNewCourseCode(e.target.value)} className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500" required /></div>
                  {createError && (<p className="text-sm text-red-400 text-center">{createError}</p>)}
                  <div className="flex gap-3 pt-2">
                    <Button type="button" onClick={closeCreateModal} variant="outline" className="flex-1 border-slate-600 text-slate-200 hover:bg-slate-700" disabled={isCreating}>Cancel</Button>
                    <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" disabled={isCreating}>{isCreating ? 'Creating...' : 'Create and Continue'}</Button>
                  </div>
                </CardContent>
              </form>
            )}
            {createStep === 'enroll' && (
              <>
                <CardHeader><CardTitle className="text-white">Enroll Students</CardTitle><CardDescription className="text-slate-400">Course "{newlyCreatedCourse?.name}" created. Now, enroll students from a division.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-slate-300">Choose which division(s) to enroll:</p>
                  <Button onClick={() => handleEnrollDivision('A')} className="w-full bg-slate-600 hover:bg-slate-700 text-white" disabled={isCreating}>{isCreating ? 'Enrolling...' : 'Enroll Division A (Students 1-70)'}</Button>
                  <Button onClick={() => handleEnrollDivision('B')} className="w-full bg-slate-600 hover:bg-slate-700 text-white" disabled={isCreating}>{isCreating ? 'Enrolling...' : 'Enroll Division B (Students 71-150)'}</Button>
                  <Button onClick={() => handleEnrollDivision('Both')} className="w-full bg-blue-600 hover:bg-blue-700 text-white" disabled={isCreating}>{isCreating ? 'Enrolling...' : 'Enroll Both Divisions'}</Button>
                  {createError && (<p className="text-sm text-red-400 text-center pt-2">{createError}</p>)}
                  <Button type="button" onClick={closeCreateModal} variant="link" className="w-full text-slate-400" disabled={isCreating}>Skip for now</Button>
                </CardContent>
              </>
            )}
          </Card>
        </div>
      )}

      {/* --- NEW: Delete Confirmation Modal --- */}
      {showDeleteModal && courseToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-red-400">Delete Course</CardTitle>
              <CardDescription className="text-slate-400">
                Are you sure you want to delete this course?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-slate-300">
                You are about to permanently delete: <br />
                <strong className="text-white font-medium">{courseToDelete.course_name} ({courseToDelete.course_id})</strong>
              </p>
              <p className="text-amber-400 text-sm bg-amber-500/10 p-3 rounded-md border border-amber-500/20">
                This will delete all associated quizzes, topics, student answers, marks, and enrollments. This action cannot be undone.
              </p>
              {deleteError && (
                <p className="text-sm text-red-400 text-center">{deleteError}</p>
              )}
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  onClick={closeDeleteModal}
                  variant="outline"
                  className="flex-1 border-slate-600 text-slate-200 hover:bg-slate-700"
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleDeleteCourse}
                  variant="destructive"
                  className="flex-1"
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Yes, Delete This Course'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}