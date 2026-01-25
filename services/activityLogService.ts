import { UserActivityLog } from '../types.ts';

export class ActivityLogService {
  private static logs: UserActivityLog[] = [];

  static log(action: UserActivityLog['action'], metadata: any) {
    const entry: UserActivityLog = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      action,
      metadata
    };
    this.logs.unshift(entry);
    console.debug(`[ACTIVITY_LOG] ${action}`, metadata);
  }

  static getLogs(): UserActivityLog[] {
    return [...this.logs];
  }
}