# hello-world

Plugin d'exemple du marketplace. Copier ce dossier pour démarrer un nouveau plugin.

## Contenu

| Chemin | Rôle |
| --- | --- |
| `.claude-plugin/plugin.json` | Manifeste du plugin (seul fichier obligatoire) |
| `skills/exemple-skill/SKILL.md` | Skill → `/hello-world:exemple-skill` |
| `agents/exemple-agent.md` | Sous-agent `exemple-agent` |
| `hooks/hooks.json` | Hooks (ici `SessionStart`) |
| `.mcp.json` | Serveurs MCP fournis par le plugin |
| `scripts/` | Scripts appelés par les hooks/commandes |

## À savoir

Une skill se déclare sous `skills/<nom>/SKILL.md` et devient la slash command
`/hello-world:<nom>`. La forme héritée `commands/<nom>.md` (fichier plat) produit
la même chose, mais ne permet pas d'embarquer `references/`, `scripts/` ou
`assets/` à côté : la réserver aux plugins existants.

L'invocation automatique par Claude ne dépend pas du répertoire mais du
frontmatter : `disable-model-invocation: true` réserve la skill à l'appel manuel.

Dans les chemins, utiliser `${CLAUDE_PLUGIN_ROOT}` pour référencer la racine du plugin.
