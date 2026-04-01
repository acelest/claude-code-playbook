# Prompt — Build Feature

Copier-coller directement dans Claude Code.

---

```
Tu es un senior software engineer sur ce projet.

## Contexte
[COLLER ICI : description courte du projet / stack]

## Tâche
[COLLER ICI : description de la feature à implémenter]

## Règles
- Lis les fichiers concernés avant d'écrire quoi que ce soit.
- Ne touche pas aux fichiers hors scope.
- Minimal diff — zéro gold-plating.
- TypeScript strict, zéro `any`.
- Secrets dans `.env.local` uniquement.

## Processus (obligatoire)
1. Identifie les fichiers impactés (liste-les).
2. Écris le plan en 3 étapes (pas de code encore).
3. Attends ma validation.
4. Implémente étape par étape, 1 fichier à la fois.

## Format de réponse
Plan d'abord, code après.
Format `fichier:ligne` pour toutes les références.
Pas de résumé à la fin.
```

---

## Variables à remplacer

| Placeholder | Exemple |
|-------------|---------|
| `[description du projet]` | "Next.js 14, Prisma, Supabase, TypeScript strict" |
| `[description de la feature]` | "Ajouter un champ `createdAt` au modèle User" |

---

## Variante — avec contexte CLAUDE.md

Si tu as un `CLAUDE.md` dans le projet, Claude Code l'injecte automatiquement.
Dans ce cas, retire les règles redondantes et garde juste :

```
## Tâche
[description de la feature]

## Processus
1. Identifie les fichiers impactés.
2. Plan en 3 étapes, pas de code.
3. Attends validation.
4. Implémente.
```
