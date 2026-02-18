/**
 * Logging utility for OAuthKitchen.
 *
 * Provides structured logging with console output and in-memory log storage.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  timestamp: Date
  level: LogLevel
  module: string
  message: string
  context?: Record<string, unknown>
}

class Logger {
  private module: string
  private logStore: LogEntry[] = []
  private maxLogEntries = 1000

  constructor(module: string) {
    this.module = module
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this._log('debug', message, context)
  }

  info(message: string, context?: Record<string, unknown>): void {
    this._log('info', message, context)
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this._log('warn', message, context)
  }

  error(message: string, context?: Record<string, unknown>): void {
    this._log('error', message, context)
  }

  private _log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      module: this.module,
      message,
      context,
    }

    this.logStore.push(entry)

    // Keep memory under control
    if (this.logStore.length > this.maxLogEntries) {
      this.logStore = this.logStore.slice(-this.maxLogEntries)
    }

    // Console output
    const timestamp = entry.timestamp.toISOString()
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${this.module}]`

    if (context) {
      console[level](`${prefix} ${message}`, context)
    } else {
      console[level](`${prefix} ${message}`)
    }
  }

  /**
   * Get all logged entries.
   */
  getLogs(): LogEntry[] {
    return [...this.logStore]
  }

  /**
   * Get logs filtered by level.
   */
  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logStore.filter((entry) => entry.level === level)
  }

  /**
   * Clear all logs.
   */
  clearLogs(): void {
    this.logStore = []
  }

  /**
   * Get number of log entries.
   */
  getLogCount(): number {
    return this.logStore.length
  }
}

// Global logger instances cache
const loggers = new Map<string, Logger>()

/**
 * Get or create a logger for a module.
 */
export function getLogger(module: string): Logger {
  if (!loggers.has(module)) {
    loggers.set(module, new Logger(module))
  }
  return loggers.get(module)!
}

/**
 * Get all logs from all loggers.
 */
export function getAllLogs(): LogEntry[] {
  const allLogs: LogEntry[] = []
  for (const logger of loggers.values()) {
    allLogs.push(...logger.getLogs())
  }
  return allLogs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
}

/**
 * Clear all logs from all loggers.
 */
export function clearAllLogs(): void {
  for (const logger of loggers.values()) {
    logger.clearLogs()
  }
}

/**
 * Export logs to JSON format.
 */
export function exportLogsToJson(): string {
  return JSON.stringify(getAllLogs(), null, 2)
}

export default getLogger
