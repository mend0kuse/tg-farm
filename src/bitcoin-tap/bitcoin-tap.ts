import { Long, TelegramClient, tl } from '@mtcute/node';
import { TAccountData } from '../scripts/accounts-generator';
import { BaseLogger } from '../shared/logger';
import axios, { AxiosInstance, isAxiosError } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { toInputUser } from '@mtcute/node/utils.js';
import { random, sleep, shuffleArray } from '../shared/utils';
import { telegramApi } from '../shared/telegram/telegram-api';
import { BitcoinTapDatabase } from './database';

export class BitcoinTap {
    private account: TAccountData;
    private database: BitcoinTapDatabase;
    private profile: any;
    private refCode: number;
    private telegramClient: TelegramClient;
    private logger: BaseLogger;
    private api: AxiosInstance;
    private isCreated: boolean = false;
    private friends = 0;
    private farmInfo: any;
    private walletInfo: any;
    private dailyInfo: any[];
    private tasks: any[];
    private tasksEvents: any[];

    constructor({
        account,
        refCode,
        isCreated,
        telegramClient,
        database,
    }: {
        account: TAccountData;
        refCode: number;
        telegramClient: TelegramClient;
        isCreated: boolean;
        database: BitcoinTapDatabase;
    }) {
        this.isCreated = isCreated;
        this.database = database;
        this.account = account;
        this.refCode = refCode;
        this.telegramClient = telegramClient;
        this.logger = new BaseLogger(`BITCOIN_TAP_${account.index}`);

        this.createApi();
    }

    async start() {
        let cycle = 1;

        this.api
            .get('https://ifconfig.me/ip', {
                baseURL: '',
            })
            .then((response) => this.logger.log('IP =', response.data))
            .catch((error) => this.logger.error('Ошибка получения IP', this.handleError(error)));

        mainLoop: while (true) {
            const delayInMinutes = cycle === 1 ? random(1, 120) : random(2, 3) * 60;
            this.logger.log(`Задержка ${delayInMinutes} минут перед стартом прохода...`);

            await sleep(delayInMinutes * 60);

            let loginAttempts = 0;
            loginLoop: while (true) {
                try {
                    await this.login();
                    break loginLoop;
                } catch (error) {
                    if (tl.RpcError.is(error, 'FLOOD_WAIT_%d')) {
                        this.logger.error('FLOOD WAIT', error.seconds * 2);
                        await sleep(error.seconds * 2);
                        throw new Error('FLOOD');
                    }

                    if (loginAttempts > 5) {
                        throw new Error('5 Неудачных логинов');
                    }

                    this.logger.error('Неудачный логин, задержка...', this.handleError(error));
                    await sleep(random(100, 150));
                    loginAttempts++;

                    continue loginLoop;
                }
            }

            if (!this.profile?.id) {
                this.logger.error('Профиль не найден');
                continue mainLoop;
            }

            if (!this.isCreated) {
                try {
                    this.database.createAccount({
                        index: this.account.index,
                        tokens: this.profile.points_balance,
                        friends: this.friends,
                    });
                    this.isCreated = true;
                    this.logger.error('Успешно добавлен в базу');
                } catch (error) {
                    this.logger.error('Ошибка добавления в базу', error);
                }
            }

            await this.getData();

            await sleep(random(5, 10));

            const actions = [
                this.completeTasks,
                this.claimFriends,
                this.completeRoulette,
                this.connectBitcoinWallet,
                this.claimFarm,
                this.completeDaily,
                this.completeLottery,
            ];

            shuffleArray(actions);

            for (const promise of actions) {
                try {
                    await sleep(random(5, 10));
                    await promise.call(this);
                    await sleep(random(1, 4));
                    await this.getFarm();
                } catch (error) {
                    this.logger.error('Ошибка выполнения промиса:', this.handleError(error));
                }
            }

            try {
                this.database.updateByIndex({
                    index: this.account.index,
                    tokens: this.profile.points_balance,
                    friends: this.friends,
                });
            } catch (error) {
                this.logger.error('Ошибка обновления базы:', error);
            }

            cycle++;
        }
    }

    async getDaily() {
        try {
            this.dailyInfo = (await this.api.get(`/daily/?user_id=${this.profile.id}`)).data;
            this.logger.log('Daily получен');
        } catch (error) {
            this.logger.error('Ошибка получения daily', this.handleError(error));
        }
    }

