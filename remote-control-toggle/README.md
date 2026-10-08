# remote-control-toggle

A Claude Code mod that shows whether Remote Control is on for the current session.

By default it shows a small line under the prompt: "Remote Control off", or
"Remote Control on" plus the number of attached phones. In the terminal it is a
dim label in the footer row next to the mode labels. In the desktop app it is the
mod's status line, which the app draws under its prompt. Neither takes space from
the conversation. `/rc-status`
prints the same thing as text. Turn Remote Control on or off by typing
`/remote-control` (or `/rc`) as usual.

Install once, from any terminal session of Claude Code:

```
/plugin install remote-control-toggle --marketplace standbib/claude-mods
```

Answer `y` to add the marketplace, then pick the user scope. It is active from
then on in the terminal and in local sessions of the Claude desktop app.

## A band with a button instead

Set **placement** to `band` in `/config` to get a row above the prompt instead.
In the terminal that row has a Turn on / Turn off button (hotkey `r` when the
band has focus). The desktop app runs `/remote-control` itself, so there the band
shows the state and tells you what to type.

## How it knows

The on/off state comes from this session's record in `~/.claude/sessions/`
(or `$CLAUDE_CONFIG_DIR/sessions/`), which Claude Code updates whenever Remote
Control connects or disconnects. The mod re-checks every 3 seconds. Remote
Control is not available inside cloud sessions, and the mod shows nothing there.

## Developing

```
claude --plugin-dir ./remote-control-toggle
claude plugin validate .
claude plugin test ./remote-control-toggle
```
