import { SQLite3Database } from '../shared/database/sqlite';

export class CatsDatabase extends SQLite3Database {
    constructor() {
        super('cats');
    }

    init() {
        this.db.run(
            `
            CREATE TABLE IF NOT EXISTS CatsAccount (
                index INTEGER PRIMARY KEY,
                tokens INTEGER,
                refCode TEXT
            )
        `,
            (err) => {
                if (err) {
                    this.logger.error('Error creating table:', err);
                }
            }
        );
    }

    createAccount(args: { index: number; refCode: string; tokens: number }) {
        const { index, refCode, tokens } = args;

        this.db.run(
            'INSERT INTO CatsAccount (index, refCode, tokens) VALUES (?, ?, ?)',
            [index, refCode, tokens],
            (err) => {
                if (err) {
                    this.logger.error('Error creating account:', err);
                }
            }
        );
    }

    findByIndex(index: number): Promise<any> {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM CatsAccount WHERE index = ?', [index], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    updateTokensByIndex(index: number, tokens: number) {
        this.db.run('UPDATE CatsAccount SET tokens = ? WHERE index = ?', [tokens, index], (err) => {
            if (err) {
                this.logger.error('Error updating tokens:', err);
            }
        });
    }

    findAll(): Promise<any[]> {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM CatsAccount', (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }
}

export const catsDatabase = new CatsDatabase();
