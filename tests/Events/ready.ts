import { Events} from "discord.js"

const readyEvent: any = {
  name: Events.ClientReady,
  once: true,
  execute(client: any) {
    console.log(`Ready! Logged in as ${client.user.tag}`)
  }
}

export default readyEvent
