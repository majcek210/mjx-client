import "dotenv/config"
import Client from "../src/client.js"

const client = new Client({ debug: true })
    .setName("tuff bot")

client.discord.on("messageCreate", (msg:any) => {
    if (msg.content === "!ping") msg.reply("pong")
})

await client.start(process.env.TOKEN)
