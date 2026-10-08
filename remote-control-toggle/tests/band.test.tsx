import { describe, expect, mock, test } from 'claude-code/testing'
import type { CommandInfo, On } from 'claude-code'

const PLUGIN = 'remote-control-toggle'
const SESSION = 'session-abc'
const OFF = 'Control this session from your phone or claude.ai/code'
const ON = 'Disconnect Remote Control'
const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
} as const
const TYPED = { args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const
const SURFACES = ['terminal', 'desktop'] as const
const BAND = { options: { placement: 'band' } } as const

function rcCommand(description: string): CommandInfo {
  return { name: 'remote-control', description, source: 'builtin' }
}

// The engine beneath the plugin: a home folder holding this session's file
// (and another session's), whose bridgeSessionId `bridge()` reports.
function engine(on: On, bridge: () => string | undefined, env: Record<string, string> = {}) {
  const statuses: (string | undefined)[] = []
  on('ui.status', ($, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  mock.env(on, { HOME: '/home/me', ...env })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: SESSION }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('fs.list', ($, e) => {
    if (e.path !== '/home/me/.claude/sessions') throw new Error(`no such folder ${e.path}`)
    return {
      value: [
        { name: '11.json', kind: 'file', size: 10, mtimeMs: 0, isLink: false },
        { name: '22.json', kind: 'file', size: 10, mtimeMs: 0, isLink: false },
        { name: '22.abc.key', kind: 'file', size: 10, mtimeMs: 0, isLink: false },
      ],
    }
  })
  on('fs.read', ($, e) => {
    if (e.path === '/home/me/.claude/sessions/11.json') {
      return { value: JSON.stringify({ pid: 11, sessionId: 'someone-else', bridgeSessionId: 'cse_other' }) }
    }
    if (e.path === '/home/me/.claude/sessions/22.json') {
      const id = bridge()
      return { value: JSON.stringify({ pid: 22, sessionId: SESSION, ...(id ? { bridgeSessionId: id } : {}) }) }
    }
    throw new Error(`no such file ${e.path}`)
  })

  return statuses
}

const start = { cwd: '/tmp', isInteractive: true }

describe('band: the button toggles /remote-control in the terminal', () => {
  for (const surface of SURFACES) {
    test(`off, then on, then off by pressing (${surface})`, BAND, async ($, on) => {
      mock.clock(on)
      let bridgeId: string | undefined
      const runs: string[] = []
      engine(on, () => bridgeId)
      on('command.list', () => ({ value: [rcCommand(bridgeId ? ON : OFF)] }))
      on('session.surfaces', () => ({ value: ['terminal'] }))
      on('command.run', { command: 'remote-control' }, () => {
        runs.push('remote-control')
        bridgeId = bridgeId ? undefined : 'cse_123'
        return { text: '' }
      })

      await $.session.start({ ...start, surface })
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: PROPS })
      expect(await ui.find({ type: 'Text', text: /Remote Control off/ })).toBeDefined()
      expect((await ui.find({ key: 'toggle' }))?.props.label).toBe('Turn on')

      await ui.press({ key: 'toggle' })
      expect(runs).toEqual(['remote-control'])
      expect(await ui.find({ type: 'Text', text: /Remote Control on/ })).toBeDefined()
      expect((await ui.find({ key: 'toggle' }))?.props.label).toBe('Turn off')

      await ui.press({ key: 'toggle' })
      expect(runs).toHaveLength(2)
      expect((await ui.find({ key: 'toggle' }))?.props.label).toBe('Turn on')
    })
  }

  test('follows the person typing /rc, and the poll catches a drop', BAND, async ($, on) => {
    const clock = mock.clock(on)
    let bridgeId: string | undefined
    engine(on, () => bridgeId)
    on('command.list', () => ({ value: [rcCommand(bridgeId ? ON : OFF)] }))
    on('session.surfaces', () => ({ value: bridgeId ? ['terminal', 'mobile'] : ['terminal'] }))
    on('command.run', { command: 'remote-control' }, () => {
      bridgeId = bridgeId ? undefined : 'cse_123'
      return { text: '' }
    })

    await $.session.start({ ...start, surface: 'terminal' })
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: PROPS })
    expect((await ui.find({ key: 'toggle' }))?.props.label).toBe('Turn on')

    await $.command.run({ command: 'remote-control', ...TYPED })
    await clock.settle()
    expect((await ui.find({ key: 'toggle' }))?.props.label).toBe('Turn off')
    expect(await ui.find({ type: 'Text', text: /1 client/ })).toBeDefined()

    bridgeId = undefined
    await clock.advance(3000)
    expect((await ui.find({ key: 'toggle' }))?.props.label).toBe('Turn on')
  })
})

