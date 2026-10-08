# remote-control-toggle

A Claude Code mod for the terminal: a one-line band above the prompt that shows
whether Remote Control is on, how many phones or web clients are attached, and a
button that turns it on or off (same as typing `/rc`). `/rc-status` prints the
same line as text.

Install once, from any terminal session of Claude Code:

```
/plugin install remote-control-toggle --marketplace standbib/claude-mods
```

Answer `y` to add the marketplace, then pick the user scope. It is active from
then on in every terminal session.

To run it from a checkout instead while developing:

```
claude --plugin-dir ./remote-control-toggle
```

Checks: `claude plugin validate .` at the repo root (reads the marketplace and the
mod) and `claude plugin test ./remote-control-toggle`.

Remote Control is not available inside cloud sessions, and the band says so there.
