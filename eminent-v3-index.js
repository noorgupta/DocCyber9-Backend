/**
 * ═══════════════════════════════════════════════════════════════════
 * EMINENT V3 BACKEND - Advanced Document Integrity Verification
 * ═══════════════════════════════════════════════════════════════════
 * Features:
 * - JWT Authentication (bcrypt + jsonwebtoken)
 * - MongoDB Persistence (EminentDB)
 * - Advanced Document Storage (Text + Base64 Media)
 * - Salted SHA-256 Hashing with UUID
 * - Batch Verification
 * - AI-Powered Tamper Detection (Placeholder for LLM)
 * - Complete Audit Trail
 * ═══════════════════════════════════════════════════════════════════
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

const app = express();

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true
}));
app.use(bodyParser.json({ limit: '50mb' })); // Support large Base64 files
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Constants
const MONGODB_URI = 'mongodb://localhost:27017';
const DB_NAME = 'EminentDB';
const JWT_SECRET = 'eminent-v3-secret-key-change-in-production';
const JWT_EXPIRY = '7d';
const BCRYPT_ROUNDS = 10;

let db;

// ═══════════════════════════════════════════════════════════════════
// DATABASE CONNECTION
// ═══════════════════════════════════════════════════════════════════

async function connectToMongo() {
  try {
    const client = await MongoClient.connect(MONGODB_URI);
    db = client.db(DB_NAME);
    
    // Create indexes for performance
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('documents').createIndex({ userId: 1 });
    await db.collection('documents').createIndex({ createdAt: -1 });
    
    console.log(`✅ Connected to MongoDB: ${DB_NAME}`);
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate salted SHA-256 hash
 * @param {string} text - Input text or Base64 string
 * @param {string} salt - UUID salt
 * @returns {string} - SHA-256 hash
 */
function generateSaltedHash(text, salt) {
  const saltedText = text + salt;
  return crypto.createHash('sha256').update(saltedText).digest('hex');
}

/**
 * Detect if input is Base64 encoded
 * @param {string} str - Input string
 * @returns {boolean}
 */
function isBase64(str) {
  if (!str || typeof str !== 'string') return false;
  try {
    // Check if it's a valid Base64 string
    const base64Regex = /^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+)?;base64,/;
    if (base64Regex.test(str)) return true;
    
    // Check if it's pure Base64 without data URI
    return Buffer.from(str, 'base64').toString('base64') === str;
  } catch (err) {
    return false;
  }
}

/**
 * Normalize input (handles both text and Base64)
 * @param {string} input - Raw text or Base64 string
 * @returns {string} - Normalized string for hashing
 */
function normalizeInput(input) {
  if (isBase64(input)) {
    // Remove data URI prefix if present
    const base64Data = input.replace(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+)?;base64,/, '');
    return base64Data;
  }
  return input.trim();
}

// ═══════════════════════════════════════════════════════════════════
// JWT MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════

/**
 * Authenticate JWT token from Authorization header
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Access denied. No token provided.'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      error: 'Invalid or expired token.'
    });
  }
}

// ═══════════════════════════════════════════════════════════════════
// AUTHENTICATION ROUTES
// ═══════════════════════════════════════════════════════════════════

/**
 * POST /auth/signup
 * Register new user with bcrypt password hashing
 */
app.post('/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required.'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long.'
      });
    }

    // Check if user exists
    const existingUser = await db.collection('users').findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User with this email already exists.'
      });
    }

    // Hash password with bcrypt
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Create user
    const newUser = {
      name: name || null,
      email,
      password: hashedPassword,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection('users').insertOne(newUser);
    const userId = result.insertedId.toString();

    // Generate JWT token
    const token = jwt.sign(
      { id: userId, email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      token,
      user: {
        id: userId,
        name: name || null,
        email
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during signup.'
    });
  }
});

/**
 * POST /auth/login
 * Authenticate user with bcrypt password verification
 */
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required.'
      });
    }

    // Find user
    const user = await db.collection('users').findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.'
      });
    }

    // Verify password with bcrypt
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id.toString(), email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during login.'
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// DOCUMENT ROUTES (PROTECTED WITH JWT)
// ═══════════════════════════════════════════════════════════════════

/**
 * POST /document/store
 * Store document hash with support for text and Base64 media files
 * Protected route - requires JWT authentication
 */
