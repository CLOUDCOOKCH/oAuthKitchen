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

    if (this.logStore.length > this.maxLogEntries) {
      this.logStore = this.logStore.slice(-this.maxLogEntries)
    }

    const timestamp = entry.timestamp.toISOString()
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${this.module}]`

    const consoleFn = (console[level] as (...args: unknown[]) => void).bind(console)
    if (context) {
      consoleFn(`${prefix} ${message}`, context)
    } else {
      consoleFn(`${prefix} ${message}`)
    }
  }

  getLogs(): LogEntry[] {
    return [...this.logStore]
  }

  clearLogs(): void {
    this.logStore = []
  }
}

const loggers = new Map<string, Logger>()

export function getLogger(module: string): Logger {
  if (!loggers.has(module)) {
    loggers.set(module, new Logger(module))
  }
  return loggers.get(module)!
}

export default getLogger
