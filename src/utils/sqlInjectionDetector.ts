/**
 * SQL Injection Detection & Funny Response Generator
 * Detects common SQL injection patterns and returns a witty response
 */

// Common SQL injection patterns
const SQL_INJECTION_PATTERNS = [
  /('.*?OR.*?'.*?=.*?')/gi,
  /('.*?OR.*?\d+.*?=.*?\d+)/gi,
  /('.*?OR.*?True)/gi,
  /('.*?OR.*?1.*?=.*?1)/gi,
  /(\d+\s+OR\s+\d+\s*=\s*\d+)/gi,
  /(.*?OR\s*'.*?=.*?')/gi,
  /(.*?'.*;.*?DROP)/gi,
  /(.*?'.*;.*?DELETE)/gi,
  /(.*?'.*;.*?UPDATE)/gi,
  /(.*?UNION.*?SELECT)/gi,
  /(.*?UNION.*?ALL.*?SELECT)/gi,
  /(-{2}|\/\*|\*\/|;)/gi, // SQL comment syntax
  /(xp_|sp_|exec|execute|script|javascript|onerror)/gi,
];

// Funny quotes when SQL injection is detected
const SQL_INJECTION_QUOTES = [
  { quote: "Nice try, but this system doesn't speak SQL!", hacker_type: 'SQL Wizard' },
  { quote: "That query won't work here, friend. We use something way cooler: MongoDB.", hacker_type: 'NoSQL Defender' },
  { quote: 'SQL Injection? More like SQL REJECTION!', hacker_type: 'Security Guard' },
  { quote: "I see what you did there. Sneaky! But we're sneakier.", hacker_type: 'Code Detective' },
  { quote: "Your SQL skills are impressive, but we use the dark side: Mongoose schemas!", hacker_type: 'Tech Ninja' },
  { quote: 'UNION SELECT my respect? Sure, but only INSERT INTO our legit user database.', hacker_type: 'Database Clown' },
  { quote: "Even hackers need to follow the rules sometimes. This isn't one of those times.", hacker_type: 'Code Judge' },
  { quote: "DROP TABLE hacker_attempts? Made you a deal you can't refuse!", hacker_type: 'Exploit Defuser' },
  { quote: "SQL injection detected! But hey, at least you're thinking like a security researcher.", hacker_type: 'Cyber Scientist' },
  { quote: 'Nice try! But our validators are tougher than a firewall at Area 51.', hacker_type: 'Cyber Agent' },
  { quote: 'You tried to hack. We blocked you. Round 1 goes to the defense!', hacker_type: 'Winner' },
  { quote: 'SQL what? Never heard of it. We only speak the language of legitimate credentials here.', hacker_type: 'Secret Keeper' },
];

/**
 * Detect if input contains SQL injection patterns
 */
export const detectSQLInjection = (input: string): boolean => {
  if (!input || typeof input !== 'string') {
    return false;
  }

  // Check each pattern
  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      return true;
    }
  }

  return false;
};

/**
 * Get a fun response for SQL injection attempt
 */
export const getSQLInjectionResponse = () => {
  const randomIndex = Math.floor(Math.random() * SQL_INJECTION_QUOTES.length);
  const responsePick = SQL_INJECTION_QUOTES[randomIndex];

  return {
    success: false,
    statusCode: 403,
    message: `${responsePick.hacker_type}: "${responsePick.quote}"`,
    isSQLInjection: true,
    quote: responsePick.quote,
    hackerType: responsePick.hacker_type,
  };
};

/**
 * Enhanced detection that checks multiple fields
 */
export const checkForSQLInjection = (credentials: {
  username?: string;
  password?: string;
  email?: string;
}): { detected: boolean; field?: string } => {
  const fields = ['username', 'email', 'password'] as const;

  for (const field of fields) {
    const value = credentials[field];
    if (value && detectSQLInjection(value)) {
      return { detected: true, field };
    }
  }

  return { detected: false };
};
