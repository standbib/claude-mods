// Pure helpers for the gate board: they parse command output, nothing else.

// What a PR description says about the adversarial review panel
export function panelNote(body) {
  const text = body || ''
  if (/panel[- ]ready/i.test(text)) return 'panel-ready, not run'
  if (/panel skipped|skipped[^.\n]{0,40}\bpanel\b/i.test(text)) return 'panel skipped'
  if (/panel`?\s+(was|is)\s+not run|not run[^.\n]{0,20}\bpanel\b/i.test(text)) {
    return /adversarial (review|agents)|reviewed by/i.test(text) ? 'reviewed, full panel not run' : 'panel not run'
  }
  if (/\bpanel (ran|run:|verdict|found|confirmed)|adversarial-panel`? (ran|found)/i.test(text)) return 'panel ran'
  if (/adversarial review[^.\n]{0,40}(ran|found|confirmed|caught)/i.test(text)) return 'adversarial review ran'
  return 'no panel note'
}

// One word for a PR's checks, from gh's statusCheckRollup
export function checksSummary(rollup) {
  const items = rollup || []
  if (items.length === 0) return 'no checks'
  const states = items.map((c) => String(c.conclusion || c.state || c.status || '').toUpperCase())
  if (states.some((s) => ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes(s))) return 'checks failing'
  if (states.some((s) => ['', 'PENDING', 'QUEUED', 'IN_PROGRESS', 'EXPECTED', 'WAITING', 'REQUESTED'].includes(s))) return 'checks running'
  return 'checks passing'
}

// Migration files on main whose version is missing from the database's history
export function missingMigrations(lsTreeOutput, applied) {
  const appliedVersions = new Set((applied || []).map((m) => String(m.version)))
  return lsTreeOutput
    .split('\n')
    .map((path) => path.trim().split('/').pop())
    .filter((file) => file && file.endsWith('.sql'))
    .map((file) => ({ version: file.split('_')[0], name: file.replace(/^\d+_/, '').replace(/\.sql$/, '') }))
    .filter((m) => /^\d+$/.test(m.version) && !appliedVersions.has(m.version))
    .sort((a, b) => a.version.localeCompare(b.version))
}

// The newest commit time, in seconds, for each function folder, from
// `git log --format=@%ct --name-only -- supabase/functions`
export function lastChangeByFunction(gitLogOutput) {
  const latest = {}
  let time = 0
  for (const line of gitLogOutput.split('\n')) {
    if (line.startsWith('@')) {
      time = Number(line.slice(1))
      continue
    }
    const parts = line.trim().split('/')
    if (parts.length < 4 || parts[0] !== 'supabase' || parts[1] !== 'functions') continue
    if (!(parts[2] in latest)) latest[parts[2]] = time
  }
  return latest
}

// Counts changed lines that are code: not blank, not a comment, and not in a
// test, markdown or fixture file, which a deploy doesn't ship.
export function codeLinesChanged(diffText) {
  let count = 0
  let shipped = true
  for (const line of diffText.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const path = line.split(' b/').pop() || ''
      shipped = !/\.(test|spec)\.[jt]sx?$|\.md$|\/(tests?|__tests__|fixtures)\//.test(path)
      continue
    }
    if (!shipped || line.startsWith('+++') || line.startsWith('---')) continue
    if (!line.startsWith('+') && !line.startsWith('-')) continue
    const body = line.slice(1).trim()
    if (body === '' || body.startsWith('//') || body.startsWith('/*') || body.startsWith('*') || body.startsWith('*/')) continue
    count += 1
  }
  return count
}

// PRs merged to main, from `git log --first-parent --format=%s%x1f%b%x1e`
export function mergesFrom(gitLogOutput) {
  return gitLogOutput
    .split('\x1e')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [subject, body = ''] = entry.split('\x1f')
      const merge = subject.match(/^Merge pull request #(\d+)/)
      if (merge) return { pr: Number(merge[1]), title: body.trim().split('\n')[0] || subject }
      const squash = subject.match(/^(.*) \(#(\d+)\)$/)
      if (squash) return { pr: Number(squash[2]), title: squash[1] }
      return { pr: null, title: subject }
    })
}

// True when a short prompt says, in the first person, that the user published
export function isPublishedMessage(text) {
  if (!text || text.length > 1500) return false
  const sentences = text.split(/(?<=[.!?\n])/)
  return sentences.some((s) => {
    if (s.trim().endsWith('?')) return false
    if (/\b(not|n't|never|before|once|until|will|to be)\b[^.\n]{0,20}\bpublish/i.test(s)) return false
    return /\b(I|I've|I have|we|we've|just|and)\s+(just\s+)?(re)?published\b|\bI did (re)?publish\b|^\s*published\b/i.test(s)
  })
}

// Month/day for a time in milliseconds
export function shortDate(ms) {
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
