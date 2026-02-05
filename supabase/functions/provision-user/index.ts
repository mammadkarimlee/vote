import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.91.1'

type ProvisionMode = 'login' | 'email'

type ProvisionRequest = {
  mode: ProvisionMode
  name: string
  role: 'student' | 'teacher' | 'manager' | 'moderator' | 'branch_admin'
  branchId?: string | null
  email?: string
  password?: string
  docData?: {
    groupId?: string
    classLevel?: string
    firstName?: string
    lastName?: string
    departmentId?: string
    photoUrl?: string
    teacherCategory?: string
  }
}

const AZ_CHAR_MAP: Record<string, string> = {
  Ə: 'e',
  ə: 'e',
  I: 'i',
  ı: 'i',
  İ: 'i',
  Ö: 'o',
  ö: 'o',
  Ü: 'u',
  ü: 'u',
  Ç: 'c',
  ç: 'c',
  Ş: 's',
  ş: 's',
  Ğ: 'g',
  ğ: 'g',
}

const normalizeLoginPart = (value: string) => {
  return value
    .split('')
    .map((char) => AZ_CHAR_MAP[char] ?? char)
    .join('')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

const buildLoginFromName = (fullName: string) => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  const first = parts[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1] : ''

  const firstPart = normalizeLoginPart(first).slice(0, 3)
  const lastPart = normalizeLoginPart(last).slice(0, 2)
  const fallback = normalizeLoginPart(fullName).slice(0, 5)

  return (firstPart + lastPart) || fallback || 'user'
}

const LOGIN_EMAIL_DOMAIN = Deno.env.get('LOGIN_EMAIL_DOMAIN') || 'vote.local'

const toLoginEmail = (loginOrEmail: string) => {
  const trimmed = loginOrEmail.trim().toLowerCase()
  if (trimmed.includes('@')) return trimmed
  return `${trimmed}@${LOGIN_EMAIL_DOMAIN}`
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: 'Missing Supabase env vars' }, 500)
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace('Bearer ', '').trim()
  if (!jwt) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  const { data: authData, error: authError } = await supabase.auth.getUser(jwt)
  if (authError || !authData.user) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const { data: actor, error: actorError } = await supabase
    .from('users')
    .select('*')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (actorError || !actor) {
    return jsonResponse({ error: 'Forbidden' }, 403)
  }

  let payload: ProvisionRequest
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  if (!payload.name?.trim()) {
    return jsonResponse({ error: 'Name is required' }, 400)
  }

  if (payload.mode !== 'login' && payload.mode !== 'email') {
    return jsonResponse({ error: 'Invalid mode' }, 400)
  }

  const isSuperAdmin = actor.role === 'superadmin'
  const isBranchStaff = actor.role === 'branch_admin' || actor.role === 'moderator'

  if (!isSuperAdmin && !isBranchStaff) {
    return jsonResponse({ error: 'Forbidden' }, 403)
  }

  if (!isSuperAdmin && payload.branchId && actor.branch_id !== payload.branchId) {
    return jsonResponse({ error: 'Branch mismatch' }, 403)
  }

  if (!isSuperAdmin && payload.role === 'branch_admin') {
    return jsonResponse({ error: 'Cannot create branch admin' }, 403)
  }

  if (payload.mode === 'email' && (!payload.email || !payload.password)) {
    return jsonResponse({ error: 'Email and password are required' }, 400)
  }

  if (payload.mode === 'login' && !payload.branchId) {
    return jsonResponse({ error: 'Branch is required' }, 400)
  }

  const orgId = actor.org_id
  const branchId = payload.branchId ?? actor.branch_id ?? null

  if (!branchId) {
    return jsonResponse({ error: 'Branch is required' }, 400)
  }

  const ensureUniqueLogin = async (base: string) => {
    let candidate = base
    let counter = 1
    while (counter < 1000) {
      const { data } = await supabase
        .from('usernames')
        .select('login')
        .eq('org_id', orgId)
        .eq('login', candidate)
        .maybeSingle()
      if (!data) return candidate
      candidate = `${base}${counter}`
      counter += 1
    }
    throw new Error('Unique login not available')
  }

  try {
    let login: string | null = null
    let password: string | null = null
    let email: string

    if (payload.mode === 'login') {
      const base = buildLoginFromName(payload.name)
      login = await ensureUniqueLogin(base)
      password = login
      email = toLoginEmail(login)
    } else {
      email = payload.email!.trim().toLowerCase()
      password = payload.password!
      login = email
    }

    const { data: authUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (createError || !authUser.user) {
      return jsonResponse({ error: createError?.message || 'Auth user not created' }, 400)
    }

    const uid = authUser.user.id

    if (payload.mode === 'login') {
      const { error: usernameError } = await supabase.from('usernames').insert({
        org_id: orgId,
        login,
        user_id: uid,
        role: payload.role,
        branch_id: branchId,
      })
      if (usernameError) {
        await supabase.auth.admin.deleteUser(uid)
        return jsonResponse({ error: usernameError.message }, 400)
      }
    }

    const { error: userError } = await supabase.from('users').insert({
      id: uid,
      org_id: orgId,
      role: payload.role,
      branch_id: branchId,
      display_name: payload.name,
      login,
      email,
      auth_user_id: uid,
    })

    if (userError) {
      await supabase.auth.admin.deleteUser(uid)
      return jsonResponse({ error: userError.message }, 400)
    }

    if (payload.role === 'student') {
      const { error: studentError } = await supabase.from('students').insert({
        id: uid,
        org_id: orgId,
        name: payload.name,
        branch_id: branchId,
        group_id: payload.docData?.groupId,
        class_level: payload.docData?.classLevel,
        user_id: uid,
        login,
      })
      if (studentError) {
        await supabase.auth.admin.deleteUser(uid)
        return jsonResponse({ error: studentError.message }, 400)
      }
    }

    if (payload.role === 'teacher') {
      const { error: teacherError } = await supabase.from('teachers').insert({
        id: uid,
        org_id: orgId,
        name: payload.name,
        branch_id: branchId,
        user_id: uid,
        login,
        first_name: payload.docData?.firstName ?? null,
        last_name: payload.docData?.lastName ?? null,
        department_id: payload.docData?.departmentId ?? null,
        photo_url: payload.docData?.photoUrl ?? null,
        teacher_category: payload.docData?.teacherCategory ?? 'standard',
      })
      if (teacherError) {
        await supabase.auth.admin.deleteUser(uid)
        return jsonResponse({ error: teacherError.message }, 400)
      }
    }

    return jsonResponse({
      uid,
      login,
      password,
      email,
    })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500)
  }
})
