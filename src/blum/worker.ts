import { TelegramClient } from '@mtcute/node';
import { TAccountData } from '../scripts/accounts-generator';
import { baseLogger } from '../shared/logger';
import { telegramApi } from '../shared/telegram/telegram-api';
import { random, sleep } from '../shared/utils';
import { Blum } from './blum';
import { blumDatabase } from './database';
import { REFERRAL_MAP_BLUM } from './ref';

export const runBlumWorker = async (user: TAccountData, telegramClient: TelegramClient) => {
    let errors = 0;

    blumDatabase.init();

    const refererIndex = REFERRAL_MAP_BLUM[user.index];
    let refCode = '7fFDqxfhZh';
    let isCreated = false;

    while (errors < 5) {
        while (true) {
            const myAccount = await blumDatabase.findByIndex(user.index);
            if (myAccount) {
                isCreated = true;
                break;
            }

            if (refererIndex === 1) {
                break;
            }

            const refererAccount: any = await blumDatabase.findByIndex(refererIndex);
            if (refererAccount) {
                refCode = refererAccount.refCode ?? '';
                if (refCode) {
                    break;
                }
            }

            baseLogger.accentLog(
                `[BLUM_${user.index}] В базе не найден аккаунт referer ${refererIndex}. Задержка 5 минут...`
            );

            await sleep(60 * 5);
        }

        try {
            await new Blum({
                telegramClient,
                account: user,
                refCode,
                isCreated,
                database: blumDatabase,
            }).start();
        } catch (error) {
            errors++;
            baseLogger.error(`[BLUM_${user.index}] WORKER ERROR`, error);

            await telegramApi.sendBotNotification(`[BLUM]. Воркер ${user.index}. Ошибка #${errors}. ${error}`);
            await sleep(random(120, 180));
        }
    }
};
