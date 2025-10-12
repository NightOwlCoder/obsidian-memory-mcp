import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

/**
 * Create a rotating logger with structured output
 * 
 * Features:
 * - Rotates at 1MB file size
 * - Keeps 5 files maximum
 * - Structured JSON logging
 * - Timestamp included
 */
export function createLogger(
  name: string,
  logFilePath: string
): winston.Logger {
  
  const fileTransport = new DailyRotateFile({
    filename: logFilePath,
    maxSize: '1m',      // 1MB per file
    maxFiles: 5,        // Keep 5 files max
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length > 0 
          ? ' ' + JSON.stringify(meta) 
          : '';
        return `[${timestamp}] ${level.toUpperCase().padEnd(7)} | ${message}${metaStr}`;
      })
    )
  });
  
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    transports: [fileTransport]
  });
}

// Pre-configured loggers
export const daemonLogger = createLogger(
  'daemon',
  process.env.DAEMON_LOG_FILE || '/tmp/obsidian-indexer.log'
);

export const mcpLogger = createLogger(
  'mcp',
  process.env.MCP_LOG_FILE || '/tmp/obsidian-mcp.log'
);
