import { TAccountData } from '../scripts/accounts-generator';
import { baseLogger } from '../shared/logger';
import { telegramApi } from '../shared/telegram/telegram-api';
import { parseSocks5Proxy, random, sleep } from '../shared/utils';
import { Cats } from './cats';
import { catsDatabase } from './database';

export const runCatsWorker = async (user: TAccountData) => {
    let errors = 0;

    // const refererIndex = REFERRAL_MAP[user.index];
    const refCode = 'SfBw9snEPstwWptCAwjrV';
    let isCreated = false;

    const myAccount = await catsDatabase.findByIndex(user.index);
    if (myAccount) {
        isCreated = true;
    }

    while (errors < 5) {
        // while (true) {
        //     const myAccount = await catsDatabase.findByIndex(user.index);
        //     if (myAccount) {
        //         isCreated = true;
        //         break;
        //     }

        //     const refererAccount = await catsDatabase.findByIndex(refererIndex);
        //     if (refererAccount) {
        //         refCode = refererAccount.refCode ?? '';
        //         if (refCode) {
        //             break;
        //         }
        //     }

        //     baseLogger.accentLog(
        //         `[CATS_${user.index}] В базе не найден аккаунт referer ${refererIndex}. Задержка 5 минут...`
        //     );
        //     await sleep(60 * 5);
        // }

        const { telegramClient } = await telegramApi.createClientBySession({
            session: user.session,
            proxy: parseSocks5Proxy(user.proxy),
            sessionName: user.index.toString(),
        });

        try {
            const cats = new Cats({
                telegramClient,
                account: user,
                refCode,
                isCreated,
            });

            baseLogger.log(`[CATS_${user.index}] Старт воркера`);

            await cats.start();
            const delay = 60 * 60 * random(24, 26);
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
