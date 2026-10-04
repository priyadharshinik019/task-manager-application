const { pbkdf2, randomBytes, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const { pool } = require('../config/database');
const jwt = require('jsonwebtoken');

const pbkdf2Async = promisify(pbkdf2);
const iterations = 210000;
const keyLength = 32;
const digest = 'sha256';

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await pbkdf2Async(password, salt, iterations, keyLength, digest);
  return `pbkdf2$${iterations}$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

async function verifyPassword(password, passwordHash) {
  const [algorithm, iterationText, saltHex, derivedKeyHex] = passwordHash.split('$');
  const storedIterations = Number(iterationText);

  if (
    algorithm !== 'pbkdf2' ||
    !Number.isSafeInteger(storedIterations) ||
    storedIterations < 1 ||
    !/^(?:[0-9a-f]{2})+$/i.test(saltHex || '') ||
    !/^(?:[0-9a-f]{2})+$/i.test(derivedKeyHex || '')
  ) {
    return false;
  }

  const salt = Buffer.from(saltHex, 'hex');
  const expectedKey = Buffer.from(derivedKeyHex, 'hex');
  const actualKey = await pbkdf2Async(password, salt, storedIterations, expectedKey.length, digest);

  return actualKey.length === expectedKey.length && timingSafeEqual(actualKey, expectedKey);
}

async function registerUser({ name, email, password }) {
  const passwordHash = await hashPassword(password);

  try {
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email`,
      [name, email, passwordHash]
    );

    return result.rows[0];
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'users_email_key') {
      const duplicateEmailError = new Error('Email already exists.');
      duplicateEmailError.code = 'DUPLICATE_EMAIL';
      throw duplicateEmailError;
    }

    throw error;
  }
}

async function loginUser({ email, password }) {
  const result = await pool.query(
    'SELECT id, password_hash FROM users WHERE email = $1',
    [email]
  );
  const user = result.rows[0];

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    const invalidCredentialsError = new Error('Invalid email or password.');
    invalidCredentialsError.code = 'INVALID_CREDENTIALS';
    throw invalidCredentialsError;
  }

  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN;
  if (!secret || !expiresIn) {
    throw new Error('JWT_SECRET and JWT_EXPIRES_IN must be configured.');
  }

  const accessToken = jwt.sign(
    { userId: user.id },
    secret,
    { expiresIn }
  );

  return { accessToken };
}

module.exports = { registerUser, loginUser };
