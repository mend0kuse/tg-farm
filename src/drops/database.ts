import { SQLite3Database } from '../shared/database/sqlite';

export class DropsDatabase extends SQLite3Database {
    constructor() {
        super('drops');
    }

    init() {
        return this.db
            .prepare(
                `
            CREATE TABLE IF NOT EXISTS DropsAccount (
                accountIndex INTEGER PRIMARY KEY,
                tokens INTEGER,
                friends INTEGER,
                refCode TEXT
            )
        `
            )
            .run();
    }

    createAccount(args: { index: number; tokens: number; friends: number; refCode: string }) {
        return this.db
            .prepare('INSERT INTO DropsAccount (accountIndex, tokens, friends, refCode) VALUES (?, ?, ?, ?)')
            .run(Object.values(args));
    }

    findByIndex(index: number) {
        return this.db.prepare('SELECT * FROM DropsAccount WHERE accountIndex = ?').get([index]);
    }

    updateByIndex({
        index,
        tokens,
        friends,
        refCode,
    }: {
        index: number;
        tokens: string;
        friends: number;
        refCode: string;
    }) {
        return this.db
            .prepare(
                `UPDATE DropsAccount 
                 SET tokens = ?, friends = ?, refCode = ?
                 WHERE accountIndex = ?`
            )
            .run([tokens, friends, refCode, index]);
    }

    findAll() {
        return this.db.prepare('SELECT * FROM DropsAccount').all();
    }
}

export const dropsDatabase = new DropsDatabase();
