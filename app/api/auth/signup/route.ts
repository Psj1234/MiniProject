import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[Signup API] Missing Supabase server credentials')
      return NextResponse.json(
        { error: 'Server configuration error: missing Supabase credentials' },
        { status: 500 }
      )
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    const body = await req.json()
    const { email, password, name, role, studentId } = body

    // 1. Validation
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Please provide a valid email address.' }, { status: 400 })
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long.' },
        { status: 400 }
      )
    }

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Full name is required.' }, { status: 400 })
    }

    if (!role || !['student', 'professor'].includes(role)) {
      return NextResponse.json(
        { error: "Role is required and must be either 'student' or 'professor'." },
        { status: 400 }
      )
    }

    let parsedStudentId: number | null = null
    if (role === 'student') {
      if (!studentId || isNaN(Number(studentId))) {
        return NextResponse.json(
          { error: 'Please enter a valid numeric Student ID.' },
          { status: 400 }
        )
      }
      parsedStudentId = Number(studentId)

      // Check if student_id is already used by another student profile
      const { data: existingStudentId } = await adminSupabase
        .from('profiles')
        .select('id')
        .eq('student_id', parsedStudentId)
        .limit(1)

      if (existingStudentId && existingStudentId.length > 0) {
        return NextResponse.json(
          { error: `Student ID ${parsedStudentId} is already registered by another account.` },
          { status: 400 }
        )
      }
    }

    // 2. Create User with Instant Auto-Confirmation
    const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true, // Bypass external email delivery & confirm immediately
      user_metadata: {
        full_name: name.trim()
      }
    })

    if (authError || !authData.user) {
      const errMsg = authError?.message || 'Failed to create user account'
      console.error('[Signup API] Auth creation error:', errMsg)

      if (errMsg.toLowerCase().includes('already') || errMsg.toLowerCase().includes('registered')) {
        return NextResponse.json(
          { error: 'An account with this email already exists. Please sign in instead.' },
          { status: 409 }
        )
      }

      return NextResponse.json({ error: errMsg }, { status: 400 })
    }

    const userId = authData.user.id

    // 3. Upsert Profile with Role and Student ID
    const profilePayload: any = {
      id: userId,
      full_name: name.trim(),
      role: role,
      student_id: parsedStudentId,
      updated_at: new Date().toISOString()
    }

    const { error: profileError } = await adminSupabase.from('profiles').upsert(profilePayload)

    if (profileError) {
      console.error('[Signup API] Profile upsert error:', profileError)
      return NextResponse.json(
        { error: 'Account created, but failed to save profile: ' + profileError.message },
        { status: 500 }
      )
    }

    console.log(`[Signup API] Successfully created and verified ${role} account for ${email}`)

    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        email: authData.user.email,
        role: role
      }
    })
  } catch (err: any) {
    console.error('[Signup API] Unexpected error:', err)
    return NextResponse.json(
      { error: err.message || 'An unexpected error occurred during signup.' },
      { status: 500 }
    )
  }
}
