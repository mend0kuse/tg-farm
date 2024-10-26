import { TelegramClient, tl } from '@mtcute/node';
import { TAccountData } from '../scripts/accounts-generator';
import { BaseLogger } from '../shared/logger';
import axios, { AxiosError, AxiosInstance, HttpStatusCode, isAxiosError } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { toInputUser } from '@mtcute/node/utils.js';
import { random, sleep, shuffleArray, randomArrayItem } from '../shared/utils';
import { telegramApi } from '../shared/telegram/telegram-api';
import { DropsDatabase } from './database';

export class Drops {
    private account: TAccountData;
    private database: DropsDatabase;
    private profile: any;
    private refCode: string;
    private myRefInfo: any;
    private telegramClient: TelegramClient;
    private logger: BaseLogger;
    private api: AxiosInstance;
    private API_URL = 'https://api.miniapp.dropstab.com/api';
    private isCreated: boolean = false;
    private syncInterval: any;
    private orders: any;
    private activeTasksCategories: Array<{ quests: any[] }> = [];

    constructor({
        account,
        refCode,
        isCreated,
        telegramClient,
        database,
    }: {
        account: TAccountData;
        refCode: string;
        telegramClient: TelegramClient;
        isCreated: boolean;
        database: DropsDatabase;
    }) {
        this.isCreated = isCreated;
        this.database = database;
        this.account = account;
        this.refCode = refCode;
        this.telegramClient = telegramClient;
        this.logger = new BaseLogger(`DROPS_${account.index}`);

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

        while (true) {
            const delayInMinutes = cycle === 1 ? random(1, 110) : random(5, 10) * 60;
            this.logger.log(`Задержка ${delayInMinutes} минут перед стартом прохода ${cycle}...`);

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

            this.logger.accentLog('Успешный логин. Начало прохода');

            await this.getData();
            if (!this.myRefInfo) {
                this.logger.error('Не удалось получить информацию, 2ая попытка');
                await sleep(random(2, 5));
                await this.getData();
            }

            await this.claimDaily();

            if (!this.isCreated) {
                await this.applyRefLink();
                await sleep(random(3, 5));
                await this.claimWelcomeBonus();

                try {
                    this.database.createAccount({
                        index: this.account.index,
                        tokens: this.profile.balance,
                        friends: 0,
                        refCode: '',
                    });
                    this.isCreated = true;
                    this.logger.error('Успешно добавлен в базу');
                } catch (error) {
                    this.logger.error('Ошибка добавления в базу', error);
                }
            }

            this.syncInterval = setInterval(() => {
                this.getProfile();
            }, 5000);

            await sleep(random(3, 5));

            const actions = [this.completeTasks, this.claimFriendsReward, this.completeOrders];

            shuffleArray(actions);

            for (const promise of actions) {
                try {
                    await sleep(random(4, 6));
                    await promise.call(this);
                } catch (error) {
                    this.logger.error('Ошибка выполнения промиса:', this.handleError(error));
                }
            }

            try {
                this.database.updateByIndex({
                    index: this.account.index,
                    tokens: this.profile.balance,
                    friends: this.myRefInfo?.referrals.total ?? 0,
                    refCode: this.myRefInfo?.code ?? '',
                });
            } catch (error) {
                this.logger.error('Ошибка обновления токенов:', error);
            }

            clearInterval(this.syncInterval);
            cycle++;
        }
    }

    async login() {
        let url = '';

        try {
            this.logger.log('Старт логина');

            url = (await this.getWebAppData()).url;

            this.logger.log('Успешный resolvePeer');

            await this.getProfile();

            this.logger.log('Успешный логин');
        } catch (_error) {
            const error = _error as AxiosError;
            if (url && (error.status === HttpStatusCode.Forbidden || error.status === HttpStatusCode.Unauthorized)) {
                this.logger.log('Токена нет');
                await this.sendLogin(url);
                await this.getProfile();
                return;
            }

            throw _error;
        }
    }

    async completeOrders() {
        this.logger.log('Выполнение трейдов');

        for (const { period, order } of this.orders?.periods ?? []) {
            if (this.profile.balance < period.unlockThreshold) {
                this.logger.log('Трейд недоступен с id', period.id);
                continue;
            }

            if (order?.status === 'PENDING') {
                this.logger.log('Трейд уже сделан с id', period.id);
                continue;
            }

            try {
                if (order) {
                    await sleep(random(1, 5));
                    const action = order.status === 'CLAIM_AVAILABLE' ? 'claim' : 'markUserChecked';
                    await this.api.put(`/order/${order.id}/${action}`);
                    continue;
                }

                await sleep(random(1, 5));

                const coins = (await this.api.get('/order/coins')).data;
                const selectedCoin: any = randomArrayItem(coins.filter((coin: any) => !!coin.actual));

                await sleep(random(2, 5));
                await this.api.get(`/order/coinStats/${selectedCoin.id}`);

                await sleep(random(2, 5));
                await this.api.post('/order', {
                    coinId: selectedCoin.id,
                    periodId: period.id,
                    short: randomArrayItem([false, true]),
                });

                this.logger.log('Успешно сделан трейд в периоде', period.id);
            } catch (error) {
                this.logger.error('Ошибка выполнения ордера', this.handleError(error));
            }
        }
    }

    async getOrders() {
        try {
            this.orders = (await this.api.get('/order')).data;
        } catch (error) {
            this.logger.error('Ошибка получения ордеров', this.handleError(error));
        }
    }

    async getProfile() {
        this.logger.log('Получения профиля');

        this.profile = (await this.api.get('/user/current')).data;
    }

