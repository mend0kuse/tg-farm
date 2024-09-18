export class BaseLogger {
    constructor(private prefix: string) {}

    log(...message: any[]) {
        console.log(this.makePrefix(), ...message);
    }

    accentLog(...message: any[]) {
        const res = `
        ----------
        ----------
            ${this.makePrefix()} ${message.join(', ')}}
        ----------
        ----------
        `;

        console.log(res);
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
