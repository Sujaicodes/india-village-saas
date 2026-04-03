"use strict";
// ============================================================================
// India Village Data - Sample REST API
// Framework: Express.js with TypeScript
// ============================================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const pg_1 = require("pg");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// ============================================================================
// DATABASE CONNECTION
// ============================================================================
const pool = new pg_1.Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
});
// ============================================================================
// EXPRESS APP SETUP
// ============================================================================
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Rate limiting
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);
async function authenticateApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
        return res.status(401).json({
            error: 'API key required',
            message: 'Please provide X-API-Key header'
        });
    }
    try {
        const result = await pool.query(`SELECT 
        ak.id, ak.user_id, ak.is_active, 
        ak.rate_limit_per_minute, ak.rate_limit_per_day,
        u.id as user_id, u.email, u.subscription_plan
       FROM api_keys ak
       JOIN users u ON ak.user_id = u.id
       WHERE ak.api_key = $1 AND ak.is_active = true AND u.is_active = true`, [apiKey]);
        if (result.rows.length === 0) {
            return res.status(401).json({
                error: 'Invalid API key',
                message: 'The provided API key is invalid or inactive'
            });
        }
        const apiKeyData = result.rows[0];
        // Update last_used_at
        await pool.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [apiKeyData.id]);
        // Attach user and API key info to request
        req.user = {
            id: apiKeyData.user_id,
            email: apiKeyData.email,
            subscription_plan: apiKeyData.subscription_plan
        };
        req.apiKey = {
            id: apiKeyData.id,
            rate_limit_per_minute: apiKeyData.rate_limit_per_minute,
            rate_limit_per_day: apiKeyData.rate_limit_per_day
        };
        next();
    }
    catch (error) {
        console.error('Authentication error:', error);
        res.status(500).json({
            error: 'Authentication failed',
            message: 'Internal server error during authentication'
        });
    }
}
// ============================================================================
// MIDDLEWARE - REQUEST LOGGING
// ============================================================================
async function logRequest(req, res, next) {
    const startTime = Date.now();
    res.on('finish', async () => {
        const responseTime = Date.now() - startTime;
        if (req.user && req.apiKey) {
            try {
                await pool.query(`INSERT INTO api_request_logs 
           (api_key_id, user_id, endpoint, method, status_code, response_time_ms, ip_address, query_params)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
                    req.apiKey.id,
                    req.user.id,
                    req.path,
                    req.method,
                    res.statusCode,
                    responseTime,
                    req.ip,
                    JSON.stringify(req.query)
                ]);
            }
            catch (error) {
                console.error('Failed to log request:', error);
            }
        }
    });
    next();
}
// ============================================================================
// API ROUTES
// ============================================================================
// Health Check
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    }
    catch (error) {
        res.status(500).json({ status: 'error', message: 'Database connection failed' });
    }
});
// API Documentation
app.get('/api', (req, res) => {
    res.json({
        name: 'India Village Data API',
        version: '1.0.0',
        endpoints: {
            '/api/states': 'Get all states',
            '/api/states/:id/districts': 'Get districts in a state',
            '/api/districts/:id/sub-districts': 'Get sub-districts in a district',
            '/api/sub-districts/:id/villages': 'Get villages in a sub-district',
            '/api/search/villages': 'Search villages (query param: q)',
            '/api/address/:villageId': 'Get complete address for a village',
            '/api/autocomplete': 'Autocomplete search (query param: q, type)'
        },
        authentication: 'Required: X-API-Key header'
    });
});
// ============================================================================
// GEOGRAPHICAL DATA ENDPOINTS
// ============================================================================
// Get all states
app.get('/api/states', authenticateApiKey, logRequest, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, state_code, state_name FROM states ORDER BY state_name');
        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    }
    catch (error) {
        console.error('Error fetching states:', error);
        res.status(500).json({ error: 'Failed to fetch states' });
    }
});
// Get districts by state
app.get('/api/states/:id/districts', authenticateApiKey, logRequest, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`SELECT d.id, d.district_code, d.district_name, s.state_name
       FROM districts d
       JOIN states s ON d.state_id = s.id
       WHERE d.state_id = $1
       ORDER BY d.district_name`, [id]);
        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    }
    catch (error) {
        console.error('Error fetching districts:', error);
        res.status(500).json({ error: 'Failed to fetch districts' });
    }
});
// Get sub-districts by district
app.get('/api/districts/:id/sub-districts', authenticateApiKey, logRequest, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`SELECT sd.id, sd.sub_district_code, sd.sub_district_name, d.district_name
       FROM sub_districts sd
       JOIN districts d ON sd.district_id = d.id
       WHERE sd.district_id = $1
       ORDER BY sd.sub_district_name`, [id]);
        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    }
    catch (error) {
        console.error('Error fetching sub-districts:', error);
        res.status(500).json({ error: 'Failed to fetch sub-districts' });
    }
});
// Get villages by sub-district
app.get('/api/sub-districts/:id/villages', authenticateApiKey, logRequest, async (req, res) => {
    try {
        const { id } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const offset = (page - 1) * limit;
        const result = await pool.query(`SELECT v.id, v.village_name, v.pincode, v.population, sd.sub_district_name
       FROM villages v
       JOIN sub_districts sd ON v.sub_district_id = sd.id
       WHERE v.sub_district_id = $1
       ORDER BY v.village_name
       LIMIT $2 OFFSET $3`, [id, limit, offset]);
        const countResult = await pool.query('SELECT COUNT(*) FROM villages WHERE sub_district_id = $1', [id]);
        const totalCount = parseInt(countResult.rows[0].count);
        res.json({
            success: true,
            pagination: {
                page,
                limit,
                total: totalCount,
                pages: Math.ceil(totalCount / limit)
            },
            data: result.rows
        });
    }
    catch (error) {
        console.error('Error fetching villages:', error);
        res.status(500).json({ error: 'Failed to fetch villages' });
    }
});
// Search villages
app.get('/api/search/villages', authenticateApiKey, logRequest, async (req, res) => {
    try {
        const searchQuery = req.query.q?.toLowerCase().trim();
        if (!searchQuery || searchQuery.length < 2) {
            return res.status(400).json({
                error: 'Invalid search query',
                message: 'Search query must be at least 2 characters'
            });
        }
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const result = await pool.query(`SELECT 
        v.id,
        v.village_name,
        v.pincode,
        sd.sub_district_name,
        d.district_name,
        s.state_name,
        CONCAT(v.village_name, ', ', sd.sub_district_name, ', ', d.district_name, ', ', s.state_name, ', India') as full_address
       FROM villages v
       JOIN sub_districts sd ON v.sub_district_id = sd.id
       JOIN districts d ON sd.district_id = d.id
       JOIN states s ON d.state_id = s.id
       WHERE v.village_name_lower LIKE $1
       ORDER BY v.village_name
       LIMIT $2`, [`%${searchQuery}%`, limit]);
        res.json({
            success: true,
            query: searchQuery,
            count: result.rows.length,
            data: result.rows
        });
    }
    catch (error) {
        console.error('Error searching villages:', error);
        res.status(500).json({ error: 'Failed to search villages' });
    }
});
// Get complete address for a village
app.get('/api/address/:villageId', authenticateApiKey, logRequest, async (req, res) => {
    try {
        const { villageId } = req.params;
        const result = await pool.query(`SELECT * FROM v_complete_addresses WHERE village_id = $1`, [villageId]);
        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Village not found',
                message: `No village found with ID ${villageId}`
            });
        }
        res.json({
            success: true,
            data: result.rows[0]
        });
    }
    catch (error) {
        console.error('Error fetching address:', error);
        res.status(500).json({ error: 'Failed to fetch address' });
    }
});
// Autocomplete (fuzzy search with trigram)
app.get('/api/autocomplete', authenticateApiKey, logRequest, async (req, res) => {
    try {
        const query = req.query.q?.toLowerCase().trim();
        const type = req.query.type || 'village'; // village, district, state
        if (!query || query.length < 2) {
            return res.status(400).json({
                error: 'Invalid query',
                message: 'Query must be at least 2 characters'
            });
        }
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        let result;
        switch (type) {
            case 'state':
                result = await pool.query(`SELECT id, state_name as name, state_code as code
           FROM states
           WHERE state_name_lower % $1
           ORDER BY similarity(state_name_lower, $1) DESC
           LIMIT $2`, [query, limit]);
                break;
            case 'district':
                result = await pool.query(`SELECT d.id, d.district_name as name, d.district_code as code, s.state_name
           FROM districts d
           JOIN states s ON d.state_id = s.id
           WHERE d.district_name_lower % $1
           ORDER BY similarity(d.district_name_lower, $1) DESC
           LIMIT $2`, [query, limit]);
                break;
            case 'village':
            default:
                result = await pool.query(`SELECT 
            v.id,
            v.village_name as name,
            CONCAT(v.village_name, ', ', sd.sub_district_name, ', ', d.district_name, ', ', s.state_name) as full_address
           FROM villages v
           JOIN sub_districts sd ON v.sub_district_id = sd.id
           JOIN districts d ON sd.district_id = d.id
           JOIN states s ON d.state_id = s.id
           WHERE v.village_name_lower % $1
           ORDER BY similarity(v.village_name_lower, $1) DESC
           LIMIT $2`, [query, limit]);
                break;
        }
        res.json({
            success: true,
            query,
            type,
            count: result.rows.length,
            data: result.rows
        });
    }
    catch (error) {
        console.error('Error in autocomplete:', error);
        res.status(500).json({ error: 'Autocomplete failed' });
    }
});
// ============================================================================
// ERROR HANDLING
// ============================================================================
// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: 'The requested endpoint does not exist',
        path: req.path
    });
});
// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message || 'Something went wrong'
    });
});
// ============================================================================
// SERVER START
// ============================================================================
app.listen(PORT, () => {
    console.log('═'.repeat(70));
    console.log(`  India Village Data API`);
    console.log(`  Server running on http://localhost:${PORT}`);
    console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('═'.repeat(70));
});
// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing server...');
    await pool.end();
    process.exit(0);
});
exports.default = app;
//# sourceMappingURL=api_server.js.map