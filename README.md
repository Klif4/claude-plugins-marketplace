# klif-marketplace

Marketplace de plugins pour [Claude Code](https://claude.com/claude-code).

## Installation

```bash
# Depuis GitHub
/plugin marketplace add Klif4/claude-plugins-marketplace

# Ou depuis un chemin local (dev)
/plugin marketplace add /home/klif/Work/claude-plugins-marketplace
```

Puis :

```bash
/plugin install hello-world@klif-marketplace
/plugin            # interface interactive
```

## Plugins disponibles

| Plugin | Description |
| --- | --- |
| `hello-world` | Plugin d'exemple servant de gabarit. |
| `software-craftsmanship` | Boucle BDD → tests → implémentation, trois agents cloisonnés. TypeScript, Vitest, Cucumber, Immutable. |

## Ajouter un plugin

1. Copier le gabarit :
   ```bash
   cp -r plugins/hello-world plugins/mon-plugin
   ```
2. Éditer `plugins/mon-plugin/.claude-plugin/plugin.json` (`name`, `description`, `version`).
3. Ajouter une entrée dans `.claude-plugin/marketplace.json` :
   ```json
   {
     "name": "mon-plugin",
     "source": "./plugins/mon-plugin",
     "description": "…",
     "version": "0.1.0"
   }
   ```
4. Valider : `./scripts/validate.sh`
5. Tester localement : `/plugin marketplace update klif-marketplace`

## Structure

```
.
├── .claude-plugin/
│   └── marketplace.json      # catalogue (obligatoire, à la racine)
├── plugins/
│   ├── hello-world/
│   │   ├── .claude-plugin/
│   │   │   └── plugin.json   # manifeste du plugin
│   │   ├── skills/           # skills → /plugin:nom (dossier/SKILL.md)
│   │   ├── agents/           # sous-agents (.md)
│   │   ├── hooks/hooks.json  # hooks
│   │   ├── scripts/          # scripts exécutables
│   │   └── .mcp.json         # serveurs MCP
│   └── software-craftsmanship/
│       ├── .claude-plugin/plugin.json
│       ├── skills/           # craft, craft-setup, craft-conventions, craft-review
│       ├── agents/           # bdd-writer, test-writer, implementer
│       ├── hooks/hooks.json  # garde PreToolUse dispatchée sur agent_type
│       └── scripts/          # craft-guard.sh
└── scripts/validate.sh
```

## Sources de plugins supportées

`source` accepte un chemin relatif (`./plugins/x`), ou un objet :

```json
{ "source": { "source": "github", "repo": "owner/repo" } }
{ "source": { "source": "git", "url": "https://exemple.com/repo.git" } }
```
