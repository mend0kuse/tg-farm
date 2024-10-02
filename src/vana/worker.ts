import { APP_CONFIG } from '../config';
import { REFERRAL_MAP } from '../constants';
import { TAccountData } from '../scripts/accounts-generator';
import { baseLogger } from '../shared/logger';
import { telegramApi } from '../shared/telegram/telegram-api';
import { random, sleep } from '../shared/utils';
import { Vana } from './vana';
import { excelUtility } from '../shared/excel/excel';
import { vanaDatabase } from './database';
import { TelegramClient } from '@mtcute/node';

export const runVanaWorker = async (account: TAccountData, telegramClient: TelegramClient) => {
    const accounts = excelUtility.getAccounts();

    let errors = 0;

    vanaDatabase.init();

    const refererIndex = REFERRAL_MAP[account.index];
    let refCode = Number(APP_CONFIG.MASTER_USER_ID);
    let isCreated = false;

    while (errors < 5) {
        while (true) {
            const myAccount = await vanaDatabase.findByIndex(account.index);
            if (myAccount) {
                isCreated = true;
                break;
            }

            if (refererIndex === 1) {
                break;
            }

            const refererAccount: any = await vanaDatabase.findByIndex(refererIndex);
            if (refererAccount) {
                const { id } = accounts.find((acc) => acc.index === refererAccount.accountIndex)!;
                refCode = id;
                break;
            }

            baseLogger.accentLog(
                `[VANA_${account.index}] В базе не найден аккаунт referer ${refererIndex}. Задержка 5 минут...`
            );
            await sleep(60 * 5);
        }

        try {
            await new Vana({
                telegramClient,
                account,
                refCode,
                isCreated,
                database: vanaDatabase,
            }).start();
        } catch (error) {
            errors++;
            baseLogger.error(`[VANA_${account.index}] WORKER ERROR`, error);

            await telegramApi.sendBotNotification(`[VANA]. Воркер ${account.index}. Ошибка #${errors}. ${error}`);
            await sleep(random(120, 180));
        }
    }
};
