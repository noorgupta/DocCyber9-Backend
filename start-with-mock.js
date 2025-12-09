/*
 * Development server with mock MongoDB (in-memory fallback)
 * Use this if you don't have MongoDB installed yet
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const app = express();

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(bodyParser.json());

// In-memory mock database
const mockDB = new Map();

// Helper: generate salted SHA-256 hash
function saltedHash(text, salt) {
  if (typeof text !== 'string') text = String(text ?? '');
  return crypto.createHash('sha256').update(salt + text, 'utf8').digest('hex');
}

// Route: POST /api/store
app.post('/api/store', async (req, res) => {
  try {
    const { documentText } = req.body || {};
    if (!documentText || typeof documentText !== 'string') {
      return res.status(400).json({ success: false, message: 'Invalid or missing "documentText" in request body.' });
    }

    const salt = uuidv4();
    const hash = saltedHash(documentText, salt);
    const createdAt = new Date();
    const id = uuidv4();

    mockDB.set(id, { hash, salt, createdAt });

    return res.json({ success: true, id, message: 'Hash stored successfully.' });
  } catch (err) {
    console.error('Error in /api/store:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// Route: POST /api/verify/:id
app.post('/api/verify/:id', async (req, res) => {
  try {
    const { id } = req.params || {};
    const { documentText } = req.body || {};

    if (!id) {
      return res.status(400).json({ success: false, match: false, message: 'Missing ID in URL.' });
    }

    if (typeof documentText !== 'string') {
      return res.status(400).json({ success: false, match: false, message: 'Invalid or missing "documentText" in request body.' });
    }

    const doc = mockDB.get(id);

    if (!doc) {
      return res.status(404).json({ success: false, match: false, message: 'ID not found.' });
    }

    const recalculated = saltedHash(documentText, doc.salt);
    const match = recalculated === doc.hash;

    const message = match
      ? 'Hashes match. Document integrity verified.'
      : 'Hashes do not match. Document may have been altered.';

    return res.json({
      success: true,
      match,
      message,
      id,
      createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : new Date(doc.createdAt).toISOString(),
    });
  } catch (err) {
    console.error('Error in /api/verify/:id:', err);
    return res.status(500).json({ success: false, match: false, message: 'Internal server error.' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`⚠️  Running with MOCK in-memory database (no MongoDB)`);
  console.log(`🚀 SecureSign Doc-Audit V2 Backend running on http://localhost:${PORT}`);
  console.log(`💡 To use real MongoDB, install it and run: npm start`);
});