    async completeTasks() {
        this.logger.log('Прохождение заданий');

        for (const category of this.activeTasksCategories) {
            for (const { id, claimAllowed, url } of category.quests) {
                if (claimAllowed) {
                    await sleep(random(2, 3));
                    await this.claimQuest(id);
                    return;
                }

                if (url && url.startsWith('https://t.me/s/')) {
                    this.logger.log('Вступление в канал');
                    try {
                        await telegramApi.joinChannel(this.telegramClient, url.split('https://t.me/s/')[1]);
                    } catch (error) {
                        if (tl.RpcError.is(error, 'FLOOD_WAIT_%d')) {
                            this.logger.error('FLOOD WAIT', error.seconds * 2);
                            await sleep(error.seconds * 2);
                        }

                        this.logger.error('Ошибка вступления в канал', this.handleError(error));
                    }

                    await sleep(random(10, 15));
                }

                await sleep(random(2, 3));
                await this.checkQuest(id);
            }
        }
    }

    async claimFriendsReward() {
        if (this.myRefInfo.availableToClaim === 0) {
            return;
        }

        try {
            await this.api.post('/refLink/claim');
            this.logger.log('Успешный клейм награды за друзей');
        } catch (error) {
            this.logger.error('Ошибка клейма награды за друзей', this.handleError(error));
        }
    }

    async applyRefLink() {
        this.logger.log('Применение реф кода');

        try {
            await this.api.put('/user/applyRefLink', {
                code: this.refCode,
            });
        } catch (error) {
            this.logger.error('Ошибка применения реф кода', this.handleError(error));
        }
    }

    async claimDaily() {
        try {
            const { result } = (await this.api.post('/bonus/dailyBonus')).data;
            if (!result) {
                throw new Error('Result=false');
            }

            this.logger.log('Успешный клейм daily');
        } catch (error) {
            this.logger.error('Ошибка клейма daily', this.handleError(error));
        }
    }

    async getRefLink() {
        this.logger.log('Применение информации о реф коде');

        try {
            this.myRefInfo = (await this.api.get('/refLink')).data;
        } catch (error) {
            this.logger.error('Ошибка получения реф кода', this.handleError(error));
        }
    }

    async getData() {
        await Promise.allSettled([
            this.getProfile(),
            this.getOrders(),
            this.getRefLink(),
            this.etherDropSub(),
            this.getActiveTasks(),
            this.getCompletedTasks(),
        ]);
    }

    async checkQuest(id: number | string) {
        try {
            const { status } = (await this.api.put(`/quest/${id}/verify`)).data;
            if (status !== 'OK') {
                throw new Error('OK=false');
            }

            this.logger.log('Квест успешно проверен ', id);
        } catch (error) {
            this.logger.error('Ошибка проверки квеста ', id, this.handleError(error));
        }
    }

    async claimQuest(id: number | string) {
        try {
            const { status } = (await this.api.put(`/quest/${id}/claim`)).data;
            if (status !== 'OK') {
                throw new Error('OK=false');
            }
            this.logger.log('Квест успешно заклеймлен ', id);
        } catch (error) {
            this.logger.error('Ошибка проверки квеста ', id, this.handleError(error));
        }
    }

    async etherDropSub() {
        this.logger.log('Получение etherDropSub');

        try {
            await this.api.get(`etherDropsSubscription`);
        } catch (error) {
            this.logger.error('Ошибка получения etherDrop', this.handleError(error));
        }
    }

    async claimWelcomeBonus() {
        this.logger.log('Клейм welcome бонуса');

        try {
            await this.api.post('/bonus/welcomeBonus');
        } catch (error) {
            this.logger.error('Ошибка получения приветственного бонуса', this.handleError(error));
        }
    }

    async sendLogin(tgUrl: string) {
        this.logger.log('Получение токена');

        try {
            const { user, jwt } = (
                await this.api.post(
                    `/auth/login`,
                    {
                        webAppData: telegramApi.extractWebAppData(tgUrl),
                    },
                    {
                        headers: {
                            Authorization: '',
                        },
                    }
                )
            ).data;

            this.profile = user;
            this.api.defaults.headers['Authorization'] = `Bearer ${jwt.access.token}`;
            this.logger.log('Успешно установлен токен');
        } catch (error) {
            this.logger.error('Ошибка получения токена', this.handleError(error));
            throw error;
        }
    }

    async getActiveTasks() {
        this.logger.log('Получение активных заданий');

        try {
            this.activeTasksCategories = (await this.api.get('/quest/active')).data;
        } catch (error) {
            this.logger.error('Ошибка получения списка активных заданий', this.handleError(error));
            return [];
        }
    }

    async getCompletedTasks() {
        this.logger.log('Получение выполненных заданий');

        try {
            await this.api.get('/quest/completed');
        } catch (error) {
            this.logger.error('Ошибка получения списка выполненных заданий', this.handleError(error));
        }
    }

    async getWebAppData() {
        const peer = await this.telegramClient.resolvePeer('fomo');

        return this.telegramClient.call({
            _: 'messages.requestAppWebView',
            peer,
            app: {
                _: 'inputBotAppShortName',
                botId: toInputUser(peer),
                shortName: 'APP',
            },
            platform: 'Android',
            startParam: `ref_${this.refCode}`,
            writeAllowed: true,
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
            baseURL: this.API_URL,
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
                Origin: 'https://miniapp.dropstab.com/',
                Referer: 'https://miniapp.dropstab.com/',
                referrerPolicy: 'strict-origin-when-cross-origin',
            },
        });
    }
}
