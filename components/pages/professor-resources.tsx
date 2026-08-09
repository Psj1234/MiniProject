'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Upload, File, Trash2, Download, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Resource {
  id: string
  title: string
  description: string
  storage_path: string
  file_data: string
  file_size: number
  file_type: string
  created_at: string
  visibility: string
  course_name: string
  course_id: string
}

export default function ProfessorResources() {
  const [loading, setLoading] = useState(true)
  const [resources, setResources] = useState<Resource[]>([])
  const [courses, setCourses] = useState<{ id: string; name: string }[]>([])
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Upload form state
  const [selectedCourse, setSelectedCourse] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<'all' | 'fast' | 'slow'>('all')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const supabase = createClient()

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Not authenticated')
        return
      }

      // Get teacher's courses
      const { data: teacherCourses, error: coursesError } = await supabase
        .from('course_teachers')
        .select('course_id, courses(id, name)')
        .eq('teacher_id', user.id)

      if (coursesError) throw coursesError

      const coursesList = teacherCourses?.map((tc: any) => ({
        id: tc.courses.id,
        name: tc.courses.name
      })) || []

      setCourses(coursesList)

      // Get all resources for teacher's courses (without file_data to save bandwidth)
      const courseIds = coursesList.map(c => c.id)
      
      if (courseIds.length === 0) {
        setResources([])
        setLoading(false)
        return
      }

      const { data: resourcesData, error: resourcesError } = await supabase
        .from('resources')
        .select('id, title, description, storage_path, file_size, file_type, created_at, visibility, course_id, courses(name)')
        .in('course_id', courseIds)
        .eq('uploaded_by', user.id)
        .order('created_at', { ascending: false })

      if (resourcesError) throw resourcesError

      const processedResources = resourcesData?.map((r: any) => ({
        id: r.id,
        title: r.title,
        description: r.description || '',
        storage_path: r.storage_path || '',
        file_data: '', // Don't load file data in list view
        file_size: r.file_size || 0,
        file_type: r.file_type || '',
        created_at: r.created_at,
        visibility: r.visibility || 'all',
        course_name: r.courses?.name || 'Unknown',
        course_id: r.course_id
      })) || []

      setResources(processedResources)

    } catch (err: any) {
      console.error('Error fetching resources:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Check file size (max 10MB for database storage)
      if (file.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB for database storage')
        return
      }
      setSelectedFile(file)
      setError(null)
    }
  }

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = error => reject(error)
    })
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedFile || !selectedCourse || !title) {
      setError('Please fill all required fields')
      return
    }

    setUploading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Convert file to base64
      const base64Data = await fileToBase64(selectedFile)

      // Create resource record in database
      const { error: dbError } = await supabase
        .from('resources')
        .insert({
          course_id: selectedCourse,
          title,
          description,
          storage_path: selectedFile.name, // Store filename
          file_data: base64Data,
          file_size: selectedFile.size,
          file_type: selectedFile.type,
          visibility,
          uploaded_by: user.id
        })

      if (dbError) throw dbError

      // Reset form and refresh
      setShowUploadModal(false)
      resetForm()
      await fetchData()

    } catch (err: any) {
      console.error('Upload error:', err)
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (resource: Resource) => {
    if (!confirm(`Are you sure you want to delete "${resource.title}"?`)) return

    try {
      setError(null)

      // Delete from database
      const { error: dbError } = await supabase
        .from('resources')
        .delete()
        .eq('id', resource.id)

      if (dbError) throw dbError

      // Refresh list
      await fetchData()

    } catch (err: any) {
      console.error('Delete error:', err)
      setError(err.message)
    }
  }

  const handleDownload = async (resource: Resource) => {
    try {
      // Fetch the full resource with file_data
      const { data, error } = await supabase
        .from('resources')
        .select('file_data, file_type, storage_path')
        .eq('id', resource.id)
        .single()

      if (error) throw error

      if (!data.file_data) {
        throw new Error('File data not found')
      }

      // Convert base64 to blob
      const byteString = atob(data.file_data.split(',')[1])
      const mimeString = data.file_data.split(',')[0].split(':')[1].split(';')[0]
      const ab = new ArrayBuffer(byteString.length)
      const ia = new Uint8Array(ab)
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i)
      }
      const blob = new Blob([ab], { type: mimeString })

      // Create download link
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = data.storage_path || resource.title
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

    } catch (err: any) {
      console.error('Download error:', err)
      setError(err.message)
    }
  }

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setVisibility('all')
    setSelectedFile(null)
    setSelectedCourse('')
    setError(null)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const getVisibilityLabel = (vis: string) => {
    if (vis === 'fast') return 'Fast Learners Only'
    if (vis === 'slow') return 'Slow Learners Only'
    return 'All Students'
  }

  const getVisibilityColor = (vis: string) => {
    if (vis === 'fast') return 'bg-blue-500/20 text-blue-300 border-blue-500/30'
    if (vis === 'slow') return 'bg-amber-500/20 text-amber-300 border-amber-500/30'
    return 'bg-green-500/20 text-green-300 border-green-500/30'
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6 text-center">
        <p className="text-white text-lg">Loading resources...</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Course Resources</h1>
          <p className="text-slate-400">Upload and manage learning materials for your courses</p>
        </div>
        <Button
          onClick={() => setShowUploadModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white"
          disabled={courses.length === 0}
        >
          <Upload size={16} className="mr-2" />
          Upload Resource
        </Button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300">
          {error}
        </div>
      )}

      {/* Storage Info */}
      <Card className="bg-blue-500/10 border-blue-500/30">
        <CardContent className="pt-4">
          <p className="text-sm text-blue-300">
            <strong>Note:</strong> Files are stored in the database. Maximum file size: 10MB per file.
          </p>
        </CardContent>
      </Card>

      {/* No Courses Warning */}
      {courses.length === 0 && (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-12 pb-12 text-center">
            <p className="text-slate-400 mb-4">You don't have any courses assigned yet.</p>
            <p className="text-slate-500 text-sm">Resources can only be uploaded to courses you teach.</p>
          </CardContent>
        </Card>
      )}

      {/* Resources List */}
      {courses.length > 0 && resources.length === 0 ? (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-12 pb-12 text-center">
            <File className="mx-auto mb-4 text-slate-600" size={48} />
            <p className="text-slate-400 mb-4">No resources uploaded yet</p>
            <Button
              onClick={() => setShowUploadModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Upload Your First Resource
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Group by course */}
          {courses.map(course => {
            const courseResources = resources.filter(r => r.course_id === course.id)
            if (courseResources.length === 0) return null

            return (
              <Card key={course.id} className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white">{course.name}</CardTitle>
                  <CardDescription className="text-slate-400">
                    {courseResources.length} resource{courseResources.length !== 1 ? 's' : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {courseResources.map(resource => (
                      <div
                        key={resource.id}
                        className="p-4 bg-slate-700/50 rounded-lg border border-slate-600 hover:border-slate-500 transition"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <File size={20} className="text-blue-400" />
                              <h4 className="font-semibold text-white">{resource.title}</h4>
                              <span className={`text-xs px-2 py-1 rounded border ${getVisibilityColor(resource.visibility)}`}>
                                {getVisibilityLabel(resource.visibility)}
                              </span>
                            </div>
                            {resource.description && (
                              <p className="text-sm text-slate-400 mb-2 ml-8">{resource.description}</p>
                            )}
                            <div className="text-xs text-slate-500 ml-8 space-y-1">
                              <p>File: {resource.storage_path} ({formatFileSize(resource.file_size)})</p>
                              <p>Uploaded on {formatDate(resource.created_at)}</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleDownload(resource)}
                              variant="ghost"
                              size="icon"
                              className="text-blue-400 hover:bg-blue-500/20"
                            >
                              <Download size={18} />
                            </Button>
                            <Button
                              onClick={() => handleDelete(resource)}
                              variant="ghost"
                              size="icon"
                              className="text-red-400 hover:bg-red-500/20"
                            >
                              <Trash2 size={18} />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl bg-slate-800 border-slate-700 max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-white">Upload Resource</CardTitle>
                <CardDescription className="text-slate-400">
                  Add a new learning material for your students
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setShowUploadModal(false)
                  resetForm()
                }}
                className="text-slate-400 hover:bg-slate-700"
              >
                <X size={20} />
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpload} className="space-y-4">
                {/* Course Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200">
                    Course <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={selectedCourse}
                    onChange={(e) => setSelectedCourse(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  >
                    <option value="">Select a course</option>
                    {courses.map(course => (
                      <option key={course.id} value={course.id}>
                        {course.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Title */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200">
                    Title <span className="text-red-400">*</span>
                  </label>
                  <Input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Week 5 Lecture Notes"
                    className="bg-slate-700 border-slate-600 text-white"
                    required
                  />
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200">
                    Description (Optional)
                  </label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description of the resource..."
                    className="bg-slate-700 border-slate-600 text-white min-h-[80px]"
                  />
                </div>

                {/* Visibility */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200">
                    Visibility
                  </label>
                  <select
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as 'all' | 'fast' | 'slow')}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="all">All Students</option>
                    <option value="fast">Fast Learners Only</option>
                    <option value="slow">Slow Learners Only</option>
                  </select>
                  <p className="text-xs text-slate-400">
                    Control who can see this resource based on learning pace
                  </p>
                </div>

                {/* File Upload */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200">
                    File <span className="text-red-400">*</span>
                  </label>
                  <div className="border-2 border-dashed border-slate-600 rounded-lg p-6 text-center hover:border-slate-500 transition">
                    <input
                      type="file"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="file-upload"
                      accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.jpg,.jpeg,.png"
                      required
                    />
                    <label htmlFor="file-upload" className="cursor-pointer">
                      <Upload className="mx-auto mb-2 text-slate-400" size={32} />
                      {selectedFile ? (
                        <div>
                          <p className="text-slate-200 font-medium">{selectedFile.name}</p>
                          <p className="text-xs text-slate-400 mt-1">
                            {formatFileSize(selectedFile.size)}
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-slate-300 font-medium">Click to upload file</p>
                          <p className="text-xs text-slate-500 mt-1">
                            PDF, DOC, PPT, TXT, Images (Max 10MB)
                          </p>
                        </div>
                      )}
                    </label>
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    onClick={() => {
                      setShowUploadModal(false)
                      resetForm()
                    }}
                    variant="outline"
                    className="flex-1 border-slate-600 text-slate-200 hover:bg-slate-700"
                    disabled={uploading}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                    disabled={uploading}
                  >
                    {uploading ? 'Uploading...' : 'Upload Resource'}
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