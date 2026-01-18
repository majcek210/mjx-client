import "dotenv/config"
import Client from "../src/client.js"

const client = new Client({ debug: true })
    .setName("tuff bot")
    
client.registerEventsRoute("./dist/tests/Events")
client.registerCommandsRoute("./dist/tests/Commands")

client.discord.on("messageCreate", (msg:any) => {
    if (msg.content === "!ping") msg.reply("pong")
})
client.discord.once("ready", () => {
    setTimeout(() => {
        process.exit(0)
    }, 20000)
})

client.start(process.env.TOKEN)
client.pushCommands(process.env.TOKEN)
