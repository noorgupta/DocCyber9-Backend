/*
 * ChronoSeal Doc-Audit MVP - Backend (index.js)
 * Node.js + Express with JWT Authentication + Salted SHA-256 + MongoDB
 * Does NOT call app.listen here (per request).
 */

const express = require('express');
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://doc-cyber9-frontend.vercel.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}));
const bodyParser = require('body-parser');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { MongoClient, ObjectId } = require('mongodb');
let uuidv4;
(async () => {
  const { v4 } = await import('uuid');
  uuidv4 = v4;
})();
const multer = require('multer');

const app = express();

// CORS - allow the Vite dev server origin (supports both 5173 and 5174)
app.use(
  cors({
    origin: ['http://localhost:5173', 'http://localhost:5174'],
    credentials: true,
  })
);

// JSON body parsing
// Increase JSON body limit a bit to be safe, but use multer for file uploads
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Multer in-memory storage for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// MongoDB connection details
const MONGO_URL =
  process.env.MONGO_URL ||
  'mongodb+srv://noorgupta24_db_user:8lJezeNnsAJgrstp@cluster0.rehreru.mongodb.net/?appName=Cluster0';
const DB_NAME = process.env.DB_NAME || 'ChronoSealDB';
const USERS_COLLECTION = 'users';
const DOCUMENTS_COLLECTION = 'documents';

// JWT secret - FIXED: Single consistent secret key
const JWT_SECRET = 'EMINENT_BLACKBIRD_SECRET_KEY_2025';
const JWT_EXPIRY = '1d'; // Token valid for 1 day

// Bcrypt salt rounds
const SALT_ROUNDS = 10;

let dbClient;
let db;

// Connect to MongoDB
async function connectToMongo() {
  if (dbClient && db) return { dbClient, db };
  dbClient = new MongoClient(MONGO_URL);
  await dbClient.connect();
  db = dbClient.db(DB_NAME);

  // Create indexes
  await db.collection(USERS_COLLECTION).createIndex({ email: 1 }, { unique: true });
  await db.collection(DOCUMENTS_COLLECTION).createIndex({ userId: 1 });
  await db.collection(DOCUMENTS_COLLECTION).createIndex({ createdAt: -1 });

  return { dbClient, db };
}

// Helper: generate salted SHA-256 hash for document integrity
function saltedHash(text, salt) {
  // Support both string and Buffer inputs
  if (Buffer.isBuffer(text)) {
    // Prepend salt as UTF-8 bytes to buffer
    return crypto
      .createHash('sha256')
      .update(Buffer.concat([Buffer.from(String(salt), 'utf8'), text]))
      .digest('hex');
  }

  if (typeof text !== 'string') text = String(text ?? '');
  return crypto.createHash('sha256').update(salt + text, 'utf8').digest('hex');
}

// Middleware: JWT Authentication
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
      return res
        .status(401)
        .json({ success: false, message: 'Authorization header required.' });
    }

    // Extract token from "Bearer TOKEN" format
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        success: false,
        message: 'Invalid authorization header format. Use: Bearer <token>',
      });
    }

    const token = parts[1];

    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: 'Access token required.' });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);

      // Attach user info to request
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        id: decoded.userId, // Alias for compatibility
      };

      next();
    } catch (jwtError) {
      console.error('❌ JWT Verification Error:', jwtError.message);

      if (jwtError.name === 'TokenExpiredError') {
        return res
          .status(403)
          .json({ success: false, message: 'Token expired. Please login again.' });
      } else if (jwtError.name === 'JsonWebTokenError') {
        return res
          .status(403)
          .json({ success: false, message: 'Invalid token. Please login again.' });
      } else {
        return res
          .status(403)
          .json({ success: false, message: 'Token verification failed.' });
      }
    }
  } catch (err) {
    console.error('❌ Auth middleware error:', err);
    return res.status(500).json({ success: false, message: 'Authentication error.' });
  }
}

// ========================================
// HEALTH CHECK ROUTE
// ========================================

// GET / - Simple health check
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'ChronoSeal Doc-Audit MVP Backend is running!',
    timestamp: new Date().toISOString(),
  });
});

// ========================================
// AUTHENTICATION ROUTES
// ========================================

