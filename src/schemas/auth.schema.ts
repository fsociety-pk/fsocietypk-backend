import { z } from 'zod';
import { loginSchema as login, registerSchema } from '../validators/auth.validator';
export const loginSchema = z.object({ body: login });
export const signupSchema = z.object({ body: registerSchema });
