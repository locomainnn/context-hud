# context-hud

A Claude Code mod that puts a compact HUD bar above the prompt in the **Claude desktop app**, inspired by the claude-hud statusline. It only draws on the desktop surface, so a terminal statusline (like claude-hud) stays untouched.

What the bar shows:

- **Model** and **project** folder with git branch (`*` when there are uncommitted changes)
- **Context window**: a colored bar with percentage and tokens used (green < 70%, yellow < 85%, red above)
- **Rate limits**: 5-hour and 7-day usage with time until reset, when Claude Code reports them
- **Session duration**
- **Tools**: the tool running right now (with its file or command) and a count per tool
- **Agents**: running subagents with type, model and elapsed time
- **Todos**: the active todo and progress (done/total)

`/hud` prints the HUD as text. Where no desktop surface draws the bar (for example a server session opened in the desktop app through Remote Control), a one-line HUD notice is added under each answer instead; `/hud uit` turns that off and `/hud aan` back on.

## Install

In the desktop app: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `locomainnn/context-hud`, then **Add plugin**.

From a terminal session:

```
/plugin install context-hud --marketplace locomainnn/context-hud
```

From a shell:

```
claude plugin install context-hud --marketplace locomainnn/context-hud
```

## License

MIT
