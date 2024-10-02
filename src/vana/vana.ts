import { TelegramClient, tl } from '@mtcute/node';
import { TAccountData } from '../scripts/accounts-generator';
import { BaseLogger } from '../shared/logger';
import axios, { AxiosError, AxiosInstance, HttpStatusCode, isAxiosError } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { toInputUser } from '@mtcute/node/utils.js';
import { random, sleep, shuffleArray, randomArrayItem, randomChance } from '../shared/utils';
import { telegramApi } from '../shared/telegram/telegram-api';
import { VanaDatabase } from './database';

export class Vana {
    private account: TAccountData;
    private database: VanaDatabase;
    private profile: any;
    private refCode: string;
    private telegramClient: TelegramClient;
    private logger: BaseLogger;
    private api: AxiosInstance;
    private API_URL = 'https://www.vanadatahero.com/api';
    private isCreated: boolean = false;
    private friends = 0;

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
        database: VanaDatabase;
    }) {
        this.isCreated = isCreated;
        this.database = database;
        this.account = account;
        this.refCode = refCode;
        this.telegramClient = telegramClient;
        this.logger = new BaseLogger(`VANA_${account.index}`);

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
            const delayInMinutes = cycle === 1 ? random(1, 120) : randomArrayItem([1, 2, 3, 4, 5, 6, 7, 8]) * 60;
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

            if (!this.profile) {
                this.logger.error('Профиль не найден');
                continue mainLoop;
            }

            this.logger.accentLog('Успешный логин. Начало прохода');

            if (!this.isCreated) {
                try {
                    this.database.createAccount({
                        index: this.account.index,
                        tokens: this.profile.points,
                        friends: this.friends,
                    });
                    this.isCreated = true;
                    this.logger.error('Успешно добавлен в базу');
                } catch (error) {
                    this.logger.error('Ошибка добавления в базу', error);
                }
            }

            await sleep(random(5, 10));

            const actions = [this.completeTasks, this.completeTaps, this.sendLeaderBoard, this.sendInvite];

            shuffleArray(actions);

            for (const promise of actions) {
                try {
                    await sleep(random(5, 10));
                    await promise.call(this);
                    await sleep(random(1, 4));
                    await this.getProfile();
                } catch (error) {
                    this.logger.error('Ошибка выполнения промиса:', this.handleError(error));
                }
            }

            try {
                this.database.updateByIndex({
                    index: this.account.index,
                    tokens: this.profile.points,
                    friends: this.friends,
                });
            } catch (error) {
                this.logger.error('Ошибка обновления токенов:', error);
            }

            cycle++;
        }
    }

    async completeTaps() {
        await this.sendPageView('home');

        try {
            let cycles = random(20, 40);
            while (cycles > 0) {
                await sleep(random(20, 30));

                const points = random(5, 20);
                await this.completeTask(1, points);
                cycles--;
            }
        } catch (error) {
            this.logger.error('Ошибка выполнения тапов', this.handleError(error));
        }
    }

    async sendPageView(page: string) {
        this.api.post(
            'https://www.vanadatahero.com/_vercel/insights/view',
            {
                o: `https://www.vanadatahero.com/${page}`,
                sv: '0.1.2',
                sdkn: '@vercel/analytics/react',
                sdkv: '1.3.1',
                ts: Date.now(),
            },
            {
                baseURL: '',
                headers: {
                    referrer: `https://www.vanadatahero.com/${page}`,
                    origin: `https://www.vanadatahero.com/${page}`,
                },
            }
        );
    }

    async login() {
        try {
            this.logger.log('Старт логина');

            const url = await this.getWebAppDataUrl();

            this.logger.log('Успешный resolvePeer');

            this.api.defaults.headers['X-Telegram-Web-App-Init-Data'] = telegramApi.extractWebAppData(url);

            await this.getProfile();

            this.logger.log('Успешный логин');
        } catch (_error) {
            const error = _error as AxiosError;
            if (error.status === HttpStatusCode.NotFound) {
                this.logger.log('Пользователь не найден. Создаем..');
                await this.createUser();
                return;
            }

            throw _error;
        }
    }

    async getProfile() {
        this.profile = (await this.api.get('/player')).data;
    }

    async completeTasks() {
        await this.sendPageView('challenges');

        this.logger.log('Прохождение заданий');

        try {
            const { tasks } = (await this.api.get('/tasks')).data;
            this.friends = tasks[1].completed.length ?? 0;

            for (const task of tasks) {
                if (task.completed.length > 0) {
                    continue;
                }

                if (task.claimType === 'immediate') {
                    await sleep(random(5, 10));
                    await this.completeTask(task.id, task.points);
                }

                // todo complete other tasks
            }
        } catch (error) {
            this.logger.error('Ошибка выполнения заданий', this.handleError(error));
        }
    }

    async createUser() {
        try {
            const result = await this.api.post(`/player`);
            this.profile = result.data;

            await sleep(random(1, 2));

            await this.api.post('/tasks/2', {
                status: 'completed',
                data: {
                    referredUsername: this.profile.tgUsername,
                    referredPlayerId: this.profile.id,
                    referredBy: this.refCode,
                },
            });

            this.logger.log('Пользователь зареган успешно');
        } catch (error) {
            this.logger.error('Ошибка создания пользователя', this.handleError(error));
            throw error;
        }
    }

    async sendLeaderBoard() {
        if (!randomChance(20)) {
            return;
        }

        await this.sendPageView('leaderboard');
    }

    async sendInvite() {
        if (!randomChance(20)) {
            return;
        }

        await this.sendPageView('invite');
    }

    async completeTask(id: string | number, points: number) {
        try {
            await this.api.post(`/tasks/${id}`, {
                points,
                status: 'completed',
            });
        } catch (error) {
            this.logger.error('Ошибка выполнения задания', this.handleError(error));
        }
    }

    async getWebAppDataUrl() {
        const peer = await this.telegramClient.resolvePeer('VanaDataHeroBot');

        const response = await this.telegramClient.call({
            _: 'messages.requestAppWebView',
            peer,
            app: {
                _: 'inputBotAppShortName',
                botId: toInputUser(peer),
                shortName: 'VanaDataHero',
            },
            platform: 'Android',
            startParam: this.refCode,
            writeAllowed: true,
        });

        return response.url;
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
                Origin: 'https://www.vanadatahero.com/home',
                Referer: 'https://www.vanadatahero.com/home',
                referrerPolicy: 'strict-origin-when-cross-origin',
            },
        });
    }
}