export type AppLocale = "en" | "sv";

export const localeLabels: Record<AppLocale, string> = {
  en: "English",
  sv: "Svenska"
};

type MessageTree = {
  shell: {
    portalTitle: string;
    searchTicket: string;
    open: string;
    user: string;
    signOut: string;
    newTicket: string;
    createTicket: string;
    collapseNav: string;
    expandNav: string;
    language: string;
    activeUser: string;
    signedInAs: string;
  };
  modules: {
    dashboard: string;
    tickets: string;
    knowledge: string;
    approvals: string;
    globalization: string;
    clarifications: string;
    escalations: string;
    notifications: string;
    audit: string;
    attachments: string;
    reports: string;
    releasePlan: string;
    jira: string;
    integrations: string;
    admin: string;
    sla: string;
  };
  copy: {
    dashboardRequester: string;
    dashboardRole: string;
    ticketsRequester: string;
    ticketsRole: string;
    ticketsEmptyTitle: string;
    ticketsEmptyBody: string;
    ticketsEmptyFilteredBody: string;
    approvals: string;
    globalization: string;
    globalizationEmptyTitle: string;
    globalizationEmptyBody: string;
    clarificationsEmpty: string;
    escalations: string;
    releasePlan: string;
  };
  releasePlan: {
    panelTitle: string;
    panelDescription: string;
    viewsAria: string;
    tabReleases: string;
    tabSprintPlanning: string;
    product: string;
    release: string;
    sprint: string;
    resetFilters: string;
    syncJira: string;
    syncingJira: string;
    visibleTickets: string;
    releases: string;
    plannedTickets: string;
    sprints: string;
    productBoards: string;
    prodDates: string;
    selectProduct: string;
    noAccessibleProducts: string;
    selectProductFirst: string;
    noReleasesForProduct: string;
    selectRelease: string;
    noSprintsForProduct: string;
    selectSprint: string;
    emptyTitle: string;
    emptySelectProductThenRelease: string;
    emptySelectRelease: string;
    emptyNoMatchRelease: string;
    emptySelectProductThenSprint: string;
    emptySelectSprint: string;
    emptyNoMatchSprint: string;
    sprintEmptyTitle: string;
    taskNumber: string;
    estimateHours: string;
    remainHours: string;
    resources: string;
    ticketsCount: string;
    tasksCount: string;
    preprodRelease: string;
    productionRelease: string;
    ticket: string;
    jiraId: string;
    productPru: string;
    productBoard: string;
    status: string;
    preprod: string;
    prod: string;
    noJiraId: string;
    noProduct: string;
    noPru: string;
    noProductBoard: string;
    noLinkedRelease: string;
    sprintState: string;
    start: string;
    end: string;
    notSynced: string;
    notPlanned: string;
    unassigned: string;
    taskDetails: string;
    tasksInSprint: string;
    noPortalTasks: string;
    resource: string;
    estimate: string;
    remain: string;
    hEstimate: string;
    hRemain: string;
  };
};

