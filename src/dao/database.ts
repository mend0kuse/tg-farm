import { SQLite3Database } from '../shared/database/sqlite';

export class DaoDatabase extends SQLite3Database {
    constructor() {
        super('dao');
    }

    init() {
        return this.db
            .prepare(
                `
            CREATE TABLE IF NOT EXISTS DaoAccount (
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
            .prepare('INSERT INTO DaoAccount (accountIndex, tokens, friends, refCode) VALUES (?, ?, ?, ?)')
            .run(Object.values(args));
    }

    findByIndex(index: number) {
        return this.db.prepare('SELECT * FROM DaoAccount WHERE accountIndex = ?').get([index]);
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
                `UPDATE DaoAccount 
                 SET tokens = ?, friends = ?, refCode = ? 
                 WHERE accountIndex = ?`
            )
            .run([tokens, friends, refCode, index]);
    }

    findAll() {
        return this.db.prepare('SELECT * FROM DaoAccount').all();
    }
}

export const daoDatabase = new DaoDatabase();
