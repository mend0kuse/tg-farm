import { SQLite3Database } from '../shared/database/sqlite';

export class XEmpireDatabase extends SQLite3Database {
    constructor() {
        super('xempire');
    }

    init() {
        return this.db
            .prepare(
                `
            CREATE TABLE IF NOT EXISTS EmpireAccount (
                accountIndex INTEGER PRIMARY KEY,
                refCode TEXT,
                level INTEGER
            )
        `
            )
            .run();
    }

    createAccount(args: { index: number; refCode: string; level: number }) {
        const { index, refCode, level } = args;
        return this.db
            .prepare('INSERT INTO EmpireAccount (accountIndex, refCode, level) VALUES (?, ?, ?)')
            .run([index, refCode, level]);
    }

    findByIndex(index: number) {
        return this.db.prepare('SELECT * FROM EmpireAccount WHERE accountIndex = ?').get([index]);
    }

    updateLevelByIndex(index: number, level: number) {
        return this.db.prepare('UPDATE EmpireAccount SET level = ? WHERE accountIndex = ?').run([level, index]);
    }

    findAll() {
        return this.db.prepare('SELECT * FROM EmpireAccount').all();
    }
}

export const xEmpireDatabase = new XEmpireDatabase();
