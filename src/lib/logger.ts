export default class logger {
    private static format(message: string): string {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] ${message}`;
    }

    static output(message: string) {
        console.log(this.format(message));
    }

    static warn(message: string) {
        console.warn(`\x1b[33m${this.format(message)}\x1b[0m`); // yellow
    }

    static error(message: string) {
        console.error(`\x1b[31m${this.format(message)}\x1b[0m`); // red
    }
}
