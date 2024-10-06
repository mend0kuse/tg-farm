import { TelegramClient } from '@mtcute/node';
import { REFERRAL_MAP_2 } from '../constants';
import { TAccountData } from '../scripts/accounts-generator';
import { baseLogger } from '../shared/logger';
import { telegramApi } from '../shared/telegram/telegram-api';
import { random, sleep } from '../shared/utils';
import { Cats } from './cats';
import { catsDatabase } from './database';

export const runCatsWorker = async (user: TAccountData, telegramClient: TelegramClient) => {
    let errors = 0;

    try {
        catsDatabase.init();
    } catch (error) {
        baseLogger.error(error);
    }

    const refererIndex = REFERRAL_MAP_2[user.index];
    let refCode = 'SfBw9snEPstwWptCAwjrV';
    let isCreated = false;

    while (errors < 5) {
        while (true) {
            const myAccount = await catsDatabase.findByIndex(user.index);
            if (myAccount) {
                isCreated = true;
                break;
            }

            if (refererIndex === 1) {
                break;
            }

            const refererAccount: any = await catsDatabase.findByIndex(refererIndex);
            if (refererAccount) {
                refCode = refererAccount.refCode ?? '';
                if (refCode) {
                    break;
                }
            }

            baseLogger.accentLog(
                `[CATS_${user.index}] В базе не найден аккаунт referer ${refererIndex}. Задержка 5 минут...`
            );
            await sleep(60 * 5);
        }

        try {
            const cats = new Cats({
                telegramClient,
                account: user,
                refCode,
                isCreated,
                database: catsDatabase,
            });

            baseLogger.log(`[CATS_${user.index}] Старт воркера`);

            await cats.start();
            const delay = 60 * 60 * random(6, 8);
            baseLogger.log(`[CATS_${user.index}] Применена задержка до следующего круга. Часов `, delay / 60 / 60);
            await sleep(delay);
        } catch (error) {
            errors++;
            baseLogger.error(`[CATS_${user.index}] WORKER ERROR`, error);

            await telegramApi.sendBotNotification(`[CATS]. Воркер ${user.index}. Ошибка #${errors}. ${error}`);
            await sleep(random(120, 180));
        }
    }
};
