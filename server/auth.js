import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const COOKIE = 'meru_session';
const SESSION_AGE = 30 * 24 * 60 * 60;
const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const cookieOptions = () => `Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_AGE}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;

async function passwordDigest(password, salt) {
  return scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

export function readSession(req, db) {
  const cookie = req.headers.cookie || '';
  const token = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!token) return null;
  let decoded;
  try { decoded = decodeURIComponent(token); } catch { return null; }
  const hash = hashToken(decoded);
  const session = db.prepare('SELECT users.id, users.name, users.email, sessions.expires_at FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ?').get(hash);
  if (!session) return null;
  if (session.expires_at <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash);
    return null;
  }
  return { id: session.id, name: session.name, email: session.email, tokenHash: hash };
}

export function registerAuthRoutes(app, db) {
  app.get('/api/auth/me', (req, res) => {
    const user = readSession(req, db);
    res.json({ user: user ? { id: user.id, name: user.name, email: user.email } : null });
  });

  app.post('/api/auth/register', async (req, res, next) => {
    try {
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const errors = {};
      if (name.length < 2 || name.length > 80) errors.name = 'Enter your name (2–80 characters).';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) errors.email = 'Enter a valid email address.';
      if (password.length < 8 || password.length > 128) errors.password = 'Use a password between 8 and 128 characters.';
      if (Object.keys(errors).length) return res.status(400).json({ error: 'Please check the highlighted fields.', errors });
      const salt = randomBytes(16).toString('hex');
      const digest = await passwordDigest(password, salt);
      let userId;
      try {
        userId = Number(db.prepare('INSERT INTO users (name,email,password_hash,password_salt) VALUES (?,?,?,?)').run(name, email, digest.toString('hex'), salt).lastInsertRowid);
      } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.errcode === 2067) return res.status(409).json({ error: 'An account with this email already exists.', errors: { email: 'This email is already registered.' } });
        throw error;
      }
      const user = db.prepare('SELECT id,name,email FROM users WHERE id = ?').get(userId);
      issueSession(db, userId, res);
      return res.status(201).json({ user });
    } catch (error) { return next(error); }
  });

  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!email || !password) return res.status(400).json({ error: 'Enter your email and password.' });
      const account = db.prepare('SELECT id,name,email,password_hash,password_salt FROM users WHERE email = ?').get(email);
      if (!account) return res.status(401).json({ error: 'Email or password is incorrect.' });
      const actual = await passwordDigest(password, account.password_salt);
      const expected = Buffer.from(account.password_hash, 'hex');
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return res.status(401).json({ error: 'Email or password is incorrect.' });
      issueSession(db, account.id, res);
      return res.json({ user: { id: account.id, name: account.name, email: account.email } });
    } catch (error) { return next(error); }
  });

  app.post('/api/auth/logout', (req, res) => {
    const user = readSession(req, db);
    if (user) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(user.tokenHash);
    res.setHeader('Set-Cookie', `${COOKIE}=; ${cookieOptions().replace(`Max-Age=${SESSION_AGE}`, 'Max-Age=0')}`);
    res.status(204).end();
  });
}

function issueSession(db, userId, res) {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const expiresAt = Date.now() + SESSION_AGE * 1000;
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').run(tokenHash, userId, expiresAt);
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; ${cookieOptions()}`);
}

export function requireAuth(db) {
  return (req, res, next) => {
    const user = readSession(req, db);
    if (!user) return res.status(401).json({ error: 'Please sign in to continue.' });
    req.user = user;
    return next();
  };
}
