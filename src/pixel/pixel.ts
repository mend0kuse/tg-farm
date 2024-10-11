import { TelegramClient, tl } from '@mtcute/node';
import { TAccountData } from '../scripts/accounts-generator';
import { BaseLogger } from '../shared/logger';
import axios, { AxiosInstance, HttpStatusCode, isAxiosError } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { toInputUser } from '@mtcute/node/utils.js';
import { random, sleep, shuffleArray, randomArrayItem, randomChance, generateRandomString } from '../shared/utils';
import { telegramApi } from '../shared/telegram/telegram-api';
import { PixelDatabase } from './database';
import WebSocket from 'ws';

export class Pixel {
    private account: TAccountData;
    private database: PixelDatabase;
    private profile: any;
    private mining: any;
    private refCode: string;
    private sessionId: string;
    private telegramClient: TelegramClient;
    private logger: BaseLogger;
    private api: AxiosInstance;
    private analyticsApi: AxiosInstance;
    private API_URL = 'https://notpx.app/api/v1';
    private isCreated: boolean = false;
    private ws: WebSocket;
    private template: any;

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
        database: PixelDatabase;
    }) {
        this.isCreated = isCreated;
        this.database = database;
        this.account = account;
        this.refCode = refCode;
        this.telegramClient = telegramClient;
        this.logger = new BaseLogger(`PIXEL_${account.index}`);

        const agent = account.proxy ? new SocksProxyAgent(account.proxy) : undefined;

        this.createAnalyticsApi(agent);
        this.createPixelApi(agent);
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
            const randomHour = randomArrayItem(this.DELAY_HOURS);
            const delayInMinutes = cycle === 1 ? random(1, 120) : random(randomHour - 0.5, randomHour + 0.5) * 60;
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

            this.logger.accentLog(
                'Успешный логин. Начало прохода. \n',
                this.profile ? `Токены = ${this.profile.balance}. \n` : ' ',
                this.profile ? `Лига = ${this.profile.league}. \n` : ' '
            );

            this.setupWs();
            await this.getInitialData();

            await sleep(random(5, 10));

            if (!this.isCreated) {
                try {
                    this.database.createAccount({
                        index: this.account.index,
                        league: this.profile.league,
                        friends: this.profile.friends,
                    });
                    this.isCreated = true;
                    this.logger.error('Успешно добавлен в базу');
                } catch (error) {
                    this.logger.error('Ошибка добавления в базу', error);
                }
            }

            await sleep(random(1, 3));

            const actions = [
                this.claimMining,
                this.completeTasks,
                this.completeImprovements,
                this.completePaint,
                this.createTemplate,
                this.joinSquad,
                this.sendFriendsEvent,
                this.sendHistoryEvent,
                this.sendLeaderBoardEvent,
                this.sendProfileEvent,
                this.sendSquadEvent,
                this.sendStarsEvent,
            ];

            shuffleArray(actions);

            for (const promise of actions) {
                try {
                    await sleep(random(5, 10));
                    await promise.call(this);
                } catch (error) {
                    this.logger.error('Ошибка выполнения промиса:', this.handleError(error));
                }
            }

            try {
                this.database.updateByIndex({
                    index: this.account.index,
                    league: this.profile.league,
                    friends: this.profile.friends,
                });
            } catch (error) {
                this.logger.error('Ошибка обновления токенов:', error);
            }

            cycle++;
            this.logger.accentLog('Конец прохода');
            this.ws.close();
        }
    }

    async getInitialData() {
        await Promise.allSettled([this.getMiningStatus(), this.getTemplateById(), this.getMyTemplate()]);
    }

    setupWs() {
        this.ws = new WebSocket('wss://notpx.app/api/v2/image/ws');
        this.ws.onopen = () => this.logger.log('WebSocket соединение установлено');
        this.ws.onerror = (err: any) => this.logger.error('Ошибка ws: ', err);
        this.ws.onclose = () => this.logger.log('WebSocket соединение завершено');
    }

    async getMyTemplate() {
        this.template = (await this.getTemplateById('my'))?.data ?? null;
    }
    async getTemplateById(id: string | number = this.account.id) {
        try {
            return await this.api.get(`/image/template/${id}`);
        } catch (error) {
            this.logger.error(`Ошибка при загрузке template ${id}`, this.handleError(error));
        }
    }

    async createTemplate() {
        if (this.template) {
            this.logger.log('Уже создан шаблон');
            return;
        }

        this.logger.log('Создание шаблона...')

        await this.sendPageView('https://app.notpx.app/template');

        try {
            const templates = (await this.api.get('/image/template/list?limit=12&offset=0')).data;
            const { templateId } = randomArrayItem(templates) as any;

            await sleep(random(5, 10));
            await this.getTemplateById(templateId);

            await sleep(random(3, 5));

            await this.api.put(`/image/template/subscribe/${templateId}`);
            this.template = (await this.getTemplateById(templateId))?.data;

            this.logger.log('Создан новый шаблон');
        } catch (error) {
            this.logger.error('Ошибка при создании шаблона ', this.handleError(error));
        }
    }

    async checkTask(task: any) {
        try {
            let url = task.key;
            if (task.type === 'x') {
                await this.sendGameEvent([this.generateGameEvent('app-hide')]);
                await sleep(random(10, 15));
                url = 'x?name=' + task.key;
            }
            if (task.type === 'channel') {
                await this.sendGameEvent([this.generateGameEvent('app-hide')]);
                await sleep(random(10, 15));
                url = 'channel?name=' + task.key;
            }

            const { data } = await this.api.get(`/mining/task/check/${url}`);

            if (!data[task.checkData]) {
                throw new Error('Задание не выполнено');
            }

            this.logger.log(`Задание ${task.key} выполнено`);
        } catch (error) {
            this.logger.error(`Ошибка проверки задания ${task.key}: `, this.handleError(error));
        }
    }

    async sendFriendsEvent() {
        if (!randomChance(20)) {
            return;
        }

        await this.sendPageView('https://app.notpx.app/invite-frens');
    }

    async sendLeaderBoardEvent() {
        if (!randomChance(20)) {
            return;
        }

        await this.sendPageView('https://app.notpx.app/ratings');
    }

    async sendProfileEvent() {
        if (!randomChance(20)) {
            return;
        }

        await this.sendPageView('https://app.notpx.app/my-profile');
    }

    async sendSquadEvent() {
        if (!randomChance(20)) {
            return;
        }

        await this.sendPageView('https://app.notpx.app/my-squad');
    }

    async sendStarsEvent() {
        if (!randomChance(20)) {
            return;
        }

        await this.sendPageView('https://app.notpx.app/stars');
    }

    async sendClaimingEvent() {
        await this.sendPageView('https://app.notpx.app/claiming');
    }

    async sendHistoryEvent() {
        if (!randomChance(10)) {
            return;
        }

        await this.sendPageView('https://app.notpx.app/history');
        await this.api.get('/history/all?offset=0&limit=50');
    }

    async login() {
        this.logger.log('Старт логина');

        const url = await this.getWebAppDataUrl();

        await this.sendPageView(url);

        this.api.defaults.headers['Authorization'] = `initData ${telegramApi.extractWebAppData(url)}`;

        this.profile = (await this.api.get('/users/me')).data;

        this.sessionId = this.generateSessionId();

        await this.sendGameEvent([
            this.generateGameEvent('app-hide'),
            this.generateGameEvent('app-init', Date.now() + random(1000, 3000)),
        ]);

        this.logger.log('Успешный логин');
    }

    async sendPageView(url: string) {
        const agent = this.account.proxy ? new SocksProxyAgent(this.account.proxy) : undefined;

        this.logger.log('Отправка событий plausible');

        try {
            await axios.post(
                'https://plausible.joincommunity.xyz/api/event',
                {
                    n: 'pageview',
                    u: url,
                    d: 'notpx.app',
                    r: 'https://web.telegram.org/',
                },
                {
                    httpAgent: agent,
                    httpsAgent: agent,
                    headers: {
                        accept: '*/*',
                        'accept-language': 'en-US;q=0.8,en;q=0.7',
                        'content-type': 'text/plain',
                        'sec-ch-ua': '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
                        'sec-ch-ua-mobile': '?0',
                        'sec-fetch-dest': 'empty',
                        'sec-fetch-mode': 'cors',
                        'sec-fetch-site': 'cross-site',
                        'sec-ch-ua-platform': '"Android"',
                        referrerPolicy: 'strict-origin-when-cross-origin',
                        priority: 'u=1, i',
                        Referer: 'https://app.notpx.app/',
                        Origin: 'https://app.notpx.app',
                        'User-Agent': this.account.userAgent,
                    },
                }
            );
        } catch (error) {
            this.logger.error('Ошибка отправки событий plausible', this.handleError(error));
        }
    }

    async sendGameEvent(payload: any[]) {
        this.logger.log('Отправка событий tganalytics');

        try {
            await this.analyticsApi.post('/events', payload, {
                headers: {
                    Content: randomArrayItem(this.CONTENT_DATA),
                    'Content-Length': JSON.stringify(payload).length,
                },
            });
        } catch (error) {
            this.logger.error('Ошибка отправки аналитики', this.handleError(error));
        }
    }

    async claimMining() {
        this.logger.log(`Старт клейма`);
        await this.sendClaimingEvent();

        if (this.mining.fromStart * this.mining.speedPerSecond < random(0.3, 0.5)) {
            this.logger.log('Прошло мало времени с последнего клейма');
            return;
        }

        try {
            this.mining = (await this.api.get('/mining/claim')).data;
            this.logger.log(`Успешно получено ${this.mining.claimed} токенов`);
        } catch (error) {
            this.logger.error('Ошибка получения майнинга:', this.handleError(error));
        }
    }

    async joinSquad() {
        const squadId = randomArrayItem([
            578037, 679085, 577266, 631405, 573790, 4, 577680, 573809, 628001, 573984, 588489,
        ]);

        if (this.profile.squad?.id) {
            this.logger.log('Уже вступил в squad');
            return;
        }

        try {
            const url = await this.getSquadWebAppDataUrl();
            const webAppData = telegramApi.extractWebAppData(url);
            const gamesApi = axios.create({ ...this.api.defaults, baseURL: 'https://api.notcoin.tg' });

            gamesApi.defaults.headers['bypass-tunnel-reminder'] = 'x';
            gamesApi.defaults.headers['X-Auth-Token'] = 'Bearer null';
            gamesApi.defaults.headers['Referer'] = 'https://webapp.notcoin.tg';
            gamesApi.defaults.headers['Origin'] = 'https://webapp.notcoin.tg';
            delete gamesApi.defaults.headers['Authorization'];
            delete gamesApi.defaults.headers['content-type'];

            const { data } = await gamesApi.post('/auth/login', {
                webAppData,
            });

            const { accessToken, telegramId } = data.data;

            gamesApi.defaults.headers['X-Auth-Token'] = `Bearer ${accessToken}`;

            await gamesApi.get(`/profiles/by/telegram_id/${telegramId}`);
            const { squad } = (await gamesApi.get(`/squads/by/id/${squadId}`)).data.data;
            if (!squad) {
                throw new Error('Не найден сквад');
            }
            const response = await gamesApi.post(`/squads/${squad.slug}/join`, {
                chatId: squad.chatId,
            });

            if (response.status !== HttpStatusCode.Created) {
                throw new Error('Неудачное вступление в сквад');
            }

            this.logger.log('Успешное вступление в клан');
        } catch (error) {
            if (tl.RpcError.is(error, 'FLOOD_WAIT_%d')) {
                this.logger.error('FLOOD WAIT', error.seconds * 2);
                await sleep(error.seconds * 2);
            }

            this.logger.error('Ошибка получения peer для squad:', this.handleError(error));
        }
    }

    async getMiningStatus() {
        try {
            this.mining = (await this.api.get('/mining/status')).data;
            this.logger.log(`Успешно получен статус майнинга`);
        } catch (error) {
            this.logger.log('Ошибка получения mining статуса', this.handleError(error));
        }
    }

    async completePaint() {
        if (!this.template) {
            this.logger.log('Не найден шаблон для рисования');
            return;
        }

        this.logger.log(`Старт рисования. Заряды =`, this.mining.charges);

        const preparePixel = (x: number, y: number) => {
            return Number(y + '' + (x + 1));
        };

        const { x, y, imageSize } = this.template;

        const minPixelId = preparePixel(x, y);
        const maxPixelId = preparePixel(x + imageSize, y + imageSize);

        const colorStrategy = randomArrayItem(['random', 'same']);
        let color = randomArrayItem(this.COLORS);

        const firstPixelId = random(minPixelId, maxPixelId);
        let pixelId = firstPixelId;

        const getPixelInValidRange = () => {
            return pixelId >= minPixelId && pixelId <= maxPixelId;
        };

        let charges = this.mining.charges;

        while (charges > 0) {
            if (charges !== this.mining.charges) {
                if (colorStrategy === 'random') {
                    color = randomArrayItem(this.COLORS);
                }

                let attempts = 0;
                while (attempts < 10) {
                    pixelId = random(firstPixelId - random(5, 10), firstPixelId + random(5, 10));

                    if (getPixelInValidRange()) {
                        break;
                    }

                    attempts++;
                }

                if (attempts === 10) {
                    pixelId = firstPixelId;
                }
            }

            try {
                await this.api.post('/repaint/start', { pixelId, newColor: color });
                this.logger.log(`Успешно зарисован #`, charges);
                charges--;
            } catch (error) {
                this.logger.error(`Ошибка рисования пикселя: ${charges}`, this.handleError(error));
            }

            await sleep(random(2, 10));
        }
    }

    async getWebAppDataUrl() {
        const peer = await this.telegramClient.resolvePeer('notpixel');

        const response = await this.telegramClient.call({
            _: 'messages.requestAppWebView',
            peer,
            app: {
                _: 'inputBotAppShortName',
                botId: toInputUser(peer),
                shortName: 'app',
            },
            platform: 'Android',
            startParam: this.refCode,
            writeAllowed: true,
        });

        return response.url;
    }

    async getSquadWebAppDataUrl() {
        const peer = await this.telegramClient.resolvePeer('notgames_bot');

        const response = await this.telegramClient.call({
            _: 'messages.requestAppWebView',
            peer,
            app: {
                _: 'inputBotAppShortName',
                botId: toInputUser(peer),
                shortName: 'squads',
            },
            platform: 'Android',
            writeAllowed: true,
        });

        return response.url;
    }

    async completeImprovements() {
        this.logger.log(`Старт прокачки`);

        try {
            for (const boost in this.mining.boosts) {
                const level = this.mining.boosts[boost];
                const price = this.BOOST_PRICE_BY_CURRENT_LEVEL[level];

                if (level >= this.MAX_BOOST_LEVEL_BY_KEY[boost]) {
                    this.logger.log(`Улучшение ${boost} на максимальном уровне`);
                    continue;
                }

                if (this.mining.userBalance > price) {
                    await this.improveBoost(boost);
                    this.logger.log(`Успешно улучшено ${boost} на уровне ${level}`);
                    this.mining.userBalance -= price;
                }
            }
        } catch (error) {
            this.logger.error('Ошибка прокачки улучшений:', this.handleError(error));
        }
    }

    async improveBoost(key: string) {
        try {
            const { data } = await this.api.get(`/mining/boost/check/${key}`);
            if (!data[key]) {
                throw new Error('Ошибка прокачки');
            }
        } catch (error) {
            this.logger.error(`Ошибка улучшения бустера ${key}:`, this.handleError(error));
            throw error;
        }
    }

    async completeTasks() {
        this.logger.log(`Старт выполнения заданий`);

        shuffleArray(this.hardcodeTasks);
        await this.sendClaimingEvent();

        for (const task of this.hardcodeTasks) {
            if (this.mining.tasks[task.checkData]) {
                continue;
            }

            try {
                if (task.type === 'condition' && !task.condition?.()) {
                    continue;
                }

                if (
                    task.type === 'league' &&
                    this.LEAGUES.indexOf(this.profile.league) < this.LEAGUES.indexOf(task.league!)
                ) {
                    continue;
                }

                await sleep(random(2, 3));

                this.logger.log('Выполнение ' + task.key);

                if (task.type === 'channel') {
                    await telegramApi.joinChannel(this.telegramClient, task.key);
                }

                await this.checkTask(task);
            } catch (error) {
                this.logger.error(`Ошибка выполнения задания ${task.key}: `, this.handleError(error));
            }
        }
    }

    // ---- HELPERS ----

    private DELAY_HOURS = [1, 2, 3, 7];

    private LEAGUES = ['bronze', 'silver', 'gold', 'platinum'];

    private MAX_PIXEL_ID = 1000000;

    private hardcodeTasks = [
        {
            condition: () => {
                return this.mining.repaintsTotal >= 20;
            },
            type: 'condition',
            key: 'paint20pixels',
            checkData: 'paint20pixels',
        },
        {
            condition: () => {
                return this.profile.friends >= 3;
            },
            type: 'condition',
            key: 'invite3frens',
            checkData: 'invite3frens',
        },
        {
            condition: () => {
                return !!this.profile.squad?.id;
            },
            type: 'condition',
            key: 'joinSquad',
            checkData: 'joinSquad',
        },
        {
            key: 'notpixel',
            type: 'x',
            checkData: 'x:notpixel',
        },
        {
            key: 'notcoin',
            type: 'x',
            checkData: 'x:notcoin',
        },
        {
            key: 'notcoin',
            type: 'channel',
            checkData: 'channel:notcoin',
        },
        {
            key: 'notpixel_channel',
            type: 'channel',
            checkData: 'channel:notpixel_channel',
        },
        {
            key: 'leagueBonusSilver',
            checkData: 'leagueBonusSilver',
            type: 'league',
            league: this.LEAGUES[1],
        },
        {
            key: 'leagueBonusGold',
            checkData: 'leagueBonusGold',
            type: 'league',
            league: this.LEAGUES[2],
        },
        {
            key: 'leagueBonusPlatinum',
            checkData: 'leagueBonusPlatinum',
            type: 'league',
            league: this.LEAGUES[3],
        },
    ];

    private BOOST_PRICE_BY_CURRENT_LEVEL: Record<number, number> = {
        1: 5,
        2: 100,
        3: 200,
        4: 300,
        5: 400,
        6: 500,
        7: 600,
        8: 700,
        9: 800,
        10: 900,
        11: 1000,
    };

    private MAX_BOOST_LEVEL_BY_KEY: Record<string, number> = {
        paintReward: 7,
        energyLimit: 6,
        reChargeSpeed: 11,
    };

    private COLORS = [
        '#6A5CFF',
        '#e46e6e',
        '#FFD635',
        '#7EED56',
        '#00CCC0',
        '#51E9F4',
        '#94B3FF',
        '#9C6926',
        '#6D001A',
        '#bf4300',
        '#000000',
        '#FFFFFF',
    ];

    private CONTENT_DATA = [
        '123,34,120,34,58,50,49,55,46,57,56,48,54,52,51,52,57,57,49,50,57,54,44,34,121,34,58,51,50,50,48,46,56,49,50,52,57,51,51,57,52,53,53,55,52,125',
        '123,34,120,34,58,51,51,54,46,55,52,48,55,55,57,56,55,49,54,51,52,52,44,34,121,34,58,54,49,56,49,46,55,51,55,52,55,56,52,52,50,49,52,52,125',
        '123,34,120,34,58,49,52,46,50,57,50,55,48,50,48,53,54,50,50,52,52,54,44,34,121,34,58,54,53,46,52,49,53,57,52,55,54,53,57,52,51,51,50,57,125',
        '123,34,120,34,58,52,54,49,46,56,52,50,52,50,51,53,50,54,50,55,51,53,44,34,121,34,58,57,57,50,55,46,52,50,49,49,51,50,52,48,56,48,57,53,125',
        '123,34,120,34,58,49,51,49,46,54,49,53,52,53,51,49,52,51,52,52,55,44,34,121,34,58,49,53,49,51,46,55,48,56,56,50,50,48,48,57,48,53,56,56,125',
        '123,34,120,34,58,53,50,54,46,55,51,54,48,54,51,52,49,49,57,52,49,54,44,34,121,34,58,49,50,48,56,57,46,50,51,57,57,56,53,48,55,56,55,57,51,125',
        '123,34,120,34,58,50,49,55,46,57,56,48,54,52,51,52,57,57,49,50,57,54,44,34,121,34,58,51,50,50,48,46,56,49,50,52,57,51,51,57,52,53,53,55,52,125',
        '123,34,120,34,58,54,51,51,46,55,51,53,54,52,57,53,53,50,49,56,50,50,44,34,121,34,58,49,53,57,53,51,46,55,55,48,51,50,54,49,57,53,48,53,125',
        '123,34,120,34,58,55,55,51,46,57,51,49,53,55,50,54,55,50,54,51,51,53,44,34,121,34,58,50,49,53,51,48,46,53,50,51,56,55,50,53,52,57,50,57,54,125',
        '123,34,120,34,58,50,48,48,46,50,55,50,49,54,50,49,52,56,54,57,49,51,54,44,34,121,34,58,50,56,51,53,46,53,57,48,54,56,53,52,57,53,50,54,56,54,125',
        '123,34,120,34,58,53,53,50,46,51,52,48,50,55,52,51,55,50,52,48,56,57,44,34,121,34,58,49,50,57,56,49,46,52,48,49,51,49,53,52,56,49,55,50,50,125',
        '123,34,120,34,58,50,50,57,46,48,50,54,50,51,49,48,56,50,48,51,51,44,34,121,34,58,51,52,54,54,46,53,51,54,52,48,52,54,55,53,49,49,57,50,125',
        '123,34,120,34,58,53,50,57,46,49,54,57,49,57,57,55,51,53,52,49,50,57,44,34,121,34,58,49,50,49,55,51,46,49,56,57,52,56,52,48,54,55,57,52,51,125',
        '123,34,120,34,58,57,49,53,46,49,48,50,49,48,48,55,48,48,56,55,51,51,44,34,121,34,58,50,55,54,56,51,46,56,55,54,57,48,49,49,51,51,48,55,55,125',
        '123,34,120,34,58,49,51,54,46,52,50,53,52,54,48,55,52,49,52,56,49,50,44,34,121,34,58,49,53,57,55,46,50,49,49,57,49,56,52,57,56,57,54,50,50,125',
        '123,34,120,34,58,49,48,51,46,48,52,48,52,50,48,54,57,57,53,49,48,49,52,44,34,121,34,58,49,48,52,56,46,57,52,54,56,48,53,48,50,49,57,50,51,57,125',
        '123,34,120,34,58,50,56,55,46,56,52,50,55,50,50,51,55,49,53,53,56,55,53,44,34,121,34,58,52,56,56,53,46,50,57,54,52,51,49,54,49,51,50,57,55,53,125',
        '123,34,120,34,58,56,53,56,46,53,55,53,49,48,48,54,50,57,51,53,49,54,44,34,121,34,58,50,53,49,53,56,46,56,49,50,56,48,56,54,49,48,57,49,52,125',
        '123,34,120,34,58,50,55,46,57,50,49,49,55,48,50,50,57,49,51,52,50,48,53,44,34,121,34,58,49,53,52,46,57,49,57,52,55,53,56,48,53,53,51,51,57,125',
        '123,34,120,34,58,50,53,52,46,55,55,50,49,50,54,55,57,56,53,52,55,56,55,44,34,121,34,58,52,48,54,56,46,52,56,54,49,51,54,57,54,52,48,54,48,51,125',
        '123,34,120,34,58,54,57,54,46,50,52,56,52,54,55,57,57,57,55,48,54,54,44,34,121,34,58,49,56,51,55,50,46,55,49,51,54,57,51,50,48,54,56,49,55,125',
        '123,34,120,34,58,51,52,46,54,56,49,51,55,55,49,55,53,54,57,52,52,49,53,44,34,121,34,58,50,48,57,46,52,55,50,49,50,52,55,55,52,49,55,50,54,55,125',
        '123,34,120,34,58,56,53,46,57,56,52,57,50,54,48,56,54,50,53,54,54,52,44,34,121,34,58,55,57,57,46,51,53,56,53,49,56,51,54,55,55,55,56,55,125',
        '123,34,120,34,58,56,54,56,46,52,50,53,49,48,57,52,48,50,53,49,50,56,44,34,121,34,58,50,53,53,57,49,46,56,55,49,52,51,54,57,56,54,55,50,51,125',
        '123,34,120,34,58,57,55,51,46,54,55,48,49,48,50,56,53,54,57,53,52,55,44,34,121,34,58,51,48,51,56,50,46,51,53,53,51,52,50,57,55,56,48,49,53,125',
        '123,34,120,34,58,56,56,46,53,48,55,52,57,48,49,57,53,55,54,49,50,44,34,121,34,58,56,51,52,46,55,54,51,57,57,52,57,53,51,52,54,49,50,125',
        '123,34,120,34,58,55,53,48,46,56,51,51,52,52,52,50,50,49,49,56,49,55,44,34,121,34,58,50,48,53,55,53,46,51,57,52,57,53,50,55,50,57,50,49,51,125',
        '123,34,120,34,58,52,56,46,53,52,54,48,54,52,54,54,48,50,52,48,52,55,53,44,34,121,34,58,51,52,49,46,56,50,50,55,54,54,55,52,54,50,53,48,49,125',
        '123,34,120,34,58,56,52,55,46,52,51,50,53,48,57,53,57,51,50,49,52,51,44,34,121,34,58,50,52,54,55,48,46,53,51,53,51,54,50,54,52,49,56,51,125',
        '123,34,120,34,58,55,50,56,46,51,53,51,50,56,52,50,52,56,53,52,50,56,44,34,121,34,58,49,57,54,53,56,46,48,57,52,50,56,55,49,53,55,49,56,50,125',
    ];

    handleError(error: unknown) {
        if (isAxiosError(error)) {
            return `Axios error: ${error.status} ${error.code} ${error.message} `;
        } else {
            return error as string;
        }
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
            app_name: 'NotPixel',
            is_premium: false,
            platform: 'android',
            locale: 'en',
            client_timestamp: eventTime,
        };
    }

    createAnalyticsApi(agent: SocksProxyAgent | undefined) {
        this.analyticsApi = axios.create({
            httpAgent: agent,
            httpsAgent: agent,
            baseURL: 'https://tganalytics.xyz',
            headers: {
                accept: '*/*',
                'content-type': 'application/json',
                referrerPolicy: 'strict-origin-when-cross-origin',
                'accept-language': 'en-US;q=0.8,en;q=0.7',
                priority: 'u=1, i',
                'sec-ch-ua': '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
                'sec-ch-ua-mobile': '?1',
                'sec-ch-ua-platform': '"Android"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'cross-site',
                Origin: 'https://app.notpx.app/',
                Referrer: 'https://app.notpx.app/',
                'tga-auth-token':
                    'eyJhcHBfbmFtZSI6Ik5vdFBpeGVsIiwiYXBwX3VybCI6Imh0dHBzOi8vdC5tZS9ub3RwaXhlbC9hcHAiLCJhcHBfZG9tYWluIjoiaHR0cHM6Ly9hcHAubm90cHguYXBwIn0=!qE41yKlb/OkRyaVhhgdePSZm5Nk7nqsUnsOXDWqNAYE=',
            },
        });
    }

    createPixelApi(agent: SocksProxyAgent | undefined) {
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
                'sec-fetch-site': 'same-site',
                'User-Agent': this.account.userAgent,
                priority: 'u=1, i',
                'Referrer-Policy': 'strict-origin-when-cross-origin',
                Referer: 'https://app.notpx.app',
                Origin: 'https://app.notpx.app',
            },
        });
    }
}
