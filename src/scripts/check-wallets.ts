import { fromNano } from '@ton/core';
import { excelUtility } from '../shared/excel/excel';
import { baseLogger } from '../shared/logger';
import { tonUtility } from '../shared/ton/ton-utility';

const [, , index] = process.argv;

(async () => {
    let all = 0;

    const accounts = excelUtility.getAccounts();

    for (const acc of index ? [accounts.find((acc) => acc.index === Number(index))] : accounts) {
        if (!acc) {
            continue;
        }

        const balance = await tonUtility.getBalanceByMnemonic(acc.mnemonicTon.split(' '));
        baseLogger.log(`[${acc.index}] = `, fromNano(balance));
        all += Number(fromNano(balance));
    }

    if (!index) {
        baseLogger.accentLog(`Всего = ${all} TON`);
    }
})();
