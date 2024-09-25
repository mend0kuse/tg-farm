import sqlite3 from 'sqlite3';
import path from 'path';
import { BaseLogger } from '../logger';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SQLite3Database {
    logger: BaseLogger;
    dbFilePath: string;
    db: sqlite3.Database;

    constructor(dbName: string) {
        this.logger = new BaseLogger(dbName.toUpperCase());
        this.dbFilePath = path.resolve(__dirname, '..', '..', '..', 'db', `${dbName}.db`);
        this.db = new sqlite3.Database(this.dbFilePath, (err) => {
            if (err) {
                this.logger.error('Error connecting to SQLite database:', err);
            } else {
                this.logger.log('Connected to the SQLite database.');
            }
        });
    }

    close() {
        this.db.close((err) => {
            if (err) {
                this.logger.error('Error closing SQLite database:', err);
            } else {
                this.logger.log('SQLite connection closed.');
            }
        });
    }
}
