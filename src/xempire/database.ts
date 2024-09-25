import { SQLite3Database } from '../shared/database/sqlite';

export class XEmpireDatabase extends SQLite3Database {
    constructor() {
        super('xempire');
    }

    init() {
        this.db.run(
            `
            CREATE TABLE IF NOT EXISTS EmpireAccount (
                index INTEGER PRIMARY KEY,
                refCode TEXT,
                level INTEGER
            )
        `,
            (err) => {
                if (err) {
                    this.logger.error('Error creating table:', err);
                }
            }
        );
    }

    createAccount(args: { index: number; refCode: string; level: number }) {
        const { index, refCode, level } = args;
        this.db.run(
            'INSERT INTO EmpireAccount (index, refCode, level) VALUES (?, ?, ?)',
            [index, refCode, level],
            (err) => {
                if (err) {
                    this.logger.error('Error creating account:', err);
                }
            }
        );
    }

    findByIndex(index: number): Promise<any> {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM EmpireAccount WHERE index = ?', [index], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    updateLevelByIndex(index: number, level: number) {
        this.db.run('UPDATE EmpireAccount SET level = ? WHERE index = ?', [level, index], (err) => {
            if (err) {
                this.logger.error('Error updating level:', err);
            }
        });
    }

    findAll(): Promise<any[]> {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM EmpireAccount', (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }
}

export const xEmpireDatabase = new XEmpireDatabase();
