import { TAccountData } from '../scripts/accounts-generator';
import { baseLogger } from '../shared/logger';
import { telegramApi } from '../shared/telegram/telegram-api';
import { random, sleep } from '../shared/utils';
import { Drops } from './drops';
import { dropsDatabase } from './database';
import { TelegramClient } from '@mtcute/node';
import { REFERRAL_MAP_DROPS } from './ref';

export const runDropsWorker = async (account: TAccountData, telegramClient: TelegramClient) => {
    let errors = 0;

    dropsDatabase.init();

    const refererIndex = REFERRAL_MAP_DROPS[account.index];
    let refCode = '6LWP4';
    let isCreated = false;

    while (errors < 5) {
        while (true) {
            const myAccount = await dropsDatabase.findByIndex(account.index);
            if (myAccount) {
                isCreated = true;
                break;
            }

            if (refererIndex === 1) {
                break;
            }

            const refererAccount: any = await dropsDatabase.findByIndex(refererIndex);
            if (refererAccount.refCode) {
                refCode = refererAccount.refCode;
                break;
            }

            baseLogger.accentLog(
                `[DROPS_${account.index}] В базе не найден код referer ${refererIndex}. Задержка 5 минут...`
            );

            await sleep(60 * 5);
        }

        try {
            await new Drops({
                telegramClient,
                account,
                refCode,
                isCreated,
                database: dropsDatabase,
            }).start();
        } catch (error) {
            errors++;
            baseLogger.error(`[DROPS_${account.index}] WORKER ERROR`, error);

            await telegramApi.sendBotNotification(`[DROPS]. Воркер ${account.index}. Ошибка #${errors}. ${error}`);
            await sleep(random(120, 180));
        }
    }
};
