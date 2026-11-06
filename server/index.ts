import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openDb } from './db.ts';
import { createApp } from './app.ts';

const dbPath = process.env.DB_PATH ?? './data/unit-manager.sqlite';
const port = Number(process.env.PORT ?? 3001);

mkdirSync(dirname(dbPath), { recursive: true });
const db = openDb(dbPath);
// Só escuta em localhost: os dados (rates, budget) nunca ficam expostos à rede.
createApp(db).listen(port, '127.0.0.1', () => {
  console.log(`API local em http://127.0.0.1:${port} (base de dados: ${dbPath})`);
});
