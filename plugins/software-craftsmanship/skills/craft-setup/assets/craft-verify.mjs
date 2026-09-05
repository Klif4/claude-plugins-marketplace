#!/usr/bin/env node
// The craft loop's gate runner, in two modes.
//
// Every line this prints lands in an agent's context, so it prints a digest and
// not a transcript: one line per gate when green, the tail of the output when red.
//
// FULL (default) — the project gate. The whole unit suite, domain coverage at
// 100%, every acceptance scenario, and tsc. Run once per feature file, after the
// fast gate is green: it is what catches a regression in a feature file already
// delivered and a domain branch no test demands.
//
// FAST (--fast --feature <path> [unit test paths]) — the feature-file gate. Only
// the scenarios of the file being driven and only the unit test files that specify
// them, with no coverage instrumentation. Seconds instead of minutes. It cannot see
// a regression in another feature file or a coverage hole; the full gate is what
// catches those.
//
// Exit code is the verdict in both modes.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const TAIL = 40

const argv = process.argv.slice(2)
const fast = argv.includes('--fast')
const featureAt = argv.indexOf('--feature')
const feature = featureAt === -1 ? undefined : argv[featureAt + 1]
const paths = argv.filter((arg, index) => !arg.startsWith('--') && index !== featureAt + 1)

const run = (label, command, args) => {
  const { stdout, stderr, status, error } = spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })

  if (error) {
    console.log(`FAIL  ${label}`)
    console.log(`${command} could not be run: ${error.message}`)
    return false
  }

  if (status === 0) {
    console.log(`PASS  ${label}`)
    return true
  }

  const lines = `${stdout ?? ''}${stderr ?? ''}`.trimEnd().split('\n')
  console.log(`FAIL  ${label}`)
  if (lines.length > TAIL) console.log(`… ${lines.length - TAIL} earlier lines cut.`)
  console.log(lines.slice(-TAIL).join('\n'))
  return false
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

if (fast) {
  if (!feature) {
    console.error('--fast requires --feature <path to the .feature file>.')
    process.exit(2)
  }
  if (!existsSync(feature)) {
    console.error(`--feature: ${feature} does not exist.`)
    process.exit(2)
  }

  // Only unit test files: step definitions are cucumber's, not vitest's. A feature
  // file driven by step definitions alone leaves nothing to filter on, and an
  // unmatched filter makes vitest exit non-zero on "no test files found" — fall
  // back to the whole unit suite, still far cheaper than the instrumented run.
  const units = paths.filter((path) => path.startsWith('tests/') && existsSync(path))
  if (paths.length > 0 && units.length === 0) {
    console.log('note: no unit test file among the paths given — running the whole unit suite.')
  }

  const unitLabel = units.length > 0 ? `unit tests (${units.length} file(s))` : 'unit suite'
  if (!run(unitLabel, 'vitest', ['run', '--reporter=dot', ...units])) process.exit(1)
  // The feature file is passed positionally: cucumber.mjs declares no `paths`, so
  // this selection replaces the default features/**/*.feature instead of adding to
  // it, and the run covers exactly the scenarios of this file.
  if (!run(`scenarios of ${feature}`, 'cucumber-js', [feature])) process.exit(1)
  if (!run('typecheck', 'tsc', ['--noEmit'])) process.exit(1)

  console.log('\nFast gate green. Coverage and regressions are checked by `yarn craft:verify`.')
  process.exit(0)
}

// Gates 2 and 3 are the same run: the thresholds in vitest.config.ts fail it.
if (
  !run('unit suite + domain coverage', 'vitest', [
    'run',
    '--coverage',
    '--reporter=dot',
    '--coverage.reporter=json-summary',
  ])
) {
  reportCoverageShortfall()
  process.exit(1)
}

if (!run('acceptance scenarios', 'cucumber-js', [])) process.exit(1)
if (!run('typecheck', 'tsc', ['--noEmit'])) process.exit(1)

console.log('\nAll four gates green.')
