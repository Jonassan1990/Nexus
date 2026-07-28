# Information Architecture — Nexus Support Portal

**Phase:** 1.75  
**Related:** [Product Rulebook](../PRODUCT_RULEBOOK.md)

---

## 1. Purpose

Describe the product’s information structure: what users can reach, how modules relate, and which blueprint each surface uses. This is the map—not a redesign.

---

## 2. Application shell

```
┌─────────────────────────────────────────────────────────────┐
│ TopBar — brand, search, persona/role, notifications, menu   │
├──────────────┬──────────────────────────────────────────────┤
│ Sidebar      │ main#main-content                            │
│ (modules)    │   Page → PageHeader → Toolbar? → Content     │
│              │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

- **TopBar:** cross-cutting identity, global search, attention, persona.  
- **Sidebar:** primary navigation; compact and mobile drawer variants.  
- **Workspace:** one active module at a time.

---

## 3. Module inventory (as shipped)

| Module key | Label | Audience (role gate) | Dominant blueprint |
| --- | --- | --- | --- |
| `dashboard` | Command Center | All roles | Command Center |
| `tickets` | Ticket List | All roles | List → Details |
| `knowledge` | Knowledge | All roles | Knowledge Experience |
| `releasePlan` | Release Plan | All roles | List / board (Report-like filters) |
| `approvals` | Approvals | Approver roles | List → Details |
| `globalization` | Globalization | Approver roles | List → Details |
| `clarifications` | Clarifications | All roles | List → Details |
| `jira` | Jira Sync | Execution roles | List / queue |
| `escalations` | Escalations | Governance roles | List → Details |
| `notifications` | Notifications | All roles | List |
| `audit` | Audit | Governance roles | List / Report |
| `attachments` | Attachments | All roles | List / library |
| `integrations` | Integrations | Admin | Settings |
| `admin` | Admin | Admin | Settings |
| `reports` | Reports | Governance roles | Report |

Role gates are product security boundaries. UI must not invent alternate nav trees that bypass them.

---

## 4. Entity model (conceptual)

```
Persona / Role
    └─ Modules (visibility)
Ticket
    ├─ Workflow steps / approvals
    ├─ Clarification threads
    ├─ Escalations
    ├─ Jira link / sync state
    ├─ Attachments
    ├─ Comments / audit events
    └─ Notifications (derived)
KnowledgeArticle
    ├─ Category tree
    ├─ Versions / review
    ├─ Attachments
    └─ Related articles
Product / PRU / Release / Sprint  (planning dimensions)
Integrations / Admin config       (platform)
```

**Primary objects:** Ticket (work) and KnowledgeArticle (operational knowledge). Most modules are lenses on tickets; Knowledge is a separate operational content system.

---

## 5. Common page structures (observed)

| Structure | Where it appears today | Standard blueprint |
| --- | --- | --- |
| KPI strip + panels | Dashboard | Dashboard |
| Filter chips + queue/table + detail | Tickets, Jira, Approvals | List / Details |
| Tabbed detail | Ticket detail, Function mapping, Release plan | Details |
| Side nav + config panel | Admin, Integrations | Settings |
| Filter command bar + charts + tables | Reports | Report |
| Empty / restricted panels | Many modules when no entity or no access | States (Empty / Error) |

---

## 6. Mandatory hierarchies

### 6.1 Module page
`PageHeader` → optional `Toolbar` → `Content` → one or more `Section`/`Panel`.

### 6.2 List → Details
1. List blueprint shows searchable/filterable collection.  
2. Selecting a row opens Details (same module or tickets module with tab).  
3. Details may use `SplitView` (list retained | inspector) on desktop; stack on small screens.

### 6.3 Settings
`PageHeader` → optional settings nav (`SidebarGroup`) → `FormSection` panels → `ActionBar` save.

### 6.4 Reports
`PageHeader` → `CommandBar` filters → summary KPIs → charts section → data table section.

---

## 7. Cross-links (information flow)

| From | To | Rule |
| --- | --- | --- |
| Dashboard attention / KPI | Target module (+ ticket when known) | Deep link with context |
| Notification item | Source module / ticket / tab | Preserve unread handling in product logic |
| Approval / clarification / escalation queues | Ticket detail | Open tickets module or in-module detail consistently per surface |
| Reports row | Ticket detail | Optional; if offered, use same open-ticket path as lists |

Do not create orphan pages outside the sidebar module set without updating this IA.

---

## 8. Content priority (within a page)

1. Alerts / blockers affecting the current task  
2. Page identity (`PageHeader`)  
3. Controls that change the dataset (search/filters)  
4. Primary data (table, board, form, detail)  
5. Secondary context (recent, help, metadata)

---

## 9. Out of scope for IA changes in 1.75

- Renaming modules  
- Reordering sidebar for “redesign”  
- Splitting/merging features  
- Changing role matrices  

Those are product decisions for later phases; this document freezes the **current** architecture as the rule baseline.
