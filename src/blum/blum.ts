import { TelegramClient, tl } from '@mtcute/node';
import { TAccountData } from '../scripts/accounts-generator';
import { BaseLogger } from '../shared/logger';
import axios, { AxiosInstance, isAxiosError } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { toInputUser } from '@mtcute/node/utils.js';
import { random, sleep, shuffleArray, randomArrayItem, randomChance, generateRandomString } from '../shared/utils';
import { telegramApi } from '../shared/telegram/telegram-api';
import { BlumDatabase } from './database';
import { tonUtility } from '../shared/ton/ton-utility';
import { APP_CONFIG } from '../config';

export class Blum {
    private account: TAccountData;
    private database: BlumDatabase;
    private refCode: string;
    private telegramClient: TelegramClient;
    private logger: BaseLogger;
    private api: AxiosInstance;
    private analyticsApi: AxiosInstance;
    private isCreated: boolean = false;
    private externalData: {
        youtube: Record<string, string | number>;
    } | null = null;
    private sessionId: string;

    /// ---- GAME DATA ----

    private myRefData: any;
    private tokens: { access: string; refresh: string } | null = null;
    private myTribeData: any;
    private myWalletData: any;
    private farmData: any;

    private DOMAINS_URL = {
        GAME: 'https://game-domain.blum.codes/api/v1',
        WALLET: 'https://wallet-domain.blum.codes/api/v1',
        USER: 'https://user-domain.blum.codes/api/v1',
        TRIBE: 'https://tribe-domain.blum.codes/api/v1',
        EARN: 'https://earn-domain.blum.codes/api/v1',
        SUBSCRIPTION: 'https://subscription.blum.codes/api/v1',
        GATEWAY: 'https://gateway.blum.codes/api/v1',
    };

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
        database: BlumDatabase;
    }) {
        this.isCreated = isCreated;
        this.database = database;
        this.account = account;
        this.refCode = refCode;
        this.telegramClient = telegramClient;
        this.logger = new BaseLogger(`BLUM_${account.index}`);

        this.createBlumApi();
        this.createAnalyticsApi();
    }

    async start() {
        this.api
            .get('https://ifconfig.me/ip', {
                baseURL: '',
            })
            .then((response) => this.logger.log('IP =', response.data))
            .catch((error) => this.logger.error('Ошибка получения IP', this.handleError(error)));

        let cycle = 1;
        mainLoop: while (true) {
            // TODO wallet connect

            const delayInMinutes = cycle === 1 ? random(10, 120) : random(8, 12) * 60;
            this.logger.log(`Задержка ${delayInMinutes} минут перед стартом прохода...`);
            await sleep(delayInMinutes * 60);

            await this.sendPosthog();
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

            await this.getInitialData();

            if (!this.tokens || !this.farmData) {
                this.logger.error('Профиль не найден');
                continue mainLoop;
            }

            if (!this.isCreated) {
                try {
                    this.database.createAccount({
                        index: this.account.index,
                        tokens: this.farmData?.availableBalance ?? 0,
                        refCode: this.myRefData?.referralToken ?? '',
                    });
                    this.isCreated = true;
                    this.logger.error('Успешно добавлен в базу');
                } catch (error) {
                    this.logger.error('Ошибка добавления в базу', error);
                }
            }

            const actions = [
                this.joinTribe,
                this.completeTasks,
                this.playGame,
                this.claimFriends,
                this.connectWallet,
                this.completeFarming,
                this.getFriends,
            ];

            shuffleArray(actions);

            for (const promise of actions) {
                try {
                    await sleep(random(5, 10));
                    await promise.call(this);
                    await this.sync();
                } catch (error) {
                    this.logger.error('Ошибка выполнения промиса:', this.handleError(error));
                }
            }

            try {
                this.database.updateByIndex({
                    index: this.account.index,
                    tokens: this.farmData?.availableBalance ?? 0,
                    refCode: this.myRefData?.referralToken ?? '',
                });
            } catch (error) {
                this.logger.error('Ошибка обновления аккаунта:', error);
            }

            this.logger.accentLog('Конец прохода');
            cycle++;
        }
    }

    async sync() {
        await Promise.allSettled([
            this.getFarm(),
            this.getPointsBalance(),
            this.getMyTribe(),
            this.getFriendsBalance(),
            this.getMyWallet(),
            this.getNow(),
        ]);

        this.logger.log('Успешно синхронизовано');
    }

    async getInitialData() {
        await Promise.allSettled([
            this.getFarm(),
            this.getMe(),
            this.getMyTribe(),
            this.getMyWallet(),
            this.getFriendsBalance(),
            this.getPointsBalance(),
            this.getLeaderBoard(),
            // this.getExternalData(),
        ]);

        this.logger.log('Получены начальные данные');
    }

    // ---- ANALYTICS ----

    async sendPosthog() {
        const payload = new FormData();
        payload.append(
            'data',
            'eyJ0b2tlbiI6InBoY19CUmMxaDJENTlmU09jZHFUTUNFemZOaU1nRUw1alRHNjMwSkJRV0M1Q25IIiwiZGlzdGluY3RfaWQiOiIwMTkyNmE5Yi00MmI0LTdlMzctYmFiZC0zNzZkZDdkYzQ2N2IiLCJncm91cHMiOnt9fQ=='
        );

        try {
            await axios.post(
                `https://eu.i.posthog.com/decide/?v=3&ip=1&_=${Date.now()}&ver=1.160.0&compression=base64`,
                payload,
                {
                    httpAgent: this.httpAgent,
                    httpsAgent: this.httpAgent,
                    headers: { ...this.sharedHeaders, 'content-type': 'application/x-www-form-urlencoded' },
                }
            );
        } catch (error) {
            this.logger.error('Ошибка отправки Posthog', error);
        }
    }

    // ---- ACTIONS ----

    async login() {
        this.logger.log('Старт логина');

        const { url } = await this.getWebAppData();

        this.logger.log('Успешный resolvePeer');

        if (!this.tokens) {
            const { token } = (
                await this.api.post(
                    '/auth/provider/PROVIDER_TELEGRAM_MINI_APP',
                    {
                        query: telegramApi.extractWebAppData(url),
                        referralToken: this.refCode,
                    },
                    {
                        baseURL: this.DOMAINS_URL.USER,
                    }
                )
            ).data;

            this.tokens = token;
        } else {
            await this.refreshToken();
        }

        if (!this.tokens?.access) {
            throw new Error('Не найден access токен');
        }

        this.api.defaults.headers['Authorization'] = `Bearer ${this.tokens.access}`;

        this.logger.log('Успешный логин');

        this.sessionId = this.generateSessionId();

        await this.sendGameEvent([
            this.generateGameEvent('app-hide'),
            this.generateGameEvent('app-init', Date.now() + random(1000, 3000)),
        ]);
    }

    async sendGameEvent(payload: any[]) {
        try {
            await this.analyticsApi.post('/events', payload);
            this.logger.log('Успешно: Отправка событий tganalytics');
        } catch (error) {
            this.logger.error('Ошибка отправки аналитики', this.handleError(error));
        }
    }

    async refreshToken() {
        try {
            this.tokens = (
                await this.api.post(
                    '/auth/refresh',
                    {
                        refresh: this.tokens?.refresh,
                    },
                    {
                        baseURL: this.DOMAINS_URL.USER,
                    }
                )
            ).data;
            this.logger.log('Успешный refresh токена');
        } catch (error) {
            this.tokens = null;
            this.logger.error('Ошибка refresh:', this.handleError(error));
            throw error;
        }
    }

    async joinTribe() {
        if ((this.myTribeData?.id ?? 0) !== 0) {
            this.logger.log('Уже в tribe');
            return;
        }

        const tribe = randomArrayItem([
            'dancayairdrop',
            'dogs_community',
            'blumvnd',
            'cuaairdrop',
            'zona_ghalibie',
            'kiemtiencungxgptteam',
            'hamster_kambt',
        ]);

        try {
            const { id } = (
                await this.api.get(`/tribe/by-chatname/${tribe}`, {
                    baseURL: this.DOMAINS_URL.TRIBE,
                })
            ).data;

            await sleep(random(2, 3));

            await this.api.post(
                `tribe/${id}/join`,
                {},
                {
                    baseURL: this.DOMAINS_URL.TRIBE,
                }
            );

            await this.getMyTribe();

            this.logger.log('Успешное вступление в tribe');
        } catch (error) {
            this.logger.error('Ошибка вступления в tribe:', this.handleError(error));
        }
    }

    async completeTasks() {
        const sections = await this.getTasks();

        let tasksToStart = random(0, 10);
        shuffleArray(sections);

        const tasks = [];

        for (const section of sections) {
            shuffleArray(section.tasks);
            for (const sectionTask of section.tasks) {
                tasks.push(sectionTask);
                if (sectionTask.subTasks) {
                    shuffleArray(sectionTask.subTasks);
                    tasks.push(...sectionTask.subTasks);
                }
            }

            shuffleArray(section.subSections);
            for (const subSection of section.subSections) {
                shuffleArray(subSection.tasks);
                tasks.push(...subSection.tasks);
            }
        }

        for (const { id, status, validationType, subTasks, title, type } of tasks) {
            if (status === 'FINISHED' || !!subTasks) {
                continue;
            }

            try {
                if (status === 'READY_FOR_CLAIM') {
                    await sleep(random(5, 10));
                    await this.claimTask(id, title);
                    continue;
                }

                if (tasksToStart > 0 && status === 'NOT_STARTED' && type !== 'PROGRESS_TARGET') {
                    await sleep(random(5, 10));
                    await this.startTask(id, title);
                    tasksToStart--;

                    if (validationType === 'KEYWORD') {
                        if (!this.externalData) {
                            continue;
                        }

                        const keyword = this.externalData.youtube[title];
                        if (!keyword) {
                            await telegramApi.sendBotNotification(
                                `[BLUM_${this.account.index}] Нужен код для: ${title}`
                            );
                            continue;
                        }

                        await sleep(random(5, 10));
                        await this.validateTask(id, keyword);
                    }
                }
            } catch (error) {
                this.logger.error('Ошибка выполнения задания ', title, this.handleError(error));
            }
        }
    }

    async claimTask(id: string, title?: string) {
        try {
            await this.api.post(
                `/tasks/${id}/claim`,
                {},
                {
                    baseURL: this.DOMAINS_URL.EARN,
                }
            );

            this.logger.log('Успешный claim задания ', title);
        } catch (error) {
            this.logger.error('Ошибка клейма задания', title, this.handleError(error));
            throw error;
        }
    }

    async validateTask(id: string, keyword: string | number) {
        try {
            await this.api.post(
                `/tasks/${id}/validate`,
                {
                    keyword,
                },
                {
                    baseURL: this.DOMAINS_URL.EARN,
                }
            );

            this.logger.log('Успешный validate задания ', id);
        } catch (error) {
            this.logger.error('Ошибка валидации задания', id, this.handleError(error));
            throw error;
        }
    }

    async startTask(id: string, title?: string) {
        try {
            if (randomChance(20)) {
                this.sendGameEvent([this.generateGameEvent('app-hide')]);
            }

            await this.api.post(
                `/tasks/${id}/start`,
                {},
                {
                    baseURL: this.DOMAINS_URL.EARN,
                }
            );

            this.logger.log('Успешный start задания ', title);
        } catch (error) {
            this.logger.error('Ошибка старта задания', title, this.handleError(error));
            throw error;
        }
    }

    async playGame() {
        if (!this.farmData?.playPasses) {
            this.logger.log('Нет билетов для игры');
            return;
        }

        this.logger.log('Начало игры');
        let passes = this.farmData.playPasses;
        while (passes > 0) {
            try {
                const { gameId } = (await this.api.post('/game/play')).data;
                const points = random(30, 150);
                await sleep(30);
                await this.api.post(`/game/claim`, {
                    gameId,
                    points,
                });

                this.logger.log('Успешно сыграно #', passes, '. Получено очков =', points);
                await sleep(random(2, 10));
            } catch (error) {
                this.logger.error('Ошибка игры:', this.handleError(error));
            }

            passes--;
        }
    }

    async connectWallet() {
        if (this.myWalletData) {
            this.logger.log('Кошелек уже подключен');
            return;
        }

        return;

        try {
            const wallet = await tonUtility.getWalletContract(this.account.mnemonicTon.split(' '));
            const account = {
                address: wallet.address.toRawString(),
                chain: '-239',
                publicKey: await tonUtility.getPublicKeyHex(this.account.mnemonicTon.split(' ')),
            };

            await this.api.post(
                '/wallet/connect',
                {
                    account,
                    tonProof: {
                        name: 'ton_proof',
                        proof: {
                            domain: {
                                lengthBytes: 19,
                                value: 'telegram.blum.codes',
                            },
                            payload: Date.now().toString(),
                            signature: '', // TODO
                            timestamp: Date.now() / 1000,
                        },
                    },
                },
                {
                    baseURL: this.DOMAINS_URL.WALLET,
                }
            );
        } catch (error) {
            this.logger.error('Произошла ошибка при подключении кошелька', this.handleError(error));
        }
    }

    async completeFarming() {
        if (this.farmData) {
            return;
        }

        if (!this.farmData.farming) {
            try {
                await this.api.post('/farming/start');
                this.logger.log('Успешно начал фарминг');
            } catch (error) {
                this.logger.error('Ошибка старта фарма:', this.handleError(error));
            }

            return;
        }

        if (this.farmData.farming.endTime > Date.now()) {
            this.logger.log('Клейм фарма еще не доступен');
            return;
        }

        try {
            await this.api.post('/farming/claim');
            await sleep(random(1, 2));
            await this.api.post('/farming/start');
            this.logger.log('Успешно начал фарминг');
        } catch (error) {
            this.logger.error('Ошибка старта фара:', this.handleError(error));
        }
    }

    async claimFriends() {
        if (!this.myRefData?.canClaim) {
            this.logger.log('Клейм за друзей недоступен');
            return;
        }

        try {
            await this.api.post(
                '/friends/claim',
                {},
                {
                    baseURL: this.DOMAINS_URL.USER,
                }
            );

            this.logger.log('Успешный клейм за друзей');
        } catch (error) {
            this.logger.error('Ошибка получения друзей:', this.handleError(error));
        }
    }

    // ---- FETCHERS ----

    async getDaily() {
        try {
            await this.api.get('/daily-reward?offset=-480');
            this.logger.log('Успешный получен daily');
        } catch (error) {
            this.logger.error('Ошибка получения дневной награды:', this.handleError(error));
        }
    }

    async getFarm() {
        try {
            this.farmData = (await this.api.get('/user/balance')).data;
            this.logger.log('Успешный получен farmData');
        } catch (error) {
            this.logger.error('Ошибка получения баланса:', this.handleError(error));
        }
    }

    async getPointsBalance() {
        try {
            await this.api.get('/wallet/my/points/balance', {
                baseURL: this.DOMAINS_URL.WALLET,
            });
            this.logger.log('Успешный получен points/balance');
        } catch (error) {
            this.logger.error('Ошибка получения баланса поинтов:', this.handleError(error));
        }
    }

    async getNow() {
        try {
            await this.api.get('/time/now');
            this.logger.log('Успешный получен now');
        } catch (error) {
            this.logger.error('Ошибка получения времени:', this.handleError(error));
        }
    }

    async getMyWallet() {
        try {
            this.myWalletData = (
                await this.api.get('/wallet/my', {
                    baseURL: this.DOMAINS_URL.WALLET,
                })
            ).data;

            this.logger.log('Успешный получен wallet');
        } catch (error) {
            this.logger.error('Ошибка получения кошелька:', this.handleError(error));
        }
    }

    async getMyTribe() {
        try {
            this.myTribeData = (
                await this.api.get('/tribe/my', {
                    baseURL: this.DOMAINS_URL.TRIBE,
                })
            ).data;

            this.logger.log('Успешный получен мой tribe');
        } catch (error) {
            this.logger.error('Ошибка моего сквада:', this.handleError(error));
        }
    }

    async getExternalData() {
        try {
            const { data } = await axios.get(APP_CONFIG.EXTERNAL_DATA_URL_MUSK);

            this.logger.log('Внешние данные успешно получены');
            this.externalData = data.data;
        } catch (error) {
            this.logger.error('Ошибка получения внешних данных!', this.handleError(error));
        }
    }

    async getLeaderBoard() {
        try {
            await this.api.get('/tribe/leaderboard', {
                baseURL: this.DOMAINS_URL.TRIBE,
            });

            this.logger.log('Успешный получен leaderboard');
        } catch (error) {
            this.logger.error('Ошибка получения leaderboard:', this.handleError(error));
        }
    }

    async getWebAppData() {
        const peer = await this.telegramClient.resolvePeer('BlumCryptoBot');

        return this.telegramClient.call({
            _: 'messages.requestAppWebView',
            peer,
            app: {
                _: 'inputBotAppShortName',
                botId: toInputUser(peer),
                shortName: 'app',
            },
            platform: 'Android',
            startParam: `ref_${this.refCode}`,
            writeAllowed: true,
        });
    }

    async getFriendsBalance() {
        try {
            this.myRefData = (
                await this.api.get('/friends/balance', {
                    baseURL: this.DOMAINS_URL.USER,
                })
            ).data;

            this.logger.log('Успешный получен myRefData');
        } catch (error) {
            this.logger.error('Ошибка получения баланса за друзей:', this.handleError(error));
        }
    }

    async getFriends() {
        if (!randomChance(20)) {
            return;
        }

        try {
            await this.api.get('/friends?pageSize=1000', {
                baseURL: this.DOMAINS_URL.USER,
            });

            this.logger.log('Успешный получен список друзей');
        } catch (error) {
            this.logger.error('Ошибка получения списка друзей:', this.handleError(error));
        }
    }

    async getMe() {
        try {
            await this.api.get('/user/me', {
                baseURL: this.DOMAINS_URL.USER,
            });

            this.logger.log('Успешный получен me');
        } catch (error) {
            this.logger.error('Ошибка получения моего профиля:', this.handleError(error));
        }
    }

    async getTasks() {
        try {
            return (
                await this.api.get('/tasks', {
                    baseURL: this.DOMAINS_URL.EARN,
                })
            ).data;
        } catch (error) {
            this.logger.error('Ошибка получения списка заданий:', this.handleError(error));
            return [];
        }
    }

    async getTribes() {
        try {
            await this.api.get('/tribe', {
                baseURL: this.DOMAINS_URL.TRIBE,
            });

            this.logger.log('Успешный получены tribes');
        } catch (error) {
            this.logger.error('Ошибка получения списка tribe:', this.handleError(error));
        }
    }

    async getTribeBot() {
        try {
            await this.api.get('/tribe/bot', {
                baseURL: this.DOMAINS_URL.TRIBE,
            });

            this.logger.log('Успешный получен tribe bot');
        } catch (error) {
            this.logger.error('Ошибка получения бота tribe:', this.handleError(error));
        }
    }

    // ---- HELPERS ----

    handleError(error: unknown) {
        if (isAxiosError(error)) {
            return `Axios error: ${error.status} ${error.code} ${error.message} ${JSON.stringify(error.response?.data)}`;
        } else {
            return error as string;
        }
    }

    createBlumApi() {
        this.api = axios.create({
            httpAgent: this.httpAgent,
            httpsAgent: this.httpAgent,
            baseURL: this.DOMAINS_URL.GAME,
            headers: this.sharedHeaders,
        });
    }

    get httpAgent() {
        return this.account.proxy ? new SocksProxyAgent(this.account.proxy) : undefined;
    }

    get sharedHeaders() {
        return {
            accept: '*/*',
            'accept-language': 'en-US;q=0.8,en;q=0.7',
            'sec-ch-ua': '"Not)A;Brand";v="99", "Google Chrome";v="122", "Chromium";v="122"',
            'sec-ch-ua-mobile': '?1',
            'sec-ch-ua-platform': '"Android"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-site',
            'User-Agent': this.account.userAgent,
            priority: 'u=1, i',
            Origin: 'https://telegram.blum.codes',
            Referer: 'https://telegram.blum.codes',
        };
    }

    generateSessionId(): string {
        return [
            generateRandomString(8),
            generateRandomString(4),
            '4' + generateRandomString(3),
            generateRandomString(4),
            generateRandomString(12),
        ].join('-');
    }

    generateGameEvent(eventName: string, eventTime = Date.now()) {
        return {
            event_name: eventName,
            session_id: this.sessionId,
            user_id: this.account.id,
            app_name: 'blum_data_prod',
            is_premium: false,
            platform: 'android',
            locale: 'en',
            client_timestamp: eventTime.toString(),
        };
    }

    createAnalyticsApi() {
        this.analyticsApi = axios.create({
            httpAgent: this.httpAgent,
            httpsAgent: this.httpAgent,
            baseURL: 'https://tganalytics.xyz',
            headers: {
                ...this.sharedHeaders,
                'tga-auth-token':
                    'eyJhcHBfbmFtZSI6ImJsdW1fZGF0YV9wcm9kIiwiYXBwX3VybCI6Imh0dHBzLy90Lm1lL0JsdW1DcnlwdG9Cb3QiLCJhcHBfZG9tYWluIjoiaHR0cHM6Ly90ZWxlZ3JhbS5ibHVtLmNvZGVzIn0=!MU0kXOzDDD/uWjqbs8GvSYHRixCiwotuxO5NY6ct/NI=',
            },
        });
    }
}
