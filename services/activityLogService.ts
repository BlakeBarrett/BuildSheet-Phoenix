import { UserActivityLog } from '../types.ts';
import { get, set } from 'idb-keyval';

const ACTIVITY_LOG_KEY = 'buildsheet_activity_log';
const MAX_LOG_ENTRIES = 500;

export class ActivityLogService {
  private static logs: UserActivityLog[] = [];
  private static loaded = false;

  static async loadFromStorage(): Promise<void> {
    if (this.loaded) return;
    try {
      const stored = await get(ACTIVITY_LOG_KEY);
      if (stored && Array.isArray(stored)) {
        this.logs = stored.map((e: any) => ({
          ...e,
          timestamp: new Date(e.timestamp)
        }));
      }
    } catch (e) {
      console.error('[ACTIVITY_LOG] Failed to load from IndexedDB', e);
    }
    this.loaded = true;
  }

  private static persist() {
    const toStore = this.logs.slice(0, MAX_LOG_ENTRIES);
    set(ACTIVITY_LOG_KEY, toStore).catch(e => console.error('[ACTIVITY_LOG] Persist failed', e));
  }

  static log(action: UserActivityLog['action'], metadata: any) {
    const entry: UserActivityLog = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      action,
      metadata
    };
    this.logs.unshift(entry);
    if (this.logs.length > MAX_LOG_ENTRIES) {
      this.logs = this.logs.slice(0, MAX_LOG_ENTRIES);
    }
    this.persist();
    console.debug(`[ACTIVITY_LOG] ${action}`, metadata);
  }

  static getLogs(): UserActivityLog[] {
    return [...this.logs];
  }
}