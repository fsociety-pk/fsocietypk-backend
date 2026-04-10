import 'dotenv/config'
import app from './app'
import { connectDB } from './config/db'
import { env } from './config/env'
import logger from './utils/logger'
import { initSocket } from './socket'

const PORT = env.PORT

const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB()

    // Start HTTP server
    const server = app.listen(PORT, () => {
      logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      logger.info(`  FsocietyPK API running`)
      logger.info(`  ▸ Environment : ${env.NODE_ENV}`)
      logger.info(`  ▸ Port        : ${PORT}`)
      logger.info(`  ▸ API Prefix  : ${env.API_PREFIX}`)
      logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    })

    // Initialize Socket.io
    initSocket(server)

    // Graceful shutdown
    const shutdown = (signal: string) => {
      logger.warn(`${signal} received — shutting down gracefully...`)
      server.close(() => {
        logger.info('HTTP server closed')
        process.exit(0)
      })
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Rejection:', reason)
      server.close(() => process.exit(1))
    })

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error)
      process.exit(1)
    })

  } catch (error) {
    logger.error('Failed to start server:', error)
    process.exit(1)
  }
}

startServer()
