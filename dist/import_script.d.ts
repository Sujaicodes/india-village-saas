import { PoolClient } from 'pg';
declare class Utils {
    /**
     * Normalize name: Proper capitalization, trim spaces
     */
    static normalizeName(name: string): string;
    /**
     * Validate and normalize pincode
     */
    static validatePincode(pincode?: string): string | null;
    /**
     * Parse population safely
     */
    static parsePopulation(population?: string): number | null;
    /**
     * Chunk array into batches
     */
    static chunk<T>(array: T[], size: number): T[][];
    /**
     * Read CSV file and parse
     */
    static readCSV<T>(filePath: string): Promise<T[]>;
}
declare class Database {
    private pool;
    constructor();
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    getClient(): Promise<PoolClient>;
    query(text: string, params?: any[]): Promise<any>;
    disableTriggers(): Promise<void>;
    enableTriggers(): Promise<void>;
    truncateTables(): Promise<void>;
    vacuum(): Promise<void>;
}
declare class ImportOrchestrator {
    private db;
    private stateImporter;
    private districtImporter;
    private subDistrictImporter;
    private villageImporter;
    private validator;
    constructor();
    run(): Promise<void>;
}
export { ImportOrchestrator, Database, Utils };
