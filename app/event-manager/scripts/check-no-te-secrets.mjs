import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const root = new URL('../src', import.meta.url)
const allowedExt = new Set(['.js', '.jsx', '.ts', '.tsx'])
const patterns = [/TE_API_KEY/i, /TE_API_TOKEN/i, /TE_API_SECRET/i]
const violations = []

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) walk(full)
    else if (allowedExt.has(extname(full))) {
      const content = readFileSync(full, 'utf8')
      if (patterns.some((re) => re.test(content))) violations.push(full)
    }
  }
}

walk(root.pathname)

if (violations.length > 0) {
  console.error('Found TE secret-like keys in frontend source:')
  for (const file of violations) console.error(`- ${file}`)
  process.exit(1)
}

console.log('OK: no TE secret-like keys found in app/event-manager/src')

