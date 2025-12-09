/*
 * ChronoSeal Doc-Audit MVP - Backend (index.js)
 * Node.js + Express with JWT Authentication + Salted SHA-256 + MongoDB
 * Fully Vercel-compatible (uses dynamic import for uuid)
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { MongoClient, ObjectId } = require('mongodb');
const multer = require('multer');

const app = express();

// ✅ Dynamic import for UUID (Vercel-compatible)
async function getUUID() {
  const { v4 } = await import('uuid');
  return v4();
}

// ✅ Allow frontend + local CORS
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://doc-cyber9-frontend.vercel.app'
  ],
  credentials: true
}));

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

const upload = multer({ storage: multer.memoryStorage() });

const MONGO_URL = process.env.MONGO_URL;
const DB_NAME = process.env.DB_NAME || 'ChronoSealDB';
const USERS_COLLECTION = 'users';
const DOCUMENTS_COLLECTION = 'documents';

const JWT_SECRET = 'EMINENT_BLACKBIRD_SECRET_KEY_2025';
const JWT_EXPIRY = '1d';
const SALT_ROUNDS = 10;

let db, dbClient;

async function connectToMongo() {
  if (dbClient && db) return { dbClient, db };
  dbClient = new MongoClient(MONGO_URL);
  await dbClient.connect();
  db = dbClient.db(DB_NAME);
  console.log(`✅ Connected to MongoDB: ${DB_NAME}`);
  return { dbClient, db };
}

function saltedHash(text, salt) {
  if (Buffer.isBuffer(text)) {
    return crypto.createHash('sha256')
      .update(Buffer.concat([Buffer.from(String(salt), 'utf8'), text]))
      .digest('hex');
  }
  return crypto.createHash('sha256')
    .update(salt + String(text ?? ''), 'utf8')
    .digest('hex');
}

async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ success: false, message: 'Authorization header required.' });

    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Access token required.' });

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('JWT Error:', err.message);
    return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
  }
}

// ✅ Health check route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'ChronoSeal Doc-Audit MVP Backend is running!',
    timestamp: new Date().toISOString()
  });
});

// ✅ Signup route
app.post('/auth/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required.' });

    await connectToMongo();
    const existingUser = await db.collection(USERS_COLLECTION).findOne({ email: email.toLowerCase() });
    if (existingUser) return res.status(409).json({ success: false, message: 'User already exists.' });

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const newUser = {
      email: email.toLowerCase(),
      password: hashedPassword,
      name: name || email.split('@')[0],
      createdAt: new Date(),
    };

    const result = await db.collection(USERS_COLLECTION).insertOne(newUser);
    const token = jwt.sign({ userId: result.insertedId.toString(), email }, JWT_SECRET, { expiresIn: JWT_EXPIRY });

    res.status(201).json({ success: true, message: 'User created successfully', token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ✅ Login route
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    await connectToMongo();

    const user = await db.collection(USERS_COLLECTION).findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const token = jwt.sign({ userId: user._id.toString(), email }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    res.json({ success: true, message: 'Login successful', token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ✅ Example document route using new UUID function
app.post('/document/store', authenticateToken, async (req, res) => {
  try {
    await connectToMongo();
    const id = await getUUID();
    const payload = { _id: id, userId: req.user.userId, createdAt: new Date() };
    await db.collection(DOCUMENTS_COLLECTION).insertOne(payload);
    res.json({ success: true, id, message: 'Document stored' });
  } catch (err) {
    console.error('Document Error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ✅ Export app for Vercel (top-level)
module.exports = app;
