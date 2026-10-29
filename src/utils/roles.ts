/** Keep the frontend/backend role contracts in sync. The server is the authority. */
export const ROLES = ['user', 'admin', 'manager', 'moderator', 'editor', 'analyst'] as const;
export type Role = typeof ROLES[number];
export type StaffRole = Exclude<Role, 'user'>;
export type Permission = 'overview' | 'challenges.read' | 'challenges.write' | 'challenges.review' | 'reviews' | 'members' | 'projects' | 'analytics' | 'announcements' | 'roles' | 'system' | 'profile' | 'support' | 'team';
const all: Permission[] = ['overview', 'challenges.read', 'challenges.write', 'challenges.review', 'reviews', 'members', 'projects', 'analytics', 'announcements', 'roles', 'system', 'profile', 'support', 'team'];
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  user: [], admin: all,
  manager: ['overview', 'challenges.read', 'challenges.write', 'challenges.review', 'reviews', 'members', 'projects', 'analytics', 'announcements'],
  moderator: ['overview', 'challenges.read', 'challenges.review', 'reviews', 'members'],
  editor: ['overview', 'challenges.read', 'challenges.write', 'projects'],
  analyst: ['overview', 'analytics'],
};
export const ROLE_LABELS: Record<Role, string> = { user: 'Member', admin: 'Administrator', manager: 'Manager', moderator: 'Moderator', editor: 'Editor', analyst: 'Analyst' };
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  user: 'Community access and challenge participation',
  admin: 'Full administration, staff roles, account security, and backend status',
  manager: 'Content, moderation, members, projects, analytics, and announcements',
  moderator: 'Review challenges and contributions; manage member access',
  editor: 'Create and publish challenges; edit content and manage projects',
  analyst: 'Read platform overview and analytics',
};
export const isStaff = (role: unknown): role is StaffRole => typeof role === 'string' && ROLES.includes(role as Role) && role !== 'user';
export const hasPermission = (role: unknown, permission: Permission): boolean => isStaff(role) && ROLE_PERMISSIONS[role].includes(permission);
