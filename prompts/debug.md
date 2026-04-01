# Prompt — Debug

Copier-coller directement dans Claude Code.

---

```
Tu es un expert en debugging.

## Erreur
[COLLER ICI : message d'erreur complet + stack trace]

## Contexte
- Fichier : [fichier:ligne]
- Ce que je faisais : [action qui a déclenché l'erreur]
- Stack : [ex: Next.js 14, Node 20, TypeScript]

## Règles
- Reproduis avant de corriger.
- Hypothèse en une phrase avant tout fix.
- Un fix à la fois. Vérifie avant de passer au suivant.
- Minimal diff — ne touche qu'à ce qui cause le bug.

## Format de réponse obligatoire
**Root cause :** [une phrase]
**Fix :** [ce qui change et pourquoi]
**Vérification :** [commande ou test à lancer pour confirmer]
```

---

## Variables à remplacer

| Placeholder | Exemple |
|-------------|---------|
| `[message d'erreur]` | `TypeError: Cannot read properties of undefined (reading 'id')` |
| `[fichier:ligne]` | `src/lib/user.ts:42` |
| `[action déclenchante]` | "appel à `getUserById()` après login" |

---

## Variante — bug de performance

```
Tu es un expert en performance web.

## Problème
[description du symptôme : "la page met 4s à charger", "N+1 query sur /users", etc.]

## Contexte
[stack + fichier suspect si connu]

## Règles
- Mesure d'abord (profiler, query count, bundle size).
- Identifie le bottleneck exact avant toute optimisation.
- 1 optimisation à la fois, mesure l'impact.

## Format
**Bottleneck :** [où et pourquoi]
**Fix :** [changement]
**Gain estimé :** [ordre de grandeur]
```

---

## Variante — bug de type TypeScript

```
## Erreur TypeScript
[coller l'erreur tsc exacte]

## Fichier
[fichier:ligne]

Trouve la cause de l'erreur de type.
Ne cast pas avec `as` sauf si aucune autre option.
Explique pourquoi le type est incorrect.
```