describe('band in the desktop app: no /remote-control in the command list', () => {
  test('reads on and off from the session file, and says what to type', BAND, async ($, on) => {
    const clock = mock.clock(on)
    let bridgeId: string | undefined
    engine(on, () => bridgeId)
    on('command.list', () => ({ value: [] }))
    on('session.surfaces', () => ({ value: ['desktop'] }))

    await $.session.start({ ...start, surface: 'desktop' })
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: PROPS })
    expect(await ui.find({ type: 'Text', text: /Remote Control off/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /type \/remote-control to turn it on/ })).toBeDefined()
    expect(await ui.find({ key: 'toggle' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /not available/ })).toBeUndefined()

    // The person types /remote-control; the desktop app connects it.
    bridgeId = 'cse_456'
    await clock.advance(3000)
    expect(await ui.find({ type: 'Text', text: /Remote Control on/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /turn it off/ })).toBeDefined()
    // The desktop app itself is no Remote Control client.
    expect(await ui.find({ type: 'Text', text: /client/ })).toBeUndefined()

    bridgeId = undefined
    await clock.advance(3000)
    expect(await ui.find({ type: 'Text', text: /Remote Control off/ })).toBeDefined()
  })

  test('a CLAUDE_CONFIG_DIR folder is read instead of the home one', async ($, on) => {
    mock.clock(on)
    engine(on, () => 'cse_1', { CLAUDE_CONFIG_DIR: '/home/me/.claude' })
    on('command.list', () => ({ value: [] }))
    on('session.surfaces', () => ({ value: ['desktop'] }))
    await $.session.start({ ...start, surface: 'desktop' })
    const { text } = await $.command.run({ command: 'rc-status', ...TYPED })
    expect(text).toBe('Remote Control is on.')
  })
})

describe('/rc-status and the edges', () => {
  test('/rc-status prints the state', async ($, on) => {
    mock.clock(on)
    engine(on, () => 'cse_1')
    on('command.list', () => ({ value: [rcCommand(ON)] }))
    on('session.surfaces', () => ({ value: ['terminal', 'mobile', 'mobile'] }))
    await $.session.start({ ...start, surface: 'terminal' })
    const { text } = await $.command.run({ command: 'rc-status', ...TYPED })
    expect(text).toBe('Remote Control is on, 2 clients attached.')
  })

  test('another session being connected does not count as this one', async ($, on) => {
    mock.clock(on)
    engine(on, () => undefined)
    on('command.list', () => ({ value: [] }))
    on('session.surfaces', () => ({ value: ['desktop'] }))
    await $.session.start({ ...start, surface: 'desktop' })
    const { text } = await $.command.run({ command: 'rc-status', ...TYPED })
    expect(text).toBe('Remote Control is off.')
  })

  test('a cloud session says it is not available', BAND, async ($, on) => {
    mock.clock(on)
    engine(on, () => undefined, { CLAUDE_CODE_REMOTE: 'true' })
    on('command.list', () => ({ value: [] }))
    on('session.surfaces', () => ({ value: [] }))
    await $.session.start({ ...start, surface: 'terminal' })
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: PROPS })
    expect(await ui.find({ type: 'Text', text: /not available in a cloud session/ })).toBeDefined()
    expect(await ui.find({ key: 'toggle' })).toBeUndefined()
  })
})