app.post('/document/store', authenticateToken, async (req, res) => {
  try {
    const { documentText, fileName, fileType } = req.body;
    const userId = req.user.id;

    // Validation
    if (!documentText) {
      return res.status(400).json({
        success: false,
        error: 'Document text or Base64 string is required.'
      });
    }

    // Normalize input (handles both text and Base64)
    const normalizedInput = normalizeInput(documentText);
    
    // Detect input type
    const inputType = isBase64(documentText) ? 'base64' : 'text';

    // Generate unique UUID salt
    const salt = uuidv4();

    // Generate salted SHA-256 hash
    const hash = generateSaltedHash(normalizedInput, salt);

    // Create document record
    const document = {
      userId,
      hash,
      salt,
      inputType,
      fileName: fileName || null,
      fileType: fileType || null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection('documents').insertOne(document);
    const documentId = result.insertedId.toString();

    res.status(201).json({
      success: true,
      message: inputType === 'base64' 
        ? 'Media file hash stored successfully.' 
        : 'Document hash stored successfully.',
      id: documentId,
      hash,
      salt,
      inputType,
      timestamp: document.createdAt
    });
  } catch (error) {
    console.error('Store error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during document storage.'
    });
  }
});

/**
 * POST /document/verify/:id
 * Verify document integrity with detailed audit trail
 * Protected route - requires JWT authentication
 */
app.post('/document/verify/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { documentText } = req.body;
    const userId = req.user.id;

    // Validation
    if (!documentText) {
      return res.status(400).json({
        success: false,
        error: 'Document text or Base64 string is required.'
      });
    }

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid document ID format.'
      });
    }

    // Find document
    const document = await db.collection('documents').findOne({
      _id: new ObjectId(id),
      userId
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'Document not found or access denied.'
      });
    }

    // Normalize input
    const normalizedInput = normalizeInput(documentText);

    // Recalculate hash with stored salt
    const computedHash = generateSaltedHash(normalizedInput, document.salt);

    // Compare hashes
    const match = computedHash === document.hash;

    // Create detailed audit trail
    const auditTrail = {
      documentId: id,
      userId,
      inputType: document.inputType,
      fileName: document.fileName,
      fileType: document.fileType,
      originalHash: document.hash,
      computedHash,
      salt: document.salt,
      match,
      storedAt: document.createdAt,
      verifiedAt: new Date(),
      timeSinceStorage: new Date() - document.createdAt // milliseconds
    };

    res.json({
      success: true,
      message: match 
        ? 'Document integrity verified. No tampering detected.' 
        : 'Document has been altered. Tampering detected.',
      match,
      auditTrail
    });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during verification.'
    });
  }
});

/**
 * POST /document/compare-tamper
 * AI-powered tamper detection with detailed change analysis
 * Protected route - requires JWT authentication
 * 
 * NOTE: This uses a PLACEHOLDER function for LLM integration.
 * Replace analyzeTamperingWithLLM() with actual API calls to:
 * - OpenAI GPT-4
 * - Anthropic Claude
 * - Google Gemini
 * - Or any other LLM service
 */
