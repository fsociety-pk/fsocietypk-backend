// ── Shared Types for FsocietyPK ─────────────────────────────────

// ── Enums ─────────────────────────────────────────────────────────
export type UserRole = 'user' | 'admin'

export type ChallengeDifficulty = 'easy' | 'medium' | 'hard' | 'insane'

export type ChallengeCategory =
  | 'web'
  | 'pwn'
  | 'rev'
  | 'crypto'
  | 'forensics'
  | 'osint'
  | 'misc'
  | 'stego'
  | 'network'
  | 'mobile'

export type SubmissionStatus = 'correct' | 'incorrect'

export type ChallengeStatus = 'pending' | 'approved' | 'rejected'

// ── User ──────────────────────────────────────────────────────────
export interface IUser {
  _id: string
  username: string
  role: UserRole
  avatar?: string
  bio?: string
  country?: string
  score: number
  solvedChallenges: string[]
  isBanned: boolean
  createdAt: string
  updatedAt: string
}

// ── Challenge ─────────────────────────────────────────────────────
export interface IFlag {
  sequence: number
  value: string
}

export interface IChallenge {
  _id: string
  title: string
  slug: string
  description: string
  category: ChallengeCategory
  difficulty: ChallengeDifficulty
  points: number
  flag?: string  // Legacy: deprecated, kept for backwards compatibility
  flags?: IFlag[]  // New: for multi-flag story-based challenges
  hints: IHint[]
  files: IFile[]
  attachments: string[]
  solveCount: number
  isActive: boolean
  status: ChallengeStatus
  rejectionReason?: string | null
  createdBy: string | IUser
  author?: string | IUser  // virtual alias for createdBy (legacy)
  createdAt: string
  updatedAt: string
}

export interface IHint {
  _id: string
  content: string
  cost: number
}

export interface IFile {
  _id: string
  filename: string
  url: string
  size: number
}

// ── Submission ────────────────────────────────────────────────────
export interface ISubmission {
  _id: string
  userId: string | IUser
  challengeId: string | IChallenge
  submittedFlag: string
  isCorrect: boolean
  pointsAwarded: number
  timestamp: string
}

// ── Leaderboard ───────────────────────────────────────────────────
export interface ILeaderboardEntry {
  rank: number
  user: Pick<IUser, '_id' | 'username' | 'avatar' | 'country' | 'score'>
  solvedCount: number
  lastSolveAt: string
}

// ── API ───────────────────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean
  statusCode: number
  message: string
  data: T
  meta?: PaginationMeta
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: PaginationMeta
}

// ── Admin Profile ─────────────────────────────────────────────────
export interface IAdminProfile {
  slug: string;
  name: string;
  bio: string;
  profileImage: string;
  links: {
    github?: string;
    linkedin?: string;
    portfolio?: string;
  };
  socialLinks: {
    platform: string;
    url: string;
  }[];
}
