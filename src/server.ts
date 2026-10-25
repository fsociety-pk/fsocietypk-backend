import './config/loadEnv'
import app from './app'
import { connectDB, disconnectDB } from './config/db'
import { env } from './config/env'
import logger from './utils/logger'
import { initSocket } from './socket'
import { verifyChallengeEmailTransport } from './utils/emailHelper'
import { verifyR2Connection } from './lib/r2'

const PORT = env.PORT
const HOST = env.HOST

const safeErrorDetails = (error: unknown) => {
  const appError = error as { name?: unknown; code?: unknown; message?: unknown } | null
  return {
    ...(typeof appError?.name === 'string' && { name: appError.name }),
    ...(typeof appError?.code === 'string' && { code: appError.code }),
    message: (typeof appError?.message === 'string' ? appError.message : String(error)).slice(0, 300),
  }
}

const startServer = async () => {
  try {
    logger.info('Startup: environment configuration validated.')

    const r2Status = await verifyR2Connection()
    if (r2Status.reachable) {
      logger.info('R2 storage check: configured and reachable.')
    } else {
      logger.error('R2 storage check failed: credentials/bucket may be invalid or unreachable.', {
        ...(r2Status.errorCode && { code: r2Status.errorCode }),
        ...(r2Status.httpStatus && { httpStatus: r2Status.httpStatus }),
      })
    }

    // Connect to MongoDB
    await connectDB()

    // Start HTTP server
    const server = app.listen(PORT, HOST, () => {
      logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      logger.info(`  FsocietyPK API running`)
      logger.info(`  ▸ Environment : ${env.NODE_ENV}`)
      logger.info(`  ▸ Host        : ${HOST}`)
      logger.info(`  ▸ Port        : ${PORT}`)
      logger.info(`  ▸ API Prefix  : ${env.API_PREFIX}`)
      logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    })

    server.on('error', (error) => {
      logger.error('HTTP server status: FAILED to bind/listen.', safeErrorDetails(error))
      process.exit(1)
    })

    // Initialize Socket.io
    initSocket(server)

    // SMTP diagnostics run in the background so a mail outage cannot prevent
    // the HTTP API, challenges, or dashboard from starting.
    void verifyChallengeEmailTransport()

    // Graceful shutdown
    let shuttingDown = false
    const shutdown = (signal: string) => {
      if (shuttingDown) return
      shuttingDown = true
      logger.warn(`${signal} received — shutting down gracefully...`)
      server.close(() => {
        void disconnectDB().finally(() => {
          logger.info('Shutdown complete.')
          process.exit(0)
        })
      })
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled promise rejection.', safeErrorDetails(reason))
      server.close(() => process.exit(1))
    })

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception.', safeErrorDetails(error))
      process.exit(1)
    })

  } catch (error) {
    logger.error('Startup failed.', safeErrorDetails(error))
    process.exit(1)
  }
}

startServer()
