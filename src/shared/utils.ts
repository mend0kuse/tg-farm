import readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

export const terminalPrompt = (query: string): Promise<string> => {
    return new Promise((res) => rl.question(query, res));
};

export const random = (min: number, max: number) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

export const randomArrayItem = <T>(array: T[]): T => {
    return array[random(0, array.length - 1)];
};

export const sleep = (seconds: number) => {
    return new Promise((res) => setTimeout(res, seconds * 1000));
};

export const shuffleArray = (array: any[]) => {
    for (var i = array.length - 1; i >= 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
};

export type TSocks5Proxy = {
    type: 'socks5';
    login: string;
    password: string;
    ip: string;
    port: number;
};

export const parseSocks5Proxy = (url: string): TSocks5Proxy | null => {
    const regex = /^socks5:\/\/([^:]+):([^@]+)@([^:]+):(\d+)$/;
    const match = url.match(regex);

    if (match) {
        const [_, login, password, ip, port] = match;
        return {
            type: 'socks5',
            login,
            password,
            ip,
            port: Number(port),
        };
    } else {
        return null;
    }
};
