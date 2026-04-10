/**
 * SQL INJECTION DETECTION FEATURE
 * ================================
 * 
 * This document describes the SQL injection detection feature added to the auth system.
 * 
 * FEATURE OVERVIEW:
 * ─────────────────
 * When a user attempts to use SQL injection patterns in the login or registration forms,
 * they receive a custom, funny response instead of a generic error message. This serves as:
 * - A security measure (early detection)
 * - A humorous acknowledgment of the attempt
 * - An educational moment (the user sees they were detected)
 * 
 * IMPLEMENTATION DETAILS:
 * ──────────────────────
 * 
 * File: backend/src/utils/sqlInjectionDetector.ts
 * - detectSQLInjection(): Checks a string for SQL patterns
 * - getSQLInjectionResponse(): Returns a funny quote + hacker type
 * - checkForSQLInjection(): Checks multiple fields at once
 * 
 * File: backend/src/controllers/auth.controller.ts
 * - register(): Added SQL injection check before user creation
 * - login(): Added SQL injection check before credential verification
 * 
 * DETECTED PATTERNS:
 * ──────────────────
 * The system detects these common SQL injection attempts:
 * 
 * 1. Basic OR conditions:
 *    - ' OR '1'='1
 *    - ' OR 1=1
 *    - ' OR TRUE
 *    - admin' OR '1'='1
 * 
 * 2. Comments and concatenation:
 *    - -- (SQL comment)
 *    - /* */ (block comment)
 *    - ; (statement terminator)
 * 
 * 3. Advanced techniques:
 *    - UNION SELECT
 *    - UNION ALL SELECT
 *    - DROP TABLE
 *    - DELETE FROM
 *    - UPDATE...
 * 
 * 4. Script/XSS patterns:
 *    - javascript:
 *    - onerror=
 *    - script tags
 *    - Stored procedures (xp_, sp_)
 * 
 * FUNNY RESPONSES:
 * ────────────────
 * Users attempting SQL injection will see one of these random responses:
 * 
* SQL Wizard: "Nice try, but this system doesn't speak SQL!"
* NoSQL Defender: "That query won't work here, friend. We use something way cooler: MongoDB."
* Security Guard: "SQL Injection? More like SQL REJECTION!"
* Code Detective: "I see what you did there. Sneaky! But we're sneakier."
* Tech Ninja: "Your SQL skills are impressive, but we use the dark side: Mongoose schemas!"
* Database Clown: "UNION SELECT my respect? Sure, but only INSERT INTO our legit user database."
* Code Judge: "Even hackers need to follow the rules sometimes. This isn't one of those times."
* Exploit Defuser: "DROP TABLE hacker_attempts? Made you a deal you can't refuse!"
* Cyber Scientist: "SQL injection detected! But hey, at least you're thinking like a security researcher."
* Cyber Agent: "Nice try! But our validators are tougher than a firewall at Area 51."
* Winner: "You tried to hack. We blocked you. Round 1 goes to the defense!"
* Secret Keeper: "SQL what? Never heard of it. We only speak the language of legitimate credentials here."
 * 
 * EXAMPLE ATTEMPTS:
 * ─────────────────
 * 
 * Try these in the login form to see the funny responses:
 * 
 * Username: admin' OR '1'='1
 * Password: anything
 * → Returns: "SQL Wizard" with random funny message
 * 
 * Username: user
 * Password: ' OR 1=1 --
 * → Returns: "NoSQL Defender" with random funny message
 * 
 * Username: admin'; DROP TABLE users; --
 * Password: test
 * → Returns: "Exploit Defuser" with random funny message
 * 
 * RESPONSE FORMAT:
 * ────────────────
 * {
 *   statusCode: 403,
*   message: "SQL Wizard: \"Nice try, but this system doesn't speak SQL!\"",
 *   data: {
 *     isSQLInjection: true,
 *     attemptedField: "username" // which field triggered the detection
 *   }
 * }
 * 
 * NO LOGS OR SECURITY WARNINGS:
 * ─────────────────────────────
 * - No detailed error messages are logged
 * - The system doesn't reveal internal structure
 * - It's purely for entertainment and early detection
 * - Real security is handled by input validation and parameterized queries
 * 
 * FRONTEND DISPLAY:
 * ─────────────────
 * The Login.tsx page displays the message as a toast notification.
 * Users see: "[Hacker Type]: [Funny Quote]"
 * 
 * Example: "🎪 Database Clown: UNION SELECT my respect? Sure, but only INSERT INTO..."
 */

export {}; // This file is purely documentation
