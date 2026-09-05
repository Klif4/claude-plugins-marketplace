#!/usr/bin/env node
// The craft loop's gate runner.
//
// Every line this prints lands in an agent's context, so it prints a digest and
// not a transcript: one line per gate when green, the tail of the output when red.
// It also runs the unit suite ONCE for both the "suite is green" gate and the
// coverage gate — `yarn test` followed by `yarn coverage` runs it twice.
//
// Exit code is the verdict: 0 means all three gates are green.
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const TAIL = 40

const run = (label, command) => {
  try {
    execSync(command, { stdio: 'pipe', encoding: 'utf8' })
    console.log(`PASS  ${label}`)
    return true
  } catch (error) {
    const lines = `${error.stdout ?? ''}${error.stderr ?? ''}`.trimEnd().split('\n')
    console.log(`FAIL  ${label}`)
    if (lines.length > TAIL) console.log(`… ${lines.length - TAIL} earlier lines cut.`)
    console.log(lines.slice(-TAIL).join('\n'))
    return false
  }
}

// Which domain files miss the 100% gate, read from the machine-readable summary
// rather than from the coverage table — the table lists every file, short or not.
const reportCoverageShortfall = () => {
  const path = 'coverage/coverage-summary.json'
  if (!existsSync(path)) return

  const short = Object.entries(JSON.parse(readFileSync(path, 'utf8')))
    .filter(([file]) => file.includes('src/domain/'))
    .filter(([, m]) => Math.min(m.lines.pct, m.branches.pct, m.functions.pct, m.statements.pct) < 100)

  if (short.length === 0) return

  console.log('\nDomain files short of 100%:')
  short.forEach(([file, m]) =>
    console.log(
      `  ${file}  lines=${m.lines.pct}% branches=${m.branches.pct}% functions=${m.functions.pct}%`,
    ),
  )
}

// Gates 2 and 3 are the same run: the thresholds in vitest.config.ts fail it.
if (!run('unit suite + domain coverage', 'vitest run --coverage --reporter=dot --coverage.reporter=json-summary')) {
  reportCoverageShortfall()
  process.exit(1)
}

if (!run('acceptance scenarios', 'cucumber-js')) process.exit(1)
if (!run('typecheck', 'tsc --noEmit')) process.exit(1)

console.log('\nAll three gates green.')
