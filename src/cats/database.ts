import { SQLite3Database } from '../shared/database/sqlite';

export class CatsDatabase extends SQLite3Database {
    constructor() {
        super('cats');
    }

    init() {
        return this.db
            .prepare(
                `
            CREATE TABLE IF NOT EXISTS CatsAccount (
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
            .prepare('INSERT INTO CatsAccount (accountIndex, tokens, refCode) VALUES (?, ?, ?)')
            .run(Object.values(args));
    }

    findByIndex(index: number) {
        return this.db.prepare('SELECT * FROM CatsAccount WHERE accountIndex = ?').get([index]);
    }

    updateTokensByIndex(index: number, tokens: number) {
        return this.db.prepare('UPDATE CatsAccount SET tokens = ? WHERE accountIndex = ?').run([tokens, index]);
    }

    findAll() {
        return this.db.prepare('SELECT * FROM CatsAccount').all();
    }
}

export const catsDatabase = new CatsDatabase();