// POST /auth/signup
// Body: { email, password, name }
app.post('/auth/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body || {};

    // Validation
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: 'Email and password are required.' });
    }

    if (typeof email !== 'string' || !email.includes('@')) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid email format.' });
    }

    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters.',
      });
    }

    await connectToMongo();

    // Check if user already exists
    const existingUser = await db
      .collection(USERS_COLLECTION)
      .findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res
        .status(409)
        .json({ success: false, message: 'User with this email already exists.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user
    const newUser = {
      email: email.toLowerCase(),
      password: hashedPassword,
      name: name || email.split('@')[0],
      createdAt: new Date(),
    };

    const result = await db.collection(USERS_COLLECTION).insertOne(newUser);

    // Generate JWT token with explicit userId
    const userId = result.insertedId.toString();
    const token = jwt.sign(
      {
        userId: userId,
        email: newUser.email,
        id: userId, // Alias for compatibility
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    console.log('✅ Signup successful for user:', userId, newUser.email);

    return res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      token,
      user: {
        id: userId,
        email: newUser.email,
        name: newUser.name,
      },
    });
  } catch (err) {
    console.error('Error in /auth/signup:', err);
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' });
  }
});

// POST /auth/login
// Body: { email, password }
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    // Validation
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: 'Email and password are required.' });
    }

    await connectToMongo();

    // Find user
    const user = await db
      .collection(USERS_COLLECTION)
      .findOne({ email: email.toLowerCase() });
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: 'Invalid email or password.' });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res
        .status(401)
        .json({ success: false, message: 'Invalid email or password.' });
    }

    // Generate JWT token with explicit userId
    const userId = user._id.toString();
    const token = jwt.sign(
      {
        userId: userId,
        email: user.email,
        id: userId, // Alias for compatibility
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    console.log('✅ Login successful for user:', userId, user.email);

    return res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: userId,
        email: user.email,
        name: user.name,
      },
    });
  } catch (err) {
    console.error('Error in /auth/login:', err);
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' });
  }
});

// ========================================
// PROTECTED DOCUMENT ROUTES
// ========================================

// POST /document/store
// Body: { documentText }
// Headers: Authorization: Bearer <token>
// Accept either JSON { documentText } OR multipart form with file field 'file'
app.post(
  '/document/store',
  authenticateToken,
  upload.single('file'),
  async (req, res) => {
    try {
      // documentText may come in body (string) or file buffer in req.file
      let documentContent = null;
      let originalTextForComparison = null;

      if (req.file && req.file.buffer) {
        // Use the raw file buffer for hashing
        documentContent = req.file.buffer;
        // Store text version for AI comparison (if it's text-based)
        try {
          originalTextForComparison = req.file.buffer.toString('utf8');
        } catch (e) {
          // If it's binary, we can't do text comparison
          originalTextForComparison = null;
        }
      } else if (req.body && req.body.documentText) {
        // Accept either raw string or base64 payload
        documentContent = req.body.documentText;
        originalTextForComparison = req.body.documentText;
      }

      if (!documentContent) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or missing document content. Provide file or documentText.',
        });
      }

      await connectToMongo();

      const salt = uuidv4();
      const hash = saltedHash(documentContent, salt);
      const createdAt = new Date();

      const payload = {
        userId: req.user.userId, // From JWT token
        hash,
        salt,
        createdAt,
        // Store original text for AI tamper detection (optional, only if text-based)
        originalText: originalTextForComparison || null,
      };

      const result = await db.collection(DOCUMENTS_COLLECTION).insertOne(payload);

      return res.json({
        success: true,
        id: result.insertedId.toString(),
        message: 'Document hash stored successfully.',
      });
    } catch (err) {
      console.error('Error in /document/store:', err);
      return res
        .status(500)
        .json({ success: false, message: 'Internal server error.' });
    }
  }
);

