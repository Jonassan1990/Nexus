# Page Blueprint Catalogue — Nexus Support Portal

**Phase:** 1.75  
**DS templates:** `@/design-system` templates  
**Related:** [Product Rulebook](../PRODUCT_RULEBOOK.md)

---

## How to use this catalogue

Every new or migrated screen declares **one** blueprint.  
Blueprints define hierarchy, regions, and behaviour—not visual decoration.

Shared chrome for all blueprints:

```
Page
  PageHeader   → identity + primary actions
  Toolbar?     → search / filters / secondary actions
  Content
    …blueprint body…
```

---

## 1. Dashboard / Command Center

**Template:** Command Center composition (`CommandCenterLayout` + section patterns)  
**Answers:** What needs my attention? What should I do next? What changed?

### Hierarchy
1. Continue Working  
2. Critical Alerts (optional alert banner when count > 0)  
3. Assigned Tickets  
4. Team Queues  
5. Activity Feed  
6. Metrics (`MetricGrid`, **max 4** cards)  
7. Reports (`ReportSection` — textual / tabular only)

### Rules
- This is an **operational Command Center**, not a KPI dashboard.  
- Each metric and queue opens a filtered List or Details destination when clicked.  
- No decorative charts (no donuts / ornamental bars without a table alternative).  
- No duplicate information across sections.  
- No unnecessary icons or visual clutter.  
- Sections are reusable DS patterns: `ContinueWorking`, `AttentionPanel`, `AssignedTicketsPanel`, `QueueOverview`, `ActivityFeed`, `MetricGrid`, `ReportSection`.  
- Responsive: metric/queue grids collapse 4 → 2 → 1. No fixed heights.

### Maps to modules
`dashboard`

---

## 2. List / Work Management list

**Template:** `ListTemplate` + `WorkItemList` / `WorkItemFilters`  
**Answers:** Which work items match my filters, and which should I open?

### Hierarchy
1. PageHeader (+ primary create when applicable)  
2. `WorkItemFilters` — Search → facets → sort → mine → reset  
3. `WorkItemList` table / board / queue  
4. Optional pagination or “load more” below

### Rules
- Filters never move into PageHeader actions.  
- Empty filter result ≠ module empty: copy must say filters are active.  
- Row open behaviour is consistent within the module.  
- Search uses `@/features/workspace` `WorkspaceSearch` haystack helpers.  
- Tickets are one `WorkItemType` — do not fork list chrome per type.

### Maps to modules
`tickets` (first consumer), and future work types: approvals, release tasks, quality actions, escalations

---

## 3. Details / Work item details

**Template:** `DetailsTemplate` + `WorkItemDetails` (+ optional `WorkItemInspector`)  
**Answers:** What is this work item, and what can I do to it?

### Hierarchy
1. `WorkItemToolbar` (back + context) when leaving a list  
2. `WorkItemDetails` hero (key, title, summary, badges, actions)  
3. Local tabs (peer aspects of the same entity)  
4. Tab body (domain panels)  
5. Optional `AssignmentPanel` / `StatusTimeline` / inspector

### Rules
- One entity in focus.  
- Destructive actions require confirmation patterns defined by product logic—not hidden icons only.  
- On mobile, inspector stacks below main; tabs remain sticky when possible.  
- Domain panels (Jira, escalations, etc.) stay outside the WorkItem chrome.

### Maps to modules
Ticket detail surfaces, escalation detail, approval detail, function-mapping detail

---

## 4. CRUD

**Template:** `CrudTemplate`  
**Answers:** What am I creating or editing, and is it valid to save?

### Hierarchy
1. PageHeader (create vs edit title)  
2. Optional notice (`Alert`)  
3. FormSection fields  
4. ActionBar — Cancel secondary, Save/Submit primary (end-aligned)

### Rules
- Validate before submit; errors use field-level + optional summary `ErrorState`.  
- Unsaved changes: product may warn on navigate—behaviour must be consistent per form family.  
- Do not mix unrelated settings in one CRUD form.

### Maps to modules
New ticket modal/page flows, admin entity editors, request-option editors

---

## 5. Settings

**Template:** `SettingsTemplate`  
**Answers:** How is the platform or integration configured?

### Hierarchy
1. PageHeader  
2. SplitView: settings nav (`SidebarGroup`) | section panels (`FormSection`)  
3. Per-section ActionBar or explicit Save in panel

### Rules
- Nav lists configuration domains—not tickets.  
- Dangerous operations (reset, disconnect) are separated and labeled.  
- Read-only managed fields (e.g. SES sender) display as read-only—not editable then ignored.

### Maps to modules
`admin`, `integrations`

---

## 6. Wizard

**Template:** `WizardTemplate`  
**Answers:** What step am I on, and what is required to continue?

### Hierarchy
1. PageHeader  
2. Step list / indicator  
3. Step body (one task)  
4. ActionBar — Back / Next / Finish

### Rules
- One primary decision per step.  
- Steps are named by outcome, not implementation.  
- Allow Back without data loss within the wizard session unless a step commits irreversibly (then label clearly).

### Maps to modules
Multi-step create / onboarding-style flows when introduced; keep modals only for short wizards

---

## 7. Reports

**Template:** `ReportTemplate`  
**Answers:** What do the numbers say, and what evidence backs them?

### Hierarchy
1. PageHeader  
2. CommandBar filters (time, product, team, etc.)  
3. Optional summary KPI row  
4. Charts section  
5. Data table section (export secondary action here or in CommandBar)

### Rules
- Filters apply to both charts and tables together.  
- Chart colours: `--chart-*` / domain tokens only.  
- Always ship a tabular or textual companion for chart series.  
- Loading replaces chart+table regions with skeletons—not a full-page whiteout when header can stay.

### Maps to modules
`reports` (and analytics panels that behave as reports)

---

## 8. Knowledge Experience

**Template:** `DetailsTemplate` + Knowledge patterns (`KnowledgeExplorer` / `KnowledgeReader` / `KnowledgeEditor`)  
**Answers:** What operational knowledge do I need, and can I trust this version?

### Hierarchy
1. PageHeader (+ New article when permitted)  
2. `KnowledgeSidebar` + `KnowledgeTree`  
3. Mode body:
   - Explore → `KnowledgeExplorer` (search, facets, results)
   - Read → `KnowledgeReader` + inspector (`ArticleMetadata`, related, attachments, timeline, versions, review)
   - Edit → `KnowledgeEditor`
   - Review → Reader + `ReviewPanel`
4. Optional AI slot (reserved; empty until wired)

### Rules
- Knowledge is an **operational tool**, not a documentation brochure.  
- Fast search first; reading chrome stays minimal.  
- Do not redesign Work Management or Command Center inside this module.  
- Article lifecycle (draft → in_review → published → deprecated) is visible in metadata and version history.  
- Permissions come from the consumer (`permissions` on the article model).  
- Future AI assist uses reserved `aiSlot` / `aiContext` — do not invent a parallel chat product inside Knowledge.

### Maps to modules
`knowledge`

---

## Blueprint selection guide

| If the user needs to… | Choose |
| --- | --- |
| Scan health & jump to work | Dashboard / Command Center |
| Find an item in a set | List / Work Management list |
| Work on one work item | Details / Work item details |
| Find / read / maintain operational knowledge | Knowledge Experience |
| Enter structured data | CRUD |
| Configure the system | Settings |
| Complete a guided multi-step task | Wizard |
| Analyse trends / distributions | Report |

If two blueprints seem to fit, prefer the one that matches the **primary job** of the screen; compose secondary jobs as sections inside it.
