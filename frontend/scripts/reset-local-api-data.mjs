import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, 'local-api-data.json');

await rm(dataPath, { force: true });
console.log('Local API data reset. Restart npm run api:dev to start with empty buildings and floors.');
