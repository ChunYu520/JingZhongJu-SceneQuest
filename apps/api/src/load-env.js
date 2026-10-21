import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');
const configPath = process.env.CONFIG_ENV_FILE || path.join(appRoot, '.env');
dotenv.config({ path: configPath, override: true });
