import { SQLite3Database } from '../shared/database/sqlite';

export class BitcoinTapDatabase extends SQLite3Database {
    constructor() {
        super('bitcoin-tap');
    }

    init() {
        return this.db
            .prepare(
                `
            CREATE TABLE IF NOT EXISTS BitcoinTapAccount (
                accountIndex INTEGER PRIMARY KEY,
                tokens INTEGER,
                friends INTEGER
            )
        `
            )
            .run();
    }

    createAccount(args: { index: number; tokens: number; friends: number }) {
        return this.db
            .prepare('INSERT INTO BitcoinTapAccount (accountIndex, tokens, friends) VALUES (?, ?, ?)')
            .run(Object.values(args));
    }

    findByIndex(index: number) {
        return this.db.prepare('SELECT * FROM BitcoinTapAccount WHERE accountIndex = ?').get([index]);
    }

    updateByIndex({ index, tokens, friends }: { index: number; tokens: string; friends: number }) {
        return this.db
            .prepare(
                `UPDATE BitcoinTapAccount 
                 SET tokens = ?, friends = ?
                 WHERE accountIndex = ?`
            )
            .run([tokens, friends, index]);
    }

    findAll() {
        return this.db.prepare('SELECT * FROM BitcoinTapAccount').all();
    }
}

export const bitcoinTap = new BitcoinTapDatabase();
