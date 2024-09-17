export class BaseLogger {
    constructor(private prefix: string) {}

    log(...message: any[]) {
        console.log(this.makePrefix(), ...message);
    }

    warn(...message: any[]) {
        console.warn(this.makePrefix(), ...message);
    }

    error(...message: any[]) {
        console.error(this.makePrefix(), ...message);
    }

    get currentTime() {
        return new Date().toISOString();
    }

    private makePrefix() {
        return `${this.currentTime} [${this.prefix.toUpperCase()}]`;
    }
}

export const baseLogger = new BaseLogger('APP');