// GET /document/:id
// Returns document metadata (hash, salt, createdAt)
app.get('/document/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params || {};
    if (!id)
      return res
        .status(400)
        .json({ success: false, message: 'Missing document ID in URL.' });

    await connectToMongo();

    let doc;
    try {
      doc = await db
        .collection(DOCUMENTS_COLLECTION)
        .findOne({ _id: new ObjectId(id) });
    } catch (e) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid document ID format.' });
    }

    if (!doc) {
      return res
        .status(404)
        .json({ success: false, message: 'Document not found.' });
    }

    // Ensure the requesting user owns this document
    if (doc.userId !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This document belongs to another user.',
      });
    }

    return res.json({
      success: true,
      id: doc._id.toString(),
      hash: doc.hash,
      salt: doc.salt,
      createdAt:
        doc.createdAt instanceof Date
          ? doc.createdAt.toISOString()
          : new Date(doc.createdAt).toISOString(),
    });
  } catch (err) {
    console.error('Error in GET /document/:id:', err);
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' });
  }
});

// GET /documents
// Returns recent documents for the authenticated user (most recent first)
app.get('/documents', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '10', 10);
    await connectToMongo();

    const docsCursor = db
      .collection(DOCUMENTS_COLLECTION)
      .find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(limit);

    const docs = await docsCursor.toArray();

    const sanitized = docs.map((d) => ({
      id: d._id.toString(),
      hash: d.hash,
      salt: d.salt,
      createdAt:
        d.createdAt instanceof Date
          ? d.createdAt.toISOString()
          : new Date(d.createdAt).toISOString(),
    }));

    return res.json({ success: true, documents: sanitized });
  } catch (err) {
    console.error('Error in GET /documents:', err);
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error.' });
  }
});

// POST /document/verify/:id
// Body: { documentText } OR multipart form with file field 'file'
// Headers: Authorization: Bearer <token>
// Response: { success, match, message, id, createdAt, auditTrail }
app.post(
  '/document/verify/:id',
  authenticateToken,
  upload.single('file'),
  async (req, res) => {
    try {
      const { id } = req.params || {};

      // Accept documentText in body or file buffer
      let documentText = null;
      if (req.file && req.file.buffer) {
        documentText = req.file.buffer;
      } else if (req.body && typeof req.body.documentText === 'string') {
        documentText = req.body.documentText;
      }

      if (!id) {
        return res.status(400).json({
          success: false,
          match: false,
          message: 'Missing document ID in URL.',
        });
      }

      if (!documentText) {
        return res.status(400).json({
          success: false,
          match: false,
          message:
            'Invalid or missing document content. Provide file or documentText.',
        });
      }

      await connectToMongo();

      let doc;
      try {
        doc = await db
          .collection(DOCUMENTS_COLLECTION)
          .findOne({ _id: new ObjectId(id) });
      } catch (e) {
        return res.status(400).json({
          success: false,
          match: false,
          message: 'Invalid document ID format.',
        });
      }

      if (!doc) {
        return res.status(404).json({
          success: false,
          match: false,
          message: 'Document not found.',
        });
      }

      // Check if document belongs to the authenticated user
      if (doc.userId !== req.user.userId) {
        return res.status(403).json({
          success: false,
          match: false,
          message: 'Access denied. This document belongs to another user.',
        });
      }

      const recalculated = saltedHash(documentText, doc.salt);
      const match = recalculated === doc.hash;

      const message = match
        ? 'Hashes match. Document integrity verified.'
        : 'Hashes do not match. Document may have been altered.';

      // Audit trail
      const auditTrail = {
        documentId: doc._id.toString(),
        userId: doc.userId,
        originalHash: doc.hash,
        submittedHash: recalculated,
        match,
        timestamp: new Date().toISOString(),
        originalCreatedAt:
          doc.createdAt instanceof Date
            ? doc.createdAt.toISOString()
            : new Date(doc.createdAt).toISOString(),
      };

      return res.json({
        success: true,
        match,
        message,
        id: doc._id.toString(),
        createdAt:
          doc.createdAt instanceof Date
            ? doc.createdAt.toISOString()
            : new Date(doc.createdAt).toISOString(),
        auditTrail,
      });
    } catch (err) {
      console.error('Error in /document/verify/:id:', err);
      return res.status(500).json({
        success: false,
        match: false,
        message: 'Internal server error.',
      });
    }
  }
);

// ========================================
// EXPORTS FOR VERCEL + TESTS
// ========================================

// Export the Express app as the default export (Vercel needs this)
module.exports = app;

// Optional: attach helpers for tests/tools without breaking Vercel
module.exports.connectToMongo = connectToMongo;
module.exports.saltedHash = saltedHash;
module.exports.authenticateToken = authenticateToken;
