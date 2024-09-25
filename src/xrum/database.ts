import { SQLite3Database } from '../shared/database/sqlite';

export class XrumDatabase extends SQLite3Database {
    constructor() {
        super('xrum');
    }

    init() {
        return this.db
            .prepare(
                `
            CREATE TABLE IF NOT EXISTS XrumAccount (
                accountIndex INTEGER PRIMARY KEY,
                tgId INTEGER,
                tokens INTEGER
            )
        `
            )
            .run();
    }

    createAccount(args: { index: number; tgId: number; tokens: number }) {
        return this.db
            .prepare('INSERT INTO XrumAccount (accountIndex, tgId, tokens) VALUES (?, ?, ?)')
            .run(Object.values(args));
    }

    findByIndex(index: number) {
        return this.db.prepare('SELECT * FROM XrumAccount WHERE accountIndex = ?').get(index);
    }

    updateTokensByIndex(index: number, tokens: number) {
        this.db.prepare('UPDATE XrumAccount SET tokens = ? WHERE accountIndex = ?').run([tokens, index]);
    }

    findAll() {
        return this.db.prepare('SELECT * FROM XrumAccount').all();
    }
}

export const xrumDatabase = new XrumDatabase();
