---
name: exemple-skill
description: Skill d'exemple. Utiliser quand l'utilisateur demande à voir comment un plugin expose une skill.
argument-hint: "[nom]"
allowed-tools: Bash(echo:*)
---

# Skill d'exemple

Salue l'utilisateur nommé "$ARGUMENTS" (ou "le monde" si aucun argument n'est
fourni), puis rappelle en une phrase à quoi sert ce plugin d'exemple.

## Structure d'une skill

- `SKILL.md` — instructions chargées dans le contexte (garder court).
- `references/` — documentation détaillée, lue à la demande.
- `scripts/` — scripts exécutables appelés par la skill.
- `assets/` — gabarits et fichiers statiques.

## Frontmatter utile

- `description` — détermine quand Claude charge la skill automatiquement.
- `disable-model-invocation: true` — réserve la skill à l'appel manuel
  (`/hello-world:exemple-skill`).
- `argument-hint` / `allowed-tools` — aide à la saisie et restriction d'outils.
