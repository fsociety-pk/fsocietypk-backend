import { Router } from 'express';
import cors from 'cors';
import { isOriginAllowed } from '../utils/cors';
import { getTeamProfile, listTeamCertificates, getTeamCertificateFile } from '../controllers/team.controller';
const router = Router();
// The public team entry uses credential-free GETs from its dedicated subdomain.
// This exception applies only to public team reads, never to administration.
router.use(cors({ origin: (origin, callback) => callback(null, origin === 'https://about.fsocietypk.tech' || isOriginAllowed(origin)), credentials: false, methods: ['GET', 'HEAD'] }));
router.get('/', getTeamProfile());
router.get('/certificates', listTeamCertificates());
router.get('/certificates/:id/file', getTeamCertificateFile());
export default router;
