#!/usr/bin/env node
// The craft loop's boundary check, in one call.
//
// It replaces the four commands the orchestrator used to run by hand after every
// agent (two `grep` pipelines to list, two to revert, then `git add` and
// `git diff --cached`). Each of those was a round-trip of its own — and, without a
// permission allow-list, an approval prompt of its own.
//
//   node scripts/craft-scope.mjs --allow tests/ features/steps/ --stage tests features
//
// --allow  the prefixes this agent was allowed to write. Everything else that
//          changed is a violation: the allow-list catches the config an agent
//          relaxed, which a deny-list of "directories it must not touch" misses.
// --stage  what to snapshot into the index once the tree is clean again, and what
//          to print as the list of files the agent wrote. Optional.
//
// Reverting is deliberately asymmetric. A tracked file is restored from the index,
// which is lossless. An untracked file has no copy anywhere, so it is deleted only
// under the directories the loop owns — `src/`, `tests/`, `features/`. Anything an
// agent dropped outside those is reported and left on disk: a stray file is a
// violation to record, never a reason to delete something the user may have been
// writing while the loop ran.
//
// Exit code: 0 when the tree is within scope (whether or not something had to be
// reverted — the digest says so), 2 when git itself failed.
import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'

const OWNED = ['src/', 'tests/', 'features/']

const argv = process.argv.slice(2)
const flagValues = (flag) => {
  const at = argv.indexOf(flag)
  if (at === -1) return []
  const rest = argv.slice(at + 1)
  const end = rest.findIndex((arg) => arg.startsWith('--'))
  return end === -1 ? rest : rest.slice(0, end)
}

const allow = flagValues('--allow')
const stage = flagValues('--stage')

if (allow.length === 0) {
  console.error('--allow requires at least one path prefix, e.g. --allow tests/ features/steps/')
  process.exit(2)
}

const git = (...args) => {
  const { stdout, stderr, status, error } = spawnSync('git', args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  if (error || status !== 0) {
    console.error(`FAIL  git ${args.join(' ')}`)
    console.error(error ? error.message : `${stdout ?? ''}${stderr ?? ''}`.trimEnd())
    process.exit(2)
  }
  return (stdout ?? '').trim()
}

const lines = (output) => (output === '' ? [] : output.split('\n'))
const inScope = (path) => allow.some((prefix) => path.startsWith(prefix))

const changed = lines(git('diff', '--name-only')).filter((path) => !inScope(path))
const created = lines(git('ls-files', '--others', '--exclude-standard')).filter(
  (path) => !inScope(path),
)

const report = []

if (changed.length > 0) {
  git('checkout', '--', ...changed)
  changed.forEach((path) => report.push(`  M ${path} — restored from the index`))
}

created.forEach((path) => {
  if (OWNED.some((prefix) => path.startsWith(prefix))) {
    rmSync(path, { force: true })
    report.push(`  ? ${path} — deleted`)
    return
  }
  report.push(`  ? ${path} — LEFT IN PLACE, outside ${OWNED.join(' ')}: check it yourself`)
})

console.log(
  report.length === 0
    ? `SCOPE clean — only ${allow.join(' ')} changed`
    : `SCOPE ${report.length} violation(s) — the agent wrote outside ${allow.join(' ')}`,
)
report.forEach((line) => console.log(line))

if (stage.length === 0) process.exit(0)

git('add', '-A', '--', ...stage)

const wrote = lines(git('diff', '--cached', '--name-only', '--', ...stage))
console.log(`\nSTAGED ${wrote.length} file(s) under ${stage.join(' ')}:`)
wrote.forEach((path) => console.log(`  ${path}`))
