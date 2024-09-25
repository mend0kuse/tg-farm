import { SQLite3Database } from '../shared/database/sqlite';

export class XrumDatabase extends SQLite3Database {
    constructor() {
        super('xrum');
    }

    init() {
        this.db.run(
            `
            CREATE TABLE IF NOT EXISTS XrumAccount (
                index INTEGER PRIMARY KEY,
                tgId INTEGER,
                tokens INTEGER
            )
        `,
            (err) => {
                if (err) {
                    this.logger.error('Error creating table:', err);
                }
            }
        );
    }

    createAccount(args: { index: number; tgId: number; tokens: number }) {
        const { index, tgId, tokens } = args;
        this.db.run('INSERT INTO XrumAccount (index, tgId, tokens) VALUES (?, ?, ?)', [index, tgId, tokens], (err) => {
            if (err) {
                this.logger.error('Error creating account:', err);
            }
        });
    }

    findByIndex(index: number): Promise<any> {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM XrumAccount WHERE index = ?', [index], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    updateTokensByIndex(index: number, tokens: number) {
        this.db.run('UPDATE XrumAccount SET tokens = ? WHERE index = ?', [tokens, index], (err) => {
            if (err) {
                this.logger.error('Error updating tokens:', err);
            }
        });
    }

    findAll(): Promise<any[]> {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM XrumAccount', (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }
}

export const xrumDatabase = new XrumDatabase();
