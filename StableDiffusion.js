module.exports =
{
    instances: [],

    newInstance: function(checkpoint, channels)
    {
        var o = 
        {
            name: checkpoint,
            channels: channels,
            process: null,
            port: null,
            launched: false,
            ready: false,
            needsRestart: false,
            timeouts: [],

            log: function(str)
            {
                if (typeof EventHandlers === "object")
                    if (typeof EventHandlers.onLogLine === "function")
                        EventHandlers.onLogLine(o.name + ": " + str);
            },

            getProcess: function()
            {
                if (o.process !== null)
                    return o.process;

                o.port = 8000 + Math.floor(Math.random() * 999);
                o.log("Serving on port " + o.port);

                o.ready           = false;
                o.needsRestart    = false;
                o.process         = Process.spawn(
                    "cmd",
                    ["/C", "webui.bat", "--api", "--listen", ("--port " + o.port), ("--ckpt .\\models\\Stable-diffusion\\" + checkpoint)],
                    {
                        shell: true,
                        cwd: Settings.path
                    });

                Libraries.reload();

                o.process.on("exit",        function() { EventHandlers.onProcessExit(o); });
                o.process.stdout.on("data", function(data) { EventHandlers.onProcessData(o, data); });

                EventHandlers.onProcessStart(o);

                setTimeout(
                    function() {
                        o.launched = true;
                    },
                    Settings.timeBetweenInstanceLaunches * 1000);

                // Wait 60 seconds:
                setTimeout(
                    function() {
                        o.ready = true;
                        EventHandlers.onProcessReady(o);
                    },
                    Settings.timeAfterInstanceLaunch * 1000);

                return o.process;
            },

            restart: function()
            {
                try
                {
                    o.process.kill("SIGINT");
                    o.process = null;
                    o.getProcess();
                }
                catch (x) { console.log(x); }
            }
        };

        return o;
    }
};
