import { SQLite3Database } from '../shared/database/sqlite';

export class BlumDatabase extends SQLite3Database {
    constructor() {
        super('blum');
    }

    init() {
        return this.db
            .prepare(
                `
            CREATE TABLE IF NOT EXISTS BlumAccount (
                accountIndex INTEGER PRIMARY KEY,
                tokens INTEGER,
                refCode TEXT
            )
        `
            )
            .run();
    }

    createAccount(args: { index: number; tokens: number; refCode: string }) {
        return this.db
            .prepare('INSERT INTO BlumAccount (accountIndex, tokens, refCode) VALUES (?, ?, ?)')
            .run(Object.values(args));
    }

    findByIndex(index: number) {
        return this.db.prepare('SELECT * FROM BlumAccount WHERE accountIndex = ?').get([index]);
    }

    updateByIndex({ index, tokens, refCode }: { index: number; tokens: string; refCode: string }) {
        return this.db
            .prepare(
                `UPDATE BlumAccount 
                 SET tokens = ?, refCode = ?
                 WHERE accountIndex = ?`
            )
            .run([tokens, refCode, index]);
    }
    findAll() {
        return this.db.prepare('SELECT * FROM BlumAccount').all();
    }
}

export const blumDatabase = new BlumDatabase();