// The engine's own footer beneath the plugin: its mode labels, as drawn.
function footer(on: On) {
  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.modes.join(' & ')}</Text>
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine band</Text>
  })
}

describe('footer (the default): a label under the prompt, no band', () => {
  for (const surface of SURFACES) {
    test(`shows off, then on, beside the engine's modes (${surface})`, async ($, on) => {
      const clock = mock.clock(on)
      let bridgeId: string | undefined
      engine(on, () => bridgeId)
      footer(on)
      on('command.list', () => ({ value: surface === 'terminal' ? [rcCommand(bridgeId ? ON : OFF)] : [] }))
      on('session.surfaces', () => ({ value: [surface] }))

      await $.session.start({ ...start, surface })
      const modes = await $.ui.mount({ plugin: PLUGIN, surface, component: 'SessionMode', props: { modes: ['auto mode on'] } })
      expect((await modes.find({ type: 'Text' }))?.text).toBe('auto mode on & Remote Control off')

      bridgeId = 'cse_9'
      await clock.advance(3000)
      expect((await modes.find({ type: 'Text' }))?.text).toBe('auto mode on & Remote Control on')

      const band = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: PROPS })
      expect((await band.find({ type: 'Text', text: 'engine band' }))?.text).toBe('engine band')
      expect(await band.find({ text: /Remote Control/ })).toBeUndefined()
    })
  }

  test('a cloud session adds no label', async ($, on) => {
    mock.clock(on)
    engine(on, () => undefined, { CLAUDE_CODE_REMOTE: 'true' })
    footer(on)
    on('command.list', () => ({ value: [] }))
    on('session.surfaces', () => ({ value: [] }))
    await $.session.start({ ...start, surface: 'desktop' })
    const modes = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'SessionMode', props: { modes: [] } })
    expect((await modes.find({ type: 'Text' }))?.text).toBe('')
  })
})

describe('desktop app: a status line under its prompt', () => {
  test('sends off, then on, then off, each once', async ($, on) => {
    const clock = mock.clock(on)
    let bridgeId: string | undefined
    const statuses = engine(on, () => bridgeId)
    on('command.list', () => ({ value: [] }))
    on('session.surfaces', () => ({ value: ['desktop'] }))

    await $.session.start({ ...start, surface: 'desktop' })
    await clock.settle()
    expect(statuses).toEqual(['Remote Control off'])

    await clock.advance(3000)
    expect(statuses).toEqual(['Remote Control off'])

    bridgeId = 'cse_7'
    await clock.advance(3000)
    expect(statuses).toEqual(['Remote Control off', 'Remote Control on'])

    bridgeId = undefined
    await clock.advance(3000)
    expect(statuses).toEqual(['Remote Control off', 'Remote Control on', 'Remote Control off'])
  })

  test('the terminal gets no status line, only the footer label', async ($, on) => {
    const clock = mock.clock(on)
    const statuses = engine(on, () => 'cse_1')
    on('command.list', () => ({ value: [rcCommand(ON)] }))
    on('session.surfaces', () => ({ value: ['terminal'] }))
    await $.session.start({ ...start, surface: 'terminal' })
    await clock.advance(3000)
    expect(statuses.filter(text => text !== undefined)).toEqual([])
  })

  test('the band setting sends no status line', BAND, async ($, on) => {
    const clock = mock.clock(on)
    const statuses = engine(on, () => 'cse_1')
    on('command.list', () => ({ value: [] }))
    on('session.surfaces', () => ({ value: ['desktop'] }))
    await $.session.start({ ...start, surface: 'desktop' })
    await clock.advance(3000)
    expect(statuses.filter(text => text !== undefined)).toEqual([])
  })
})
