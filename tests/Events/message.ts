import { Events, Message } from "discord.js"
import type { Event } from "../../dist/client.js"

const messageEvent: Event<"messageCreate"> = {
  name: Events.MessageCreate,
  once: false,
  async execute(message: Message) {
    if (message.author.bot) return;
    const channel:any = message.client.channels.cache.get(process.env.TEST_CHANNEL!);
    if (channel?.isTextBased()) {
      await channel.send(`Hello! Received a message from ${message.author.tag}`);
    }
  }
}

export default messageEvent;
