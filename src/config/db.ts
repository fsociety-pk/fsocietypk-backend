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

    logger.info(`MongoDB connected → ${conn.connection.host}`)
    logger.info(`Database         → ${conn.connection.name}`)

    // Connection event handlers
    mongoose.connection.on('disconnected', () => {
      isConnected = false
      logger.warn('MongoDB disconnected')
    })

    mongoose.connection.on('reconnected', () => {
      isConnected = true
      logger.info('MongoDB reconnected')
    })

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err)
      isConnected = false
    })

  } catch (error) {
    logger.error('MongoDB connection failed:', error)
    throw error
  }
}

export const disconnectDB = async (): Promise<void> => {
  if (!isConnected) return
  await mongoose.connection.close()
  isConnected = false
  logger.info('MongoDB disconnected cleanly')
}
