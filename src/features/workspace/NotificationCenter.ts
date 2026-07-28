/**
 * NotificationCenter — read-state + unread derivation.
 * UI (TopBar popover / module panel) stays in features; they must call this service.
 */

import type { NotificationItem } from "@/lib/types";
import { parseStringListRecord, safeReadLocalStorage, safeWriteLocalStorage } from "./storage";

export const NOTIFICATION_READ_STORAGE_KEY = "nexus-notification-read-state-v1";

export type NotificationReadState = Record<string, string[]>;

export function defaultNotificationReadState(): NotificationReadState {
  return {};
}

export function readNotificationReadState(): NotificationReadState {
  return parseStringListRecord(safeReadLocalStorage(NOTIFICATION_READ_STORAGE_KEY));
}

export function writeNotificationReadState(state: NotificationReadState): void {
  safeWriteLocalStorage(NOTIFICATION_READ_STORAGE_KEY, JSON.stringify(state));
}

export function getNotificationReadKeys(notification: NotificationItem): string[] {
  return notification.readKey && notification.readKey !== notification.id
    ? [notification.id, notification.readKey]
    : [notification.id];
}

export function addNotificationReadKeysForPersona(
  current: NotificationReadState,
  personaId: string,
  notification: NotificationItem
): NotificationReadState {
  return {
    ...current,
    [personaId]: Array.from(
      new Set([...(current[personaId] ?? []), ...getNotificationReadKeys(notification)])
    )
  };
}

export function isNotificationUnread(
  notification: NotificationItem,
  readKeys: ReadonlySet<string>
): boolean {
  return getNotificationReadKeys(notification).every((key) => !readKeys.has(key));
}

export function applyUnreadFlags(
  notifications: readonly NotificationItem[],
  readKeys: ReadonlySet<string>
): NotificationItem[] {
  return notifications.map((notification) => ({
    ...notification,
    unread: isNotificationUnread(notification, readKeys)
  }));
}

export function countUnreadNotifications(
  notifications: readonly NotificationItem[],
  readKeys: ReadonlySet<string>
): number {
  return notifications.filter((notification) => isNotificationUnread(notification, readKeys)).length;
}
