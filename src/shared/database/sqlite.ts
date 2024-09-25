import sqlite from 'better-sqlite3';
import path from 'path';
import { BaseLogger } from '../logger';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SQLite3Database {
    logger: BaseLogger;
    dbFilePath: string;
    db: sqlite.Database;

    constructor(dbName: string) {
        this.logger = new BaseLogger(dbName.toUpperCase());
        this.dbFilePath = path.resolve(__dirname, '..', '..', '..', 'db', `${dbName}.db`);
        this.db = new sqlite(this.dbFilePath);
    }

    close() {
        this.db.close();
    }
}