app.post('/document/compare-tamper', authenticateToken, async (req, res) => {
  try {
    const { originalText, tamperedText } = req.body;

    // Validation
    if (!originalText || !tamperedText) {
      return res.status(400).json({
        success: false,
        error: 'Both originalText and tamperedText are required.'
      });
    }

    // Quick comparison
    if (originalText === tamperedText) {
      return res.json({
        success: true,
        message: 'No changes detected. Documents are identical.',
        changes: [],
        summary: 'No tampering detected.'
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // AI-POWERED TAMPER DETECTION (PLACEHOLDER)
    // ═══════════════════════════════════════════════════════════════
    // TODO: Replace this with actual LLM API call
    // Example integrations:
    //
    // 1. OpenAI GPT-4:
    //    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    //    const response = await openai.chat.completions.create({
    //      model: "gpt-4-turbo",
    //      messages: [{
    //        role: "user",
    //        content: `Analyze these two documents and identify specific changes:\n\n
    //                  Original: ${originalText}\n\n
    //                  Tampered: ${tamperedText}`
    //      }],
    //      response_format: { type: "json_object" }
    //    });
    //
    // 2. Anthropic Claude:
    //    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    //    const response = await anthropic.messages.create({
    //      model: "claude-3-5-sonnet-20241022",
    //      messages: [{ role: "user", content: prompt }]
    //    });
    //
    // 3. Google Gemini:
    //    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    //    const result = await model.generateContent(prompt);
    //
    // ═══════════════════════════════════════════════════════════════

    // PLACEHOLDER: Simulate LLM response
    const llmAnalysis = await analyzeTamperingWithLLM(originalText, tamperedText);

    res.json({
      success: true,
      message: 'Tamper analysis completed.',
      changes: llmAnalysis.changes,
      summary: llmAnalysis.summary,
      severity: llmAnalysis.severity,
      affectedSections: llmAnalysis.affectedSections
    });
  } catch (error) {
    console.error('Compare-tamper error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during tamper analysis.'
    });
  }
});

/**
 * PLACEHOLDER FUNCTION FOR LLM INTEGRATION
 * 
 * Replace this with actual API calls to your LLM provider.
 * This function should return a structured JSON object with:
 * - changes: Array of detected modifications
 * - summary: Overall description of changes
 * - severity: Impact level (low, medium, high, critical)
 * - affectedSections: List of modified sections
 * 
 * @param {string} originalText - Original document text
 * @param {string} tamperedText - Modified document text
 * @returns {Promise<Object>} - Structured analysis result
 */
async function analyzeTamperingWithLLM(originalText, tamperedText) {
  // ═══════════════════════════════════════════════════════════════
  // EXTERNAL LLM API INTEGRATION GOES HERE
  // ═══════════════════════════════════════════════════════════════
  // Example prompt for LLM:
  //
  // const prompt = `
  //   You are a document integrity analyst. Compare these two documents and identify all changes.
  //   
  //   Original Document:
  //   ${originalText}
  //   
  //   Tampered Document:
  //   ${tamperedText}
  //   
  //   Provide a JSON response with:
  //   {
  //     "changes": [
  //       {
  //         "type": "addition|deletion|modification",
  //         "location": "paragraph/section identifier",
  //         "original": "original text snippet",
  //         "tampered": "modified text snippet",
  //         "description": "what was changed"
  //       }
  //     ],
  //     "summary": "overall description of changes",
  //     "severity": "low|medium|high|critical",
  //     "affectedSections": ["section1", "section2"]
  //   }
  // `;
  //
  // const llmResponse = await callYourLLMAPI(prompt);
  // return JSON.parse(llmResponse);
  // ═══════════════════════════════════════════════════════════════

  // PLACEHOLDER: Basic text comparison for demo purposes
  // This is a simplified version - replace with actual LLM analysis
  
  return new Promise((resolve) => {
    setTimeout(() => {
      // Simple diff simulation
      const changes = [];
      const originalLines = originalText.split('\n');
      const tamperedLines = tamperedText.split('\n');
      
      for (let i = 0; i < Math.max(originalLines.length, tamperedLines.length); i++) {
        const origLine = originalLines[i] || '';
        const tampLine = tamperedLines[i] || '';
        
        if (origLine !== tampLine) {
          changes.push({
            type: origLine && tampLine ? 'modification' : (tampLine ? 'addition' : 'deletion'),
            location: `Line ${i + 1}`,
            original: origLine.substring(0, 100),
            tampered: tampLine.substring(0, 100),
            description: `Content changed at line ${i + 1}`
          });
        }
      }

      resolve({
        changes: changes.slice(0, 10), // Limit to 10 changes for demo
        summary: `Detected ${changes.length} modification(s) between original and tampered documents.`,
        severity: changes.length > 5 ? 'high' : (changes.length > 2 ? 'medium' : 'low'),
        affectedSections: changes.map(c => c.location),
        note: '⚠️ PLACEHOLDER: Replace with actual LLM API integration (OpenAI, Claude, Gemini, etc.)'
      });
    }, 500); // Simulate API delay
  });
}

/**
 * POST /document/batch-verify
 * Batch verification of multiple documents
 * Protected route - requires JWT authentication
 */
app.post('/document/batch-verify', authenticateToken, async (req, res) => {
  try {
    const { documents } = req.body;
    const userId = req.user.id;

    // Validation
    if (!documents || !Array.isArray(documents)) {
      return res.status(400).json({
        success: false,
        error: 'Documents array is required. Format: [{id: "ID1", text: "Text1"}, ...]'
      });
    }

    if (documents.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Documents array cannot be empty.'
      });
    }

    if (documents.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 100 documents can be verified in a single batch.'
      });
    }

    // Validate each document has required fields
    for (const doc of documents) {
      if (!doc.id || !doc.text) {
        return res.status(400).json({
          success: false,
          error: 'Each document must have "id" and "text" properties.'
        });
      }
    }

    // Batch verification
    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (const doc of documents) {
      try {
        // Validate ObjectId
        if (!ObjectId.isValid(doc.id)) {
          results.push({
            documentId: doc.id,
            success: false,
            error: 'Invalid document ID format.',
            match: false
          });
          failCount++;
          continue;
        }

        // Find document
        const document = await db.collection('documents').findOne({
          _id: new ObjectId(doc.id),
          userId
        });

        if (!document) {
          results.push({
            documentId: doc.id,
            success: false,
            error: 'Document not found or access denied.',
            match: false
          });
          failCount++;
          continue;
        }

        // Normalize input
        const normalizedInput = normalizeInput(doc.text);

        // Recalculate hash
        const computedHash = generateSaltedHash(normalizedInput, document.salt);

        // Compare
        const match = computedHash === document.hash;

        // Add to results
        results.push({
          documentId: doc.id,
          success: true,
          match,
          auditTrail: {
            documentId: doc.id,
            userId,
            inputType: document.inputType,
            fileName: document.fileName,
            originalHash: document.hash,
            computedHash,
            salt: document.salt,
            match,
            storedAt: document.createdAt,
            verifiedAt: new Date()
          }
        });

        if (match) successCount++;
        else failCount++;
      } catch (err) {
        results.push({
          documentId: doc.id,
          success: false,
          error: err.message,
          match: false
        });
        failCount++;
      }
    }

    res.json({
      success: true,
      message: `Batch verification completed. ${successCount} verified, ${failCount} failed/tampered.`,
      totalDocuments: documents.length,
      successCount,
      failCount,
      results
    });
  } catch (error) {
    console.error('Batch verify error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during batch verification.'
    });
  }
});

