import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'

// Admin client helper to perform trusted cascading deletes
function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createServerClient(url, key, {
    cookies: {
      getAll() { return [] },
      setAll() {}
    }
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const assignmentId = body?.assignmentId

    if (!assignmentId) {
      return NextResponse.json({ error: 'Missing assignmentId' }, { status: 400 })
    }

    // 1. Authenticate calling user
    const supabase = await createClient()
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminDb = getAdminSupabase()

    // 2. Verify assignment ownership
    const { data: assignment, error: fetchErr } = await adminDb
      .from('assignments')
      .select('id, title, professor_id')
      .eq('id', assignmentId)
      .single()

    if (fetchErr || !assignment) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
    }

    if (assignment.professor_id !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden: You are not authorized to delete this assignment' },
        { status: 403 }
      )
    }

    // 3. Explicit clean cascade deletion to ensure no orphaned answers or submissions remain
    // 3a. Retrieve all submission IDs for this assignment
    const { data: submissions } = await adminDb
      .from('assignment_submissions')
      .select('id')
      .eq('assignment_id', assignmentId)

    const subIds = (submissions || []).map((s) => s.id)

    if (subIds.length > 0) {
      // Delete answers linked to submissions
      const { error: ansErr } = await adminDb
        .from('assignment_answers')
        .delete()
        .in('submission_id', subIds)

      if (ansErr) {
        console.warn('[Delete Assignment] Answers deletion warning:', ansErr.message)
      }

      // Delete student submissions
      const { error: subDelErr } = await adminDb
        .from('assignment_submissions')
        .delete()
        .in('id', subIds)

      if (subDelErr) {
        console.warn('[Delete Assignment] Submissions deletion warning:', subDelErr.message)
      }
    }

    // 3b. Delete recipients
    const { error: recErr } = await adminDb
      .from('assignment_recipients')
      .delete()
      .eq('assignment_id', assignmentId)

    if (recErr) {
      console.warn('[Delete Assignment] Recipients deletion warning:', recErr.message)
    }

    // 3c. Delete questions
    const { error: qErr } = await adminDb
      .from('assignment_questions')
      .delete()
      .eq('assignment_id', assignmentId)

    if (qErr) {
      console.warn('[Delete Assignment] Questions deletion warning:', qErr.message)
    }

    // 3d. Delete the parent assignment record
    const { error: delErr } = await adminDb
      .from('assignments')
      .delete()
      .eq('id', assignmentId)

    if (delErr) {
      console.error('[Delete Assignment] Failed to delete assignment record:', delErr)
      throw delErr
    }

    console.log(`[Delete Assignment] Assignment "${assignment.title}" (${assignmentId}) deleted successfully by professor ${user.id}`)

    return NextResponse.json({
      success: true,
      message: `Assignment "${assignment.title}" and all associated student evaluations were removed.`
    })
  } catch (error: any) {
    console.error('Delete assignment route exception:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete assignment' },
      { status: 500 }
    )
  }
}
