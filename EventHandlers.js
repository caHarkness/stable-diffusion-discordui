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

    // Message being the source of the prompt, not the text
    // The prompt is the thing we pass to Stable Diffusion!
	onPrompt: function(o, msg, kind = "txt2img")
	{
        if (!o.ready)
            return;

        var input       = msg.content;
        var prompt      = msg.content;
        var negative    = "";
        var batch_size  = 1;

        if (input.match(/ x[0-8]{1}$/))
        {
            var multRegex   = / x([0-8]{1})$/;
            var multiplier  = multRegex.exec(input);

            batch_size  = parseInt(multiplier[1]);
            prompt      = prompt.replace(multRegex, "");
        }

        if (prompt.indexOf(" -") > -1)
        {
            var parts   = prompt.split(" -");
            negative    = parts.pop();
            prompt      = parts.join(" -");
        }

		try
        {
            EventHandlers.onLogLine("Entire input: " + input);
        	EventHandlers.onLogLine("Positive prompt: " + prompt);

            if (negative.length > 0)
                console.log("Negative prompt: " + negative);

            if (batch_size > 1)
                console.log("Batch size: " + batch_size);
            
        	msg.channel.sendTyping();

            // Set this to 
            StableDiffusion.needsRestart = true;

            // Read the txt2img file for the POST:
            var json = Libraries.load("./txt2img.json");

            json.prompt             = prompt;
            json.negative_prompt    = negative;
            json.batch_size         = batch_size;

            var address = "http://127.0.0.1:" + o.port + "/sdapi/v1/txt2img";

            o.log("Attempting to POST to " + address);

            Request.post(
                address,
                { json: json },
                function (error, response, body)
                {
                    try
                    {
                    	var buffers = [];

                        for (const image of body.images)
                        {
                            var timestamp   = Math.round(new Date().getTime() / 1000.0);
                            var safePrompt  = input;
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
                        	content: input,
                        	files: buffers
                        }).then(function(x) {
                            o.needsRestart = false;
                        	x.react("♻️");
                        });
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
        var reaction = await r.fetch();
        var message = await reaction.message.fetch();

        for (var i of StableDiffusionInstances)
        {
            i.log("Message Channel Name: " + message.channel.name);
            i.log("Instance channels: " + JSON.stringify(i.channels));

            if (i.channels.indexOf(message.channel.name) < 0)
                continue;

            i.log("Made it here");

            switch (reaction._emoji.name)
            {
                case "♻️":
                    //for (const entry of StableDiffusion.prompts)
                    //  if (reaction.message.id == entry.id)
                    //      EventHandlers.onPrompt(entry.prompt);
                    EventHandlers.onPrompt(i, message);
                    break;
            }
        }
	},

	onMessageCreate: async function(msg)
	{
        var message = await msg.fetch();

        for (var i of StableDiffusionInstances)
        {
            if (i.channels.indexOf(message.channel.name) > -1)
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
                        EventHandlers.onPrompt(i, message);
                }
            }
        }
	}
};
