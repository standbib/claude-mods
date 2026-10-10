import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'gate-board',
  component: 'Pane',
  requestId: 'gate-board',
  surface: 'terminal',
  viewport: { columns: 140, rows: 40 },
  props: {
    title: 'Waiting on you',
    isFocused: true,
    bodyColumns: 100,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

// Seconds for a day in 2026
const day = (month: number, date: number) => Date.UTC(2026, month - 1, date, 12) / 1000

const PRS = [
  { number: 157, title: 'Checklist: add a notification dot', isDraft: false, body: 'Panel skipped: a restyle.', statusCheckRollup: [{ conclusion: 'FAILURE' }, { conclusion: 'SUCCESS' }] },
  { number: 65, title: 'Spec — Event Map (Phase H)', isDraft: true, body: '', statusCheckRollup: [] },
]

const LIVE = [
  { slug: 'chat', updated_at: day(8, 16) * 1000 },
  { slug: 'send-cadence-nudge', updated_at: day(9, 1) * 1000 },
  { slug: 'generate-monthly-reflection', updated_at: day(7, 1) * 1000 },
]

const COMMENT_ONLY_DIFF = [
  'diff --git a/supabase/functions/chat/tools.ts b/supabase/functions/chat/tools.ts',
  '--- a/supabase/functions/chat/tools.ts',
  '+++ b/supabase/functions/chat/tools.ts',
  '@@ -1,3 +1,4 @@',
  '-// Old description of the tool',
  '+// New description of the tool',
  '+ * that matches the code',
].join('\n')

const CODE_DIFF = [
  'diff --git a/supabase/functions/send-cadence-nudge/index.ts b/supabase/functions/send-cadence-nudge/index.ts',
  '--- a/supabase/functions/send-cadence-nudge/index.ts',
  '+++ b/supabase/functions/send-cadence-nudge/index.ts',
  '@@ -10,1 +10,1 @@',
  "-  .eq('status', 'active')",
  "+  .neq('status', 'inactive')",
].join('\n')

const MERGES = 'Merge pull request #156 from example/fix/checklist-polish\x1fChecklist polish\x1e' + 'Admin page for testers (#155)\x1f\x1e'

const SHA = 'a'.repeat(40)

// Answers git, gh and Supabase the way they answered on 2 October
function stubWorld(on, options: { isRepo?: boolean; ghFails?: boolean } = {}) {
  const saved = new Map<string, unknown>()
  const toasts: string[] = []
  on('process.run', ($, e) => {
    const cmd = e.argv.join(' ')
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } })
    if (cmd === 'git rev-parse --show-toplevel') return options.isRepo === false ? { value: { exitCode: 128, stdout: '', stderr: 'not a git repository' } } : ok('/work/withremi\n')
    if (cmd === 'git fetch origin --quiet') return ok('')
    if (cmd.startsWith('gh pr list')) return options.ghFails ? { value: { exitCode: 1, stdout: '', stderr: 'gh: not logged in' } } : ok(JSON.stringify(PRS))
    if (cmd.startsWith('git ls-tree --name-only origin/main supabase/migrations/'))
      return ok(['supabase/migrations/20260101000000_base.sql', 'supabase/migrations/20260907120000_schedule_event_reminders.sql', 'supabase/migrations/20260914130000_love_languages_canonical.sql'].join('\n'))
    if (cmd.startsWith('git ls-tree -d --name-only origin/main supabase/functions/'))
      return ok(['supabase/functions/_shared', 'supabase/functions/chat', 'supabase/functions/send-cadence-nudge', 'supabase/functions/first-week-digest'].join('\n'))
    if (cmd.startsWith('git log --format=@%ct --name-only'))
      return ok(`@${day(9, 14)}\n\nsupabase/functions/send-cadence-nudge/index.ts\n@${day(9, 8)}\n\nsupabase/functions/chat/tools.ts\n`)
    if (cmd.startsWith('git log -1 --format=%H')) return ok('b'.repeat(40) + '\n')
    if (cmd.startsWith('git diff') && cmd.endsWith('supabase/functions/chat')) return ok(COMMENT_ONLY_DIFF)
    if (cmd.startsWith('git diff') && cmd.endsWith('supabase/functions/send-cadence-nudge')) return ok(CODE_DIFF)
    if (cmd.startsWith('git log --first-parent')) return ok(MERGES)
    if (cmd === 'git ls-remote origin refs/heads/main') return ok(`${SHA}\trefs/heads/main\n`)
    return { value: { exitCode: 1, stdout: '', stderr: 'unexpected: ' + cmd } }
  })
  on('http.fetch', ($, e) => {
    if (e.url.endsWith('/functions')) return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(LIVE) } }
    if (e.url.endsWith('/database/migrations')) return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify([{ version: '20260101000000', name: 'base' }]) } }
    return { value: { status: 404, ok: false, headers: {}, text: '' } }
  })
  on('fs.read', ($, e) => (e.path.endsWith('project-ref') ? { value: 'testref\n' } : { deny: 'no such file' }))
  on('env.get', ($, e) => ({ value: e.name === 'SUPABASE_ACCESS_TOKEN' ? 'token' : '/home' }))
  on('store.get', ($, e) => ({ value: saved.get(e.key) }))
  on('store.set', ($, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('clock.now', () => ({ value: day(10, 2) * 1000 }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('prompt.submit', ($, e) => ({ text: e.text }))
  return { saved, toasts }
}

async function openBoard($) {
  await $.command.run({ command: 'gate', args: '' })
  return $.ui.mount(PANE)
}

test('lists open PRs with their checks and panel note', async ($, on) => {
  stubWorld(on)
  const ui = await openBoard($)
  expect(await ui.find({ type: 'Text', text: /#157 Checklist: add a notification dot/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /checks failing · panel skipped/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /draft · no checks · no panel note/ })).toBeDefined()
})

test('shows code on main that is not live, and skips a comment-only change', async ($, on) => {
  stubWorld(on)
  const ui = await openBoard($)
  expect(await ui.find({ type: 'Text', text: /send-cadence-nudge: changed/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^\s*chat: changed/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /never deployed/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /first-week-digest/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Still live, but deleted from main/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /generate-monthly-reflection/ })).toBeDefined()
})

test('counts migrations missing from the database history', async ($, on) => {
  stubWorld(on)
  const ui = await openBoard($)
  expect(await ui.find({ type: 'Text', text: "  2 migrations on main, missing from the database's history (since 9/7)" })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /love_languages_canonical/ })).toBeDefined()
})

test('"I merged 116 and published" marks main, and later merges show as unpublished', async ($, on) => {
  const { saved } = stubWorld(on)
  let ui = await openBoard($)
  expect(await ui.find({ type: 'Text', text: /say "I published" here or press p/ })).toBeDefined()
  await ui.unmount()

  await $.prompt.submit({ text: 'I merged 116 and published. Can we also adjust the copy?' })
  expect(saved.get('published:/work/withremi')).toEqual({ sha: SHA, at: day(10, 2) * 1000 })

  ui = await openBoard($)
  expect(await ui.find({ type: 'Text', text: /2 changes to the site on main since you published/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /#156 Checklist polish/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /#155 Admin page for testers/ })).toBeDefined()
})

test('talk about publishing that is not a report of it marks nothing', async ($, on) => {
  const { saved } = stubWorld(on)
  await $.prompt.submit({ text: 'Is now a good time to publish?' })
  await $.prompt.submit({ text: "I'll publish later but for now just merge." })
  await $.prompt.submit({ text: 'PR #155 merged 09-30 and Sam published.' })
  expect(saved.size).toBe(0)
})

test('the p button marks main as published', async ($, on) => {
  const { saved, toasts } = stubWorld(on)
  const ui = await openBoard($)
  await ui.press({ key: 'published' })
  expect(saved.get('published:/work/withremi')).toEqual({ sha: SHA, at: day(10, 2) * 1000 })
  expect(toasts).toEqual(['Marked main as published'])
})

test('says so outside a git repository', async ($, on) => {
  stubWorld(on, { isRepo: false })
  const ui = await openBoard($)
  expect(await ui.find({ type: 'Text', text: 'This folder is not a git repository.' })).toBeDefined()
})

test('a gh failure is shown, and the rest of the board still draws', async ($, on) => {
  stubWorld(on, { ghFails: true })
  const ui = await openBoard($)
  expect(await ui.find({ type: 'Text', text: /Could not read PRs: gh: not logged in/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /send-cadence-nudge: changed/ })).toBeDefined()
})
