import {
  checksSummary,
  codeLinesChanged,
  isPublishedMessage,
  lastChangeByFunction,
  mergesFrom,
  missingMigrations,
  panelNote,
  shortDate,
} from './board.mjs'

const PANE = 'gate-board'
const API = 'https://api.supabase.com/v1/projects/'

// Paths a Lovable publish doesn't ship, as git pathspecs
const NOT_SITE = [':!*.md', ':!.claude', ':!.planning', ':!ops', ':!docs', ':!supabase', ':!scripts', ':!graphify-out', ':!tests', ':!e2e', ':!.github']

// The last board this session worked out, redrawn on each render
let board = { status: 'idle' }

export function register(on) {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'gate',
        description: 'What is waiting on you: open PRs, the deploy gate, merges not yet published',
        immediate: true,
      })
    } catch {
      // A taken name leaves the rest of the mod working
    }
    return next(e)
  })

  on('command.run', { command: 'gate' }, async ($) => {
    await $.ui.open({ id: PANE, title: 'Waiting on you', focus: true, closeOnEscape: true })
    await refresh($)
    return {}
  })

  // "I merged 116 and published" marks main as live
  on('prompt.submit', async ($, e, next) => {
    if (isPublishedMessage(e.text)) await markPublished($)
    return next(e)
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const width = Math.max(30, e.props.bodyColumns || 60)
    const buttons = Box({
      flexDirection: 'row',
      columnGap: 3,
      children: [
        Button({ key: 'refresh', label: 'Refresh', hotkey: 'r', plain: true, onPress: () => refresh($) }),
        Button({
          key: 'published',
          label: 'I just published',
          hotkey: 'p',
          plain: true,
          onPress: async () => {
            await markPublished($)
            await refresh($)
          },
        }),
      ],
    })
    return Box({ flexDirection: 'column', children: [...drawBoard(Text, width), Text({ children: [' '] }), buttons] })
  })
}

// Works out the whole board, then redraws the pane
async function refresh($) {
  board = { ...board, status: 'loading' }
  $.ui.invalidate('ui.render')

  const top = await run($, ['git', 'rev-parse', '--show-toplevel'])
  if (!top.ok) {
    board = { status: 'error', error: 'This folder is not a git repository.' }
    $.ui.invalidate('ui.render')
    return
  }
  const repo = top.out.trim()
  const fetched = await run($, ['git', 'fetch', 'origin', '--quiet'], repo, 20000)

  board = {
    status: 'ready',
    repo,
    name: repo.split('/').pop(),
    isOffline: !fetched.ok,
    prs: await readPRs($, repo),
    gate: await readDeployGate($, repo),
    publish: await readPublish($, repo),
  }
  $.ui.invalidate('ui.render')
}

// Runs a command without a shell; never throws
async function run($, argv, cwd, timeoutMs) {
  try {
    const init = cwd ? { cwd, timeoutMs: timeoutMs || 30000 } : { timeoutMs: timeoutMs || 30000 }
    const r = await $.process.run(argv, init)
    return { ok: r.exitCode === 0, out: r.stdout || '', err: (r.stderr || '').trim().split('\n')[0] }
  } catch (error) {
    return { ok: false, out: '', err: String(error && error.message ? error.message : error) }
  }
}

async function readPRs($, repo) {
  const r = await run($, ['gh', 'pr', 'list', '--state', 'open', '--limit', '20', '--json', 'number,title,isDraft,body,statusCheckRollup'], repo)
  if (!r.ok) return { error: 'Could not read PRs: ' + (r.err || 'gh failed') }
  try {
    return {
      items: JSON.parse(r.out).map((p) => ({
        number: p.number,
        title: p.title,
        isDraft: p.isDraft,
        checks: checksSummary(p.statusCheckRollup),
        panel: panelNote(p.body),
      })),
    }
  } catch {
    return { error: 'Could not read PRs: gh returned something unexpected.' }
  }
}

