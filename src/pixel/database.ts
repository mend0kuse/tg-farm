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
                league TEXT,
                friends INTEGER
            )
        `
            )
            .run();
    }

    createAccount({ friends, index, league }: { index: number; league: string; friends: number }) {
        return this.db
            .prepare('INSERT INTO PixelAccount (accountIndex, league, friends) VALUES (?, ?, ?)')
            .run(Object.values([index, league, friends]));
    }

    findByIndex(index: number) {
        return this.db.prepare('SELECT * FROM PixelAccount WHERE accountIndex = ?').get([index]);
    }

    updateByIndex({ index, league, friends }: { index: number; league: string; friends: number }) {
        return this.db
            .prepare(
                `UPDATE PixelAccount 
                 SET league = ?, friends = ?
                 WHERE accountIndex = ?`
            )
            .run([league, friends, index]);
    }

    findAll() {
        return this.db.prepare('SELECT * FROM PixelAccount').all();
    }
}

export const pixelDatabase = new PixelDatabase();
