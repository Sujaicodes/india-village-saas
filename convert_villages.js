// ============================================================================
// Census 2011 Village Data Converter
// Converts all state .xls files into one combined villages.csv
// ============================================================================
// Usage:
//   1. Place this file in the same folder as your .xls files
//   2. Run: node convert_villages.js
//   3. Output: villages.csv (ready for npm run import)
// ============================================================================

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

// ---- Config ----------------------------------------------------------------
const INPUT_FOLDER = './data/';        // folder containing your .xls files
const OUTPUT_FILE  = './data/villages.csv';  // output path
// ----------------------------------------------------------------------------

// Column mapping from Census 2011 headers to our schema
// Census header        → CSV output column
const COLUMN_MAP = {
  'MDDS STC':           'state_code',
  'STATE NAME':         'state_name',
  'MDDS DTC':           'district_code',
  'DISTRICT NAME':      'district_name',
  'MDDS Sub_DT':        'subdistrict_code',
  'SUB-DISTRICT NAME':  'subdistrict_name',
  'MDDS PLCN':          'lgd_code',
  'Area Name':          'village_name',
};

const OUTPUT_HEADERS = [
  'state_code',
  'state_name',
  'district_code',
  'district_name',
  'subdistrict_code',
  'subdistrict_name',
  'lgd_code',
  'village_name',
];

function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value).trim();
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function isValidVillageRow(row) {
  // Skip summary/header rows where MDDS PLCN is 000000 (state/district/subdistrict level)
  const lgdCode = String(row['lgd_code'] || '').trim();
  const villageName = String(row['village_name'] || '').trim();
  return lgdCode !== '000000' && lgdCode !== '00000' && lgdCode !== '000' && villageName !== '';
}

function processFile(filePath) {
  const filename = path.basename(filePath);
  console.log(`Processing: ${filename}`);

  try {
    const workbook = xlsx.readFile(filePath, { cellText: false, cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

    const mapped = [];

    for (const row of rows) {
      const mappedRow = {};
      for (const [censusCol, ourCol] of Object.entries(COLUMN_MAP)) {
        mappedRow[ourCol] = row[censusCol] !== undefined ? row[censusCol] : '';
      }
      if (isValidVillageRow(mappedRow)) {
        mapped.push(mappedRow);
      }
    }

    console.log(`  → ${mapped.length} villages found`);
    return mapped;

  } catch (err) {
    console.error(`  ✗ Error processing ${filename}:`, err.message);
    return [];
  }
}

async function main() {
  console.log('============================================================');
  console.log(' Census 2011 → villages.csv Converter');
  console.log('============================================================\n');

  // Find all .xls and .xlsx files
  const files = fs.readdirSync(INPUT_FOLDER)
    .filter(f => f.startsWith('Rdir_') && (f.endsWith('.xls') || f.endsWith('.xlsx')))
    .map(f => path.join(INPUT_FOLDER, f))
    .sort();

  if (files.length === 0) {
    console.error('❌ No Rdir_*.xls files found in current folder.');
    console.error('   Make sure this script is in the same folder as your .xls files.');
    process.exit(1);
  }

  console.log(`Found ${files.length} state files:\n`);
  files.forEach(f => console.log('  •', path.basename(f)));
  console.log('');

  // Process all files
  let allVillages = [];
  for (const file of files) {
    const villages = processFile(file);
    allVillages = allVillages.concat(villages);
  }

  // Create output directory if needed
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`\nCreated output directory: ${outputDir}`);
  }

  // Write CSV
  const csvLines = [OUTPUT_HEADERS.join(',')];
  for (const row of allVillages) {
    const line = OUTPUT_HEADERS.map(h => escapeCSV(row[h])).join(',');
    csvLines.push(line);
  }

  fs.writeFileSync(OUTPUT_FILE, csvLines.join('\n'), 'utf8');

  console.log('\n============================================================');
  console.log(` ✅ Done!`);
  console.log(`    Total villages: ${allVillages.length.toLocaleString()}`);
  console.log(`    Output file:    ${OUTPUT_FILE}`);
  console.log('============================================================\n');
  console.log('Next step: npm run import');
}

main().catch(console.error);
