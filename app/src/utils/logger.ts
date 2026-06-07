export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class LogManager {
    private moduleName: string;
    // Vite injects import.meta.env.DEV
    private isDev = (import.meta as any).env ? (import.meta as any).env.DEV : true;

    constructor(moduleName: string) {
        this.moduleName = moduleName;
    }

    private formatMsg(level: LogLevel, msg: string) {
        const time = new Date().toISOString().split('T')[1].slice(0, -1);
        return `[${time}] [${level.toUpperCase()}] [${this.moduleName}] ${msg}`;
    }

    debug(msg: string, ...args: any[]) {
        if (this.isDev) {
            console.debug(this.formatMsg('debug', msg), ...args);
        }
    }

    info(msg: string, ...args: any[]) {
        if (this.isDev) {
            console.info(this.formatMsg('info', msg), ...args);
        }
    }

    warn(msg: string, ...args: any[]) {
        console.warn(this.formatMsg('warn', msg), ...args);
    }

    error(msg: string, ...args: any[]) {
        console.error(this.formatMsg('error', msg), ...args);
    }
}

export function createLogger(moduleName: string) {
    return new LogManager(moduleName);
}