    async completeDaily() {
        if (!this.dailyInfo) {
            return;
        }

        const day = this.dailyInfo.find((info: any) => info.state === 'available');
        if (!day) {
            this.logger.log('Daily уже собран');
            return;
        }

        try {
            await this.api.post(`/daily/event/create/`, {
                user_id: this.profile.id,
                daily_check_id: day.id,
            });

            this.logger.log('Собрал daily');
        } catch (error) {
            this.logger.error('Ошибка выполнения daily', this.handleError(error));
        }
    }

    async completeLottery() {
        try {
            const lottery = (await this.api.get('/lottery/')).data;
            await this.api.get(`/lottery/purchase/stats/?user_id=${this.profile.id}`);

            const runeStone = lottery.find((lt: any) => lt.id === 3);
            if (!runeStone?.is_active || this.profile.points_balance < runeStone.price) {
                return;
            }

            await this.api.post(`/lottery/purchase/create/`, {
                user_id: this.profile.id,
                lottery_id: runeStone.id,
            });

            this.logger.log('Совершил лотерею');
            await this.api.get(`/lottery/purchase/stats/?user_id=${this.profile.id}`);
        } catch (error) {
            this.logger.error('Ошибка выполнения лотереи', this.handleError(error));
        }
    }

    async completeRoulette() {
        try {
            while (this.profile.points_balance > 5000) {
                await this.api.post(`/roulette/event/create/`, {
                    user_id: this.profile.id,
                });

                this.logger.log('Прокрутили рулетку');
                this.profile.points_balance -= 1000;
            }
        } catch (error) {
            this.logger.error('Ошибка выполнения прокрутки', this.handleError(error));
        }
    }

    async getData() {
        await Promise.allSettled([
            this.getWallet(),
            this.getRoulette(),
            this.getRouletteStats(),
            this.getTasks(),
            this.getFarm(),
            this.getDaily(),
        ]);
    }

    async getWallet() {
        try {
            this.walletInfo = (await this.api.get(`/wallet/?owner_id=${this.profile.id}`)).data;
            this.logger.log('Успешно получен кошелек');
        } catch (error) {
            this.logger.error('Ошибка получения кошелька', this.handleError(error));
        }
    }

    async getRoulette() {
        try {
            await this.api.get(`/roulette/`);
            this.logger.log('Успешно получена рулетка');
        } catch (error) {
            this.logger.error('Ошибка получения рулетки', this.handleError(error));
        }
    }

    async getRouletteStats() {
        try {
            await this.api.get(`/roulette/event/stats/?user_id=${this.profile.id}`);
            this.logger.log('Успешно получена статистика рулетки');
        } catch (error) {
            this.logger.error('Ошибка получения статистики рулетки', this.handleError(error));
        }
    }

    async getTasks() {
        try {
            this.tasks = (await this.api.get(`/task/`)).data;
            this.logger.log('Успешно получены задания');
            await this.getTaskEvent(this.tasks);
        } catch (error) {
            this.logger.error('Ошибка получения списка заданий', this.handleError(error));
        }
    }

    async getTaskEvent(tasks: any[]) {
        const resources = tasks.map((task) => ({
            task_id: task.id,
            chat_id: this.account.id,
            resource_id: task.resource_id,
        }));

        try {
            this.tasksEvents = (
                await this.api.get(`/task/event/?user_id=${this.profile.id}&resources=${JSON.stringify(resources)}`)
            ).data;

            this.logger.log('Успешно получены события заданий');
        } catch (error) {
            this.logger.error('Ошибка получения события для заданий', this.handleError(error));
        }
    }

    async getFarm() {
        try {
            this.farmInfo = (await this.api.get(`/click/last/?user_id=${this.profile.id}`)).data;
            this.logger.log('Успешно получен статус фарма');
        } catch (error) {
            this.logger.error('Ошибка получения фарма', this.handleError(error));
        }
    }

    async claimFarm() {
        if (!this.farmInfo) {
            return;
        }

        if (this.farmInfo.timer !== 0) {
            this.logger.log('Рано клеймить фарм');
            return;
        }

        try {
            this.farmInfo = (
                await this.api.post(`/click/create/`, {
                    user_id: this.profile.id,
                })
            ).data;
            this.logger.log('Успешно заклеймлен фарм');
        } catch (error) {
            this.logger.error('Ошибка клейма фарма', this.handleError(error));
        }
    }

