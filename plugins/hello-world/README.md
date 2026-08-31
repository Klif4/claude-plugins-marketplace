# hello-world

Plugin d'exemple du marketplace. Copier ce dossier pour démarrer un nouveau plugin.

## Contenu

| Chemin | Rôle |
| --- | --- |
| `.claude-plugin/plugin.json` | Manifeste du plugin (seul fichier obligatoire) |
| `commands/hello.md` | Slash command `/hello-world:hello` |
| `agents/exemple-agent.md` | Sous-agent `exemple-agent` |
| `skills/exemple-skill/SKILL.md` | Skill chargée automatiquement selon le contexte |
| `hooks/hooks.json` | Hooks (ici `SessionStart`) |
| `.mcp.json` | Serveurs MCP fournis par le plugin |
| `scripts/` | Scripts appelés par les hooks/commandes |

Dans les chemins, utiliser `${CLAUDE_PLUGIN_ROOT}` pour référencer la racine du plugin.
