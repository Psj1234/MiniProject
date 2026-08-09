'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { File, Download, Eye, Search, Filter } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'

interface Resource {
  id: string
  title: string
  description: string
  storage_path: string
  file_size: number
  file_type: string
  created_at: string
  visibility: string
  uploader_name: string
  uploader_id: string
  course_name: string
  course_id: string
  viewed: boolean
}

export default function StudentResources() {
  const [loading, setLoading] = useState(true)
  const [resources, setResources] = useState<Resource[]>([])
  const [filteredResources, setFilteredResources] = useState<Resource[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCourse, setSelectedCourse] = useState<string>('all')
  const [courses, setCourses] = useState<{ id: string; name: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [studentId, setStudentId] = useState<number | null>(null)

  const supabase = createClient()

  useEffect(() => {
    fetchResources()
  }, [])

  useEffect(() => {
    filterResources()
  }, [searchTerm, selectedCourse, resources])

  const fetchResources = async () => {
    try {
      setLoading(true)
      setError(null)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Not authenticated')
        return
      }

      // Get student profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('student_id')
        .eq('id', user.id)
        .single()

      if (!profile?.student_id) {
        setError('Student profile not found')
        return
      }

      setStudentId(profile.student_id)

      // Get enrolled courses with learner_tag
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('course_id, learner_tag, courses(id, name)')
        .eq('student_id', profile.student_id)

      if (!enrollments || enrollments.length === 0) {
        setError('No enrolled courses found')
        setLoading(false)
        return
      }

      const enrolledCourses = enrollments.map((e: any) => ({
        id: e.courses.id,
        name: e.courses.name,
        learner_tag: e.learner_tag
      }))

      setCourses(enrolledCourses)

      const courseIds = enrolledCourses.map(c => c.id)

      // Get resources for enrolled courses (without file_data)
      const { data: resourcesData, error: resourcesError } = await supabase
        .from('resources')
        .select(`
          id,
          title,
          description,
          storage_path,
          file_size,
          file_type,
          created_at,
          visibility,
          course_id,
          uploaded_by,
          courses(name),
          profiles:uploaded_by(full_name)
        `)
        .in('course_id', courseIds)
        .order('created_at', { ascending: false })

      if (resourcesError) throw resourcesError

      // Get viewed resources
      const { data: engagementData } = await supabase
        .from('student_resource_engagement')
        .select('resource_id')
        .eq('student_id', profile.student_id)

      const viewedResourceIds = new Set(engagementData?.map(e => e.resource_id) || [])

      // Filter resources based on visibility and learner tag
      const processedResources: Resource[] = []
      
      resourcesData?.forEach((r: any) => {
        const enrollment = enrollments.find(e => e.course_id === r.course_id)
        const learnerTag = enrollment?.learner_tag || null

        // Check visibility rules
        const isVisible = 
          r.visibility === 'all' ||
          r.visibility === null ||
          r.visibility === learnerTag

        if (isVisible) {
          processedResources.push({
            id: r.id,
            title: r.title,
            description: r.description || '',
            storage_path: r.storage_path || '',
            file_size: r.file_size || 0,
            file_type: r.file_type || '',
            created_at: r.created_at,
            visibility: r.visibility || 'all',
            uploader_name: r.profiles?.full_name || 'Unknown',
            uploader_id: r.uploaded_by,
            course_name: r.courses?.name || 'Unknown',
            course_id: r.course_id,
            viewed: viewedResourceIds.has(r.id)
          })
        }
      })

      setResources(processedResources)

    } catch (err: any) {
      console.error('Error fetching resources:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const filterResources = () => {
    let filtered = [...resources]

    // Filter by course
    if (selectedCourse !== 'all') {
      filtered = filtered.filter(r => r.course_id === selectedCourse)
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(r =>
        r.title.toLowerCase().includes(term) ||
        r.description.toLowerCase().includes(term) ||
        r.course_name.toLowerCase().includes(term) ||
        r.uploader_name.toLowerCase().includes(term)
      )
    }

    setFilteredResources(filtered)
  }

  const markAsViewed = async (resourceId: string) => {
    if (studentId) {
      const { error: engagementError } = await supabase
        .from('student_resource_engagement')
        .insert({
          resource_id: resourceId,
          student_id: studentId,
          viewed_at: new Date().toISOString()
        })

      if (!engagementError) {
        setResources(prev =>
          prev.map(r => r.id === resourceId ? { ...r, viewed: true } : r)
        )
      }
    }
  }

  const handleDownload = async (resource: Resource) => {
    try {
      setError(null)

      // Mark as viewed
      if (!resource.viewed) {
        await markAsViewed(resource.id)
      }

      // Fetch the full resource with file_data
      const { data, error } = await supabase
        .from('resources')
        .select('file_data, storage_path')
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

  const handleView = async (resource: Resource) => {
    try {
      setError(null)

      // Mark as viewed
      if (!resource.viewed) {
        await markAsViewed(resource.id)
      }

      // Fetch the full resource with file_data
      const { data, error } = await supabase
        .from('resources')
        .select('file_data, file_type')
        .eq('id', resource.id)
        .single()

      if (error) throw error

      if (!data.file_data) {
        throw new Error('File data not found')
      }

      // For PDFs and images, open in new tab
      if (resource.file_type.includes('pdf') || resource.file_type.includes('image')) {
        const newWindow = window.open()
        if (newWindow) {
          if (resource.file_type.includes('pdf')) {
            newWindow.document.write(`
              <html>
                <head><title>${resource.title}</title></head>
                <body style="margin:0">
                  <iframe src="${data.file_data}" width="100%" height="100%" style="border:none"></iframe>
                </body>
              </html>
            `)
          } else {
            newWindow.document.write(`
              <html>
                <head><title>${resource.title}</title></head>
                <body style="margin:0;display:flex;justify-content:center;align-items:center;background:#000">
                  <img src="${data.file_data}" style="max-width:100%;max-height:100vh" />
                </body>
              </html>
            `)
          }
        }
      } else {
        // For other files, download
        await handleDownload(resource)
      }

    } catch (err: any) {
      console.error('View error:', err)
      setError(err.message)
    }
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

  const getVisibilityBadge = (vis: string) => {
    if (vis === 'fast') {
      return <span className="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">For Fast Learners</span>
    }
    if (vis === 'slow') {
      return <span className="text-xs px-2 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">For Slow Learners</span>
    }
    return null
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
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Course Resources</h1>
        <p className="text-slate-400">Access learning materials shared by your instructors</p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300">
          {error}
        </div>
      )}

      {/* Filters */}
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
              <Input
                type="text"
                placeholder="Search resources..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-slate-700 border-slate-600 text-white"
              />
            </div>

            {/* Course Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
              <select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                className="w-full pl-10 px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="all">All Courses</option>
                {courses.map(course => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resources List */}
      {filteredResources.length === 0 ? (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-12 pb-12 text-center">
            <File className="mx-auto mb-4 text-slate-600" size={48} />
            <p className="text-slate-400">
              {searchTerm || selectedCourse !== 'all'
                ? 'No resources match your filters'
                : 'No resources available yet'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Group by course */}
          {courses
            .filter(course => 
              selectedCourse === 'all' || course.id === selectedCourse
            )
            .map(course => {
              const courseResources = filteredResources.filter(r => r.course_id === course.id)
              if (courseResources.length === 0) return null

              return (
                <Card key={course.id} className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-white">{course.name}</CardTitle>
                    <CardDescription className="text-slate-400">
                      {courseResources.length} resource{courseResources.length !== 1 ? 's' : ''} available
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {courseResources.map(resource => (
                        <div
                          key={resource.id}
                          className={`p-4 rounded-lg border transition ${
                            resource.viewed
                              ? 'bg-slate-700/30 border-slate-600'
                              : 'bg-slate-700/50 border-blue-500/30'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2 flex-wrap">
                                <File size={20} className="text-blue-400" />
                                <h4 className="font-semibold text-white">{resource.title}</h4>
                                {!resource.viewed && (
                                  <span className="text-xs px-2 py-1 rounded bg-blue-500 text-white font-medium">
                                    NEW
                                  </span>
                                )}
                                {getVisibilityBadge(resource.visibility)}
                              </div>
                              {resource.description && (
                                <p className="text-sm text-slate-400 mb-2 ml-8">
                                  {resource.description}
                                </p>
                              )}
                              <div className="text-xs text-slate-500 ml-8 space-y-1">
                                <p>Uploaded by <span className="text-slate-400 font-medium">{resource.uploader_name}</span></p>
                                <p>{formatDate(resource.created_at)} • {formatFileSize(resource.file_size)}</p>
                              </div>
                            </div>
                            <div className="flex gap-2 ml-4">
                              <Button
                                onClick={() => handleView(resource)}
                                variant="ghost"
                                size="icon"
                                className="text-slate-300 hover:bg-slate-600"
                                title="View"
                              >
                                <Eye size={18} />
                              </Button>
                              <Button
                                onClick={() => handleDownload(resource)}
                                variant="ghost"
                                size="icon"
                                className="text-blue-400 hover:bg-blue-500/20"
                                title="Download"
                              >
                                <Download size={18} />
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

      {/* Stats */}
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="pt-6">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-white">{resources.length}</p>
              <p className="text-sm text-slate-400">Total Resources</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-400">
                {resources.filter(r => r.viewed).length}
              </p>
              <p className="text-sm text-slate-400">Viewed</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-400">
                {resources.filter(r => !r.viewed).length}
              </p>
              <p className="text-sm text-slate-400">New</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}