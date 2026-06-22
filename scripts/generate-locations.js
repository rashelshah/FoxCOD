import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Country, State } from 'country-state-city';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DATA_DIR = path.join(__dirname, '..', 'public', 'data');
const STATES_DIR = path.join(PUBLIC_DATA_DIR, 'states');

// Ensure directories exist
if (!fs.existsSync(PUBLIC_DATA_DIR)) {
  fs.mkdirSync(PUBLIC_DATA_DIR, { recursive: true });
}
if (!fs.existsSync(STATES_DIR)) {
  fs.mkdirSync(STATES_DIR, { recursive: true });
}

// Generate countries.json
const countries = Country.getAllCountries().map(c => ({
  code: c.isoCode,
  name: c.name
}));

fs.writeFileSync(
  path.join(PUBLIC_DATA_DIR, 'countries.json'),
  JSON.stringify(countries)
);
console.log(`Generated countries.json (${countries.length} countries)`);

// Generate states/[ISO].json
let stateFilesGenerated = 0;
let totalStates = 0;

for (const country of countries) {
  const states = State.getStatesOfCountry(country.code).map(s => ({
    code: s.isoCode,
    name: s.name
  }));

  if (states.length > 0) {
    fs.writeFileSync(
      path.join(STATES_DIR, `${country.code}.json`),
      JSON.stringify(states)
    );
    stateFilesGenerated++;
    totalStates += states.length;
  }
}

console.log(`Generated ${stateFilesGenerated} state JSON files (total ${totalStates} states)`);
