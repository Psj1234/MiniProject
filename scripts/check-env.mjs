// Verifies required environment variables before starting the app.
// Usage: npm run check-env
import fs from 'node:fs'

const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GROQ_API_KEY',
]

// Minimal .env.local loader (avoids adding a dependency)
if (fs.existsSync('.env.local')) {
  for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const missing = REQUIRED.filter((k) => !process.env[k]?.trim())

if (process.env.NEXT_PUBLIC_GROQ_API_KEY) {
  console.warn('WARNING: NEXT_PUBLIC_GROQ_API_KEY is set. It is exposed to the browser; use GROQ_API_KEY instead.')
}

if (missing.length) {
  console.error('Missing environment variables:\n' + missing.map((k) => `  - ${k}`).join('\n'))
  console.error('\nCopy .env.example to .env.local and fill them in.')
  process.exit(1)
}
console.log('All required environment variables are set.')
