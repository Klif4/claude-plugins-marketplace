#!/usr/bin/env node
// Closes one iteration of the craft loop, in one call.
//
//   node scripts/craft-commit.mjs "feat(checkout): minimum order amount"
//
// It replaces the four commands of phase 3j: the `git status` that decides whether
// the map needs regenerating, `yarn craft:map`, `git add -A` and `git commit`.
//
// `craft:map` runs only when `src/domain` changed — a feature satisfied by existing
// domain code and a new adapter would produce an identical map. `git status` is what
// answers that, not `git diff`: a recovery may have staged `src/`, and staged changes
// are invisible to an unqualified `git diff`.
//
// A failed map does not fail the commit. The map degrades the next iteration's
// agents; the code that just went green is still the code to record.
//
// Exit code: 0 when the commit landed, 1 when it did not.
import { spawnSync } from 'node:child_process'

const message = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))[0]

if (!message) {
  console.error('craft:commit requires the commit message, e.g. "feat(<domain>): <feature title>"')
  process.exit(2)
}

const run = (command, args) =>
  spawnSync(command, args, { encoding: 'utf8', shell: process.platform === 'win32' })

const git = (...args) => {
  const { stdout, stderr, status, error } = run('git', args)
  if (error || status !== 0) {
    console.error(`FAIL  git ${args.join(' ')}`)
    console.error(error ? error.message : `${stdout ?? ''}${stderr ?? ''}`.trimEnd())
    process.exit(1)
  }
  return (stdout ?? '').trim()
}

if (git('status', '--porcelain', '--', 'src/domain') === '') {
  console.log('MAP   skipped — src/domain is unchanged, the map would come out identical')
} else {
  const { stdout, stderr, status, error } = run(process.execPath, ['scripts/craft-map.mjs'])
  const output = `${stdout ?? ''}${stderr ?? ''}`.trimEnd()
  console.log(
    error || status !== 0
      ? `MAP   FAILED — ${output || error?.message}\n      The cause is tsconfig.map.json, not the domain. Report it; the loop continues.`
      : `MAP   ${output}`,
  )
}

git('add', '-A')

if (git('diff', '--cached', '--name-only') === '') {
  console.error('FAIL  nothing staged — there is no work to commit.')
  process.exit(1)
}

git('commit', '-m', message)
console.log(`\nCOMMIT ${git('log', '-1', '--oneline')}`)