/**
 * GET /document/list
 * List all documents for authenticated user
 * Protected route - requires JWT authentication
 */
app.get('/document/list', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50, skip = 0 } = req.query;

    const documents = await db.collection('documents')
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .project({ hash: 0, salt: 0 }) // Hide sensitive data
      .toArray();

    const total = await db.collection('documents').countDocuments({ userId });

    res.json({
      success: true,
      total,
      documents: documents.map(doc => ({
        id: doc._id.toString(),
        inputType: doc.inputType,
        fileName: doc.fileName,
        fileType: doc.fileType,
        createdAt: doc.createdAt
      }))
    });
  } catch (error) {
    console.error('List documents error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error while listing documents.'
    });
  }
});

/**
 * DELETE /document/delete/:id
 * Delete a document
 * Protected route - requires JWT authentication
 */
app.delete('/document/delete/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid document ID format.'
      });
    }

    const result = await db.collection('documents').deleteOne({
      _id: new ObjectId(id),
      userId
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Document not found or access denied.'
      });
    }

    res.json({
      success: true,
      message: 'Document deleted successfully.'
    });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during document deletion.'
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// HEALTH CHECK & INFO ROUTES
// ═══════════════════════════════════════════════════════════════════

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    service: 'Eminent V3 Backend',
    timestamp: new Date(),
    mongodb: db ? 'connected' : 'disconnected'
  });
});

/**
 * GET /api/info
 * API information and available endpoints
 */
app.get('/api/info', (req, res) => {
  res.json({
    success: true,
    service: 'Eminent V3 - Advanced Document Integrity Verification',
    version: '3.0.0',
    features: [
      'JWT Authentication (bcrypt + jsonwebtoken)',
      'Text & Base64 Media Support',
      'Salted SHA-256 Hashing with UUID',
      'Batch Document Verification',
      'AI-Powered Tamper Detection (Placeholder)',
      'Complete Audit Trail',
      'MongoDB Persistence'
    ],
    endpoints: {
      authentication: {
        signup: 'POST /auth/signup',
        login: 'POST /auth/login'
      },
      documents: {
        store: 'POST /document/store (Protected)',
        verify: 'POST /document/verify/:id (Protected)',
        batchVerify: 'POST /document/batch-verify (Protected)',
        compareTamper: 'POST /document/compare-tamper (Protected)',
        list: 'GET /document/list (Protected)',
        delete: 'DELETE /document/delete/:id (Protected)'
      },
      utility: {
        health: 'GET /health',
        info: 'GET /api/info'
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found.',
    requestedPath: req.path,
    hint: 'Visit /api/info for available endpoints.'
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error.',
    message: err.message
  });
});

// ═══════════════════════════════════════════════════════════════════
// EXPORT & INITIALIZATION
// ═══════════════════════════════════════════════════════════════════

// Initialize MongoDB connection
connectToMongo().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// Export app (for testing or external server setup)
module.exports = app;

/**
 * ═══════════════════════════════════════════════════════════════════
 * TO START THE SERVER, ADD THESE LINES IN A SEPARATE FILE:
 * ═══════════════════════════════════════════════════════════════════
 * 
 * const app = require('./eminent-v3-index');
 * const PORT = 3000;
 * 
 * app.listen(PORT, () => {
 *   console.log(`🚀 Eminent V3 Backend running on http://localhost:${PORT}`);
 * });
 * 
 * ═══════════════════════════════════════════════════════════════════
 */
