# India Village Data - ETL Pipeline & Import Strategy

## Table of Contents
1. [Overview](#overview)
2. [Data Source Analysis](#data-source-analysis)
3. [ETL Architecture](#etl-architecture)
4. [Import Process](#import-process)
5. [Data Validation](#data-validation)
6. [Performance Optimization](#performance-optimization)

---

## 1. Overview

### Objectives
- Import complete hierarchical geographical data (States → Districts → Sub-Districts → Villages)
- Normalize and standardize data formats
- Handle duplicates and inconsistencies
- Optimize for fast API queries
- Maintain data integrity and relationships

### Expected Data Volume
- **States**: ~36 states/UTs
- **Districts**: ~750 districts
- **Sub-Districts**: ~6,000+ tehsils/talukas
- **Villages**: ~600,000+ villages

### Performance Targets
- Import completion: < 2 hours for full dataset
- Data validation: 100% accuracy on hierarchical relationships
- Zero orphaned records

---

## 2. Data Source Analysis

### Expected CSV Format

#### States CSV
```csv
state_code,state_name
01,Andaman and Nicobar Islands
02,Andhra Pradesh
03,Arunachal Pradesh
...
```

#### Districts CSV
```csv
state_code,district_code,district_name
01,001,Nicobar
01,002,North and Middle Andaman
01,003,South Andaman
02,001,Anantapur
...
```

#### Sub-Districts CSV
```csv
district_code,sub_district_code,sub_district_name
001,001001,Car Nicobar
001,001002,Nancowry
002,002001,Diglipur
...
```

#### Villages CSV
```csv
sub_district_code,village_code,village_name,pincode,population
001001,0010010001,Arong,744301,2500
001001,0010010002,Kakana,744301,1800
...
```

### Data Quality Challenges

**Common Issues**:
1. **Encoding Issues**: Special characters in Hindi/regional names
2. **Duplicates**: Same village names in different sub-districts
3. **Missing Data**: Pincodes, population data may be incomplete
4. **Naming Variations**: "Sub-District" vs "Tehsil" vs "Taluka" vs "Block"
5. **Case Inconsistency**: Mixed case in names

---

## 3. ETL Architecture

### Technology Stack
- **Language**: Node.js with TypeScript
- **Database**: PostgreSQL (NeonDB)
- **CSV Parsing**: `csv-parser` library
- **Validation**: `joi` or `zod`
- **Logging**: `winston`
- **Progress Tracking**: `cli-progress`

### Architecture Diagram

```
┌─────────────────┐
│   CSV Files     │
│  (Data Source)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Extract       │
│  - Read CSV     │
│  - Parse Data   │
│  - Handle UTF-8 │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Transform     │
│  - Normalize    │
│  - Validate     │
│  - Deduplicate  │
│  - Generate IDs │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Load          │
│  - Batch Insert │
│  - Relationships│
│  - Index Build  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Verify        │
│  - Count Check  │
│  - Orphan Check │
│  - Query Test   │
└─────────────────┘
```

---

## 4. Import Process

### Phase 1: Pre-Import Preparation

#### Step 1.1: Backup Existing Data (if any)
```bash
# Backup command
pg_dump -h your-neon-host -U user -d dbname > backup_$(date +%Y%m%d).sql
```

#### Step 1.2: Truncate Tables (Fresh Import)
```sql
TRUNCATE TABLE villages CASCADE;
TRUNCATE TABLE sub_districts CASCADE;
TRUNCATE TABLE districts CASCADE;
TRUNCATE TABLE states CASCADE;
```

#### Step 1.3: Disable Triggers Temporarily
```sql
ALTER TABLE states DISABLE TRIGGER ALL;
ALTER TABLE districts DISABLE TRIGGER ALL;
ALTER TABLE sub_districts DISABLE TRIGGER ALL;
ALTER TABLE villages DISABLE TRIGGER ALL;
```

---

### Phase 2: Data Import Sequence

Import **MUST** follow hierarchical order:
1. States (Parent)
2. Districts (References States)
3. Sub-Districts (References Districts)
4. Villages (References Sub-Districts)

#### Import Flow for Each Level

```javascript
// Pseudocode for each import
async function importLevel(csvPath, tableName, transformFn) {
  const records = await readCSV(csvPath);
  const transformed = records.map(transformFn);
  const validated = await validateRecords(transformed);
  const batches = chunk(validated, 1000); // Batch size: 1000
  
  for (const batch of batches) {
    await db.batchInsert(tableName, batch);
    logProgress(batch.length);
  }
}
```

---

### Phase 3: Transformation Rules

#### States Transformation
```javascript
function transformState(row) {
  return {
    state_code: row.state_code.trim().toUpperCase(),
    state_name: normalizeStateName(row.state_name),
    state_name_lower: row.state_name.toLowerCase().trim()
  };
}

function normalizeStateName(name) {
  // Remove extra spaces
  // Capitalize properly: "ANDHRA PRADESH" → "Andhra Pradesh"
  return name.trim()
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
```

#### Districts Transformation
```javascript
function transformDistrict(row, statesMap) {
  const stateId = statesMap.get(row.state_code);
  
  if (!stateId) {
    throw new Error(`State not found: ${row.state_code}`);
  }
  
  return {
    state_id: stateId,
    district_code: row.district_code.trim(),
    district_name: normalizeName(row.district_name),
    district_name_lower: row.district_name.toLowerCase().trim()
  };
}
```

#### Villages Transformation
```javascript
function transformVillage(row, subDistrictsMap) {
  return {
    sub_district_id: subDistrictsMap.get(row.sub_district_code),
    village_code: row.village_code?.trim() || null,
    village_name: normalizeName(row.village_name),
    village_name_lower: row.village_name.toLowerCase().trim(),
    pincode: validatePincode(row.pincode),
    population: parseInt(row.population) || null
  };
}

function validatePincode(pincode) {
  if (!pincode) return null;
  const cleaned = pincode.replace(/\D/g, '');
  return cleaned.length === 6 ? cleaned : null;
}
```

---

### Phase 4: Batch Insert Strategy

#### Using PostgreSQL `COPY` Command (Fastest)
```javascript
const copyFrom = require('pg-copy-streams').from;

async function bulkInsertUsingCopy(records, tableName) {
  const stream = client.query(copyFrom(`
    COPY ${tableName} (column1, column2, ...) 
    FROM STDIN WITH (FORMAT csv)
  `));
  
  for (const record of records) {
    const csvLine = Object.values(record).join(',') + '\n';
    stream.write(csvLine);
  }
  
  stream.end();
}
```

#### Using Batch INSERT (Alternative)
```javascript
async function batchInsert(records, tableName, batchSize = 1000) {
  const batches = chunk(records, batchSize);
  
  for (const batch of batches) {
    const values = batch.map((r, i) => 
      `($${i*3+1}, $${i*3+2}, $${i*3+3})`
    ).join(',');
    
    const query = `
      INSERT INTO ${tableName} (col1, col2, col3)
      VALUES ${values}
      ON CONFLICT (unique_key) DO NOTHING
    `;
    
    await db.query(query, batch.flatMap(Object.values));
  }
}
```

---

### Phase 5: Post-Import Validation

#### Validation Checks

```sql
-- 1. Count Verification
SELECT 
  (SELECT COUNT(*) FROM states) as states_count,
  (SELECT COUNT(*) FROM districts) as districts_count,
  (SELECT COUNT(*) FROM sub_districts) as sub_districts_count,
  (SELECT COUNT(*) FROM villages) as villages_count;

-- 2. Orphan Records Check
SELECT COUNT(*) FROM districts d 
LEFT JOIN states s ON d.state_id = s.id 
WHERE s.id IS NULL;

SELECT COUNT(*) FROM sub_districts sd 
LEFT JOIN districts d ON sd.district_id = d.id 
WHERE d.id IS NULL;

SELECT COUNT(*) FROM villages v 
LEFT JOIN sub_districts sd ON v.sub_district_id = sd.id 
WHERE sd.id IS NULL;

-- 3. Duplicate Check
SELECT village_name, sub_district_id, COUNT(*) 
FROM villages 
GROUP BY village_name, sub_district_id 
HAVING COUNT(*) > 1;

-- 4. Missing Data Analysis
SELECT 
  COUNT(*) as total_villages,
  COUNT(pincode) as with_pincode,
  COUNT(population) as with_population,
  COUNT(*) - COUNT(pincode) as missing_pincode,
  COUNT(*) - COUNT(population) as missing_population
FROM villages;
```

---

## 5. Data Validation

### Validation Rules

#### State Level
- `state_code`: Non-empty, 2-digit numeric
- `state_name`: Non-empty, max 100 chars
- Unique state_code

#### District Level
- Valid `state_id` reference
- `district_code`: Non-empty, unique
- `district_name`: Non-empty, max 100 chars

#### Sub-District Level
- Valid `district_id` reference
- `sub_district_code`: Non-empty, unique
- `sub_district_name`: Non-empty, max 100 chars

#### Village Level
- Valid `sub_district_id` reference
- `village_name`: Non-empty, max 150 chars
- `pincode`: 6 digits (if present)
- `population`: Positive integer (if present)

### Validation Schema (Using Zod)

```typescript
import { z } from 'zod';

const StateSchema = z.object({
  state_code: z.string().min(1).max(10),
  state_name: z.string().min(1).max(100),
  state_name_lower: z.string().min(1).max(100)
});

const DistrictSchema = z.object({
  state_id: z.number().int().positive(),
  district_code: z.string().min(1).max(20),
  district_name: z.string().min(1).max(100),
  district_name_lower: z.string().min(1).max(100)
});

const VillageSchema = z.object({
  sub_district_id: z.number().int().positive(),
  village_code: z.string().max(50).nullable(),
  village_name: z.string().min(1).max(150),
  village_name_lower: z.string().min(1).max(150),
  pincode: z.string().length(6).regex(/^\d{6}$/).nullable(),
  population: z.number().int().positive().nullable()
});
```

---

## 6. Performance Optimization

### Database Optimization

#### Disable Indexes During Import
```sql
-- Drop indexes before import
DROP INDEX IF EXISTS idx_states_name_lower;
DROP INDEX IF EXISTS idx_districts_name_lower;
DROP INDEX IF EXISTS idx_villages_name_lower;
-- ... drop all indexes

-- Import data (fast)

-- Recreate indexes after import (parallel if possible)
CREATE INDEX CONCURRENTLY idx_states_name_lower ON states(state_name_lower);
CREATE INDEX CONCURRENTLY idx_districts_name_lower ON districts(district_name_lower);
```

#### Use UNLOGGED Tables (Temporary)
```sql
-- Make tables unlogged during import
ALTER TABLE states SET UNLOGGED;
ALTER TABLE districts SET UNLOGGED;
ALTER TABLE sub_districts SET UNLOGGED;
ALTER TABLE villages SET UNLOGGED;

-- Import data

-- Convert back to logged
ALTER TABLE states SET LOGGED;
ALTER TABLE districts SET LOGGED;
ALTER TABLE sub_districts SET LOGGED;
ALTER TABLE villages SET LOGGED;
```

#### Adjust PostgreSQL Settings (Temporary)
```sql
-- For import session only
SET maintenance_work_mem = '2GB';
SET max_wal_size = '10GB';
SET checkpoint_timeout = '30min';
SET synchronous_commit = OFF;
```

---

### Import Performance Estimates

| Level          | Records    | Batch Size | Est. Time  |
|----------------|------------|------------|------------|
| States         | 36         | 36         | < 1 sec    |
| Districts      | 750        | 500        | < 5 sec    |
| Sub-Districts  | 6,000      | 1,000      | 30-60 sec  |
| Villages       | 600,000    | 5,000      | 15-30 min  |
| **Total**      | **606,786**|            | **20-40 min** |

*Note: Times assume SSD storage and good network to NeonDB*

---

## 7. Error Handling & Recovery

### Error Logging
```javascript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'import.log' })
  ]
});

// Usage
logger.error('Failed to import district', {
  district_code: '001',
  error: error.message,
  row_number: 42
});
```

### Checkpoint & Resume
```javascript
// Save checkpoint after each batch
async function saveCheckpoint(level, lastProcessedId) {
  await db.query(`
    INSERT INTO import_checkpoints (level, last_id, timestamp)
    VALUES ($1, $2, NOW())
    ON CONFLICT (level) DO UPDATE SET last_id = $2, timestamp = NOW()
  `, [level, lastProcessedId]);
}

// Resume from checkpoint
async function resumeImport(level) {
  const checkpoint = await db.query(`
    SELECT last_id FROM import_checkpoints WHERE level = $1
  `, [level]);
  
  return checkpoint.rows[0]?.last_id || 0;
}
```

---

## 8. Complete Import Script Structure

```
project/
├── src/
│   ├── importers/
│   │   ├── stateImporter.ts
│   │   ├── districtImporter.ts
│   │   ├── subDistrictImporter.ts
│   │   └── villageImporter.ts
│   ├── validators/
│   │   └── schemas.ts
│   ├── utils/
│   │   ├── csvReader.ts
│   │   ├── normalize.ts
│   │   └── logger.ts
│   ├── db/
│   │   └── connection.ts
│   └── index.ts
├── data/
│   ├── states.csv
│   ├── districts.csv
│   ├── sub_districts.csv
│   └── villages.csv
├── logs/
│   ├── import.log
│   └── error.log
└── package.json
```

---

## 9. Monitoring & Progress Tracking

```javascript
import cliProgress from 'cli-progress';

const progressBar = new cliProgress.SingleBar({
  format: 'Import Progress |{bar}| {percentage}% | {value}/{total} | ETA: {eta}s',
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591'
});

progressBar.start(totalRecords, 0);

// Update during import
progressBar.update(currentRecord);

progressBar.stop();
```

---

## 10. Post-Import Tasks

1. **Re-enable Triggers**
   ```sql
   ALTER TABLE states ENABLE TRIGGER ALL;
   ALTER TABLE districts ENABLE TRIGGER ALL;
   ALTER TABLE sub_districts ENABLE TRIGGER ALL;
   ALTER TABLE villages ENABLE TRIGGER ALL;
   ```

2. **Rebuild Statistics**
   ```sql
   ANALYZE states;
   ANALYZE districts;
   ANALYZE sub_districts;
   ANALYZE villages;
   ```

3. **Vacuum Database**
   ```sql
   VACUUM ANALYZE;
   ```

4. **Test Critical Queries**
   ```sql
   -- Test search performance
   EXPLAIN ANALYZE
   SELECT * FROM villages 
   WHERE village_name_lower LIKE '%mumbai%' 
   LIMIT 10;
   ```

---

## Summary Checklist

- [ ] Database schema created
- [ ] CSV files validated and cleaned
- [ ] Import script developed and tested
- [ ] Batch insert optimized
- [ ] Triggers disabled before import
- [ ] Data imported in correct hierarchy
- [ ] Validation checks passed
- [ ] Indexes recreated
- [ ] Triggers re-enabled
- [ ] Database vacuumed and analyzed
- [ ] API test queries successful
- [ ] Backup created

---

**Next Step**: Implement the actual import script in Node.js/TypeScript
