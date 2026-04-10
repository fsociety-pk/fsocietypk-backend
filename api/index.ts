import app from '../src/app';
import { connectDB } from '../src/config/db';

let dbReady = false;

export default async function handler(req: any, res: any) {
  if (!dbReady) {
    await connectDB();
    dbReady = true;
  }

  return app(req, res);
}
