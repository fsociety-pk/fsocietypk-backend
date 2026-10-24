import mongoose from 'mongoose'
import { env } from './env'
import logger from '../utils/logger'

let isConnected = false

export const connectDB = async (): Promise<void> => {
  if (isConnected) {
    logger.info('MongoDB already connected')
    return
  }

  try {
    mongoose.set('strictQuery', true)

    const conn = await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      retryWrites: true,
      w: 'majority',
    })

    isConnected = true

    logger.info(`MongoDB status: CONNECTED → ${conn.connection.host}`)
    logger.info(`MongoDB database: ${conn.connection.name}`)

    // Connection event handlers
    mongoose.connection.on('disconnected', () => {
      isConnected = false
      logger.error('MongoDB status: DISCONNECTED')
    })

    mongoose.connection.on('reconnected', () => {
      isConnected = true
      logger.info('MongoDB status: RECONNECTED')
    })

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error.', {
        name: err.name,
        code: (err as any).code,
        message: err.message.slice(0, 300),
      })
      isConnected = false
    })

  } catch (error) {
    const dbError = error as { name?: string; code?: string; message?: string }
    logger.error('MongoDB connection failed.', {
      name: dbError?.name,
      code: dbError?.code,
      message: dbError?.message?.slice(0, 300),
    })
    throw error
  }
}

export const disconnectDB = async (): Promise<void> => {
  if (!isConnected) return
  await mongoose.connection.close()
  isConnected = false
  logger.info('MongoDB disconnected cleanly')
}