// Compares main with what Supabase is running, through read-only API calls
async function readDeployGate($, repo) {
  let ref = ''
  try {
    ref = (await $.fs.read(repo + '/supabase/.temp/project-ref')).trim()
  } catch {
    return { skipped: 'No linked Supabase project in this repo.' }
  }
  let token = (await $.env.get('SUPABASE_ACCESS_TOKEN')) || ''
  if (!token) {
    try {
      token = (await $.fs.read((await $.env.get('HOME')) + '/.supabase/access-token')).trim()
    } catch {
      return { skipped: 'No Supabase access token, so the deploy gate is not checked.' }
    }
  }
  const headers = { Authorization: 'Bearer ' + token }

  let functions = []
  let applied = []
  try {
    const f = await $.http.fetch(API + ref + '/functions', { headers })
    const m = await $.http.fetch(API + ref + '/database/migrations', { headers })
    if (!f.ok || !m.ok) return { error: `Supabase answered ${f.status} / ${m.status}.` }
    functions = JSON.parse(f.text)
    applied = JSON.parse(m.text)
  } catch {
    return { error: 'Could not reach Supabase.' }
  }

  const tree = await run($, ['git', 'ls-tree', '--name-only', 'origin/main', 'supabase/migrations/'], repo)
  const missing = tree.ok ? missingMigrations(tree.out, applied) : []

  const dirs = await run($, ['git', 'ls-tree', '-d', '--name-only', 'origin/main', 'supabase/functions/'], repo)
  const onMain = dirs.ok ? dirs.out.split('\n').map((d) => d.trim().split('/').pop()).filter((d) => d && !d.startsWith('_')) : []
  const live = new Map(functions.map((f) => [f.slug, f]))
  const oldest = Math.min(...functions.map((f) => f.updated_at)) / 1000
  const log = await run($, ['git', 'log', '--format=@%ct', '--name-only', '--since=@' + Math.floor(oldest), 'origin/main', '--', 'supabase/functions'], repo)
  const changed = log.ok ? lastChangeByFunction(log.out) : {}

  const behind = []
  for (const slug of onMain) {
    const fn = live.get(slug)
    const mainAt = changed[slug]
    if (!fn || !mainAt || mainAt <= fn.updated_at / 1000 + 60) continue
    // Only code counts: a comment-only change doesn't need a deploy
    const base = await run($, ['git', 'log', '-1', '--format=%H', '--until=@' + Math.floor(fn.updated_at / 1000), 'origin/main', '--', 'supabase/functions/' + slug], repo)
    const range = base.ok && base.out.trim() ? [base.out.trim(), 'origin/main'] : ['origin/main']
    const diff = await run($, ['git', 'diff', ...range, '--', 'supabase/functions/' + slug], repo)
    if (!diff.ok || codeLinesChanged(diff.out) > 0) behind.push({ slug, mainAt: mainAt * 1000, liveAt: fn.updated_at })
  }

  return {
    missing,
    behind,
    neverDeployed: onMain.filter((slug) => !live.has(slug)),
    liveNotOnMain: dirs.ok ? functions.map((f) => f.slug).filter((slug) => !onMain.includes(slug)) : [],
  }
}

// PRs merged to main since the user last said they published
async function readPublish($, repo) {
  const mark = await $.store.get('published:' + repo)
  if (!mark) return { isUnknown: true }
  // Only changes the site ships: notes, docs and edge functions don't go out with a publish
  const log = await run($, ['git', 'log', '--first-parent', '--format=%s%x1f%b%x1e', mark.sha + '..origin/main', '--', '.', ...NOT_SITE], repo)
  if (!log.ok) return { error: 'Could not compare main with the last publish.', at: mark.at }
  return { at: mark.at, merges: mergesFrom(log.out) }
}

// Records the commit main is on right now as the published one
async function markPublished($) {
  const top = await run($, ['git', 'rev-parse', '--show-toplevel'])
  if (!top.ok) return
  const repo = top.out.trim()
  const remote = await run($, ['git', 'ls-remote', 'origin', 'refs/heads/main'], repo, 15000)
  const sha = remote.ok ? remote.out.split(/\s/)[0] : ''
  if (!/^[0-9a-f]{40}$/.test(sha)) return
  await $.store.set('published:' + repo, { sha, at: await $.clock.now() })
  $.ui.toast('Marked main as published')
}