export const messages: Record<AppLocale, MessageTree> = {
  en: {
    shell: {
      portalTitle: "Nexus Support",
      searchTicket: "Search ticket",
      open: "Open",
      user: "User",
      signOut: "Sign out",
      newTicket: "New ticket",
      createTicket: "Create ticket",
      collapseNav: "Collapse navigation",
      expandNav: "Expand navigation",
      language: "Language",
      activeUser: "Active user",
      signedInAs: "Signed in as"
    },
    modules: {
      dashboard: "Command Center",
      tickets: "Ticket List",
      knowledge: "Knowledge",
      approvals: "Approvals",
      globalization: "Globalization",
      clarifications: "Clarifications",
      escalations: "Escalations",
      notifications: "Notifications",
      audit: "Audit",
      attachments: "Attachments",
      reports: "Reports",
      releasePlan: "Release Plan",
      jira: "Jira Sync",
      integrations: "Integrations",
      admin: "Admin",
      sla: "SLA"
    },
    copy: {
      dashboardRequester:
        "Command Center for your requests — continue work, critical alerts, and what changed in your scope.",
      dashboardRole:
        "Operational Command Center — continue work, critical alerts, assigned tickets, queues, and activity in your scope.",
      ticketsRequester:
        "Tickets in your product scope. Use My raised tickets to limit the list to requests you submitted.",
      ticketsRole: "Tickets visible in your current role and product / PRU / site scope.",
      ticketsEmptyTitle: "No tickets in your scope",
      ticketsEmptyBody:
        "No support tickets match your current role, product coverage, or filters. Try another persona or clear filters.",
      ticketsEmptyFilteredBody: "No tickets match the current filters within your scope.",
      approvals: "Approval gates assigned to your role within your product and responsibility scope.",
      globalization:
        "Product-owner globalization questions, internal mapping, materials, and GPO scope decisions for your coverage.",
      globalizationEmptyTitle: "No globalization work in your scope",
      globalizationEmptyBody:
        "When a GPO asks product owners for scope input or starts internal mapping in your coverage, it will appear here.",
      clarificationsEmpty: "No open clarification requests waiting for your role in the current scope.",
      escalations: "Active escalations across products, PRUs, and responsibility scopes you can access.",
      releasePlan: "Planned releases, tickets per release, pre-prod and production dates, and sprint status."
    },
    releasePlan: {
      panelTitle: "Release plan",
      panelDescription:
        "End-user release view grouped by Jira fix version, sprint, pre-prod date, and production date.",
      viewsAria: "Release planning views",
      tabReleases: "Releases",
      tabSprintPlanning: "Sprint planning",
      product: "Product",
      release: "Release",
      sprint: "Sprint",
      resetFilters: "Reset filters",
      syncJira: "Sync Jira data",
      syncingJira: "Syncing Jira...",
      visibleTickets: "Visible tickets",
      releases: "Releases",
      plannedTickets: "Planned tickets",
      sprints: "Sprints",
      productBoards: "Product boards",
      prodDates: "Prod dates",
      selectProduct: "Select product",
      noAccessibleProducts: "No accessible products",
      selectProductFirst: "Select product first",
      noReleasesForProduct: "No releases for product",
      selectRelease: "Select release",
      noSprintsForProduct: "No sprints for product",
      selectSprint: "Select sprint",
      emptyTitle: "No release plan items",
      emptySelectProductThenRelease: "Select a product, then select a release to show tickets.",
      emptySelectRelease: "Select a release to show tickets for the selected product.",
      emptyNoMatchRelease: "No visible tickets match the selected product and release.",
      emptySelectProductThenSprint: "Select a product, then select a sprint to show sprint tickets.",
      emptySelectSprint: "Select a sprint to show tickets for the selected product.",
      emptyNoMatchSprint: "No visible tickets match the selected product and sprint.",
      sprintEmptyTitle: "No sprint plan items",
      taskNumber: "Task number",
      estimateHours: "Estimate hours",
      remainHours: "Remain hours",
      resources: "Resources",
      ticketsCount: "tickets",
      tasksCount: "tasks",
      preprodRelease: "Pre-prod release",
      productionRelease: "Production release",
      ticket: "Ticket",
      jiraId: "Jira ID",
      productPru: "Product / PRU",
      productBoard: "Product board",
      status: "Status",
      preprod: "Pre-prod",
      prod: "Prod",
      noJiraId: "No Jira ID",
      noProduct: "No product",
      noPru: "No PRU",
      noProductBoard: "No product board",
      noLinkedRelease: "No linked release",
      sprintState: "Sprint state",
      start: "Start",
      end: "End",
      notSynced: "Not synced",
      notPlanned: "Not planned",
      unassigned: "Unassigned",
      taskDetails: "Task details",
      tasksInSprint: "tasks in this sprint",
      noPortalTasks: "No portal tasks are linked to this sprint yet.",
      resource: "Resource",
      estimate: "Estimate",
      remain: "Remain",
      hEstimate: "h estimate",
      hRemain: "h remain"
    }
  },
  sv: {
    shell: {
      portalTitle: "Nexus-supportportal",
      searchTicket: "Sök ärende",
      open: "Öppna",
      user: "Användare",
      signOut: "Logga ut",
      newTicket: "Nytt ärende",
      createTicket: "Skapa ärende",
      collapseNav: "Minimera navigering",
      expandNav: "Expandera navigering",
      language: "Språk",
      activeUser: "Aktiv användare",
      signedInAs: "Inloggad som"
    },
    modules: {
      dashboard: "Kommandocenter",
      tickets: "Ärendelista",
      knowledge: "Kunskap",
      approvals: "Godkännanden",
      globalization: "Globalisering",
      clarifications: "Förtydliganden",
      escalations: "Eskaleringar",
      notifications: "Aviseringar",
      audit: "Revision",
      attachments: "Bilagor",
      reports: "Rapporter",
      releasePlan: "Releaseplan",
      jira: "Jira-synk",
      integrations: "Integrationer",
      admin: "Admin",
      sla: "SLA"
    },
    copy: {
      dashboardRequester:
        "Kommandocenter för dina ärenden — fortsätt arbete, kritiska larm och vad som ändrats i din omfattning.",
      dashboardRole:
        "Operativt kommandocenter — fortsätt arbete, kritiska larm, tilldelade ärenden, köer och aktivitet i din omfattning.",
      ticketsRequester:
        "Ärenden i din produktomfattning. Använd Mina skapade ärenden för att bara se det du skickat in.",
      ticketsRole: "Ärenden som syns för din nuvarande roll och produkt-/PRU-/platsomfattning.",
      ticketsEmptyTitle: "Inga ärenden i din omfattning",
      ticketsEmptyBody:
        "Inga supportärenden matchar din roll, produkttäckning eller filter. Byt persona eller rensa filter.",
      ticketsEmptyFilteredBody: "Inga ärenden matchar aktuella filter inom din omfattning.",
      approvals: "Godkännandesteg tilldelade din roll inom produkt- och ansvarsomfattning.",
      globalization:
        "Produktägarfrågor om globalisering, intern mappning, material och GPO-beslut i din täckning.",
      globalizationEmptyTitle: "Inget globaliseringsarbete i din omfattning",
      globalizationEmptyBody:
        "När en GPO ber produktägare om input eller startar intern mappning i din täckning visas det här.",
      clarificationsEmpty: "Inga öppna förtydliganden väntar på din roll i aktuell omfattning.",
      escalations: "Aktiva eskaleringar över produkter, PRU:er och ansvarsområden du har tillgång till.",
      releasePlan: "Planerade releaser, ärenden per release, preprod-/produktionsdatum och sprintstatus."
    },
    releasePlan: {
      panelTitle: "Releaseplan",
      panelDescription:
        "Slutanvändarvy grupperad efter Jira fix version, sprint, preprod-datum och produktionsdatum.",
      viewsAria: "Vyer för releaseplanering",
      tabReleases: "Releaser",
      tabSprintPlanning: "Sprintplanering",
      product: "Produkt",
      release: "Release",
      sprint: "Sprint",
      resetFilters: "Återställ filter",
      syncJira: "Synka Jira-data",
      syncingJira: "Synkar Jira...",
      visibleTickets: "Synliga ärenden",
      releases: "Releaser",
      plannedTickets: "Planerade ärenden",
      sprints: "Sprinter",
      productBoards: "Produktboards",
      prodDates: "Prod-datum",
      selectProduct: "Välj produkt",
      noAccessibleProducts: "Inga tillgängliga produkter",
      selectProductFirst: "Välj produkt först",
      noReleasesForProduct: "Inga releaser för produkten",
      selectRelease: "Välj release",
      noSprintsForProduct: "Inga sprinter för produkten",
      selectSprint: "Välj sprint",
      emptyTitle: "Inga poster i releaseplanen",
      emptySelectProductThenRelease: "Välj en produkt och sedan en release för att visa ärenden.",
      emptySelectRelease: "Välj en release för att visa ärenden för den valda produkten.",
      emptyNoMatchRelease: "Inga synliga ärenden matchar vald produkt och release.",
      emptySelectProductThenSprint: "Välj en produkt och sedan en sprint för att visa sprintärenden.",
      emptySelectSprint: "Välj en sprint för att visa ärenden för den valda produkten.",
      emptyNoMatchSprint: "Inga synliga ärenden matchar vald produkt och sprint.",
      sprintEmptyTitle: "Inga poster i sprintplanen",
      taskNumber: "Antal uppgifter",
      estimateHours: "Uppskattade timmar",
      remainHours: "Kvarvarande timmar",
      resources: "Resurser",
      ticketsCount: "ärenden",
      tasksCount: "uppgifter",
      preprodRelease: "Preprod-release",
      productionRelease: "Produktionsrelease",
      ticket: "Ärende",
      jiraId: "Jira-ID",
      productPru: "Produkt / PRU",
      productBoard: "Produktboard",
      status: "Status",
      preprod: "Preprod",
      prod: "Prod",
      noJiraId: "Inget Jira-ID",
      noProduct: "Ingen produkt",
      noPru: "Ingen PRU",
      noProductBoard: "Ingen produktboard",
      noLinkedRelease: "Ingen kopplad release",
      sprintState: "Sprintstatus",
      start: "Start",
      end: "Slut",
      notSynced: "Ej synkad",
      notPlanned: "Ej planerad",
      unassigned: "Ej tilldelad",
      taskDetails: "Uppgiftsdetaljer",
      tasksInSprint: "uppgifter i denna sprint",
      noPortalTasks: "Inga portaluppgifter är kopplade till denna sprint ännu.",
      resource: "Resurs",
      estimate: "Uppskattning",
      remain: "Kvar",
      hEstimate: "h uppskattning",
      hRemain: "h kvar"
    }
  }
};
