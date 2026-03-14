function fmt(m: unknown): string {
  if (m instanceof Error) return m.stack ?? m.message;
  return String(m);
}

const colored = process.stdout.isTTY === true;

export default class logger {
  private static format(message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] ${message}`;
  }

  static output(...messages: unknown[]): void {
    console.log(this.format(messages.map(fmt).join(" ")));
  }

  static warn(...messages: unknown[]): void {
    const line = this.format(messages.map(fmt).join(" "));
    console.warn(colored ? `\x1b[33m${line}\x1b[0m` : line);
  }

  static error(...messages: unknown[]): void {
    const line = this.format(messages.map(fmt).join(" "));
    console.error(colored ? `\x1b[31m${line}\x1b[0m` : line);
  }
}
