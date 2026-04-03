# India Village Data - Database Schema & Import System

Complete production-ready database schema and ETL pipeline for importing India's village-level geographical data into PostgreSQL (NeonDB).

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Database Schema](#database-schema)
- [Data Import Process](#data-import-process)
- [API Usage Examples](#api-usage-examples)
- [Performance Optimization](#performance-optimization)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Overview

This system provides:

1. **Complete PostgreSQL Schema** - Normalized database design for hierarchical geographical data
2. **ETL Pipeline** - TypeScript-based import script with validation and error handling
3. **Production-Ready** - Optimized for 600K+ village records with sub-100ms query times
4. **SaaS-Ready** - Built-in user management, API keys, and subscription handling

### Data Hierarchy

```
India
  └── States (36)
      └── Districts (~750)
          └── Sub-Districts (~6,000)
              └── Villages (~600,000)
```

---

## ✨ Features

### Database Schema
- ✅ Hierarchical geographical data (State → District → Sub-District → Village)
- ✅ User management with role-based access (Admin, B2B Client)
- ✅ API key generation and management
- ✅ Usage tracking and analytics (partitioned by month)
- ✅ Subscription plans (Free, Premium, Pro, Unlimited)
- ✅ Payment transaction logging
- ✅ Full-text search with trigram indexes

### Import System
- ✅ CSV parsing with validation (Zod schemas)
- ✅ Batch processing (configurable batch size)
- ✅ Progress tracking with visual progress bars
- ✅ Error logging and recovery
- ✅ Data normalization and deduplication
- ✅ Performance optimization (triggers disabled during import)
- ✅ Post-import validation checks

---

## 📦 Prerequisites

### Required
- Node.js >= 18.0.0
- PostgreSQL 14+ (NeonDB recommended)
- npm >= 9.0.0

### CSV Data Files

Place your CSV files in the `./data` directory:

```
data/
├── states.csv
├── districts.csv
├── sub_districts.csv
└── villages.csv
```

#### Expected CSV Format

**states.csv**
```csv
state_code,state_name
01,Andaman and Nicobar Islands
02,Andhra Pradesh
...
```

**districts.csv**
```csv
state_code,district_code,district_name
01,001,Nicobar
02,001,Anantapur
...
```

**sub_districts.csv**
```csv
district_code,sub_district_code,sub_district_name
001,001001,Car Nicobar
001,001002,Nancowry
...
```

**villages.csv**
```csv
sub_district_code,village_code,village_name,pincode,population
001001,0010010001,Arong,744301,2500
001001,0010010002,Kakana,744301,1800
...
```

---

## 🚀 Quick Start

### 1. Database Setup

#### Option A: Using NeonDB (Recommended)

1. Create a NeonDB account at https://neon.tech
2. Create a new project
3. Copy the connection string

#### Option B: Local PostgreSQL

```bash
# Install PostgreSQL (Ubuntu/Debian)
sudo apt update
sudo apt install postgresql postgresql-contrib

# Create database
sudo -u postgres createdb india_villages_db
```

### 2. Create Database Schema

```bash
# Connect to your database
psql -h your-neon-host.neon.tech -U your_user -d india_villages_db

# Run the schema file
\i database_schema.sql
```

Or using command line:
```bash
psql -h your-neon-host.neon.tech -U your_user -d india_villages_db -f database_schema.sql
```

### 3. Setup Import Script

```bash
# Clone or download project files
cd india-village-import

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your database credentials
nano .env
```

**.env Configuration:**
```env
DB_HOST=your-neon-host.neon.tech
DB_PORT=5432
DB_NAME=india_villages_db
DB_USER=your_username
DB_PASSWORD=your_password
DATA_DIR=./data
BATCH_SIZE=5000
TRUNCATE_TABLES=false
```

### 4. Prepare Data Files

```bash
# Create data directory
mkdir -p data logs

# Place your CSV files in ./data/
# - states.csv
# - districts.csv
# - sub_districts.csv
# - villages.csv
```

### 5. Run Import

```bash
# Compile TypeScript
npm run build

# Run import
npm run import

# Or run directly with ts-node (development)
npm run import:dev
```

### 6. Monitor Progress

The import script will show:
- Progress bars for each import stage
- Real-time logging
- Validation results
- Performance statistics

Expected output:
```
Starting India Village Data Import Process
Database connected successfully
Disabling triggers...
Starting States import...
States Import |████████████████████| 100% | 36/36
Imported 36 states successfully
Starting Districts import...
Districts Import |████████████████████| 100% | 750/750
...
```

---

## 🗄️ Database Schema

### Core Tables

#### 1. Geographical Hierarchy

**states**
- `id` (Primary Key)
- `state_code` (Unique, indexed)
- `state_name`
- `state_name_lower` (for search)

**districts**
- `id` (Primary Key)
- `state_id` (Foreign Key → states)
- `district_code` (Unique)
- `district_name`
- `district_name_lower`

**sub_districts**
- `id` (Primary Key)
- `district_id` (Foreign Key → districts)
- `sub_district_code` (Unique)
- `sub_district_name`
- `sub_district_name_lower`

**villages**
- `id` (Primary Key)
- `sub_district_id` (Foreign Key → sub_districts)
- `village_code` (Unique, optional)
- `village_name`
- `village_name_lower`
- `pincode` (6 digits)
- `population`

#### 2. User Management

**users**
- `id` (UUID)
- `email` (Unique)
- `password_hash`
- `role` (super_admin, admin, b2b_client)
- `subscription_plan` (free, premium, pro, unlimited)
- `company_name`

**api_keys**
- `id` (UUID)
- `user_id` (Foreign Key → users)
- `api_key` (Public key, unique)
- `api_secret` (Hashed)
- `rate_limit_per_minute`
- `rate_limit_per_day`

#### 3. Usage Tracking

**api_request_logs** (Partitioned by month)
- `id`
- `api_key_id`
- `user_id`
- `endpoint`
- `status_code`
- `response_time_ms`
- `created_at`

**daily_usage_summary**
- Aggregated daily statistics
- Per user, per API key
- Total/successful/failed requests

### Views

**v_complete_addresses**
```sql
SELECT 
  village_name,
  sub_district_name,
  district_name,
  state_name,
  'Village, Sub-District, District, State, India' as full_address
FROM villages v
JOIN sub_districts sd ON v.sub_district_id = sd.id
JOIN districts d ON sd.district_id = d.id
JOIN states s ON d.state_id = s.id;
```

**v_user_api_usage**
- User email, plan, total API keys
- Total requests across all time

---

## 📊 Data Import Process

### Import Sequence

The import **must** follow this hierarchical order:

1. **States** → Foundation layer
2. **Districts** → References States
3. **Sub-Districts** → References Districts
4. **Villages** → References Sub-Districts

### Performance Optimizations

1. **Triggers Disabled** during import
2. **Batch Inserts** (default: 5,000 records per batch)
3. **Trigram Indexes** created after import
4. **Auto-lowercase** via database triggers
5. **VACUUM ANALYZE** run post-import

### Import Statistics

Expected performance (on SSD with good network):

| Level          | Records   | Time       |
|----------------|-----------|------------|
| States         | 36        | < 1 sec    |
| Districts      | 750       | < 5 sec    |
| Sub-Districts  | 6,000     | 30-60 sec  |
| Villages       | 600,000   | 15-30 min  |
| **Total**      | **606,786** | **20-40 min** |

### Validation Checks

Post-import validations:

1. ✅ **Count Verification** - Ensure all records imported
2. ✅ **Orphan Check** - No records without parent references
3. ✅ **Duplicate Check** - No duplicate villages in same sub-district
4. ✅ **Data Completeness** - Report on missing pincodes/population

---

## 🔍 API Usage Examples

### Query Complete Address

```sql
-- Get full address for a village
SELECT * FROM v_complete_addresses 
WHERE village_name_lower LIKE '%mumbai%'
LIMIT 10;
```

### Search by State

```sql
-- Get all districts in a state
SELECT d.* FROM districts d
JOIN states s ON d.state_id = s.id
WHERE s.state_name = 'Maharashtra';
```

### Autocomplete Search

```sql
-- Fuzzy search villages (using trigram index)
SELECT village_name, full_address 
FROM v_complete_addresses
WHERE village_name_lower % 'bangalor'  -- Fuzzy match
ORDER BY similarity(village_name_lower, 'bangalor') DESC
LIMIT 10;
```

### Get Hierarchy

```sql
-- Get complete hierarchy for a village
SELECT 
  v.village_name,
  sd.sub_district_name,
  d.district_name,
  s.state_name
FROM villages v
JOIN sub_districts sd ON v.sub_district_id = sd.id
JOIN districts d ON sd.district_id = d.id
JOIN states s ON d.state_id = s.id
WHERE v.id = 12345;
```

---

## ⚡ Performance Optimization

### Query Performance Tips

1. **Use lowercase columns** for case-insensitive search
   ```sql
   WHERE state_name_lower = 'maharashtra'  -- Fast (indexed)
   -- NOT: WHERE LOWER(state_name) = 'maharashtra'  -- Slow
   ```

2. **Use trigram search** for autocomplete
   ```sql
   WHERE village_name_lower % 'search_term'
   ORDER BY similarity(village_name_lower, 'search_term') DESC
   ```

3. **Leverage views** for common queries
   ```sql
   SELECT * FROM v_complete_addresses WHERE ...
   ```

### Redis Caching Strategy (for API)

```javascript
// Cache popular searches
const cacheKey = `village:${searchTerm}`;
const cached = await redis.get(cacheKey);

if (cached) {
  return JSON.parse(cached);
}

const result = await db.query(/* ... */);
await redis.setex(cacheKey, 3600, JSON.stringify(result)); // 1 hour TTL
```

### Index Maintenance

```sql
-- Rebuild indexes periodically (monthly)
REINDEX TABLE villages;

-- Update statistics
ANALYZE villages;
```

---

## 🐛 Troubleshooting

### Common Issues

#### 1. Connection Error to NeonDB

**Error:** `ECONNREFUSED` or `Connection timeout`

**Solution:**
- Check NeonDB host is correct (should include `.neon.tech`)
- Ensure SSL is enabled in connection string
- Verify firewall allows outbound port 5432

```javascript
// In connection config, ensure:
ssl: { rejectUnauthorized: false }
```

#### 2. CSV Parsing Errors

**Error:** `Unexpected token` or `Invalid CSV format`

**Solution:**
- Ensure UTF-8 encoding: `file -I your_file.csv`
- Remove BOM if present: `sed -i '1s/^\xEF\xBB\xBF//' your_file.csv`
- Check for proper line endings (LF, not CRLF)

#### 3. Foreign Key Violations

**Error:** `violates foreign key constraint`

**Solution:**
- Import in correct order: States → Districts → Sub-Districts → Villages
- Check that parent codes exist in CSV files
- Verify state_code/district_code references are consistent

#### 4. Out of Memory

**Error:** `JavaScript heap out of memory`

**Solution:**
- Reduce `BATCH_SIZE` in .env (try 1000)
- Increase Node.js memory: `NODE_OPTIONS="--max-old-space-size=4096" npm run import`
- Process villages in chunks

#### 5. Slow Import

**Issue:** Import taking hours instead of minutes

**Solution:**
- Ensure triggers are disabled
- Drop indexes before import, recreate after
- Use `COPY` command instead of INSERT (10x faster)
- Check network latency to database

---

## 📁 Project Structure

```
india-village-import/
├── src/
│   ├── import_script.ts       # Main import logic
│   ├── importers/
│   │   ├── stateImporter.ts
│   │   ├── districtImporter.ts
│   │   └── villageImporter.ts
│   ├── validators/
│   │   └── schemas.ts
│   └── utils/
│       ├── csvReader.ts
│       └── logger.ts
├── data/
│   ├── states.csv
│   ├── districts.csv
│   ├── sub_districts.csv
│   └── villages.csv
├── logs/
│   ├── import.log
│   └── error.log
├── database_schema.sql
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

---

## 🔐 Security Considerations

1. **Never commit .env** - Add to .gitignore
2. **Use environment variables** for all credentials
3. **Hash API secrets** - Never store plain text
4. **Enable SSL** for database connections
5. **Rate limiting** - Implement in API layer
6. **Input validation** - All user inputs must be validated

---

## 📈 Next Steps

After successful import:

1. **Build REST API** - Create Express/Fastify endpoints
2. **Add Authentication** - JWT + API keys
3. **Implement Caching** - Redis for hot data
4. **Deploy to Vercel** - Serverless functions
5. **Add Monitoring** - Sentry, DataDog, or similar
6. **Create Admin Dashboard** - React/Next.js UI
7. **B2B Portal** - Self-service registration

---

## 📄 License

MIT License - See LICENSE file

---

## 🤝 Support

For issues or questions:
- Create an issue on GitHub
- Email: support@example.com
- Documentation: https://docs.example.com

---

## 📝 Changelog

### v1.0.0 (2025-04-03)
- Initial release
- Complete database schema
- ETL import pipeline
- Validation system
- Documentation

---

**Built for production. Optimized for scale. Ready for SaaS.**
