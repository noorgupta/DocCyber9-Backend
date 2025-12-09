/**
 * ═══════════════════════════════════════════════════════════════════
 * EMINENT V3 BACKEND - SERVER STARTER
 * ═══════════════════════════════════════════════════════════════════
 * This file starts the Eminent V3 server on port 3000
 */

const app = require('./eminent-v3-index');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🚀 EMINENT V3 BACKEND - STARTED');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log(`📊 API Info: http://localhost:${PORT}/api/info`);
  console.log(`❤️  Health Check: http://localhost:${PORT}/health`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔐 Authentication Endpoints:');
  console.log(`   POST /auth/signup - Register new user`);
  console.log(`   POST /auth/login  - Authenticate user`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📄 Document Endpoints (Protected):');
  console.log(`   POST   /document/store            - Store document hash`);
  console.log(`   POST   /document/verify/:id       - Verify integrity`);
  console.log(`   POST   /document/batch-verify     - Batch verification`);
  console.log(`   POST   /document/compare-tamper   - AI tamper detection`);
  console.log(`   GET    /document/list             - List documents`);
  console.log(`   DELETE /document/delete/:id       - Delete document`);
  console.log('═══════════════════════════════════════════════════════════');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('⏹️  SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n⏹️  SIGINT received. Shutting down gracefully...');
  process.exit(0);
});