    async claimFriends() {
        try {
            const { claim_balance } = (await this.api.get(`/invited/balance/?owner_id=${this.profile.id}`)).data;
            this.friends = (await this.api.get(`/invited/?owner_id=${this.profile.id}&page=1&size=10`)).data.total;

            if (claim_balance === 0) {
                this.logger.log('Нет рефов для клейма');
                return;
            }

            await this.api.patch(`/invited/balance/update/?owner_id=${this.profile.id}`);
            this.logger.log('Рефы успешно заклеймлены');
        } catch (error) {
            this.logger.error('Ошибка получения баланса рефов', this.handleError(error));
        }
    }

    async connectBitcoinWallet() {
        if (this.walletInfo) {
            this.logger.log('Кошелек подключен');
            return;
        }

        try {
            await this.api.post(`/wallet/create/`, {
                address: this.account.btcAddress,
                owner_id: this.profile.id,
            });

            this.logger.log('Bitcoin кошелек успешно подключен');
        } catch (error) {
            this.logger.error('Ошибка подключения bitcoin кошелька', this.handleError(error));
        }
    }

    async login() {
        this.logger.log('Старт логина');

        const { url } = await this.getWebAppData();

        this.logger.log('Успешный resolvePeer');

        this.api.defaults.headers['X-Api-Key'] = telegramApi.extractWebAppData(url);

        await this.getProfile();

        this.logger.log('Успешный логин');
    }

    async getProfile() {
        this.profile = (await this.api.get(`/user/?chat_id=${this.account.id}`)).data;
        this.logger.log('Успешно получен профиль');
    }

    async completeTasks() {
        this.logger.log('Прохождение заданий');

        for (const { id, resource_id, value } of this.tasks) {
            const { is_claim = false, is_done = false } = this.tasksEvents.find((ev) => ev.task_id === id) ?? {};

            if (is_claim) {
                continue;
            }

            await sleep(random(3, 5));

            try {
                if (is_done) {
                    await this.claimTask(id);
                    continue;
                }

                if (resource_id) {
                    await telegramApi.joinChannel(this.telegramClient, value.split('https://t.me/')[1]);
                    continue;
                }

                await this.completeTask(id);
                await sleep(random(3, 5));
                await this.claimTask(id);
            } catch (error) {
                this.logger.error('Ошибка выполнения задания ', id, this.handleError(error));
            }
        }
    }

    async completeTask(id: string | number) {
        try {
            await this.api.post(`/task/event/create/`, {
                is_done: true,
                task_id: id,
                user_id: this.profile.id,
            });

            this.logger.log('Успешно выполнено ', id);
        } catch (error) {
            this.logger.error('Ошибка выполнения задания', id, this.handleError(error));
        }
    }

    async claimTask(id: string | number) {
        try {
            await this.api.post(`/task/event/create/`, {
                is_claim: true,
                task_id: id,
                user_id: this.profile.id,
            });

            this.logger.log('Успешно заклеймлено ', id);
        } catch (error) {
            this.logger.error('Ошибка клейма задания', id, this.handleError(error));
        }
    }

    async getWebAppData() {
        const peer = await this.telegramClient.resolvePeer('btc_app_bot');

        if (!this.isCreated) {
            await this.telegramClient.call({
                _: 'messages.startBot',
                peer,
                bot: toInputUser(peer),
                startParam: this.refCode.toString(),
                randomId: new Long(random(1, 1000000)),
            });
        }

        return this.telegramClient.call({
            _: 'messages.requestWebView',
            peer,
            bot: toInputUser(peer),
            platform: 'Android',
            startParam: this.refCode.toString(),
            fromBotMenu: true,
            url: 'https://jsatnb.xyz',
        });
    }

    // ---- HELPERS ----

    handleError(error: unknown) {
        if (isAxiosError(error)) {
            return `Axios error: ${error.status} ${error.code} ${error.message} `;
        } else {
            return error as string;
        }
    }

    createApi() {
        const agent = this.account.proxy ? new SocksProxyAgent(this.account.proxy) : undefined;

        this.api = axios.create({
            httpAgent: agent,
            httpsAgent: agent,
            baseURL: 'https://jsatnb.xyz/api/',
            headers: {
                accept: '*/*',
                'content-type': 'application/json',
                'accept-language': 'en-US;q=0.8,en;q=0.7',
                'sec-ch-ua': '"Not)A;Brand";v="99", "Google Chrome";v="122", "Chromium";v="122"',
                'sec-ch-ua-mobile': '?1',
                'sec-ch-ua-platform': '"Android"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'User-Agent': this.account.userAgent,
                priority: 'u=1, i',
                Origin: 'https://jsatnb.xyz',
                Referer: 'https://jsatnb.xyz',
                referrerPolicy: 'strict-origin-when-cross-origin',
            },
        });
    }
}
