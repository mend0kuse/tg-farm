import { APP_CONFIG } from '../config';
import { TAccountData } from '../scripts/accounts-generator';
import { baseLogger } from '../shared/logger';
import { telegramApi } from '../shared/telegram/telegram-api';
import { random, sleep } from '../shared/utils';
import { BitcoinTap } from './bitcoin-tap';
import { excelUtility } from '../shared/excel/excel';
import { bitcoinTap } from './database';
import { TelegramClient } from '@mtcute/node';
import { REFERRAL_MAP_BITCOIN_TAP } from './ref';

export const runBitcoinTapWorker = async (account: TAccountData, telegramClient: TelegramClient) => {
    let errors = 0;

    bitcoinTap.init();

    const refererIndex = REFERRAL_MAP_BITCOIN_TAP[account.index];
    let refCode = Number(APP_CONFIG.MASTER_USER_ID);
    let isCreated = false;

    while (errors < 5) {
        while (true) {
            const myAccount = await bitcoinTap.findByIndex(account.index);
            if (myAccount) {
                isCreated = true;
                break;
            }

            if (refererIndex === 1) {
                break;
            }

            const refererAccount: any = await bitcoinTap.findByIndex(refererIndex);
            if (refererAccount) {
                const { id } = excelUtility.getAccountByIndex(refererAccount.accountIndex);
                refCode = id;
                break;
            }

            baseLogger.accentLog(
                `[BITCOIN-TAP_${account.index}] В базе не найден аккаунт referer ${refererIndex}. Задержка 5 минут...`
            );
            await sleep(60 * 5);
        }

        try {
            await new BitcoinTap({
                telegramClient,
                account,
                refCode,
                isCreated,
                database: bitcoinTap,
            }).start();
        } catch (error) {
            errors++;
            baseLogger.error(`[BITCOIN-TAP_${account.index}] WORKER ERROR`, error);

            await telegramApi.sendBotNotification(
                `[BITCOIN-TAP]. Воркер ${account.index}. Ошибка #${errors}. ${error}`
            );
            await sleep(random(120, 180));
        }
    }
};
