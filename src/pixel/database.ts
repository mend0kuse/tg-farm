import { SQLite3Database } from '../shared/database/sqlite';

export class PixelDatabase extends SQLite3Database {
    constructor() {
        super('pixel');
    }

    init() {
        return this.db
            .prepare(
                `
            CREATE TABLE IF NOT EXISTS PixelAccount (
                accountIndex INTEGER PRIMARY KEY,
                tokens INTEGER,
                friends INTEGER
            )
        `
            )
            .run();
    }

    createAccount({ friends, index, tokens }: { index: number; tokens: number; friends: number }) {
        return this.db
            .prepare('INSERT INTO PixelAccount (accountIndex, tokens, friends) VALUES (?, ?, ?, ?)')
            .run(Object.values([index, tokens, friends]));
    }

    findByIndex(index: number) {
        return this.db.prepare('SELECT * FROM PixelAccount WHERE accountIndex = ?').get([index]);
    }

    updateByIndex({ index, tokens, friends }: { index: number; tokens: number; friends: number }) {
        return this.db
            .prepare(
                `UPDATE PixelAccount 
                 SET tokens = ?, friends = ?
                 WHERE accountIndex = ?`
            )
            .run([tokens, friends, index]);
    }

    findAll() {
        return this.db.prepare('SELECT * FROM PixelAccount').all();
    }
}

export const pixelDatabase = new PixelDatabase();
