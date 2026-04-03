// ============================================================================
// India Village Data Import Script
// Language: TypeScript
// Database: PostgreSQL (NeonDB)
// ============================================================================

import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import winston from 'winston';
import cliProgress from 'cli-progress';

// ============================================================================
// CONFIGURATION
// ============================================================================

interface Config {
  database: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl: boolean;
  };
  import: {
    dataDir: string;
    batchSize: number;
    enableLogging: boolean;
  };
}

const config: Config = {
  database: {
    host: process.env.DB_HOST || 'ep-misty-meadow-a1192uh9.ap-southeast-1.aws.neon.tech',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'neondb',
    user: process.env.DB_USER || 'neondb_owner',
    password: process.env.DB_PASSWORD || 'npg_7Y1xhwmuNFKd',
    ssl: true
  },
  import: {
    dataDir: process.env.DATA_DIR || './data',
    batchSize: parseInt(process.env.BATCH_SIZE || '5000'),
    enableLogging: true
  }
};

// ============================================================================
// LOGGER SETUP
// ============================================================================

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/import.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const StateSchema = z.object({
  state_code: z.string().min(1).max(10),
  state_name: z.string().min(1).max(100)
});

const DistrictSchema = z.object({
  state_code: z.string().min(1).max(10),
  district_code: z.string().min(1).max(20),
  district_name: z.string().min(1).max(100)
});

const SubDistrictSchema = z.object({
  district_code: z.string().min(1).max(20),
  sub_district_code: z.string().min(1).max(30),
  sub_district_name: z.string().min(1).max(100)
});

const VillageSchema = z.object({
  state_code: z.string().min(1).max(10),
  district_code: z.string().min(1).max(10),
  sub_district_code: z.string().min(1).max(30),
  lgd_code: z.string().max(50).optional(),
  village_name: z.string().min(1).max(150),
  pincode: z.string().optional(),
  population: z.string().optional()
});

type State = z.infer<typeof StateSchema>;
type District = z.infer<typeof DistrictSchema>;
type SubDistrict = z.infer<typeof SubDistrictSchema>;
type Village = z.infer<typeof VillageSchema>;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

class Utils {
  /**
   * Normalize name: Proper capitalization, trim spaces
   */
  static normalizeName(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Validate and normalize pincode
   */
  static validatePincode(pincode?: string): string | null {
    if (!pincode) return null;
    const cleaned = pincode.replace(/\D/g, '');
    return cleaned.length === 6 ? cleaned : null;
  }

  /**
   * Parse population safely
   */
  static parsePopulation(population?: string): number | null {
    if (!population) return null;
    const parsed = parseInt(population.replace(/\D/g, ''));
    return isNaN(parsed) ? null : parsed;
  }

  /**
   * Chunk array into batches
   */
  static chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Read CSV file and parse
   */
  static readCSV<T>(filePath: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const results: T[] = [];
      
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => resolve(results))
        .on('error', (error) => reject(error));
    });
  }
}

// ============================================================================
// DATABASE CONNECTION
// ============================================================================

