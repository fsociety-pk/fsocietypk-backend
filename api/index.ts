import app from '../src/app';
import { connectDB } from '../src/config/db';

let dbReady = false;

export default async function handler(req: any, res: any) {
  try {
    if (!dbReady) {
      await connectDB();
      dbReady = true;
    }

    return app(req, res);
  } catch (error: any) {
    console.error('Serverless bootstrap failure:', error?.message || error);
    return res.status(500).json({
      success: false,
      message: 'Server initialization failed. Check deployment environment variables and database connectivity.',
    });
  }
}
