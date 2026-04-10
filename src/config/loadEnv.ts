import path from 'path'
import dotenv from 'dotenv'

// Load .env from project root reliably for both src/* and dist/* execution.
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

// Keep default dotenv lookup as a fallback (cwd-based).
dotenv.config()