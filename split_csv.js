const fs = require('fs');
const readline = require('readline');

const input = './data/villages.csv';
const states = new Map();
const districts = new Map();
const subdistricts = new Map();
const villages = [];

async function split() {
  const rl = readline.createInterface({ input: fs.createReadStream(input) });
  let first = true;
  for await (const line of rl) {
    if (first) { first = false; continue; }
    const [sc, sn, dc, dn, sdc, sdn, lgd, vn] = line.split(',');
    states.set(sc, sn);
    districts.set(`${sc}-${dc}`, [sc, dc, dn]);
    subdistricts.set(`${sc}-${dc}-${sdc}`, [sc, dc, sdc, sdn]);
    villages.push([sc, dc, sdc, lgd, vn]);
  }

  fs.writeFileSync('./data/states.csv', 'state_code,state_name\n' +
    [...states.entries()].map(([c,n]) => `${c},${n}`).join('\n'));

  fs.writeFileSync('./data/districts.csv', 'state_code,district_code,district_name\n' +
    [...districts.values()].map(r => r.join(',')).join('\n'));

  fs.writeFileSync('./data/sub_districts.csv', 'state_code,district_code,subdistrict_code,subdistrict_name\n' +
    [...subdistricts.values()].map(r => r.join(',')).join('\n'));

  fs.writeFileSync('./data/villages.csv', 'state_code,district_code,subdistrict_code,lgd_code,village_name\n' +
    villages.map(r => r.join(',')).join('\n'));

  console.log('✅ Done!');
  console.log('States:', states.size);
  console.log('Districts:', districts.size);
  console.log('Sub-districts:', subdistricts.size);
  console.log('Villages:', villages.length);
}

split().catch(console.error);