import dotenv from 'dotenv';
import path from 'path';

// Load env vars before importing anything that uses them
dotenv.config({ path: path.join(__dirname, '../../.env') });

import mongoose from 'mongoose';
import { User } from '../models/User';
import { env } from '../config/env';

/**
 * Script to promote a user to admin.
 * Usage: npx ts-node src/scripts/promote.ts <username>
 */
const promoteUser = async () => {
  const username = process.argv[2];

  if (!username) {
    console.error('Please provide a username: npx ts-node src/scripts/promote.ts <username>');
    process.exit(1);
  }

  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    const user = await User.findOne({ username: username.toLowerCase() });

    if (!user) {
      console.error(`User "${username}" not found.`);
      process.exit(1);
    }

    user.role = 'admin';
    await user.save();

    console.log(`Success! User "${username}" is now an ADMIN.`);
    process.exit(0);
  } catch (error) {
    console.error('Error promoting user:', error);
    process.exit(1);
  }
};

promoteUser();