// The pane's lines, from the last board worked out
function drawBoard(Text, width) {
  const line = (text, style) => Text({ ...(style || {}), wrap: 'truncate-end', children: [text.length > width ? text.slice(0, width - 1) + '…' : text] })
  const head = (text) => line(text, { bold: true })
  const dim = (text) => line(text, { dimColor: true })
  const blank = () => Text({ children: [' '] })

  if (board.status === 'idle' || (board.status === 'loading' && !board.prs)) return [dim('Checking…')]
  if (board.status === 'error') return [line(board.error)]

  const out = [head('Waiting on you · ' + board.name)]
  if (board.status === 'loading') out.push(dim('Checking again…'))
  if (board.isOffline) out.push(dim('Could not reach GitHub, so this is what this Mac last fetched.'))

  out.push(blank(), head('Pull requests'))
  if (board.prs.error) out.push(dim('  ' + board.prs.error))
  else if (board.prs.items.length === 0) out.push(dim('  None open.'))
  for (const pr of board.prs.items || []) {
    out.push(line(`  #${pr.number} ${pr.title}`))
    const style = pr.checks === 'checks failing' ? { color: 'red' } : { dimColor: true }
    out.push(line(`     ${pr.isDraft ? 'draft · ' : ''}${pr.checks} · ${pr.panel}`, style))
  }

  out.push(blank(), head('Deploy gate'))
  const gate = board.gate
  if (gate.skipped || gate.error) out.push(dim('  ' + (gate.skipped || gate.error)))
  else {
    const clear = !gate.behind.length && !gate.neverDeployed.length && !gate.liveNotOnMain.length && !gate.missing.length
    if (clear) out.push(dim('  Nothing waiting. What is live matches main.'))
    if (gate.behind.length) {
      out.push(line('  Functions with code on main that is not live'))
      for (const f of gate.behind) out.push(dim(`    ${f.slug}: changed ${shortDate(f.mainAt)}, live since ${shortDate(f.liveAt)}`))
    }
    if (gate.neverDeployed.length) {
      out.push(line('  Functions on main that were never deployed'))
      out.push(dim('    ' + gate.neverDeployed.join(', ')))
    }
    if (gate.liveNotOnMain.length) {
      out.push(line('  Still live, but deleted from main'))
      out.push(dim('    ' + gate.liveNotOnMain.join(', ')))
    }
    if (gate.missing.length) {
      const first = gate.missing[0].version
      const since = `${Number(first.slice(4, 6))}/${Number(first.slice(6, 8))}`
      out.push(line(`  ${gate.missing.length} migration${gate.missing.length === 1 ? '' : 's'} on main, missing from the database's history (since ${since})`))
      for (const m of gate.missing.slice(0, 5)) out.push(dim('    ' + m.name))
      if (gate.missing.length > 5) out.push(dim(`    and ${gate.missing.length - 5} more`))
      out.push(dim('    Applied by hand, or not at all. A db push would run them again.'))
    }
  }

  out.push(blank(), head('Not published yet'))
  const pub = board.publish
  if (pub.isUnknown) out.push(dim('  After you publish in Lovable, say "I published" here or press p.'))
  else if (pub.error) out.push(dim('  ' + pub.error))
  else if (pub.merges.length === 0) out.push(dim(`  Nothing new since you published on ${shortDate(pub.at)}.`))
  else {
    out.push(line(`  ${pub.merges.length} change${pub.merges.length === 1 ? '' : 's'} to the site on main since you published on ${shortDate(pub.at)}`))
    for (const m of pub.merges.slice(0, 5)) out.push(dim(`    ${m.pr ? '#' + m.pr + ' ' : ''}${m.title}`))
    if (pub.merges.length > 5) out.push(dim(`    and ${pub.merges.length - 5} more`))
  }
  return out
}
