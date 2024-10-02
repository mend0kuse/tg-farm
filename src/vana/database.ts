import { SQLite3Database } from '../shared/database/sqlite';

export class VanaDatabase extends SQLite3Database {
    constructor() {
        super('vana');
    }

    init() {
        return this.db
            .prepare(
                `
            CREATE TABLE IF NOT EXISTS VanaAccount (
                accountIndex INTEGER PRIMARY KEY,
                tokens INTEGER,
                friends INTEGER,
            )
        `
            )
            .run();
    }

    createAccount(args: { index: number; tokens: number; friends: number }) {
        return this.db
            .prepare('INSERT INTO VanaAccount (accountIndex, tokens, friends) VALUES (?, ?, ?)')
            .run(Object.values(args));
    }

    findByIndex(index: number) {
        return this.db.prepare('SELECT * FROM VanaAccount WHERE accountIndex = ?').get([index]);
    }

    updateByIndex({ index, tokens, friends }: { index: number; tokens: string; friends: number }) {
        return this.db
            .prepare(
                `UPDATE VanaAccount 
                 SET tokens = ?, friends = ?
                 WHERE accountIndex = ?`
            )
            .run([tokens, friends, index]);
    }

    findAll() {
        return this.db.prepare('SELECT * FROM VanaAccount').all();
    }
}

export const vanaDatabase = new VanaDatabase();
