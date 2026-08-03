# DocCyber Backend

REST API powering the **DocCyber Document Integrity Verification System**. It provides secure authentication, document hashing, integrity verification, and document management services.

## Live API

**Base URL:** https://doccyber9-backend.onrender.com

API Information:
https://doccyber9-backend.onrender.com/api/info

Health Check:
https://doccyber9-backend.onrender.com/health

---

## Features

- JWT Authentication
- Password Hashing (bcrypt)
- SHA-256 Document Hashing
- Salted Hash Generation
- Document Integrity Verification
- Tamper Detection
- File & Text Document Support
- Protected REST APIs
- MongoDB Atlas Integration

---

## Tech Stack

| Category | Technologies |
|----------|--------------|
| Runtime | Node.js |
| Framework | Express.js |
| Database | MongoDB Atlas |
| Authentication | JWT |
| Password Security | bcrypt |
| File Upload | Multer |
| Deployment | Render |

---

## API Endpoints

### Authentication

| Method | Endpoint |
|---------|----------|
| POST | `/auth/signup` |
| POST | `/auth/login` |

### Documents

| Method | Endpoint |
|---------|----------|
| POST | `/document/store` |
| POST | `/document/verify/:id` |
| POST | `/document/batch-verify` |
| POST | `/document/compare-tamper` |
| GET | `/document/list` |
| DELETE | `/document/delete/:id` |

---

## Environment Variables

```env
MONGO_URI=

JWT_SECRET=

DB_NAME=
```

---

## Installation

```bash
git clone https://github.com/noorgupta/DocCyber9-Backend.git

cd DocCyber9-Backend

npm install
```

Run the server

```bash
node eminent-v3-server.js
```

---

## Frontend Repository

https://github.com/noorgupta/DocCyber9-Frontend

---

## Author

**Noor Gupta**

GitHub: https://github.com/noorgupta
