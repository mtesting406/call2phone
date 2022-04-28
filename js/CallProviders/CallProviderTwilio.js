/**
 * Communication through Twilio
 */
/* jshint expr: true */
var CallProviderTwilio = function () {
    var DEBUG = true; // For showing console logs for this component.

    // Twilio device configuration
    var deviceCfg = {
        debug: false,
        allowIncomingWhileBusy: false
    };

    var log,
        cfg,
        device,
        callbacks,
        token,
        identity,
        connection;

    /**
     * Initialize Twilio client
     *
     * @param cfgObj - The Twilio configuration object
     * @param callbacksObj - Event callbacks
     * @param logFunction - Optional external function used for logging
     */
    function init(cfgObj, callbacksObj, logFunction) {
        // Set log to provided function or if not available, use the default one
        log = logFunction || function (message) {
            console.log(message);
        };

        cfg = cfgObj;
        callbacks = callbacksObj;

        // noinspection JSUnresolvedVariable
        $.getJSON(cfg.capabilityTokenFunctionURL)
            .then(function (data) {
                    token = data.token;
                    // noinspection JSUnresolvedVariable
                    identity = data.identity;

                    // noinspection JSUnresolvedVariable
                    DEBUG && console.log('Twilio Data (Token): ', data);

                    // Setup Twilio.Device
                    device = new Twilio.Device();
                    device.setup(data.token, deviceCfg);

                    device.on('ready', function () {
                        if (callbacks.ready) {
                            callbacks.ready();
                        }
                    });

                    device.on('error', function (error) {
                        if (callbacks.error) {
                            callbacks.error(error.message);
                        }
                    });

                    device.on('connect', function (conn) {
                        connection = conn;

                        if (callbacks.connected) {
                            callbacks.connected(conn.getRemoteStream(), conn.getLocalStream(), conn);
                        }

                        bindVolumeIndicators(conn);
                    });

                    device.on('disconnect', function () {
                        connection = undefined;

                        if (callbacks.disconnected) {
                            callbacks.disconnected();
                        }
                    });

                    device.on('incoming', function (conn) {
                        connection = conn;

                        if (callbacks.incoming) {
                            callbacks.incoming(conn.parameters.From);
                        }
                    });
                }
            ).catch(function (ex) {
            console.error(ex);
            log('Twilio token error' + ex);
            if (callbacks.exception) {
                callbacks.exception(ex);
            }
            connection = undefined;
        });
    }

    /**
     *
     */
    function answer() {
        // Accept the incoming connection
        if (connection) {
            connection.accept();
        }
    }

    /**
     *
     */
    function hangup() {
        if (device) {
            device.disconnectAll();
        }
    }

    /**
     *
     * @param destination
     */
    function call(destination) {
        var params = {
            To: destination
        };

        if (device) {
            device.connect(params);
        }
    }


// noinspection JSUnusedLocalSymbols
    /**
     *
     * @param connection
     */
    function bindVolumeIndicators(connection) {
        if (callbacks.volume) {
            connection.on('volume', function (inputVolume, outputVolume) {
                callbacks.volume(inputVolume, outputVolume);
            });
        }
    }

    /**
     *
     * @returns {boolean}
     */
    function supportsVolumeIndicators() {
        return true;
    }


    return {
        init: init,
        answer: answer,
        hangup: hangup,
        call: call,
        supportsVolumeIndicators: supportsVolumeIndicators
    };
};