class Database {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.user,
      password: config.database.password,
      ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });
  }

  async connect(): Promise<void> {
    try {
      await this.pool.query('SELECT NOW()');
      logger.info('Database connected successfully');
    } catch (error) {
      logger.error('Database connection failed', { error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.pool.end();
    logger.info('Database disconnected');
  }

  getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  async query(text: string, params?: any[]): Promise<any> {
    return this.pool.query(text, params);
  }

  async disableTriggers(): Promise<void> {
    logger.info('Disabling triggers...');
    // await this.query('ALTER TABLE states DISABLE TRIGGER ALL');
    // await this.query('ALTER TABLE districts DISABLE TRIGGER ALL');
    // await this.query('ALTER TABLE sub_districts DISABLE TRIGGER ALL');
    // await this.query('ALTER TABLE villages DISABLE TRIGGER ALL');
  }

  async enableTriggers(): Promise<void> {
    logger.info('Enabling triggers...');
    // await this.query('ALTER TABLE states ENABLE TRIGGER ALL');
    // await this.query('ALTER TABLE districts ENABLE TRIGGER ALL');
    // await this.query('ALTER TABLE sub_districts ENABLE TRIGGER ALL');
    // await this.query('ALTER TABLE villages ENABLE TRIGGER ALL');
  }

  async truncateTables(): Promise<void> {
    logger.warn('Truncating all tables...');
    await this.query('TRUNCATE TABLE villages CASCADE');
    await this.query('TRUNCATE TABLE sub_districts CASCADE');
    await this.query('TRUNCATE TABLE districts CASCADE');
    await this.query('TRUNCATE TABLE states CASCADE');
  }

  async vacuum(): Promise<void> {
    logger.info('Running VACUUM ANALYZE...');
    await this.query('VACUUM ANALYZE');
  }
}

// ============================================================================
// IMPORTERS
// ============================================================================

class StateImporter {
  constructor(private db: Database) {}

  async import(filePath: string): Promise<Map<string, number>> {
    logger.info('Starting States import...');
    
    const rawData = await Utils.readCSV<State>(filePath);
    logger.info(`Read ${rawData.length} states from CSV`);

    // Validate and transform
    const validStates: State[] = [];
    const errors: any[] = [];

    rawData.forEach((row, index) => {
      try {
        const validated = StateSchema.parse(row);
        validStates.push(validated);
      } catch (error) {
        errors.push({ row: index + 1, error });
        logger.error(`Validation failed for state row ${index + 1}`, { row, error });
      }
    });

    if (errors.length > 0) {
      logger.warn(`${errors.length} state records failed validation`);
    }

    // Insert states
    const stateIdMap = new Map<string, number>();
    const progressBar = new cliProgress.SingleBar({
      format: 'States Import |{bar}| {percentage}% | {value}/{total}'
    });
    
    progressBar.start(validStates.length, 0);

    for (const state of validStates) {
      const result = await this.db.query(
        `INSERT INTO states (state_code, state_name, state_name_lower)
         VALUES ($1, $2, $3)
         ON CONFLICT (state_code) DO UPDATE 
         SET state_name = EXCLUDED.state_name
         RETURNING id`,
        [
          state.state_code.trim().toUpperCase(),
          Utils.normalizeName(state.state_name),
          state.state_name.toLowerCase().trim()
        ]
      );

      stateIdMap.set(state.state_code, result.rows[0].id);
      progressBar.increment();
    }

    progressBar.stop();
    logger.info(`Imported ${validStates.length} states successfully`);

    return stateIdMap;
  }
}

class DistrictImporter {
  constructor(private db: Database) {}

  async import(
    filePath: string, 
    stateIdMap: Map<string, number>
  ): Promise<Map<string, number>> {
    logger.info('Starting Districts import...');
    
    const rawData = await Utils.readCSV<District>(filePath);
    logger.info(`Read ${rawData.length} districts from CSV`);

    const validDistricts: District[] = [];
    const errors: any[] = [];

    rawData.forEach((row, index) => {
      try {
        const validated = DistrictSchema.parse(row);
        if (!stateIdMap.has(validated.state_code)) {
          throw new Error(`State code ${validated.state_code} not found`);
        }
        validDistricts.push(validated);
      } catch (error) {
        errors.push({ row: index + 1, error });
        logger.error(`Validation failed for district row ${index + 1}`, { row, error });
      }
    });

    if (errors.length > 0) {
      logger.warn(`${errors.length} district records failed validation`);
    }

    // Batch insert districts
    const districtIdMap = new Map<string, number>();
    const batches = Utils.chunk(validDistricts, config.import.batchSize);
    
    const progressBar = new cliProgress.SingleBar({
      format: 'Districts Import |{bar}| {percentage}% | {value}/{total}'
    });
    progressBar.start(validDistricts.length, 0);

    for (const batch of batches) {
      const values: any[] = [];
      const placeholders: string[] = [];

      batch.forEach((district, i) => {
        const offset = i * 4;
        placeholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`
        );
        values.push(
          stateIdMap.get(district.state_code),
          district.district_code.trim(),
          Utils.normalizeName(district.district_name),
          district.district_name.toLowerCase().trim()
        );
      });

      const query = `
        INSERT INTO districts (state_id, district_code, district_name, district_name_lower)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (district_code) DO UPDATE 
        SET district_name = EXCLUDED.district_name
        RETURNING district_code, id
      `;

      const result = await this.db.query(query, values);
      
      result.rows.forEach((row: any) => {
        districtIdMap.set(row.district_code, row.id);
      });

      progressBar.update((progressBar as any).value + batch.length);
    }

    progressBar.stop();
    logger.info(`Imported ${validDistricts.length} districts successfully`);

    return districtIdMap;
  }
}

class SubDistrictImporter {
  constructor(private db: Database) {}

  async import(
    filePath: string, 
    districtIdMap: Map<string, number>
  ): Promise<Map<string, number>> {
    logger.info('Starting Sub-Districts import...');
    
    const rawData = await Utils.readCSV<SubDistrict>(filePath);
    logger.info(`Read ${rawData.length} sub-districts from CSV`);

    const validSubDistricts: SubDistrict[] = [];
    const errors: any[] = [];

    rawData.forEach((row, index) => {
      try {
        const validated = SubDistrictSchema.parse(row);
        if (!districtIdMap.has(validated.district_code)) {
          throw new Error(`District code ${validated.district_code} not found`);
        }
        validSubDistricts.push(validated);
      } catch (error) {
        errors.push({ row: index + 1, error });
        logger.error(`Validation failed for sub-district row ${index + 1}`, { row, error });
      }
    });

    if (errors.length > 0) {
      logger.warn(`${errors.length} sub-district records failed validation`);
    }

    const subDistrictIdMap = new Map<string, number>();
    const batches = Utils.chunk(validSubDistricts, config.import.batchSize);
    
    const progressBar = new cliProgress.SingleBar({
      format: 'Sub-Districts Import |{bar}| {percentage}% | {value}/{total}'
    });
    progressBar.start(validSubDistricts.length, 0);

    for (const batch of batches) {
      const values: any[] = [];
      const placeholders: string[] = [];

      batch.forEach((subDistrict, i) => {
        const offset = i * 4;
        placeholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`
        );
        values.push(
          districtIdMap.get(subDistrict.district_code),
          subDistrict.sub_district_code.trim(),
          Utils.normalizeName(subDistrict.sub_district_name),
          subDistrict.sub_district_name.toLowerCase().trim()
        );
      });

      const query = `
        INSERT INTO sub_districts (district_id, sub_district_code, sub_district_name, sub_district_name_lower)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (sub_district_code) DO UPDATE 
        SET sub_district_name = EXCLUDED.sub_district_name
        RETURNING sub_district_code, id
      `;

      const result = await this.db.query(query, values);
      
      result.rows.forEach((row: any) => {
        subDistrictIdMap.set(row.sub_district_code, row.id);
      });

      progressBar.update((progressBar as any).value + batch.length);
    }

    progressBar.stop();
    logger.info(`Imported ${validSubDistricts.length} sub-districts successfully`);

    return subDistrictIdMap;
  }
}

class VillageImporter {
  constructor(private db: Database) {}

  async import(
    filePath: string, 
    subDistrictIdMap: Map<string, number>
  ): Promise<void> {
    logger.info('Starting Villages import...');
    
    const rawData = await Utils.readCSV<Village>(filePath);
    logger.info(`Read ${rawData.length} villages from CSV`);

    const validVillages: Village[] = [];
    const errors: any[] = [];

    rawData.forEach((row, index) => {
      try {
        const validated = VillageSchema.parse(row);
        if (!subDistrictIdMap.has(validated.sub_district_code)) {
          throw new Error(`Sub-district code ${validated.sub_district_code} not found`);
        }
        validVillages.push(validated);
      } catch (error) {
        errors.push({ row: index + 1, error });
        if (index < 10) { // Log first 10 errors only
          logger.error(`Validation failed for village row ${index + 1}`, { row, error });
        }
      }
    });

    if (errors.length > 0) {
      logger.warn(`${errors.length} village records failed validation`);
    }

    const batches = Utils.chunk(validVillages, config.import.batchSize);
    
    const progressBar = new cliProgress.SingleBar({
      format: 'Villages Import |{bar}| {percentage}% | {value}/{total} | ETA: {eta}s'
    });
    progressBar.start(validVillages.length, 0);

    for (const batch of batches) {
      const values: any[] = [];
      const placeholders: string[] = [];

      batch.forEach((village, i) => {
        const offset = i * 6;
        placeholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`
        );
        values.push(
          subDistrictIdMap.get(village.sub_district_code),
          village.lgd_code?.trim() || null,
          Utils.normalizeName(village.village_name),
          village.village_name.toLowerCase().trim(),
          Utils.validatePincode(village.pincode),
          Utils.parsePopulation(village.population)
        );
      });

      const query = `
        INSERT INTO villages (sub_district_id, village_code, village_name, village_name_lower, pincode, population)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (village_code) DO NOTHING
      `;

      await this.db.query(query, values);
      progressBar.update((progressBar as any).value + batch.length);
    }

    progressBar.stop();
    logger.info(`Imported ${validVillages.length} villages successfully`);
  }
}

// ============================================================================
// VALIDATION & VERIFICATION
// ============================================================================

class DataValidator {
  constructor(private db: Database) {}

  async runValidations(): Promise<boolean> {
    logger.info('Running post-import validations...');

    const validations = [
      this.checkCounts(),
      this.checkOrphans(),
      this.checkDuplicates(),
      this.checkMissingData()
    ];

    const results = await Promise.all(validations);
    const allPassed = results.every(r => r);

    if (allPassed) {
      logger.info('✓ All validations passed');
    } else {
      logger.error('✗ Some validations failed');
    }

    return allPassed;
  }

  private async checkCounts(): Promise<boolean> {
    const result = await this.db.query(`
      SELECT 
        (SELECT COUNT(*) FROM states) as states_count,
        (SELECT COUNT(*) FROM districts) as districts_count,
        (SELECT COUNT(*) FROM sub_districts) as sub_districts_count,
        (SELECT COUNT(*) FROM villages) as villages_count
    `);

    const counts = result.rows[0];
    logger.info('Record counts:', counts);

    return counts.states_count > 0 && 
           counts.districts_count > 0 && 
           counts.sub_districts_count > 0 && 
           counts.villages_count > 0;
  }

  private async checkOrphans(): Promise<boolean> {
    const queries = [
      { name: 'Orphan Districts', query: 'SELECT COUNT(*) FROM districts d LEFT JOIN states s ON d.state_id = s.id WHERE s.id IS NULL' },
      { name: 'Orphan Sub-Districts', query: 'SELECT COUNT(*) FROM sub_districts sd LEFT JOIN districts d ON sd.district_id = d.id WHERE d.id IS NULL' },
      { name: 'Orphan Villages', query: 'SELECT COUNT(*) FROM villages v LEFT JOIN sub_districts sd ON v.sub_district_id = sd.id WHERE sd.id IS NULL' }
    ];

    let allPassed = true;

    for (const { name, query } of queries) {
      const result = await this.db.query(query);
      const count = parseInt(result.rows[0].count);
      
      if (count > 0) {
        logger.error(`Found ${count} ${name}`);
        allPassed = false;
      } else {
        logger.info(`✓ No ${name}`);
      }
    }

    return allPassed;
  }

  private async checkDuplicates(): Promise<boolean> {
    const result = await this.db.query(`
      SELECT village_name, sub_district_id, COUNT(*) as count
      FROM villages 
      GROUP BY village_name, sub_district_id 
      HAVING COUNT(*) > 1
      LIMIT 10
    `);

    if (result.rows.length > 0) {
      logger.warn(`Found ${result.rows.length} duplicate village entries (showing first 10)`, result.rows);
      return false;
    }

    logger.info('✓ No duplicate villages found');
    return true;
  }

  private async checkMissingData(): Promise<boolean> {
    const result = await this.db.query(`
      SELECT 
        COUNT(*) as total_villages,
        COUNT(pincode) as with_pincode,
        COUNT(population) as with_population,
        COUNT(*) - COUNT(pincode) as missing_pincode,
        COUNT(*) - COUNT(population) as missing_population
      FROM villages
    `);

    const stats = result.rows[0];
    logger.info('Village data completeness:', stats);

    return true; // Optional fields, so always pass
  }
}

// ============================================================================
// MAIN IMPORT ORCHESTRATOR
// ============================================================================

class ImportOrchestrator {
  private db: Database;
  private stateImporter: StateImporter;
  private districtImporter: DistrictImporter;
  private subDistrictImporter: SubDistrictImporter;
  private villageImporter: VillageImporter;
  private validator: DataValidator;

  constructor() {
    this.db = new Database();
    this.stateImporter = new StateImporter(this.db);
    this.districtImporter = new DistrictImporter(this.db);
    this.subDistrictImporter = new SubDistrictImporter(this.db);
    this.villageImporter = new VillageImporter(this.db);
    this.validator = new DataValidator(this.db);
  }

  async run(): Promise<void> {
    const startTime = Date.now();
    logger.info('='.repeat(80));
    logger.info('Starting India Village Data Import Process');
    logger.info('='.repeat(80));

    try {
      // Connect to database
      await this.db.connect();

      // Optional: Truncate existing data
      const shouldTruncate = process.env.TRUNCATE_TABLES === 'true';
      if (shouldTruncate) {
        await this.db.truncateTables();
      }

      // Disable triggers for performance
      await this.db.disableTriggers();

      // Import in hierarchical order
      const stateIdMap = await this.stateImporter.import(
        path.join(config.import.dataDir, 'states.csv')
      );

      const districtIdMap = await this.districtImporter.import(
        path.join(config.import.dataDir, 'districts.csv'),
        stateIdMap
      );

      const subDistrictIdMap = await this.subDistrictImporter.import(
        path.join(config.import.dataDir, 'sub_districts.csv'),
        districtIdMap
      );

      await this.villageImporter.import(
        path.join(config.import.dataDir, 'villages.csv'),
        subDistrictIdMap
      );

      // Re-enable triggers
      await this.db.enableTriggers();

      // Run validations
      const validationsPassed = await this.validator.runValidations();

      // Vacuum database
      await this.db.vacuum();

      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);

      logger.info('='.repeat(80));
      logger.info(`Import completed in ${duration} seconds`);
      logger.info(`Validations: ${validationsPassed ? 'PASSED' : 'FAILED'}`);
      logger.info('='.repeat(80));

    } catch (error) {
      logger.error('Import process failed', { error });
      throw error;
    } finally {
      await this.db.disconnect();
    }
  }
}

// ============================================================================
// ENTRY POINT
// ============================================================================

async function main() {
  const orchestrator = new ImportOrchestrator();
  await orchestrator.run();
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    logger.error('Fatal error', { error });
    process.exit(1);
  });
}

export { ImportOrchestrator, Database, Utils };








