import sqlite from 'better-sqlite3';
import path from 'path';
import { BaseLogger } from '../logger';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export abstract class SQLite3Database {
    logger: BaseLogger;
    db: sqlite.Database;

    constructor(dbName: string) {
        this.logger = new BaseLogger(dbName.toUpperCase());
        this.db = new sqlite(path.resolve(__dirname, '..', '..', '..', 'db', `${dbName}.db`));
    }

    close() {
        this.db.close();
    }

    abstract createAccount(...args: any[]): void;
}
