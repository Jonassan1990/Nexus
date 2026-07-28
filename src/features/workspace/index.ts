/**
 * Workspace platform public API — Phase 3.5
 * Every module must consume these services; never duplicate them.
 */

export {
  WORKSPACE_PREFERENCES_STORAGE_KEY,
  MAX_RECENT_MODULES,
  defaultWorkspacePreferences,
  parseWorkspacePreferences,
  toggleListItem,
  pushRecent,
  type WorkspaceModuleKey,
  type WorkspacePreferences
} from "./preferences";

export { useWorkspacePreferences } from "./useWorkspacePreferences";
export { focusMainContent } from "./focusMainContent";
export { CommandPaletteHost, type CommandPaletteItem } from "./CommandPaletteHost";

export {
  normalizeWorkspaceQuery,
  getTicketSearchHaystack,
  ticketMatchesWorkspaceQuery,
  searchWorkspaceTickets,
  resolveWorkspaceTicketQuery,
  type WorkspaceSearchableTicket,
  type WorkspaceSearchMatch
} from "./WorkspaceSearch";

export {
  SAVED_VIEWS_STORAGE_KEY,
  defaultSavedViewsStore,
  parseSavedViewsStore,
  readSavedViewsStore,
  writeSavedViewsStore,
  listSavedViews,
  upsertSavedView,
  deleteSavedView,
  createSavedViewId,
  type SavedView,
  type SavedViewScope,
  type SavedViewsStore
} from "./SavedViews";
export { useSavedViews } from "./useSavedViews";

export {
  MAX_RECENT_TICKETS,
  rememberRecentModule,
  rememberRecentTicket,
  listRecentModules,
  listRecentTickets,
  resolveRecentTicketItems,
  type RecentEntityKind,
  type RecentEntityRef
} from "./RecentItems";

export {
  listPinnedModules,
  listFavouriteModules,
  isModulePinned,
  isModuleFavourite,
  togglePinnedModule,
  toggleFavouriteModule,
  listPinnedTickets,
  togglePinnedTicket
} from "./PinnedItems";

export {
  NOTIFICATION_READ_STORAGE_KEY,
  defaultNotificationReadState,
  readNotificationReadState,
  writeNotificationReadState,
  getNotificationReadKeys,
  addNotificationReadKeysForPersona,
  isNotificationUnread,
  applyUnreadFlags,
  countUnreadNotifications,
  type NotificationReadState
} from "./NotificationCenter";

export {
  LOCALE_STORAGE_KEY,
  USER_PREFERENCES_STORAGE_KEY,
  WORKSPACE_STORAGE_KEYS,
  defaultUserPreferences,
  parseUserPreferences,
  readUserPreferences,
  writeUserPreferences,
  type UserPreferences
} from "./UserPreferences";
export { useUserPreferences } from "./useUserPreferences";

export { BulkActionBar, type BulkAction } from "./BulkActionBar";

export {
  registerKeyboardShortcut,
  clearKeyboardShortcuts,
  handleListNavigationKeyDown,
  type KeyboardShortcutChord,
  type ListNavigationOptions
} from "./KeyboardShortcutManager";
