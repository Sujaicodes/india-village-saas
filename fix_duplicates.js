const fs = require('fs');

// Fix sub_districts.csv
const subLines = fs.readFileSync('data/sub_districts.csv', 'utf8').split('\n');
const subHeader = subLines[0];
const subFixed = subLines.slice(1).filter(l => l.trim()).map(line => {
    const parts = line.split(',');
    if (parts.length >= 3) {
        parts[2] = parts[0].trim() + parts[1].trim() + parts[2].trim();
    }
    return parts.join(',');
});
fs.writeFileSync('data/sub_districts.csv', [subHeader, ...subFixed].join('\n'));
console.log('✅ Fixed sub_districts.csv:', subFixed.length, 'rows');

// Fix villages.csv
const vilLines = fs.readFileSync('data/villages.csv', 'utf8').split('\n');
const vilHeader = vilLines[0];
const vilFixed = vilLines.slice(1).filter(l => l.trim()).map(line => {
    const parts = line.split(',');
    if (parts.length >= 3) {
        parts[2] = parts[0].trim() + parts[1].trim() + parts[2].trim();
    }
    return parts.join(',');
});
fs.writeFileSync('data/villages.csv', [vilHeader, ...vilFixed].join('\n'));
console.log('✅ Fixed villages.csv:', vilFixed.length, 'rows');

// Check for remaining duplicates
const codes = subFixed.map(l => l.split(',')[2]);
const dups = codes.filter((c, i) => codes.indexOf(c) !== i);
console.log('Remaining duplicates:', dups.length);