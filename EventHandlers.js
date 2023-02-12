module.exports =
{
    onLogLine: function(str)
    {
        console.log(str);
    },

    // Called after creating the process:
    onProcessStart: function(o)
    {
        EventHandlers.onLogLine(o.name + ": Restarting." + "\n");
    },

    // Called after 60 seconds of creating the process:
    onProcessReady: function(o)
    {
        EventHandlers.onLogLine(o.name + ": Now accepting prompts." + "\n");
    },

    // Called when the process terminates:
    onProcessExit: function(o)
    {
        // ServerChannels.chat.send("Process closed.");
        // process.exit(0);
        EventHandlers.onLogLine(o.name + ": Process closed." + "\n");
    },

    // Called on a Stdout linefeed:
    onProcessData: function(o, data)
    {
        var message = data.toString().trim();

        if (message.length < 1)
            return;

        // Do something with the line of output?
        EventHandlers.onLogLine(o.name + ": " + message + "\n");
    },

    onProcessInput: function(sd, chl, input, json)
    {
        if (!FileSystem.existsSync("channels"))
            FileSystem.mkdirSync("channels");

        var options =
        {
            prompt_prefix: "",
            prompt_suffix: "",
            negative_prompt_prefix: "",
            negative_prompt_suffix: ""
        };

        var optionsFile = `./channels/${chl.name}.json`;
        if (FileSystem.existsSync(optionsFile))
                options = Libraries.load(optionsFile);
        else    FileSystem.writeFileSync(optionsFile, JSON.stringify(options, null, 4));

        EventHandlers.onLogLine("Entire input: " + input);

        json.original_input     = input;
        json.prompt             = input;
        json.negative_prompt    = "";
        json.batch_size         = 1;
        json.width              = 512;
        json.height             = 512;
        json.tiling             = false;
        json.cfg_scale          = 7;
        json.steps              = 20;

        var optRegex = /^(..*)>/;

        if (json.prompt.match(optRegex))
        {
            var optMatches  = optRegex.exec(json.prompt);
            var optPrompt   = optMatches[1];

            // Handle 4:3
            if (optPrompt.match(/(4(x|\:)3)/))
            {
                json.width = 688;
                json.height = 512;
            }

            // Handle 3:4
            if (optPrompt.match(/(3(x|\:)4)/))
            {
                json.width = 512;
                json.height = 688;
            }

            // Handle 16:9
            if (optPrompt.match(/(16(x|\:)9)/))
            {
                json.width = 912;
                json.height = 512;
            }

            // Handle 9:16
            if (optPrompt.match(/(9(x|\:)16)/))
            {
                json.width = 512;
                json.height = 912;
            }

            // Handle tiling
            if (optPrompt.match(/tiling/))
                json.tiling = true;

            if (optPrompt.match(/cfg\+/))
            {
                json.cfg_scale += 1;

                if (optPrompt.match(/cfg\+\+/))
                    json.cfg_scale += 1;
            }

            if (optPrompt.match(/cfg-/))
            {
                json.cfg_scale -= 1;

                if (optPrompt.match(/cfg--/))
                    json.cfg_scale -= 1;
            }

            if (optPrompt.match(/steps\+/))
            {
                json.steps += 10;

                if (optPrompt.match(/steps\+\+/))
                    json.steps += 10;
            }

            json.prompt = json.prompt.replace(optRegex, "");
            json.prompt = json.prompt.trim();
        }

        if (json.prompt.match(/ x[0-8]{1}$/))
        {
            var multRegex       = / x([0-8]{1})$/;
            var multiplier      = multRegex.exec(json.prompt);

            json.batch_size     = parseInt(multiplier[1]);
            json.prompt         = json.prompt.replace(multRegex, "");
        }

        if (json.prompt.indexOf(" -") > -1)
        {
            var parts               = json.prompt.split(" -");
            json.negative_prompt    = parts.pop();
            json.prompt             = parts.join(" -");

            EventHandlers.onLogLine("Negative prompt: " + json.negative_prompt);
        }

        EventHandlers.onLogLine("Positive prompt: " + json.prompt);

        //
        //  Prefixes and suffixes
        //
        if (options.prompt_prefix && options.prompt_prefix.length > 0)
            json.prompt = `${options.prompt_prefix}, ${json.prompt}`;

        if (options.prompt_suffix && options.prompt_suffix.length > 0)
            json.prompt = `${json.prompt}, ${options.prompt_suffix}`;

        EventHandlers.onLogLine("Modified positive prompt: " + json.prompt);

        if (options.negative_prompt_prefix && options.negative_prompt_prefix.length > 0)
            json.negative_prompt = `${options.negative_prompt_prefix}, ${json.negative_prompt}`;

        if (options.negative_prompt_suffix && options.negative_prompt_suffix.length > 0)
            json.negative_prompt = `${json.negative_prompt}, ${options.negative_prompt_suffix}`;

        EventHandlers.onLogLine("Modified negative prompt: " + json.negative);

        return json;
    },

    // Message being the source of the prompt, not the text
    // The prompt is the thing we pass to Stable Diffusion!
	onTextPrompt: async function(o, msg, kind = "txt2img")
	{
        if (!o.ready)
            return;

        await msg.fetch();

        var json = Libraries.load(`./txt2img.json`);

        json = EventHandlers.onProcessInput(o, msg.channel, msg.content, json);

		try
        {
        	msg.channel.sendTyping();

            // Set this to 
            StableDiffusion.needsRestart = true;

            var address = "http://127.0.0.1:" + o.port + `/sdapi/v1/txt2img`;

            o.log("Attempting to POST to " + address);

            Request.post(
                address,
                { json: json },
                function (error, response, body)
                {
                    console.log(body);

                    try
                    {
                    	var buffers = [];

                        if (Symbol.iterator in Object(body.images))
                        {
                            for (const image of body.images)
                            {
                                var timestamp   = Math.round(new Date().getTime() / 1000.0);
                                var safePrompt  = json.original_input;
                                safePrompt      = safePrompt.replace(/[^A-Za-z0-9\- ]/, "");

                                for (const word of BadWords)
                                    if (safePrompt.toLowerCase().indexOf(word.toLowerCase()) > -1)
                                        safePrompt = "SPOILER_" + safePrompt;

                                buffers.push({
                                	attachment: new Buffer.from(image, "base64"),
                                    name: safePrompt + "_" + timestamp + ".png"
                                });
                            }

                            msg.channel.send({
                            	content: json.original_input,
                            	files: buffers
                            }).then(function(x) {
                                o.needsRestart = false;
                            	x.react("♻️");
                                x.react("🔍");
                            });
                        }
                    }
                    catch (x) { o.log(x.message); }
                });
        }
        catch (x) { o.log(x.message); }

        //
        //  Timeout:
        //
        while (o.timeouts.length > 0)
            clearTimeout(o.timeouts.shift());

        var t = setTimeout(function() {
            if (o.needsRestart == true)
            {
                o.log("Timeout " + t + " caused a restart.");
                o.restart();
            }
        }, 30 * 1000);

        o.timeouts.push(t);
        o.log("Added timeout " + t + ".");
	},

    // Message being the source of the prompt, not the text
    // The prompt is the thing we pass to Stable Diffusion!
    onImagePrompt: async function(o, msg, kind = "img2img")
    {
        if (!o.ready)
            return;

        await msg.fetch();

        // A user probably uploaded it, so give the option to "reexamine."
        if (!msg.author.bot)
            msg.react("🔍");

        var json = Libraries.load(`./img2img.json`);

        json = EventHandlers.onProcessInput(o, msg.channel, msg.content, json);

        try
        {
            msg.channel.sendTyping();

            // Set this to 
            StableDiffusion.needsRestart = true;

            json.init_images = [];

            for (var [k, v] of msg.attachments)
            {
                var url = v.url;
                var data = await SynchronousRequest.httpGet(url);

                data = Buffer.from(data).toString("base64");

                json.init_images.push(data);
            }

            var address = "http://127.0.0.1:" + o.port + `/sdapi/v1/img2img`;

            o.log("Attempting to POST to " + address);

            Request.post(
                address,
                { json: json },
                function (error, response, body)
                {
                    try
                    {
                        var buffers = [];

                        if (Symbol.iterator in Object(body.images))
                        {
                            for (const image of body.images)
                            {
                                var timestamp   = Math.round(new Date().getTime() / 1000.0);
                                var safePrompt  = json.original_input;
                                safePrompt      = safePrompt.replace(/[^A-Za-z0-9\- ]/, "");

                                for (const word of BadWords)
                                    if (safePrompt.toLowerCase().indexOf(word.toLowerCase()) > -1)
                                        safePrompt = "SPOILER_" + safePrompt;

                                buffers.push({
                                    attachment: new Buffer.from(image, "base64"),
                                    name: safePrompt + "_" + timestamp + ".png"
                                });
                            }

                            msg.channel.send({
                                content: json.original_input,
                                files: buffers
                            }).then(function(x) {
                                o.needsRestart = false;
                                x.react("♻️");
                                x.react("🔍");
                            });
                        }
                    }
                    catch (x) { o.log(x.message); }
                });
        }
        catch (x) { o.log(x.message); }

        //
        //  Timeout:
        //
        while (o.timeouts.length > 0)
            clearTimeout(o.timeouts.shift());

        var t = setTimeout(function() {
            if (o.needsRestart == true)
            {
                o.log("Timeout " + t + " caused a restart.");
                o.restart();
            }
        }, 30 * 1000);

        o.timeouts.push(t);
        o.log("Added timeout " + t + ".");
    },

	onMessageReact: async function(r, user)
	{
        var reaction    = await r.fetch();
        var message     = await reaction.message.fetch();
        var ins         = StableDiffusion.getInstanceByChannel(message.channel);

        if (ins != null)
        {
            switch (reaction._emoji.name)
            {
                case "♻️":
                    //for (const entry of StableDiffusion.prompts)
                    //  if (reaction.message.id == entry.id)
                    //      EventHandlers.onPrompt(entry.prompt);
                    EventHandlers.onTextPrompt(ins, message);
                    break;

                case "🔍":
                    //for (const entry of StableDiffusion.prompts)
                    //  if (reaction.message.id == entry.id)
                    //      EventHandlers.onPrompt(entry.prompt);
                    EventHandlers.onImagePrompt(ins, message);
                    break;
            }
        }
	},

	onMessageCreate: async function(msg)
	{
        var message = await msg.fetch();
        var ins     = StableDiffusion.getInstanceByChannel(message.channel);

        if (ins != null)
        {
            var formatted =
                message.content
                    .trim()
                    .toLowerCase();

            switch (formatted)
            {
                case "restart":
                    i.restart(message);
                    break;

                default:
                    if (message.attachments.size > 0)
                            EventHandlers.onImagePrompt(ins, message);
                    else    EventHandlers.onTextPrompt(ins, message);
            }
        }
	}
};
