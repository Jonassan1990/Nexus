# Migration Strategy — Phase 1.75 Product Rules

**Phase:** 1.75  
**Related:** [Product Rulebook](../PRODUCT_RULEBOOK.md) · [Phase 1.5 Inventory](../PHASE1_5_INVENTORY.md)

---

## 1. Intent

Adopt Product Rulebook + Design System templates **without** redesigning Dashboard, Tickets, Admin, or other features in place. Use a strangler approach: new work complies immediately; existing surfaces migrate module-by-module.

---

## 2. Compliance tiers

| Tier | Meaning |
| --- | --- |
| **T0 — Rules published** | Phase 1.75 docs are canonical (this phase). |
| **T1 — New work** | Any new screen/PR must pick a blueprint + DS templates/primitives. |
| **T2 — Shell aligned** | Module already uses `Page` / `PageHeader` / `Content` (started in Phase 1). |
| **T3 — Blueprint aligned** | Module body uses the matching template/pattern structure. |
| **T4 — State aligned** | Loading/empty/error/KPI/chart follow State Catalogue. |

---

## 3. Current baseline (post 1.5 / 1.75)

| Area | Tier | Notes |
| --- | --- | --- |
| Design System package | T1-ready | `@/design-system` complete |
| Product rules docs | T0 | This document set |
| App shell + ModuleHeader | T2 | Page / PageHeader / Content wired |
| Empty / access panels | Partial T4 | WorkspacePanel + EmptyState bridge |
| Dashboard / Tickets / Admin bodies | T2-ish chrome only | Legacy panels remain—**do not rewrite in 1.75** |

---

## 4. Recommended migration order

Order by user criticality × structural fit (no big-bang):

1. **Notifications** — List blueprint; low coupling  
2. **Audit** — List / Report-like  
3. **Attachments library** — List  
4. **Reports** — Report blueprint (charts already tokenised)  
5. **Integrations** — Settings  
6. **Admin** — Settings (section nav → SidebarGroup)  
7. **Jira / Approvals / Clarifications / Escalations** — List → Details  
8. **Tickets** — List → Details (largest; last among queues)  
9. **Dashboard** — Dashboard blueprint (KPI → MetricCard)  
10. **Release Plan** — hybrid List/Report; migrate after queues  

Each step: map regions to blueprint → replace chrome with template → swap states → leave domain logic untouched.

---

## 5. PR acceptance checklist (from T1 onward)

- [ ] Blueprint named in PR description  
- [ ] Uses `@/design-system` template or justified deviation  
- [ ] PageHeader holds primary action  
- [ ] Filters/search in Toolbar/FilterBar/CommandBar  
- [ ] Loading / empty / error from State Catalogue  
- [ ] Charts/KPIs use semantic tokens  
- [ ] No new hardcoded colours / decorative radius  
- [ ] Keyboard + focus verified for new controls  

---

## 6. Explicit non-goals (blocked without new phase)

- Visual redesign of Scania chrome  
- Reordering IA for preference  
- Changing workflow/business rules under the guise of “alignment”  
- Mass replace of all `.panel` usages in one PR  

---

## 7. Documentation ownership

| Doc | Owner mindset |
| --- | --- |
| PRODUCT_RULEBOOK | Product + Design |
| INFORMATION_ARCHITECTURE | Product |
| NAVIGATION_GUIDELINES | Product + FE |
| PAGE_BLUEPRINTS | Design + FE |
| STATE_CATALOGUE | Design + FE |
| MIGRATION_STRATEGY | FE lead |

Update IA when modules are added/removed; update blueprints when a new page type is truly required.

---

## 8. Definition of done for future “Product Rules adoption” phase

- All sidebar modules classified at **T3** or better  
- No net-new UI outside blueprints  
- State Catalogue used for all async regions  
- Migration checklist enforced in review  

**Phase 1.75 itself is done when this documentation set is reviewed and accepted—not when all modules are migrated.**
