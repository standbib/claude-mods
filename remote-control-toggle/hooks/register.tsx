import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { RcState } from '../types'

const COMMAND = 'remote-control'
const POLL_MS = 3000

const rc = atom({ plugin: 'remote-control-toggle', key: 'rc' } as const, {
  status: 'unknown',
  clients: 0,
  canToggle: false,
  isPending: false,
} as RcState)

// The session's own record in <config>/sessions/<pid>.json. Claude Code writes
// bridgeSessionId there while Remote Control is connected and clears it after,
// in the terminal and in the desktop app alike.
let sessionFilePath: string | undefined

async function sessionsDir($: EngineInterface): Promise<string | undefined> {
  const configDir = await $.env.get('CLAUDE_CONFIG_DIR')
  if (configDir) return `${configDir}/sessions`
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))

  return home ? `${home}/.claude/sessions` : undefined
}

async function readSessionFile($: EngineInterface, path: string, id: string) {
  try {
    const record = JSON.parse(await $.fs.read(path)) as {
      sessionId?: unknown
      bridgeSessionId?: unknown
    }

    return record.sessionId === id ? record : undefined
  } catch {
    return undefined
  }
}

async function bridgeFromSessionFile($: EngineInterface): Promise<boolean | undefined> {
  const id = await $.session.id()
  if (sessionFilePath) {
    const record = await readSessionFile($, sessionFilePath, id)
    if (record) return typeof record.bridgeSessionId === 'string' && record.bridgeSessionId !== ''
    sessionFilePath = undefined
  }
  const dir = await sessionsDir($)
  if (!dir) return undefined
  let entries: Awaited<ReturnType<EngineInterface['fs']['list']>>
  try {
    entries = await $.fs.list(dir)
  } catch {
    return undefined
  }
  for (const entry of entries) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue
    const path = `${dir}/${entry.name}`
    const record = await readSessionFile($, path, id)
    if (record) {
      sessionFilePath = path

      return typeof record.bridgeSessionId === 'string' && record.bridgeSessionId !== ''
    }
  }

  return undefined
}

async function refresh($: EngineInterface): Promise<RcState['status']> {
  if ((await $.env.get('CLAUDE_CODE_REMOTE')) === 'true') {
    await update($, rc, state => ({ ...state, status: 'unavailable' as const, canToggle: false }))

    return 'unavailable'
  }
  $.ui.invalidate('command.describe')
  const [commands, surfaces, fromFile, fromEnv] = await Promise.all([
    $.command.list(),
    $.session.surfaces(),
    bridgeFromSessionFile($),
    $.env.get('CLAUDE_CODE_BRIDGE_SESSION_ID'),
  ])
  // The terminal lists /remote-control (its description flips to "Disconnect"
  // while connected); the desktop app handles the typed command itself.
  const command = commands.find(c => c.name === COMMAND)
  const fromCommand = command ? /^disconnect/i.test(command.description) : undefined
  const isOn = fromFile === true || Boolean(fromEnv) || fromCommand === true
  const isKnown = fromFile !== undefined || command !== undefined || Boolean(fromEnv)
  const status: RcState['status'] = isOn ? 'on' : isKnown ? 'off' : 'unknown'
  const clients = surfaces.filter(s => s === 'mobile').length
  await update($, rc, state => ({ ...state, status, clients, canToggle: command !== undefined }))

  return status
}

function clientsText(clients: number, joiner: string): string {
  return clients === 0 ? '' : `${joiner}${clients} client${clients === 1 ? '' : 's'}`
}

function statusLine(state: RcState): string {
  if (state.status === 'unavailable') return 'Remote Control is not available in a cloud session.'
  if (state.status === 'unknown') return 'Remote Control status unknown.'
  const clients = clientsText(state.clients, ', ')

  return `Remote Control is ${state.status}${clients ? `${clients} attached` : ''}.`
}

async function toggle($: EngineInterface) {
  const before = await read($, rc)
  if (before.isPending || !before.canToggle) return
  await update($, rc, state => ({ ...state, isPending: true }))
  try {
    await $.command.run({ command: COMMAND })
    const status = await refresh($)
    $.ui.toast(`Remote Control ${status}`)
  } catch (error) {
    $.ui.toast(`Remote Control toggle failed: ${error instanceof Error ? error.message : String(error)}`)
    await refresh($)
  } finally {
    await update($, rc, state => ({ ...state, isPending: false }))
  }
}

function footerLabel(state: RcState): string | undefined {
  if (state.status !== 'on' && state.status !== 'off') return undefined
  const clients = clientsText(state.clients, ', ')

  return `Remote Control ${state.status}${clients}`
}

export const register: Register = (on, options) => {
  const placement = options.placement === 'band' ? 'band' : 'footer'
  let poll: { cancel: () => void } | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'rc-status',
      description: 'Show whether Remote Control is on',
    })
    void refresh($)
    poll?.cancel()
    poll = $.clock.every(POLL_MS, () => void refresh($))

    return next(e)
  })

  on('command.run', { command: 'rc-status' }, async $ => {
    await refresh($)

    return { text: statusLine(await read($, rc)) }
  })

  // The person's own /rc or /remote-control in the terminal: re-read once it ran.
  on('command.run', { command: COMMAND }, async ($, e, next) => {
    const ran = await next(e)
    void refresh($)

    return ran
  }).catch(($, e, next) => next(e))

  on('session.attach', async ($, e, next) => {
    const joined = await next(e)
    void refresh($)

    return joined
  })

  on('session.detach', async ($, e, next) => {
    const left = await next(e)
    if (e.reason !== 'end') void refresh($)

    return left
  })

  // Default: one more dim label in the footer under the prompt, beside the
  // engine's own modes; it takes no row of its own.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (placement !== 'footer') return next(e)
    const label = footerLabel(await read($, rc))
    if (!label) return next(e)

    return next({ ...e, props: { ...e.props, modes: [...e.props.modes, label] } })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (placement !== 'band' || e.props.hasSurvey) return next(e)
    const state = await read($, rc)
    const { Box, Button, Text } = $.ui.resolve(e)

    if (state.status === 'unavailable' || state.status === 'unknown') {
      return (
        <Box>
          <Text dimColor>○ {statusLine(state)}</Text>
        </Box>
      )
    }

    const isOn = state.status === 'on'

    return (
      <Box>
        <Text bold color={isOn ? 'success' : 'inactive'}>
          {isOn ? '●' : '○'} Remote Control {isOn ? 'on' : 'off'}
        </Text>
        <Text dimColor>{clientsText(state.clients, ' · ')} </Text>
        {state.canToggle ? (
          <Button
            key="toggle"
            hotkey="r"
            variant={isOn ? 'secondary' : 'primary'}
            dimColor={state.isPending}
            label={state.isPending ? 'Working…' : isOn ? 'Turn off' : 'Turn on'}
            onPress={() => void toggle($)}
          />
        ) : (
          <Text dimColor>· type /remote-control to turn it {isOn ? 'off' : 'on'}</Text>
        )}
      </Box>
    )
  })
}
