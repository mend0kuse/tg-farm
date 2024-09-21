import fs from 'fs';
import xlsx from 'xlsx';
import { TAccountData } from '../../accounts-generator';

export class ExcelUtility {
    getAccounts(filePath: string): TAccountData[] {
        if (!fs.existsSync(filePath)) {
            throw new Error(`Файл не найден по пути: ${filePath}`);
        }

        const workbook = xlsx.readFile(filePath);

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 }) as Array<Array<string | number>>;

        const headers = jsonData[0] as string[];
        if (!headers) {
            throw new Error('Неправильный формат файла Excel. Проверьте заголовки.');
        }

        const rows = jsonData.slice(1);

        const users: TAccountData[] = rows.map((row) => {
            return {
                index: row[0] as number,
                id: row[1] as number,
                phone: row[2] as string,
                username: row[3] as string,
                session: row[4] as string,
                mnemonicTon: row[5] as string,
                addressTon: row[6] as string,
                proxy: row[7] as string,
                userAgent: row[8] as string,
            };
        });

        return users;
    }
}

export const excelUtility = new ExcelUtility();
