Settings = require("./settings.json");

Discord     = require("discord.js");
Process     = require("child_process");
Request     = require("request");
FileSystem  = require("fs");

try
{  
    BadWords = FileSystem.readFileSync("BadWords.txt", "utf8");
    BadWords = BadWords.toString();
    BadWords = BadWords.trim();
    BadWords = BadWords.split("\n");
}
catch (x) { console.log(x); }

Libraries =
{
    required: [],

    load: function(str)
    {
        if (Libraries.required.indexOf(str) == -1)
            Libraries.required.push(str);

        delete require.cache[require.resolve(str)];

        var library = require(str);

        if (typeof library.onLoad === "function")
            library.onLoad();

        if (typeof EventHandlers === "object")
            if (typeof EventHandlers.onLogLine === "function")
                EventHandlers.onLogLine("Loaded: " + str);

        return library;
    },

    reload: function()
    {
        // for (const lib of Libraries.required)
        //     Libraries.load(lib);

        // Libraries are relative to this script's directory, not the current working directory:
        Settings        = Libraries.load("./settings.json");
        EventHandlers   = Libraries.load("./EventHandlers.js");
        StableDiffusion = Libraries.load("./StableDiffusion.js");
    }
};

Libraries.reload();

try
{
    Stats = Libraries.load("./stats.json");
}
catch (x)
{
    Stats = {};
}

Bot = new Discord.Client({
    intents: [
        Discord.GatewayIntentBits.Guilds,
        Discord.GatewayIntentBits.GuildMessages,
        Discord.GatewayIntentBits.MessageContent,
        Discord.GatewayIntentBits.GuildMessageReactions,
        Discord.GatewayIntentBits.GuildMembers,
    ],

    partials: [
        Discord.Partials.Message,
        Discord.Partials.Channel,
        Discord.Partials.Reaction
    ]
});

Bot.login(Settings.token);

BotReady                    = false;
StableDiffusionInstances    = [];
TaskQueue                   = [];
TaskQueueIntervalId         = null;

Bot.on(
    "ready",
    async () => {
        Bot.user.setPresence({
            status: "online",
        });
        
        Bot.user.setActivity(Settings.playing);

        for (var c of Settings.checkpoints)
        {
            const name      = c.name;
            const channels  = c.channels;

            var task = function()
            {
                var o = StableDiffusion.newInstance(name, channels);
                o.getProcess();
                StableDiffusionInstances.push(o);
                EventHandlers.onLogLine("New stable diffusion instance: " + name);
            }

            TaskQueue.push(task);
        }

        TaskQueueIntervalId = setInterval(function() {
            if (TaskQueue.length > 0)
            {
                var task = TaskQueue.shift();

                if (typeof task === "function")
                    task();
            }
            else
            {
                EventHandlers.onLogLine("Task queue empty.");
                clearInterval(TaskQueueIntervalId);
            }
        }, Settings.timeBetweenInstanceLaunches * 1000);

        BotReady = true;
    });

Bot.on(
    "messageCreate",
    async (msg) => {
        if (!BotReady || msg.author.bot || msg.system)
            return;

        Libraries.reload();
        EventHandlers.onMessageCreate(msg);
    });

Bot.on(
    "messageReactionAdd",
    async (reaction, user) => {
        if (!BotReady || user.bot)
            return;

        Libraries.reload();
        EventHandlers.onMessageReact(reaction, user);
    });
