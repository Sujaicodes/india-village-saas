#!/bin/bash

# ============================================================================
# India Village Data - Quick Start Setup Script
# ============================================================================

set -e  # Exit on error

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  India Village Data - Database & Import Setup                 ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Node.js version
echo "→ Checking Node.js version..."
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}✗ Node.js 18+ required. Current: $(node -v)${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v) detected${NC}"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗ npm not found. Please install Node.js and npm${NC}"
    exit 1
fi
echo -e "${GREEN}✓ npm $(npm -v) detected${NC}"

# Create directory structure
echo ""
echo "→ Creating directory structure..."
mkdir -p data logs src dist

# Create data directory with instructions
cat > data/README.md << 'EOF'
# Data Directory

Place your CSV files here:

- states.csv
- districts.csv
- sub_districts.csv
- villages.csv

## CSV Format Examples

### states.csv
```csv
state_code,state_name
01,Andaman and Nicobar Islands
02,Andhra Pradesh
```

### districts.csv
```csv
state_code,district_code,district_name
01,001,Nicobar
02,001,Anantapur
```

### sub_districts.csv
```csv
district_code,sub_district_code,sub_district_name
001,001001,Car Nicobar
002,002001,Anantapur
```

### villages.csv
```csv
sub_district_code,village_code,village_name,pincode,population
001001,0010010001,Arong,744301,2500
002001,0020010001,Agraharam,515001,3500
```
EOF

echo -e "${GREEN}✓ Directory structure created${NC}"

# Install dependencies
echo ""
echo "→ Installing dependencies..."
if [ -f "package.json" ]; then
    npm install
    echo -e "${GREEN}✓ Dependencies installed${NC}"
else
    echo -e "${YELLOW}! package.json not found. Skipping npm install${NC}"
fi

# Setup environment file
echo ""
echo "→ Setting up environment configuration..."
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${GREEN}✓ Created .env file from template${NC}"
        echo -e "${YELLOW}⚠ Please edit .env with your database credentials${NC}"
    else
        cat > .env << 'EOF'
# Database Configuration
DB_HOST=your-neon-host.neon.tech
DB_PORT=5432
DB_NAME=india_villages_db
DB_USER=your_username
DB_PASSWORD=your_password

# Import Configuration
DATA_DIR=./data
BATCH_SIZE=5000
TRUNCATE_TABLES=false
EOF
        echo -e "${GREEN}✓ Created .env file${NC}"
        echo -e "${YELLOW}⚠ Please edit .env with your database credentials${NC}"
    fi
else
    echo -e "${YELLOW}! .env already exists. Skipping...${NC}"
fi

# Check for CSV files
echo ""
echo "→ Checking for CSV data files..."
CSV_COUNT=0
for file in states.csv districts.csv sub_districts.csv villages.csv; do
    if [ -f "data/$file" ]; then
        echo -e "${GREEN}  ✓ Found data/$file${NC}"
        CSV_COUNT=$((CSV_COUNT + 1))
    else
        echo -e "${YELLOW}  ✗ Missing data/$file${NC}"
    fi
done

if [ $CSV_COUNT -eq 4 ]; then
    echo -e "${GREEN}✓ All CSV files found${NC}"
else
    echo -e "${YELLOW}⚠ $CSV_COUNT/4 CSV files found. Please add missing files to ./data/${NC}"
fi

# Build TypeScript (if source exists)
echo ""
if [ -f "import_script.ts" ]; then
    echo "→ Compiling TypeScript..."
    
    # Move import_script.ts to src if it's in root
    if [ ! -f "src/import_script.ts" ]; then
        mv import_script.ts src/
    fi
    
    npm run build 2>/dev/null || {
        echo -e "${YELLOW}! Build skipped (run 'npm run build' manually)${NC}"
    }
fi

# Create .gitignore
echo ""
echo "→ Creating .gitignore..."
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
package-lock.json

# Build output
dist/

# Environment
.env
.env.local

# Logs
logs/*.log

# Data files (optional - uncomment if you don't want to commit CSV files)
# data/*.csv

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db
EOF
echo -e "${GREEN}✓ .gitignore created${NC}"

# Summary
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  Setup Complete!                                               ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "Next Steps:"
echo ""
echo "1. ${YELLOW}Edit .env file${NC} with your database credentials"
echo "   nano .env"
echo ""
echo "2. ${YELLOW}Add CSV files${NC} to ./data/ directory:"
echo "   - states.csv"
echo "   - districts.csv"
echo "   - sub_districts.csv"
echo "   - villages.csv"
echo ""
echo "3. ${YELLOW}Create database schema${NC}:"
echo "   psql -h <host> -U <user> -d <database> -f database_schema.sql"
echo ""
echo "4. ${YELLOW}Run the import${NC}:"
echo "   npm run build"
echo "   npm run import"
echo ""
echo "For more details, see README.md"
echo ""
