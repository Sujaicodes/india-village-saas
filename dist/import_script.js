"use strict";
// ============================================================================
// India Village Data Import Script
// Language: TypeScript
// Database: PostgreSQL (NeonDB)
// ============================================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Utils = exports.Database = exports.ImportOrchestrator = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const csv_parser_1 = __importDefault(require("csv-parser"));
const pg_1 = require("pg");
const zod_1 = require("zod");
const winston_1 = __importDefault(require("winston"));
const cli_progress_1 = __importDefault(require("cli-progress"));
const config = {
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
const logger = winston_1.default.createLogger({
    level: 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
    transports: [
        new winston_1.default.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston_1.default.transports.File({ filename: 'logs/import.log' }),
        new winston_1.default.transports.Console({
            format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.simple())
        })
    ]
});
// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================
const StateSchema = zod_1.z.object({
    state_code: zod_1.z.string().min(1).max(10),
    state_name: zod_1.z.string().min(1).max(100)
});
const DistrictSchema = zod_1.z.object({
    state_code: zod_1.z.string().min(1).max(10),
    district_code: zod_1.z.string().min(1).max(20),
    district_name: zod_1.z.string().min(1).max(100)
});
const SubDistrictSchema = zod_1.z.object({
    district_code: zod_1.z.string().min(1).max(20),
    sub_district_code: zod_1.z.string().min(1).max(30),
    sub_district_name: zod_1.z.string().min(1).max(100)
});
const VillageSchema = zod_1.z.object({
    state_code: zod_1.z.string().min(1).max(10),
    district_code: zod_1.z.string().min(1).max(10),
    sub_district_code: zod_1.z.string().min(1).max(30),
    lgd_code: zod_1.z.string().max(50).optional(),
    village_name: zod_1.z.string().min(1).max(150),
    pincode: zod_1.z.string().optional(),
    population: zod_1.z.string().optional()
});
// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
class Utils {
    /**
     * Normalize name: Proper capitalization, trim spaces
     */
    static normalizeName(name) {
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
    static validatePincode(pincode) {
        if (!pincode)
            return null;
        const cleaned = pincode.replace(/\D/g, '');
        return cleaned.length === 6 ? cleaned : null;
    }
    /**
     * Parse population safely
     */
    static parsePopulation(population) {
        if (!population)
            return null;
        const parsed = parseInt(population.replace(/\D/g, ''));
        return isNaN(parsed) ? null : parsed;
    }
    /**
     * Chunk array into batches
     */
    static chunk(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
    /**
     * Read CSV file and parse
     */
    static readCSV(filePath) {
        return new Promise((resolve, reject) => {
            const results = [];
            fs_1.default.createReadStream(filePath)
                .pipe((0, csv_parser_1.default)())
                .on('data', (data) => results.push(data))
                .on('end', () => resolve(results))
                .on('error', (error) => reject(error));
        });
    }
}
exports.Utils = Utils;
// ============================================================================
// DATABASE CONNECTION
// ============================================================================
class Database {
    pool;
    constructor() {
        this.pool = new pg_1.Pool({
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
    async connect() {
        try {
            await this.pool.query('SELECT NOW()');
            logger.info('Database connected successfully');
        }
        catch (error) {
            logger.error('Database connection failed', { error });
            throw error;
        }
    }
    async disconnect() {
        await this.pool.end();
        logger.info('Database disconnected');
    }
    getClient() {
        return this.pool.connect();
    }
    async query(text, params) {
        return this.pool.query(text, params);
    }
    async disableTriggers() {
        logger.info('Disabling triggers...');
        // await this.query('ALTER TABLE states DISABLE TRIGGER ALL');
        // await this.query('ALTER TABLE districts DISABLE TRIGGER ALL');
        // await this.query('ALTER TABLE sub_districts DISABLE TRIGGER ALL');
        // await this.query('ALTER TABLE villages DISABLE TRIGGER ALL');
    }
    async enableTriggers() {
        logger.info('Enabling triggers...');
        // await this.query('ALTER TABLE states ENABLE TRIGGER ALL');
        // await this.query('ALTER TABLE districts ENABLE TRIGGER ALL');
        // await this.query('ALTER TABLE sub_districts ENABLE TRIGGER ALL');
        // await this.query('ALTER TABLE villages ENABLE TRIGGER ALL');
    }
    async truncateTables() {
        logger.warn('Truncating all tables...');
        await this.query('TRUNCATE TABLE villages CASCADE');
        await this.query('TRUNCATE TABLE sub_districts CASCADE');
        await this.query('TRUNCATE TABLE districts CASCADE');
        await this.query('TRUNCATE TABLE states CASCADE');
    }
    async vacuum() {
        logger.info('Running VACUUM ANALYZE...');
        await this.query('VACUUM ANALYZE');
    }
}
exports.Database = Database;
// ============================================================================
// IMPORTERS
// ============================================================================
class StateImporter {
    db;
    constructor(db) {
        this.db = db;
    }
    async import(filePath) {
        logger.info('Starting States import...');
        const rawData = await Utils.readCSV(filePath);
        logger.info(`Read ${rawData.length} states from CSV`);
        // Validate and transform
        const validStates = [];
        const errors = [];
        rawData.forEach((row, index) => {
            try {
                const validated = StateSchema.parse(row);
                validStates.push(validated);
            }
            catch (error) {
                errors.push({ row: index + 1, error });
                logger.error(`Validation failed for state row ${index + 1}`, { row, error });
            }
        });
        if (errors.length > 0) {
            logger.warn(`${errors.length} state records failed validation`);
        }
        // Insert states
        const stateIdMap = new Map();
        const progressBar = new cli_progress_1.default.SingleBar({
            format: 'States Import |{bar}| {percentage}% | {value}/{total}'
        });
        progressBar.start(validStates.length, 0);
        for (const state of validStates) {
            const result = await this.db.query(`INSERT INTO states (state_code, state_name, state_name_lower)
         VALUES ($1, $2, $3)
         ON CONFLICT (state_code) DO UPDATE 
         SET state_name = EXCLUDED.state_name
         RETURNING id`, [
                state.state_code.trim().toUpperCase(),
                Utils.normalizeName(state.state_name),
                state.state_name.toLowerCase().trim()
            ]);
            stateIdMap.set(state.state_code, result.rows[0].id);
            progressBar.increment();
        }
        progressBar.stop();
        logger.info(`Imported ${validStates.length} states successfully`);
        return stateIdMap;
    }
}
class DistrictImporter {
    db;
    constructor(db) {
        this.db = db;
    }
    async import(filePath, stateIdMap) {
        logger.info('Starting Districts import...');
        const rawData = await Utils.readCSV(filePath);
        logger.info(`Read ${rawData.length} districts from CSV`);
        const validDistricts = [];
        const errors = [];
        rawData.forEach((row, index) => {
            try {
                const validated = DistrictSchema.parse(row);
                if (!stateIdMap.has(validated.state_code)) {
                    throw new Error(`State code ${validated.state_code} not found`);
                }
                validDistricts.push(validated);
            }
            catch (error) {
                errors.push({ row: index + 1, error });
                logger.error(`Validation failed for district row ${index + 1}`, { row, error });
            }
        });
        if (errors.length > 0) {
            logger.warn(`${errors.length} district records failed validation`);
        }
        // Batch insert districts
        const districtIdMap = new Map();
        const batches = Utils.chunk(validDistricts, config.import.batchSize);
        const progressBar = new cli_progress_1.default.SingleBar({
            format: 'Districts Import |{bar}| {percentage}% | {value}/{total}'
        });
        progressBar.start(validDistricts.length, 0);
        for (const batch of batches) {
            const values = [];
            const placeholders = [];
            batch.forEach((district, i) => {
                const offset = i * 4;
                placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
                values.push(stateIdMap.get(district.state_code), district.district_code.trim(), Utils.normalizeName(district.district_name), district.district_name.toLowerCase().trim());
            });
            const query = `
        INSERT INTO districts (state_id, district_code, district_name, district_name_lower)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (district_code) DO UPDATE 
        SET district_name = EXCLUDED.district_name
        RETURNING district_code, id
      `;
            const result = await this.db.query(query, values);
            result.rows.forEach((row) => {
                districtIdMap.set(row.district_code, row.id);
            });
            progressBar.update(progressBar.value + batch.length);
        }
        progressBar.stop();
        logger.info(`Imported ${validDistricts.length} districts successfully`);
        return districtIdMap;
    }
}
class SubDistrictImporter {
    db;
    constructor(db) {
        this.db = db;
    }
    async import(filePath, districtIdMap) {
        logger.info('Starting Sub-Districts import...');
        const rawData = await Utils.readCSV(filePath);
        logger.info(`Read ${rawData.length} sub-districts from CSV`);
        const validSubDistricts = [];
        const errors = [];
        rawData.forEach((row, index) => {
            try {
                const validated = SubDistrictSchema.parse(row);
                if (!districtIdMap.has(validated.district_code)) {
                    throw new Error(`District code ${validated.district_code} not found`);
                }
                validSubDistricts.push(validated);
            }
            catch (error) {
                errors.push({ row: index + 1, error });
                logger.error(`Validation failed for sub-district row ${index + 1}`, { row, error });
            }
        });
        if (errors.length > 0) {
            logger.warn(`${errors.length} sub-district records failed validation`);
        }
        const subDistrictIdMap = new Map();
        const batches = Utils.chunk(validSubDistricts, config.import.batchSize);
        const progressBar = new cli_progress_1.default.SingleBar({
            format: 'Sub-Districts Import |{bar}| {percentage}% | {value}/{total}'
        });
        progressBar.start(validSubDistricts.length, 0);
        for (const batch of batches) {
            const values = [];
            const placeholders = [];
            batch.forEach((subDistrict, i) => {
                const offset = i * 4;
                placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
                values.push(districtIdMap.get(subDistrict.district_code), subDistrict.sub_district_code.trim(), Utils.normalizeName(subDistrict.sub_district_name), subDistrict.sub_district_name.toLowerCase().trim());
            });
            const query = `
        INSERT INTO sub_districts (district_id, sub_district_code, sub_district_name, sub_district_name_lower)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (sub_district_code) DO UPDATE 
        SET sub_district_name = EXCLUDED.sub_district_name
        RETURNING sub_district_code, id
      `;
            const result = await this.db.query(query, values);
            result.rows.forEach((row) => {
                subDistrictIdMap.set(row.sub_district_code, row.id);
            });
            progressBar.update(progressBar.value + batch.length);
        }
        progressBar.stop();
        logger.info(`Imported ${validSubDistricts.length} sub-districts successfully`);
        return subDistrictIdMap;
    }
}
class VillageImporter {
    db;
    constructor(db) {
        this.db = db;
    }
    async import(filePath, subDistrictIdMap) {
        logger.info('Starting Villages import...');
        const rawData = await Utils.readCSV(filePath);
        logger.info(`Read ${rawData.length} villages from CSV`);
        const validVillages = [];
        const errors = [];
        rawData.forEach((row, index) => {
            try {
                const validated = VillageSchema.parse(row);
                if (!subDistrictIdMap.has(validated.sub_district_code)) {
                    throw new Error(`Sub-district code ${validated.sub_district_code} not found`);
                }
                validVillages.push(validated);
            }
            catch (error) {
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
        const progressBar = new cli_progress_1.default.SingleBar({
            format: 'Villages Import |{bar}| {percentage}% | {value}/{total} | ETA: {eta}s'
        });
        progressBar.start(validVillages.length, 0);
        for (const batch of batches) {
            const values = [];
            const placeholders = [];
            batch.forEach((village, i) => {
                const offset = i * 6;
                placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`);
                values.push(subDistrictIdMap.get(village.sub_district_code), village.lgd_code?.trim() || null, Utils.normalizeName(village.village_name), village.village_name.toLowerCase().trim(), Utils.validatePincode(village.pincode), Utils.parsePopulation(village.population));
            });
            const query = `
        INSERT INTO villages (sub_district_id, village_code, village_name, village_name_lower, pincode, population)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (village_code) DO NOTHING
      `;
            await this.db.query(query, values);
            progressBar.update(progressBar.value + batch.length);
        }
        progressBar.stop();
        logger.info(`Imported ${validVillages.length} villages successfully`);
    }
}
// ============================================================================
// VALIDATION & VERIFICATION
// ============================================================================
class DataValidator {
    db;
    constructor(db) {
        this.db = db;
    }
    async runValidations() {
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
        }
        else {
            logger.error('✗ Some validations failed');
        }
        return allPassed;
    }
    async checkCounts() {
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
    async checkOrphans() {
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
            }
            else {
                logger.info(`✓ No ${name}`);
            }
        }
        return allPassed;
    }
    async checkDuplicates() {
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
    async checkMissingData() {
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
    db;
    stateImporter;
    districtImporter;
    subDistrictImporter;
    villageImporter;
    validator;
    constructor() {
        this.db = new Database();
        this.stateImporter = new StateImporter(this.db);
        this.districtImporter = new DistrictImporter(this.db);
        this.subDistrictImporter = new SubDistrictImporter(this.db);
        this.villageImporter = new VillageImporter(this.db);
        this.validator = new DataValidator(this.db);
    }
    async run() {
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
            const stateIdMap = await this.stateImporter.import(path_1.default.join(config.import.dataDir, 'states.csv'));
            const districtIdMap = await this.districtImporter.import(path_1.default.join(config.import.dataDir, 'districts.csv'), stateIdMap);
            const subDistrictIdMap = await this.subDistrictImporter.import(path_1.default.join(config.import.dataDir, 'sub_districts.csv'), districtIdMap);
            await this.villageImporter.import(path_1.default.join(config.import.dataDir, 'villages.csv'), subDistrictIdMap);
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
        }
        catch (error) {
            logger.error('Import process failed', { error });
            throw error;
        }
        finally {
            await this.db.disconnect();
        }
    }
}
exports.ImportOrchestrator = ImportOrchestrator;
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
//# sourceMappingURL=import_script.js.map