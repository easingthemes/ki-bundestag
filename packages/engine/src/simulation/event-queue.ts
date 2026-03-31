/**
 * Event queue and notification system for night mode.
 *
 * In participatory modes, critical/important events that occur at night
 * are queued and processed when morning arrives. Users receive in-app
 * notifications about queued/ready events and morning summaries.
 */

import { getDb, getUserDb, schema } from "../db/index.js";
import { eq, and, desc } from "drizzle-orm";

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

// ── Event Queue (simulation DB) ──

export interface QueuedEvent {
  id: string;
  eventType: string;
  eventData: unknown;
  scheduledForDay: number;
  queuedAt: string;
  processedAt: string | null;
  status: "queued" | "processed" | "cancelled";
}

/**
 * Queue an event for later processing (e.g., overnight).
 */
export function queueEvent(
  eventType: string,
  eventData: unknown,
  scheduledForDay: number,
): string {
  const db = getDb();
  const id = `eq-${generateId()}`;
  db.insert(schema.eventQueue).values({
    id,
    eventType,
    eventData: eventData as any,
    scheduledForDay,
    queuedAt: new Date().toISOString(),
    processedAt: null,
    status: "queued",
  }).run();
  return id;
}

/**
 * Get all queued (unprocessed) events, optionally for a specific day.
 */
export function getQueuedEvents(forDay?: number): QueuedEvent[] {
  const db = getDb();
  const rows = db.select().from(schema.eventQueue)
    .where(eq(schema.eventQueue.status, "queued"))
    .all();

  const mapped = rows.map(mapQueuedEvent);
  if (forDay !== undefined) {
    return mapped.filter(e => e.scheduledForDay <= forDay);
  }
  return mapped;
}

/**
 * Process (drain) all queued events up to the given day.
 * Marks them as processed and returns the list.
 */
export function drainQueue(upToDay: number): QueuedEvent[] {
  const db = getDb();
  const queued = getQueuedEvents(upToDay);
  const now = new Date().toISOString();

  for (const event of queued) {
    db.update(schema.eventQueue)
      .set({ status: "processed", processedAt: now })
      .where(eq(schema.eventQueue.id, event.id))
      .run();
  }

  return queued;
}

function mapQueuedEvent(row: typeof schema.eventQueue.$inferSelect): QueuedEvent {
  return {
    id: row.id,
    eventType: row.eventType,
    eventData: row.eventData,
    scheduledForDay: row.scheduledForDay,
    queuedAt: row.queuedAt,
    processedAt: row.processedAt ?? null,
    status: row.status as QueuedEvent["status"],
  };
}

// ── Notifications (user DB) ──

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  data: unknown;
  read: boolean;
  createdAt: string;
  dayNumber: number;
}

/**
 * Create a notification for a specific user.
 */
export function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  data: unknown,
  dayNumber: number,
): string {
  const userDb = getUserDb();
  const id = `notif-${generateId()}`;
  userDb.insert(schema.notifications).values({
    id,
    userId,
    type,
    title,
    message,
    data: data as any,
    read: false,
    createdAt: new Date().toISOString(),
    dayNumber,
  }).run();
  return id;
}

/**
 * Create a notification for all users.
 */
export function createNotificationForAll(
  type: string,
  title: string,
  message: string,
  data: unknown,
  dayNumber: number,
): void {
  const userDb = getUserDb();
  const users = userDb.select({ id: schema.users.id }).from(schema.users).all();
  for (const user of users) {
    createNotification(user.id, type, title, message, data, dayNumber);
  }
}

/**
 * Get notifications for a user, sorted by newest first.
 */
export function getNotifications(
  userId: string,
  opts?: { unreadOnly?: boolean; limit?: number },
): Notification[] {
  const userDb = getUserDb();
  let rows;

  if (opts?.unreadOnly) {
    rows = userDb.select().from(schema.notifications)
      .where(and(
        eq(schema.notifications.userId, userId),
        eq(schema.notifications.read, false),
      ))
      .orderBy(desc(schema.notifications.createdAt))
      .all();
  } else {
    rows = userDb.select().from(schema.notifications)
      .where(eq(schema.notifications.userId, userId))
      .orderBy(desc(schema.notifications.createdAt))
      .all();
  }

  const mapped = rows.map(mapNotification);
  if (opts?.limit) return mapped.slice(0, opts.limit);
  return mapped;
}

/**
 * Count unread notifications for a user.
 */
export function getUnreadCount(userId: string): number {
  const userDb = getUserDb();
  const rows = userDb.select().from(schema.notifications)
    .where(and(
      eq(schema.notifications.userId, userId),
      eq(schema.notifications.read, false),
    ))
    .all();
  return rows.length;
}

/**
 * Mark a notification as read.
 */
export function markNotificationRead(notificationId: string, userId: string): boolean {
  const userDb = getUserDb();
  const result = userDb.update(schema.notifications)
    .set({ read: true })
    .where(and(
      eq(schema.notifications.id, notificationId),
      eq(schema.notifications.userId, userId),
    ))
    .run();
  return result.changes > 0;
}

/**
 * Mark all notifications as read for a user.
 */
export function markAllNotificationsRead(userId: string): number {
  const userDb = getUserDb();
  const result = userDb.update(schema.notifications)
    .set({ read: true })
    .where(and(
      eq(schema.notifications.userId, userId),
      eq(schema.notifications.read, false),
    ))
    .run();
  return result.changes;
}

function mapNotification(row: typeof schema.notifications.$inferSelect): Notification {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    title: row.title,
    message: row.message,
    data: row.data,
    read: row.read,
    createdAt: row.createdAt,
    dayNumber: row.dayNumber,
  };
}

// ── User Action Logging (analytics) ──

/**
 * Log a user action for analytics tracking.
 */
export function logUserAction(
  userId: string,
  actionType: string,
  simDay: number,
  entityId?: string,
  entityType?: string,
  metadata?: unknown,
): void {
  const userDb = getUserDb();
  const id = `ua-${generateId()}`;
  userDb.insert(schema.userActions).values({
    id,
    userId,
    actionType,
    entityId: entityId ?? null,
    entityType: entityType ?? null,
    metadata: metadata as any ?? null,
    simDay,
    createdAt: new Date().toISOString(),
  }).run();
}

/**
 * Generate a morning summary from overnight queued events.
 */
export function generateMorningSummary(
  queuedEvents: QueuedEvent[],
  currentDay: number,
): { title: string; message: string } {
  if (queuedEvents.length === 0) {
    return {
      title: `Guten Morgen! Tag ${currentDay}`,
      message: "Keine Ereignisse über Nacht in der Warteschlange. Die Simulation läuft weiter.",
    };
  }

  const eventLines = queuedEvents.map(e => `- ${e.eventType}: geplant für Tag ${e.scheduledForDay}`);

  return {
    title: `Guten Morgen! ${queuedEvents.length} Ereignis(se) über Nacht eingereiht`,
    message: [
      `Während du geschlafen hast, wurden ${queuedEvents.length} Ereignis(se) eingereiht:`,
      ...eventLines,
      "",
      "Diese Ereignisse werden jetzt verarbeitet.",
    ].join("\n"),
  };
}
