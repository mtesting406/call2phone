/**
 * For communicating through Plivo
 */
/* jshint expr: true */
var CallProviderPlivo = function () {
    var DEBUG = true; // For showing console logs for this component.

    var plivoOptions = {
        "debug": "DEBUG",
        "permOnClick": true,
        "enableTracking": true
    };

    var log,
        cfg,
        callbacks,
        plivo,
        callInfo;

    /**
     * Initialize Plivo client
     *
     * @param cfgObj - The configuration object for Plivo
     * @param callbacksObj - Callbacks for call control
     * @param logFunction - Optional external function used for logging
     */
    function init(cfgObj, callbacksObj, logFunction) {
        // Set log to provided function or if not available, use the default one
        log = logFunction || function (message) {
            console.log(message);
        };

        cfg = cfgObj;
        callbacks = callbacksObj;

        plivo = new window.Plivo(plivoOptions);

        plivo.client.on('onWebrtcNotSupported', function () {
            if (callbacks.error) {
                callbacks.error("WebRTC is not supported on this browser!");
            }
        });

        plivo.client.on('onLogin', function () {
            if (callbacks.ready) {
                callbacks.ready();
            }
        });

        plivo.client.on('onLogout', function () {
        });

        plivo.client.on('onLoginFailed', function (reason) {
            if (callbacks.error) {
                callbacks.error("Failed to login to Plivo: " + reason);
            }
        });

        plivo.client.on('onCallRemoteRinging', function (callInfoObj) {
            callInfo = callInfoObj;

            if (callbacks.incoming) {
                callbacks.incoming();
            }
        });

        // noinspection JSUnusedLocalSymbols
        plivo.client.on('onIncomingCallCanceled', function (callInfoObj) {
            callInfo = undefined;

            if (callbacks.disconnected) {
                callbacks.disconnected();
            }
        });

        // noinspection JSUnusedLocalSymbols
        plivo.client.on('onCallFailed', function (reason, callInfoObj) {
            if (callbacks.error) {
                callbacks.error("Failed call: " + reason);
            }
            hangup();
        });

        // noinspection JSUnusedLocalSymbols
        plivo.client.on('onCallAnswered', function (callInfoObj) {
            var pcObj = plivo.client.getPeerConnection();
            if (pcObj.pc && !window.localStream) {
                DEBUG && console.log(pcObj.pc);
                var stream = pcObj.pc.getRemoteStreams()[0];
                if (callbacks.connected) {
                    callbacks.connected(stream);
                }
            }
        });

        // noinspection JSUnusedLocalSymbols
        plivo.client.on('onCallTerminated', function (evt, callInfoObj) {
            callInfo = undefined;

            if (callbacks.disconnected) {
                callbacks.disconnected();
            }
        });

        plivo.client.on('onCalling', function () {
            if (callbacks.ringing) {
                callbacks.ringing();
            }
        });

        plivo.client.on('onIncomingCall', function (callerName, extraHeaders, callInfoObj) {
            DEBUG && console.log("Plivo incoming call", callerName, extraHeaders, callInfoObj);

            callInfo = callInfoObj;

            if (callbacks.incoming) {
                callbacks.incoming(); // todo: Add from number to call to callback
            }
        });

        plivo.client.on('onMediaPermission', function () {
            DEBUG && console.log("Plivo media permission");
        });

        plivo.client.on('mediaMetrics', function () {
            DEBUG && console.log("Plivo media metrics");
        });

        plivo.client.on('onConnectionChange', function () {
            console.log("Plivo connection change");
        });

        DEBUG && console.log("Logging into Plivo with " + cfg.username);
        plivo.client.login(cfg.username, cfg.password);
    }

    /**
     *
     */
    function answer() {
        if (callInfo) {
            plivo.client.answer(callInfo.callUUID);
        }
        else {
            plivo.client.answer();
        }
    }

    /**
     *
     */
    function hangup() {
        // todo: Hangup plivo call
    }

    /**
     *
     * @returns {boolean}
     */
    function supportsVolumeIndicators() {
        return false;
    }


    /**
     *
     * @param destination
     */
    function call(destination) {
        // todo: Implement outgoing calls
        console.warn('CallProviderPlivo.call is not implemented! A call to ' + destination + ' will not be ' +
            'performed.');
    }

    return {
        init: init,
        answer: answer,
        hangup: hangup,
        call: call,
        supportsVolumeIndicators: supportsVolumeIndicators
    };
};
