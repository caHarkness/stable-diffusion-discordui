module.exports =
{
    register: function(ins)
    {
        EventHandlers.onLogLine("StableDiffusion.register(): " + ins.name);

        try
        {
            if (typeof(InstanceRegistry) === "undefined")
                InstanceRegistry = [];

            for (var exi of InstanceRegistry)
            {
                var index = InstanceRegistry.indexOf(exi);

                if (exi.name == ins.name)
                {
                    exi.destroy();
                    exi = null;
                    delete InstanceRegistry[index];
                }
            }

            InstanceRegistry.push(ins);
        }
        catch (x)
        {
            console.log(x);
        }
    },

    //
    //
    //  START OF INSTANCE
    //
    //

    create: function(checkpoint, channels)
    {
        EventHandlers.onLogLine("StableDiffusion.create(): " + checkpoint);

        var ins = 
        {
            name:           checkpoint,
            channels:       channels,
            process:        null,
            port:           null,
            launched:       false,
            ready:          false,
            needsRestart:   false,
            timeouts:       [],

            log: function(str)
            {
                if (typeof EventHandlers === "object")
                    if (typeof EventHandlers.onLogLine === "function")
                        EventHandlers.onLogLine(ins.name + ": " + str);
            },

            getProcess: function()
            {
                if (ins.process !== null)
                    return ins.process;

                ins.port = 8000 + Math.floor(Math.random() * 999);
                ins.log("Serving on port " + ins.port);

                ins.ready           = false;
                ins.needsRestart    = false;
                ins.process         = Process.spawn(
                    "cmd",
                    ["/C", "webui.bat", "--api", "--listen", ("--port " + ins.port), ("--ckpt .\\models\\Stable-diffusion\\" + checkpoint)],
                    {
                        shell: true,
                        cwd: Settings.path
                    });

                Libraries.reload();

                ins.process.on("exit",        function() { EventHandlers.onProcessExit(ins); });
                ins.process.stdout.on("data", function(data) { EventHandlers.onProcessData(ins, data); });
                ins.process.stderr.on("data", function(data) { EventHandlers.onProcessData(ins, data); });

                EventHandlers.onProcessStart(ins);

                setTimeout(
                    function() {
                        ins.launched = true;
                    },
                    Settings.timeBetweenInstanceLaunches * 1000);

                // Wait 60 seconds:
                setTimeout(
                    function() {
                        ins.ready = true;
                        EventHandlers.onProcessReady(ins);
                    },
                    Settings.timeAfterInstanceLaunch * 1000);

                return ins.process;
            },

            restart: function()
            {
                try
                {
                    ins.process.kill("SIGINT");
                    ins.process = null;
                    ins.getProcess();
                }
                catch (x) { console.log(x); }
            },

            destroy: function()
            {
                try
                {
                    ins.process.kill("SIGINT");
                    ins.process = null;
                }
                catch (x)
                {
                    console.log(x);
                }
            }
        };

        return ins;
    },

    //
    //
    //  END OF INSTANCE
    //
    //

    getInstanceByName: function(str)
    {
        EventHandlers.onLogLine(`Looking for instance by name '${str}'`);

        try
        {
            if (typeof(InstanceRegistry) === "undefined")
                InstanceRegistry = [];

            for (var ins of InstanceRegistry)
                if (ins.name == str)
                {
                    EventHandlers.onLogLine(`Found instance by name '${str}'`);
                    return ins;
                }
        }
        catch (x) { console.log(x); }
        return null;
    },

    getInstanceByChannel: function(chl)
    {
        try
        {
            var name = "";

            switch (typeof(chl))
            {
                case "string":
                    name = chl;
                    break;

                case "object":
                    if (chl.name)
                        name = chl.name;
                    break;

                default:
                    throw new Exception("chl is of unexpected type");
            }

            EventHandlers.onLogLine(`Looking for instance by channel name '${name}'`);

            if (typeof(InstanceRegistry) === "undefined")
                InstanceRegistry = [];

            // Try looking through our registry in memory:
            for (var ins of InstanceRegistry)
                for (var cn of ins.channels)
                    if (cn == name)
                    {
                        EventHandlers.onLogLine(`Found instance by channel name '${name}'`);
                        return ins;
                    }

            EventHandlers.onLogLine(`No instance found by channel name '${name}', searching the settings file...`);

            // Try looking in the settings:
            Settings = Libraries.load("./settings.json");

            for (var ckpt of Settings.checkpoints)
                for (var cn of ckpt.channels)
                    if (cn == name)
                        return StableDiffusion.getInstanceByName(ckpt.name);
        }
        catch (x) { console.log(x); }
        return null;
    }
};
