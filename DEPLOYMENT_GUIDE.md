# Deployment Guide - Vercel + NeonDB

Complete guide for deploying the India Village Data API to production.

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [NeonDB Setup](#neondb-setup)
3. [Vercel Deployment](#vercel-deployment)
4. [Redis Setup (Optional)](#redis-setup-optional)
5. [Environment Variables](#environment-variables)
6. [Post-Deployment Tasks](#post-deployment-tasks)

---

## Architecture Overview

### Production Stack
```
┌─────────────────┐
│   Client Apps   │
│  (Web/Mobile)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Vercel Edge    │
│  (API Endpoints)│
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌────────┐
│ Redis  │ │ NeonDB │
│ Cache  │ │  (PG)  │
└────────┘ └────────┘
```

### Key Benefits
- **Vercel**: Edge deployment, automatic scaling, zero-config
- **NeonDB**: Serverless PostgreSQL, automatic backups, branching
- **Redis**: Optional caching layer for hot data

---

## NeonDB Setup

### 1. Create NeonDB Account

1. Go to https://neon.tech
2. Sign up (free tier available)
3. Create a new project

### 2. Create Database

```sql
-- NeonDB automatically creates a default database
-- Additional configuration:

-- Set timezone
ALTER DATABASE your_db_name SET timezone TO 'UTC';

-- Create read-only user for analytics (optional)
CREATE USER analytics_user WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE your_db_name TO analytics_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_user;
```

### 3. Import Schema

Using NeonDB SQL Editor (Web UI):
```sql
-- Copy and paste the entire contents of database_schema.sql
-- Execute
```

Or using psql:
```bash
psql "postgres://user:password@your-project.neon.tech/dbname?sslmode=require" \
  -f database_schema.sql
```

### 4. Configure Connection Pooling

NeonDB includes built-in connection pooling. For optimal performance:

**Connection String Format:**
```
postgres://user:password@your-project.neon.tech/dbname?sslmode=require
```

**Recommended Pool Settings (in code):**
```typescript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,              // Maximum pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### 5. Enable Auto-Suspend

In NeonDB dashboard:
- Go to Settings → Compute
- Enable "Auto-suspend" (saves costs)
- Set to 5 minutes of inactivity

---

## Vercel Deployment

### Prerequisites

- Vercel account (https://vercel.com)
- GitHub/GitLab repository
- Node.js 18+ locally

### Step 1: Prepare Project Structure

```
your-project/
├── api/
│   └── [...].ts          # Serverless functions
├── lib/
│   ├── db.ts             # Database connection
│   └── middleware.ts     # Auth, logging, etc.
├── package.json
├── tsconfig.json
├── vercel.json           # Vercel configuration
└── .env.example
```

### Step 2: Convert Express to Vercel Serverless

**Before (Express):**
```typescript
app.get('/api/states', async (req, res) => {
  // handler
});
```

**After (Vercel Serverless):**
```typescript
// api/states.ts
import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // handler logic
}
```

### Step 3: Create vercel.json

```json
{
  "version": 2,
  "builds": [
    {
      "src": "api/**/*.ts",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/api/$1"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  },
  "regions": ["bom1"],
  "functions": {
    "api/**/*.ts": {
      "memory": 1024,
      "maxDuration": 10
    }
  }
}
```

**Region Codes:**
- `bom1` - Mumbai, India (recommended for Indian traffic)
- `sin1` - Singapore
- `hnd1` - Tokyo
- `iad1` - Washington DC

### Step 4: Deploy to Vercel

#### Option A: Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel

# Production deployment
vercel --prod
```

#### Option B: GitHub Integration

1. Push code to GitHub
2. Go to Vercel Dashboard
3. Click "Import Project"
4. Select your GitHub repository
5. Configure environment variables
6. Deploy

### Step 5: Configure Environment Variables

In Vercel Dashboard → Settings → Environment Variables:

```env
DATABASE_URL=postgres://user:pass@your-project.neon.tech/db?sslmode=require
NODE_ENV=production
API_VERSION=1.0.0
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX_REQUESTS=100
```

---

## Redis Setup (Optional)

For caching frequently accessed data.

### Option 1: Upstash Redis (Recommended for Vercel)

1. Go to https://upstash.com
2. Create account and database
3. Get connection URL

**Integration:**
```typescript
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Cache example
async function getCachedStates() {
  const cacheKey = 'states:all';
  const cached = await redis.get(cacheKey);

  if (cached) {
    return JSON.parse(cached as string);
  }

  const states = await db.query('SELECT * FROM states');
  await redis.setex(cacheKey, 3600, JSON.stringify(states.rows));

  return states.rows;
}
```

### Option 2: Redis Labs

Similar process, different provider.

---

## Environment Variables

### Complete .env Template for Production

```env
# Database
DATABASE_URL=postgres://user:pass@your-project.neon.tech/db?sslmode=require
DB_POOL_MIN=2
DB_POOL_MAX=20

# Redis (Optional)
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token_here

# API Configuration
API_VERSION=1.0.0
NODE_ENV=production
PORT=3000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_FREE=10
RATE_LIMIT_MAX_PREMIUM=100
RATE_LIMIT_MAX_PRO=500

# Security
JWT_SECRET=your_long_random_secret_here
API_KEY_SALT_ROUNDS=10

# Logging
LOG_LEVEL=info
SENTRY_DSN=https://your-sentry-dsn

# CORS
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

# Analytics (Optional)
GOOGLE_ANALYTICS_ID=UA-XXXXX-Y
```

---

## Post-Deployment Tasks

### 1. Import Data

After deployment, import your CSV data:

```bash
# Option A: Run locally pointing to production DB
DATABASE_URL="postgres://user:pass@prod.neon.tech/db" npm run import

# Option B: Use NeonDB CLI
neon import --database your_db --file villages.csv --table villages
```

### 2. Test Endpoints

```bash
# Test health endpoint
curl https://your-project.vercel.app/health

# Test states endpoint (with API key)
curl https://your-project.vercel.app/api/states \
  -H "X-API-Key: your_api_key"

# Test search
curl "https://your-project.vercel.app/api/search/villages?q=mumbai" \
  -H "X-API-Key: your_api_key"
```

### 3. Setup Monitoring

#### Vercel Analytics
- Automatically enabled in dashboard
- View performance metrics

#### Sentry Error Tracking

```typescript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});

// In error handler
Sentry.captureException(error);
```

### 4. Configure Custom Domain

1. Vercel Dashboard → Project Settings → Domains
2. Add your domain: `api.yourdomain.com`
3. Update DNS records as instructed
4. Wait for SSL certificate provisioning

### 5. Setup Backups

#### NeonDB Automatic Backups
- Enabled by default
- Point-in-time recovery available
- Configure retention in NeonDB dashboard

#### Manual Backup Script

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="backup_$DATE.sql"

pg_dump "$DATABASE_URL" > "$BACKUP_FILE"

# Upload to S3 (optional)
aws s3 cp "$BACKUP_FILE" "s3://your-bucket/backups/"

echo "Backup completed: $BACKUP_FILE"
```

### 6. Performance Optimization

#### Enable Compression

```typescript
import compression from 'compression';

app.use(compression());
```

#### Database Indexes

Ensure all indexes from schema are created:

```sql
-- Check existing indexes
SELECT tablename, indexname 
FROM pg_indexes 
WHERE schemaname = 'public';

-- Recreate if needed
CREATE INDEX CONCURRENTLY idx_villages_name_trgm 
ON villages USING gin(village_name_lower gin_trgm_ops);
```

#### Query Optimization

```sql
-- Analyze query performance
EXPLAIN ANALYZE
SELECT * FROM v_complete_addresses 
WHERE village_name_lower LIKE '%mumbai%';

-- Update statistics
ANALYZE villages;
```

---

## Scaling Considerations

### Horizontal Scaling (Vercel)
- Automatic with serverless functions
- No configuration needed
- Pay per execution

### Database Scaling (NeonDB)
- Upgrade compute tier in NeonDB dashboard
- Enable read replicas for heavy read workloads
- Consider connection pooling (PgBouncer)

### Caching Strategy

```typescript
// Implement multi-tier caching
async function getStates() {
  // 1. Check Redis
  const cached = await redis.get('states:all');
  if (cached) return JSON.parse(cached);

  // 2. Check in-memory (serverless function)
  if (inMemoryCache.has('states:all')) {
    return inMemoryCache.get('states:all');
  }

  // 3. Query database
  const result = await db.query('SELECT * FROM states');

  // 4. Update caches
  redis.setex('states:all', 3600, JSON.stringify(result.rows));
  inMemoryCache.set('states:all', result.rows);

  return result.rows;
}
```

---

## Security Checklist

- [ ] Environment variables secured in Vercel
- [ ] API keys hashed in database
- [ ] Rate limiting enabled
- [ ] CORS configured properly
- [ ] SQL injection prevention (parameterized queries)
- [ ] SSL/TLS enabled (automatic with Vercel)
- [ ] Regular dependency updates
- [ ] Sentry error tracking enabled
- [ ] Database connection pool limits set
- [ ] Input validation on all endpoints

---

## Monitoring Dashboard

### Key Metrics to Track

1. **API Performance**
   - Response time (p50, p95, p99)
   - Request rate
   - Error rate

2. **Database**
   - Connection pool usage
   - Query performance
   - Storage usage

3. **Business Metrics**
   - API calls per user
   - Popular search terms
   - Subscription tier distribution

### Tools

- **Vercel Analytics**: Built-in performance monitoring
- **NeonDB Console**: Database metrics
- **Sentry**: Error tracking
- **Custom Dashboard**: Build with React + Chart.js

---

## Troubleshooting

### Common Issues

#### 1. Cold Start Latency

**Problem:** First request takes 2-3 seconds

**Solution:**
```typescript
// Keep database connection warm
export const config = {
  maxDuration: 10,
};

// Reuse database connections
let cachedDb: any = null;

async function getDb() {
  if (cachedDb) return cachedDb;
  cachedDb = await createConnection();
  return cachedDb;
}
```

#### 2. Connection Pool Exhausted

**Problem:** `Error: remaining connection slots are reserved`

**Solution:**
- Reduce max pool size
- Enable NeonDB connection pooling
- Ensure connections are properly closed

```typescript
// Always use try-finally
const client = await pool.connect();
try {
  const result = await client.query('...');
  return result;
} finally {
  client.release();
}
```

#### 3. CORS Errors

**Problem:** Browser blocks API requests

**Solution:**
```typescript
res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGINS);
res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Content-Type');
```

---

## Cost Estimation

### NeonDB (Monthly)

| Tier       | Storage | Compute | Price  |
|------------|---------|---------|--------|
| Free       | 3 GB    | Shared  | $0     |
| Launch     | 10 GB   | 0.25 CU | $19    |
| Scale      | 50 GB   | 1 CU    | $69    |
| Business   | Custom  | Custom  | Custom |

### Vercel (Monthly)

| Tier       | Executions  | Bandwidth | Price  |
|------------|-------------|-----------|--------|
| Hobby      | 100 GB-hrs  | 100 GB    | $0     |
| Pro        | 1000 GB-hrs | 1 TB      | $20    |
| Enterprise | Unlimited   | Custom    | Custom |

### Upstash Redis (Monthly)

| Tier  | Commands | Storage | Price |
|-------|----------|---------|-------|
| Free  | 10k/day  | 256 MB  | $0    |
| Pay   | Per use  | Per GB  | ~$0.2 |

**Total Cost (Small Scale):**
- Free tier: $0/month
- Production (small): ~$40-50/month
- Production (medium): ~$100-200/month

---

## Summary

✅ **Completed Tasks:**
1. NeonDB database created and configured
2. Schema imported and validated
3. Data imported successfully
4. API deployed to Vercel
5. Environment variables configured
6. Custom domain setup
7. Monitoring enabled
8. Backups configured

🚀 **Your API is now live!**

Access your API at: `https://your-project.vercel.app`

---

## Support Resources

- **Vercel Docs**: https://vercel.com/docs
- **NeonDB Docs**: https://neon.tech/docs
- **PostgreSQL Docs**: https://www.postgresql.org/docs/
- **Upstash Docs**: https://docs.upstash.com/

---

**Production-ready. Scalable. Cost-effective.**
