# URL Shortener

A professional URL shortening service with comprehensive analytics, user authentication, and a modern interface. Built with Node.js, Express, PostgreSQL, and Redis.

**Live Demo**: [https://url-shortener-65ru.onrender.com](https://url-shortener-65ru.onrender.com)

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Deployment](#deployment)
- [License](#license)

---

## Features

### Core Functionality

- **URL Shortening**: Convert long URLs into concise, shareable links
- **Custom Aliases**: Create memorable custom short codes
- **Topic Organization**: Categorize URLs by topic for better management

### Analytics Dashboard

- **Performance Metrics**: Track total URLs, clicks, and unique locations
- **Time-Series Analytics**: View click trends over the last 7 days
- **Device Breakdown**: Analyze traffic by device type (Desktop, Mobile, Tablet)
- **Top Links**: See your most clicked shortened URLs

### Security and Authentication

- **Google OAuth**: Secure authentication via Google accounts
- **Session Management**: Redis-backed sessions for reliability
- **Rate Limiting**: Token bucket algorithm prevents API abuse
- **JWT Tokens**: Secure API access with JSON Web Tokens

### Performance

- **Redis Caching**: URL lookups cached for fast redirects
- **Connection Pooling**: Efficient database connections
- **Optimized Queries**: Indexed database for quick analytics

---

## Architecture

```
                                    +------------------+
                                    |   Google OAuth   |
                                    +--------+---------+
                                             |
                                             v
+-------------+       HTTPS        +-------------------+
|   Client    | <----------------> |   Node.js API     |
|  (Browser)  |                    |   (Express.js)    |
+-------------+                    +--------+----------+
                                            |
                          +-----------------+-----------------+
                          |                                   |
                          v                                   v
                 +------------------+               +------------------+
                 |   PostgreSQL     |               |     Redis        |
                 |   (Neon Cloud)   |               |   (Upstash)      |
                 +------------------+               +------------------+
                 | - Users          |               | - Session Store  |
                 | - URLs           |               | - URL Cache      |
                 | - Analytics      |               | - Rate Limiting  |
                 +------------------+               +------------------+
```

### Data Flow

1. **User Authentication**: Client initiates Google OAuth flow, server validates and creates session
2. **URL Creation**: Authenticated user submits long URL, server generates short code and stores mapping
3. **URL Redirect**: Visitor accesses short URL, server retrieves original URL from cache/database and redirects
4. **Analytics Tracking**: Each redirect logs visitor data (IP, device, location) for analytics

---

## Tech Stack

| Category | Technology |
|----------|------------|
| **Runtime** | Node.js v20 |
| **Framework** | Express.js |
| **Database** | PostgreSQL (Neon) |
| **Cache/Sessions** | Redis (Upstash) |
| **Authentication** | Passport.js, Google OAuth 2.0 |
| **Security** | Helmet, CORS, Rate Limiting |
| **API Documentation** | Swagger/OpenAPI |
| **Deployment** | Render, Docker |

---

## Getting Started

### Prerequisites

- Node.js v20 or later
- PostgreSQL database
- Redis instance
- Google OAuth credentials

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Sanjeev-IITD/url_shortener.git
   cd url_shortener
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables (see below)

4. Initialize the database:
   ```bash
   npm run init-db
   ```

5. Start the server:
   ```bash
   npm start
   ```

   For development with auto-reload:
   ```bash
   npm run dev
   ```

---

## Environment Variables

Create a `.env` file in the root directory:

```env
# Server
PORT=3000
NODE_ENV=development

# Database (PostgreSQL)
DATABASE_URL=postgresql://user:password@host:5432/database

# Redis
REDIS_URL=redis://user:password@host:port

# Google OAuth
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Session
SESSION_SECRET=your_secure_secret

# URLs
BASE_URL=http://localhost:3000
PROD_URL=https://your-production-domain.com
```

---

## API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/auth/google` | Initiate Google OAuth login |
| GET | `/auth/google/callback` | OAuth callback handler |
| GET | `/auth/current-auth` | Get current authentication status |
| GET | `/auth/logout` | Logout and clear session |

### URL Operations

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/shorten` | Create a short URL | Yes |
| GET | `/api/shorten/:alias` | Redirect to original URL | No |

**Create Short URL Request Body:**
```json
{
  "longUrl": "https://example.com/very/long/url",
  "customAlias": "my-link",
  "topic": "marketing"
}
```

### Analytics

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/analytics/overall` | Get overall user analytics | Yes |
| GET | `/api/analytics/:alias` | Get analytics for specific URL | Yes |
| GET | `/api/analytics/topic/:topic` | Get analytics by topic | Yes |

**Overall Analytics Response:**
```json
{
  "totalUrls": 10,
  "totalClicks": 250,
  "uniqueLocations": 5,
  "clicksOverTime": [
    { "date": "Jan 24", "count": 30 },
    { "date": "Jan 25", "count": 45 }
  ],
  "deviceTypes": {
    "desktop": 150,
    "mobile": 80,
    "tablet": 15,
    "other": 5
  },
  "topUrls": [
    {
      "alias": "abc123",
      "originalUrl": "https://example.com",
      "clicks": 50,
      "createdAt": "2026-01-20T10:30:00Z"
    }
  ]
}
```

---

## Database Schema

```sql
-- Users: Stores authenticated users
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    google_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    avatar VARCHAR(255),
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- URLs: Stores shortened URL mappings
CREATE TABLE urls (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) REFERENCES users(google_id),
    long_url TEXT NOT NULL,
    short_url VARCHAR(15) UNIQUE,
    topic VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_accessed TIMESTAMP WITH TIME ZONE
);

-- Analytics: Tracks each URL visit
CREATE TABLE analytics (
    id SERIAL PRIMARY KEY,
    url_id INTEGER REFERENCES urls(id),
    visitor_ip VARCHAR(45),
    user_agent TEXT,
    device_type VARCHAR(50),
    os_type VARCHAR(50),
    browser VARCHAR(50),
    country VARCHAR(2),
    city VARCHAR(100),
    visited_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### Entity Relationships

- A **User** can create multiple **URLs** (one-to-many)
- Each **URL** can have multiple **Analytics** entries (one-to-many)
- URLs are optionally grouped by **Topic**

---

## Deployment

### Render (Recommended)

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Set the build command: `npm install`
4. Set the start command: `npm start`
5. Add all environment variables in the Environment section
6. Deploy

### Docker

Build and run with Docker:

```bash
docker build -t url-shortener .
docker run -p 3000:3000 --env-file .env url-shortener
```

Or use Docker Compose:

```bash
docker-compose up -d
```

---

## Rate Limiting

The API implements token bucket rate limiting:

- **Standard endpoints**: 1,000 requests per minute per user
- **Sensitive endpoints**: 100 requests per minute per user
- **Fallback**: IP-based limiting for unauthenticated requests

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining in window
- `X-RateLimit-Reset`: Time when limit resets

---

## API Documentation

Interactive API documentation is available at:
```
https://url-shortener-65ru.onrender.com/api-docs
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -m "Add new feature"`
4. Push to branch: `git push origin feature/new-feature`
5. Open a Pull Request

---

## License

MIT License

---

## Author

Sanjeev - [GitHub](https://github.com/Sanjeev-IITD)
