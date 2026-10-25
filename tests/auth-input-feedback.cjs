/* Pure unit checks. No app server, database, email, or .env is loaded. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const { detectAuthPayload, authPayloadMessage } = require('../dist/utils/authInputFeedback');
const { preserveTypedCredentials } = require('../dist/middleware/typedCredentials.middleware');
const { registerSchema, loginSchema } = require('../dist/validators/auth.validator');
const source = fs.readFileSync(require('node:path').resolve(__dirname, '../../fsocietypk-frontend/src/utils/authInputFeedback.ts'), 'utf8');
const frontend = new Module('frontend-auth-input-feedback', module);
frontend._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, 'frontend-auth-input-feedback.js');
const samples = [
  ["' OR '1'='1", 'sql'], ["admin'--", 'sql'], ['1 OR 1=1', 'sql'],
  ['UNION ALL SELECT username FROM users', 'sql'], ['UNION/**/SELECT password FROM users', 'sql'],
  ['/*!50000UNION*/ SELECT id FROM users', 'sql'], ["x'; DROP TABLE users;--", 'sql'],
  ['pg_sleep(10)', 'sql'], ["WAITFOR DELAY '0:0:5'", 'sql'], ['extractvalue(1,1)', 'sql'],
  ['%27%20OR%20%271%27%3D%271', 'sql'], ['%2527%2520OR%25201%253D1', 'sql'],
  ['<script>alert(1)</script>', 'xss'], ['<svg/onload=alert(1)>', 'xss'],
  ['<img src=x onerror=alert(1)>', 'xss'], ['javascript:alert(1)', 'xss'],
  ['&#x3c;script&#x3e;alert(1)', 'xss'], ['%3Csvg%20onload%3Dalert(1)%3E', 'xss'],
  ['\\u003cscript\\u003e', 'xss'], ['data:text/html,<b>test</b>', 'xss'],
  ['{"$ne":null}', 'nosql'], [{ $ne: null }, 'nosql'], ['username[$ne]', 'nosql'],
  ['scriptwriter', null], ['javascript_fan', null], ['name--here', null], ['semi;colon', null],
  ['union_select', null], ['andrew', null], ['user+tag@example.com', null], ['user.name@example.com', null],
  ['', null], [null, null], [false, null], [123, null], [[], null], [{username:'valid'}, null],
];
for (let repeat=0; repeat<3; repeat++) for (const [value, expected] of samples) {
  assert.equal(detectAuthPayload(value), expected, JSON.stringify(value));
  assert.equal(frontend.exports.detectAuthPayload(value), expected, `frontend parity: ${JSON.stringify(value)}`);
}
for (const kind of ['sql','xss','nosql']) assert.equal(typeof authPayloadMessage(kind), 'string');
const strong = { username:'sample_user', email:'user+tag@example.com', password:'Valid<script>1!' };
assert(registerSchema.safeParse(strong).success);
assert.equal(registerSchema.parse(strong).password, strong.password, 'Never rewrite password punctuation or markup-like text');
for(const username of ['ab', 'a'.repeat(31), 'full name', '<svg/onload=1>', { $ne:null }]) assert(!registerSchema.safeParse({...strong,username}).success);
for(const email of ['user', 'user@', 'user@example', '<script>@example.com']) assert(!registerSchema.safeParse({...strong,email}).success);
for(const password of ['weak', 'onlylowercase1!', 'ONLYUPPERCASE1!', 'NoNumbersHere!', 'NoSymbols123', 'A1!'+'😀'.repeat(18)]) assert(!registerSchema.safeParse({...strong,password}).success);
assert(registerSchema.safeParse({...strong,password:'A1!'+'a'.repeat(69)}).success);
assert(!registerSchema.safeParse({...strong,password:'A1!'+'a'.repeat(70)}).success);
assert.equal(loginSchema.parse({username:' USER@EXAMPLE.COM ',password:"<script>' OR 1=1"}).password,"<script>' OR 1=1");
assert(!loginSchema.safeParse({username:{$ne:null},password:'test'}).success);
assert(!loginSchema.safeParse({username:'invalid name',password:'test'}).success);
let cleaned = 0;
const sanitizer = (req, _res, next) => { cleaned++; req.body.password='rewritten'; next(); };
const preserve = preserveTypedCredentials(sanitizer, '/api/v1');
for(const path of ['/api/v1/auth/login','/api/v1/auth/register','/API/V1/AUTH/LOGIN/','/api/v1/users/me/change-password/']) {
  const req={path,body:{password:strong.password}}; let next=0;
  preserve(req, {}, ()=>{next++;});
  assert.equal(req.body.password,strong.password); assert.equal(next,1);
}
assert.equal(cleaned,0);
preserve({path:'/api/v1/users/me/profile',body:{}},{},()=>{});
assert.equal(cleaned,1,'Other routes retain their sanitizers');
console.log(`PASS: ${samples.length} payload/ordinary-input cases repeated in both apps; auth field boundaries; passwords preserved; typed-credential middleware.`);
