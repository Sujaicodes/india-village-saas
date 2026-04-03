-- ============================================================================
-- India Village Data SaaS Platform - Database Schema
-- Database: PostgreSQL (NeonDB)
-- Version: 1.0
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search

-- ============================================================================
-- 1. GEOGRAPHICAL HIERARCHY TABLES
-- ============================================================================

-- States Table
CREATE TABLE states (
    id SERIAL PRIMARY KEY,
    state_code VARCHAR(10) UNIQUE NOT NULL,
    state_name VARCHAR(100) NOT NULL,
    state_name_lower VARCHAR(100) NOT NULL, -- For case-insensitive search
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Districts Table
CREATE TABLE districts (
    id SERIAL PRIMARY KEY,
    state_id INTEGER NOT NULL REFERENCES states(id) ON DELETE CASCADE,
    district_code VARCHAR(20) UNIQUE NOT NULL,
    district_name VARCHAR(100) NOT NULL,
    district_name_lower VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sub-Districts Table (Tehsil/Taluka/Block)
CREATE TABLE sub_districts (
    id SERIAL PRIMARY KEY,
    district_id INTEGER NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
    sub_district_code VARCHAR(30) UNIQUE NOT NULL,
    sub_district_name VARCHAR(100) NOT NULL,
    sub_district_name_lower VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Villages Table
CREATE TABLE villages (
    id SERIAL PRIMARY KEY,
    sub_district_id INTEGER NOT NULL REFERENCES sub_districts(id) ON DELETE CASCADE,
    village_code VARCHAR(50) UNIQUE,
    village_name VARCHAR(150) NOT NULL,
    village_name_lower VARCHAR(150) NOT NULL,
    pincode VARCHAR(10),
    population INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2. USER MANAGEMENT TABLES
-- ============================================================================

-- User Roles Enum
CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'b2b_client');

-- Subscription Plans Enum
CREATE TYPE subscription_plan AS ENUM ('free', 'premium', 'pro', 'unlimited');

-- Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    company_name VARCHAR(150),
    phone VARCHAR(20),
    role user_role DEFAULT 'b2b_client',
    subscription_plan subscription_plan DEFAULT 'free',
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- ============================================================================
-- 3. API KEY MANAGEMENT TABLES
-- ============================================================================

-- API Keys Table
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    api_key VARCHAR(64) UNIQUE NOT NULL, -- Public key
    api_secret VARCHAR(128) NOT NULL, -- Hashed secret
    key_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    rate_limit_per_minute INTEGER DEFAULT 60,
    rate_limit_per_day INTEGER DEFAULT 10000,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    last_used_at TIMESTAMP
);

-- ============================================================================
-- 4. USAGE TRACKING & ANALYTICS TABLES
-- ============================================================================

-- API Request Logs Table (Partitioned by month for performance)
CREATE TABLE api_request_logs (
    id BIGSERIAL,
    api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER NOT NULL,
    response_time_ms INTEGER,
    ip_address INET,
    user_agent TEXT,
    query_params JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) PARTITION BY RANGE (created_at);

-- Create partitions for current and next 3 months
CREATE TABLE api_request_logs_2025_04 PARTITION OF api_request_logs
    FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');

CREATE TABLE api_request_logs_2025_05 PARTITION OF api_request_logs
    FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');

CREATE TABLE api_request_logs_2025_06 PARTITION OF api_request_logs
    FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');

-- Daily Usage Summary Table
CREATE TABLE daily_usage_summary (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    total_requests INTEGER DEFAULT 0,
    successful_requests INTEGER DEFAULT 0,
    failed_requests INTEGER DEFAULT 0,
    avg_response_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, api_key_id, date)
);

-- ============================================================================
-- 5. SUBSCRIPTION & BILLING TABLES
-- ============================================================================

-- Subscription Plans Configuration
CREATE TABLE subscription_plans_config (
    id SERIAL PRIMARY KEY,
    plan_name subscription_plan UNIQUE NOT NULL,
    display_name VARCHAR(50) NOT NULL,
    monthly_price DECIMAL(10, 2) NOT NULL,
    yearly_price DECIMAL(10, 2),
    requests_per_day INTEGER NOT NULL,
    requests_per_minute INTEGER NOT NULL,
    max_api_keys INTEGER NOT NULL,
    features JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Subscriptions Table
CREATE TABLE user_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan subscription_plan NOT NULL,
    status VARCHAR(20) DEFAULT 'active', -- active, cancelled, expired, suspended
    billing_cycle VARCHAR(20), -- monthly, yearly
    amount DECIMAL(10, 2),
    currency VARCHAR(3) DEFAULT 'INR',
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP,
    auto_renew BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment Transactions Table
CREATE TABLE payment_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES user_subscriptions(id),
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    payment_method VARCHAR(50),
    payment_gateway VARCHAR(50),
    transaction_id VARCHAR(255) UNIQUE,
    status VARCHAR(20) DEFAULT 'pending', -- pending, completed, failed, refunded
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 6. CACHING & PERFORMANCE TABLES
-- ============================================================================

-- Popular Searches Cache (for analytics)
CREATE TABLE popular_searches (
    id SERIAL PRIMARY KEY,
    search_term VARCHAR(200) NOT NULL,
    search_type VARCHAR(50), -- state, district, sub_district, village
    search_count INTEGER DEFAULT 1,
    last_searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 7. INDEXES FOR PERFORMANCE OPTIMIZATION
-- ============================================================================

-- Geographical Data Indexes
CREATE INDEX idx_states_name_lower ON states(state_name_lower);
CREATE INDEX idx_states_name_trgm ON states USING gin(state_name_lower gin_trgm_ops);

CREATE INDEX idx_districts_state_id ON districts(state_id);
CREATE INDEX idx_districts_name_lower ON districts(district_name_lower);
CREATE INDEX idx_districts_name_trgm ON districts USING gin(district_name_lower gin_trgm_ops);

CREATE INDEX idx_sub_districts_district_id ON sub_districts(district_id);
CREATE INDEX idx_sub_districts_name_lower ON sub_districts(sub_district_name_lower);
CREATE INDEX idx_sub_districts_name_trgm ON sub_districts USING gin(sub_district_name_lower gin_trgm_ops);

CREATE INDEX idx_villages_sub_district_id ON villages(sub_district_id);
CREATE INDEX idx_villages_name_lower ON villages(village_name_lower);
CREATE INDEX idx_villages_name_trgm ON villages USING gin(village_name_lower gin_trgm_ops);
CREATE INDEX idx_villages_pincode ON villages(pincode);

-- User & API Key Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_subscription_plan ON users(subscription_plan);
CREATE INDEX idx_api_keys_api_key ON api_keys(api_key);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_is_active ON api_keys(is_active);

-- Usage Tracking Indexes
CREATE INDEX idx_api_logs_api_key_id ON api_request_logs(api_key_id);
CREATE INDEX idx_api_logs_user_id ON api_request_logs(user_id);
CREATE INDEX idx_api_logs_created_at ON api_request_logs(created_at);
CREATE INDEX idx_daily_usage_user_date ON daily_usage_summary(user_id, date);

-- ============================================================================
-- 8. FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_states_updated_at BEFORE UPDATE ON states
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_districts_updated_at BEFORE UPDATE ON districts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sub_districts_updated_at BEFORE UPDATE ON sub_districts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_villages_updated_at BEFORE UPDATE ON villages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically set lowercase name fields
CREATE OR REPLACE FUNCTION set_lowercase_name()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME = 'states' THEN
        NEW.state_name_lower = LOWER(NEW.state_name);
    ELSIF TG_TABLE_NAME = 'districts' THEN
        NEW.district_name_lower = LOWER(NEW.district_name);
    ELSIF TG_TABLE_NAME = 'sub_districts' THEN
        NEW.sub_district_name_lower = LOWER(NEW.sub_district_name);
    ELSIF TG_TABLE_NAME = 'villages' THEN
        NEW.village_name_lower = LOWER(NEW.village_name);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply lowercase triggers
CREATE TRIGGER set_state_lowercase BEFORE INSERT OR UPDATE ON states
    FOR EACH ROW EXECUTE FUNCTION set_lowercase_name();

CREATE TRIGGER set_district_lowercase BEFORE INSERT OR UPDATE ON districts
    FOR EACH ROW EXECUTE FUNCTION set_lowercase_name();

CREATE TRIGGER set_sub_district_lowercase BEFORE INSERT OR UPDATE ON sub_districts
    FOR EACH ROW EXECUTE FUNCTION set_lowercase_name();

CREATE TRIGGER set_village_lowercase BEFORE INSERT OR UPDATE ON villages
    FOR EACH ROW EXECUTE FUNCTION set_lowercase_name();

-- ============================================================================
-- 9. INITIAL DATA - SUBSCRIPTION PLANS
-- ============================================================================

INSERT INTO subscription_plans_config 
(plan_name, display_name, monthly_price, yearly_price, requests_per_day, requests_per_minute, max_api_keys, features)
VALUES
('free', 'Free Plan', 0.00, 0.00, 1000, 10, 1, 
 '{"support": "community", "analytics": false, "priority": "low"}'::jsonb),
 
('premium', 'Premium Plan', 499.00, 4990.00, 50000, 100, 3, 
 '{"support": "email", "analytics": true, "priority": "medium", "sla": "99%"}'::jsonb),
 
('pro', 'Pro Plan', 1999.00, 19990.00, 250000, 500, 10, 
 '{"support": "priority", "analytics": true, "priority": "high", "sla": "99.9%", "custom_domains": true}'::jsonb),
 
('unlimited', 'Unlimited Plan', 9999.00, 99990.00, 999999999, 10000, 50, 
 '{"support": "dedicated", "analytics": true, "priority": "highest", "sla": "99.99%", "custom_domains": true, "white_label": true}'::jsonb);

-- ============================================================================
-- 10. VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Complete Address Hierarchy View
CREATE VIEW v_complete_addresses AS
SELECT 
    v.id as village_id,
    v.village_name,
    v.village_code,
    v.pincode,
    sd.id as sub_district_id,
    sd.sub_district_name,
    d.id as district_id,
    d.district_name,
    s.id as state_id,
    s.state_name,
    CONCAT(
        v.village_name, ', ',
        sd.sub_district_name, ', ',
        d.district_name, ', ',
        s.state_name, ', India'
    ) as full_address
FROM villages v
JOIN sub_districts sd ON v.sub_district_id = sd.id
JOIN districts d ON sd.district_id = d.id
JOIN states s ON d.state_id = s.id;

-- User API Usage Summary View
CREATE VIEW v_user_api_usage AS
SELECT 
    u.id as user_id,
    u.email,
    u.full_name,
    u.subscription_plan,
    COUNT(DISTINCT ak.id) as total_api_keys,
    COUNT(DISTINCT ak.id) FILTER (WHERE ak.is_active = true) as active_api_keys,
    COALESCE(SUM(dus.total_requests), 0) as total_requests_all_time
FROM users u
LEFT JOIN api_keys ak ON u.id = ak.user_id
LEFT JOIN daily_usage_summary dus ON u.id = dus.user_id
GROUP BY u.id, u.email, u.full_name, u.subscription_plan;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
