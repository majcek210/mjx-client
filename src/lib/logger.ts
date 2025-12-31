export default class logger {
  private static format(message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] ${message}`;
  }

  static output(...messages: any[]) {
    console.log(this.format(messages.map(String).join(" ")));
  }

  static warn(...messages: any[]) {
    console.warn(`\x1b[33m${this.format(messages.map(String).join(" "))}\x1b[0m`);
  }

  static error(...messages: any[]) {
    console.error(`\x1b[31m${this.format(messages.map(String).join(" "))}\x1b[0m`);
  }
}
