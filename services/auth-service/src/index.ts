import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import bcrypt from 'bcryptjs';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3007);

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
}));

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

const googleClient = new OAuth2Client();

type User = {
  id: string;
  email: string;
  passwordHash?: string;
  firstName?: string;
  lastName?: string;
  provider?: 'google';
  providerSub?: string;
  createdAt: string;
};

const usersByProviderSub = new Map<string, User>();
const usersByEmail = new Map<string, User>();
const aliasToUser = new Map<string, string>();
const userToAlias = new Map<string, string>();

function signAccessToken(user: User) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      permissions: (ADMIN_EMAIL && user.email === ADMIN_EMAIL)
        ? ['ADMIN', 'PAYMENTS_SEND', 'PAYMENTS_RECEIVE', 'PROFILE_VIEW']
        : ['PAYMENTS_SEND', 'PAYMENTS_RECEIVE', 'PROFILE_VIEW'],
    },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

function signRefreshToken(user: User) {
  return jwt.sign(
    {
      userId: user.id,
      type: 'refresh',
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'auth-service', timestamp: new Date().toISOString() });
});

app.post('/api/v1/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body as { idToken?: string };

    if (!idToken) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_ID_TOKEN', message: 'Missing idToken' } });
    }

    if (!GOOGLE_CLIENT_ID) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'GOOGLE_CLIENT_ID_NOT_CONFIGURED',
          message: 'GOOGLE_CLIENT_ID is not configured in environment',
        },
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.sub || !payload.email) {
      return res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid Google token' } });
    }

    const providerSub = payload.sub;
    const key = `google:${providerSub}`;

    let user = usersByProviderSub.get(key);
    if (!user) {
      user = {
        id: `usr_${providerSub.slice(0, 12)}`,
        email: payload.email,
        firstName: payload.given_name,
        lastName: payload.family_name,
        provider: 'google',
        providerSub,
        createdAt: new Date().toISOString(),
      };
      usersByProviderSub.set(key, user);
    }

    const token = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        permissions: ['PAYMENTS_SEND', 'PAYMENTS_RECEIVE', 'PROFILE_VIEW'],
      },
      token,
      refreshToken,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

app.post('/api/v1/auth/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body as { email?: string; password?: string; firstName?: string; lastName?: string };
    if (!email || !password) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'Email y contraseña son obligatorios' } });
    }
    if (ADMIN_EMAIL && email === ADMIN_EMAIL) {
      return res.status(403).json({ success: false, error: { code: 'ADMIN_NOT_ALLOWED', message: 'No se puede registrar admin por este endpoint' } });
    }
    if (usersByEmail.has(email)) {
      return res.status(409).json({ success: false, error: { code: 'EMAIL_EXISTS', message: 'Email ya registrado' } });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: { code: 'WEAK_PASSWORD', message: 'La contraseña debe tener al menos 8 caracteres' } });
    }
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);
    const user: User = {
      id: `usr_${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}`,
      email,
      passwordHash,
      firstName,
      lastName,
      createdAt: new Date().toISOString()
    };
    usersByEmail.set(email, user);
    const token = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    return res.status(201).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        permissions: ['PAYMENTS_SEND', 'PAYMENTS_RECEIVE', 'PROFILE_VIEW']
      },
      token,
      refreshToken
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } });
  }
});

app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'Email y contraseña son obligatorios' } });
    }
    let user = usersByEmail.get(email);
    if (ADMIN_EMAIL && email === ADMIN_EMAIL) {
      if (!ADMIN_PASSWORD) {
        return res.status(500).json({ success: false, error: { code: 'ADMIN_PASSWORD_NOT_SET', message: 'ADMIN_PASSWORD no configurada' } });
      }
      if (!user) {
        const salt = await bcrypt.genSalt(12);
        const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, salt);
        user = { id: `admin_${Date.now().toString(36)}`, email, passwordHash, createdAt: new Date().toISOString() };
        usersByEmail.set(email, user);
      }
      const ok = await bcrypt.compare(password, user.passwordHash as string);
      if (!ok) {
        return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas' } });
      }
    } else {
      if (!user || !user.passwordHash) {
        return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas' } });
      }
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas' } });
      }
    }
    const token = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        permissions: (ADMIN_EMAIL && user.email === ADMIN_EMAIL)
          ? ['ADMIN', 'PAYMENTS_SEND', 'PAYMENTS_RECEIVE', 'PROFILE_VIEW']
          : ['PAYMENTS_SEND', 'PAYMENTS_RECEIVE', 'PROFILE_VIEW']
      },
      token,
      refreshToken
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } });
  }
});

// Set alias (unique, lowercase, 3-20 chars, letters/numbers/_-.)
app.post('/api/v1/users/alias', (req, res) => {
  const { userId, alias } = req.body as { userId?: string; alias?: string };
  if (!userId || !alias) {
    return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'userId y alias son obligatorios' } });
  }
  const norm = String(alias).trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,20}$/.test(norm)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_ALIAS', message: 'Alias inválido (3-20, a-z0-9._-)' } });
  }
  const existingUser = aliasToUser.get(norm);
  if (existingUser && existingUser !== userId) {
    return res.status(409).json({ success: false, error: { code: 'ALIAS_EXISTS', message: 'Alias ya está en uso' } });
  }
  const prev = userToAlias.get(userId);
  if (prev && prev !== norm) {
    aliasToUser.delete(prev);
  }
  aliasToUser.set(norm, userId);
  userToAlias.set(userId, norm);
  return res.json({ success: true, data: { userId, alias: norm } });
});

// Resolve alias -> userId
app.get('/api/v1/users/resolve', (req, res) => {
  const alias = String(req.query.alias || '').toLowerCase();
  if (!alias) return res.status(400).json({ success: false, error: { code: 'MISSING_ALIAS', message: 'alias requerido' } });
  const userId = aliasToUser.get(alias);
  if (!userId) return res.status(404).json({ success: false, error: { code: 'ALIAS_NOT_FOUND', message: 'Alias no encontrado' } });
  return res.json({ success: true, data: { userId, alias } });
});

// Get user profile (alias, email)
app.get('/api/v1/users/:userId', (req, res) => {
  const { userId } = req.params;
  const alias = userToAlias.get(userId) || null;
  let email: string | null = null;
  for (const [, u] of usersByEmail) {
    if (u.id === userId) { email = u.email; break; }
  }
  return res.json({ success: true, data: { userId, alias, email } });
});

app.listen(PORT, () => {
  console.log(`auth-service listening on http://localhost:${PORT}`);
});
