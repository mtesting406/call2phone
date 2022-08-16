/**
 * For communicating with the WWTC API
 *
 * @type {{requestAudioTTS, init, translateSpeech, translateText}}
 */

/* jshint expr: true */
var TYWI = (function() {
    var DEBUG = true, // For showing console logs for this component.

        API_CALL_TIMEOUT = 10000, // Timeout in ms when waiting for responses.

        API_CALL_TYPES = {
            TRANSCRIBE: 10,
            TRANSLATE: 20,
            TTS: 30
        };

    var started = false,
        tokenizer = [],
        translationVendorTranscription,
        translationVendorTranslation,
        translationVendorTTS,
        apiCallQueue = [],
        apiCallIdx = 0,
        log,
        cfg;

    /**
     * Initialize WWTC API.
     *
     * @param cfgObj The configuration for this component.
     * @param logFunction - Optional external function used for logging
     */
    function init(cfgObj, logFunction) {

        cfg = cfgObj;

        log = logFunction || function(message) {
            DEBUG && console.log(message);
        }; // Set log to provided function or if not available, use the default one

        // noinspection JSUnresolvedVariable
        translationVendorTranscription = cfg.speech.vendor || "Microsoft";
        translationVendorTranslation = cfg.translate.vendor || "Microsoft";
        translationVendorTTS = cfg.speak.vendor || "Microsoft";

        // Request token to WWTC API
        // noinspection JSCheckFunctionSignatures
        // noinspection JSUnresolvedVariable
        Promise.all([
                ajax(cfg.speech.translateyourworldapi),
                ajax(cfg.translate.translateyourworldapi),
                ajax(cfg.speak.translateyourworldapi)
            ])
            .then(function(response) {
                tokenizer[0] = response[0].token;
                tokenizer[1] = response[1].token;
                tokenizer[2] = response[2].token;

                for (var i = 0; i < tokenizer.length; i++) {
                    DEBUG && console.log("WWTC.init - Token for WWTC API speech recognition service #" + i + ": " + tokenizer[i]);
                }

            })
            .catch(function(err) {
                console.error("WWTC.init error", err);
                handleTYWIAPIResponseError(null, err);
            });

        log("WWTC init - Successful!");
    }


    /**
     * Handle ajax request (Promise)
     *
     * @param   apiKey   String    apiKey to request token
     * @return Promise
     */
    function ajax(apiKey) {
        return new Promise(function(resolve, reject) {
            var request = {
                'async': true,
                'crossDomain': true,
                'url': 'https://api.worldwidetechconnections.com/api/Session',
                'method': 'GET',
                'headers': {
                    'authorization': apiKey
                }
            };
            $.ajax(request).done(resolve).fail(reject);
        });
    }

    /**
     * Translate the text.
     *
     * @param text The text to translate.
     * @param fromLanguage From which language to translate.
     * @param toLanguage To which language to translate.
     * @param successCallback Callback for successfully translated text.
     * @param errorCallback Callback for errors during translation of the text.
     */
    function translateText(text, fromLanguage, toLanguage, successCallback, errorCallback) {
        // noinspection JSUnresolvedVariable
        var apiKeyVendor = cfg.translate.translateyourworldapi;
        var vendor = translationVendorTranslation;
        var token = tokenizer[1];
        // noinspection JSAnnotator
        var url = "text=" + text + "&sourceLanguage=" + fromLanguage + "&targetLanguage=" + toLanguage + "&vendor=" + vendor + "&token=" + token;

        var callIdx = apiCallIdx;
        queueAPICall(callIdx, TYWI.API_CALL_TYPES.TRANSLATE, successCallback, errorCallback);

        // noinspection JSAnnotator
        var settings = {
            "async": true,
            "crossDomain": true,
            "url": 'https://api.worldwidetechconnections.com/api/Translation?' + url,
            "method": "GET",
            "headers": {
                "authorization": apiKeyVendor
            },
            "localItem": callIdx,
            "success": function(response) {
                DEBUG && console.log("WWTC.translateText [resp] " + callIdx + "/" + this.localItem + " = ", response);
                // noinspection JSUnresolvedVariable
                handleTYWIAPIResponse(this.localItem, response.targetText);
            },
            error: function(xhr, ajaxOptions, thrownError) {
                if (errorCallback) errorCallback(thrownError);
            }
        };

        $.ajax(settings);
        apiCallIdx++;
    }

    /**
     * Transcribe speech from phone to text with API TYWI
     *
     * @param wav The WAV audio with speech to translate
     * @param language The speech language
     * @param successCallback
     * @param errorCallback
     */
    function transcribeSpeech(wav, language, successCallback, errorCallback) {
        // noinspection JSUnresolvedVariable
        var apiKeyVendor = cfg.speech.translateyourworldapi;
        var fromLanguage = "sourceLanguage=" + language;
        var vendor = "vendor=" + translationVendorTranscription;
        var token = "token=" + tokenizer[0];
        var url = "https://api.worldwidetechconnections.com/api/SpeechToText?" + token + "&" + vendor + "&" + fromLanguage;

        var callIdx = apiCallIdx;
        queueAPICall(callIdx, TYWI.API_CALL_TYPES.TRANSCRIBE, successCallback, errorCallback);

        var form = new FormData();
        form.append("file", wav, "ORIGINAL.wav");
        var settings = {
            "async": true,
            "crossDomain": true,
            "url": url,
            "method": "POST",
            "headers": {
                "authorization": apiKeyVendor
            },
            "processData": false,
            "contentType": false,
            "mimeType": "multipart/form-data",
            "data": form,
            "localItem": callIdx,
            "success": function(response) {
                var obj = JSON.parse(response);
                DEBUG && console.log("WWTC.transcribeSpeech [resp] " + callIdx + "/" + this.localItem + " = ", response);
                // noinspection JSUnresolvedVariable
                handleTYWIAPIResponse(this.localItem, obj);
            },
            error: function(xhr, ajaxOptions, thrownError) {
                if (errorCallback) errorCallback(thrownError);
            }
        };
        $.ajax(settings);
        apiCallIdx++;
    }

    /**
     * Speech To Text
     *
     * @param msg The text to run through TTS.
     * @param language The language.
     * @param useVoice The voice to use.
     * @param successCallback The callback that will receive the resulting mp3 file.
     * @param errorCallback The callback for error situations.
     */
    function requestAudioTTS(msg, language, useVoice, successCallback, errorCallback) {
        useVoice = useVoice || 'en_gb_brian'; // Default synthetic voice

        // noinspection JSUnresolvedVariable
        var apiKeyVendor = cfg.speak.translateyourworldapi;
        var vendor = "vendor=" + translationVendorTTS;
        var token = "token=" + tokenizer[2];
        var voice = "voice=" + useVoice;
        var text = "text=" + msg;
        var fromLanguage = "sourcelanguage=" + language;

        var url = "https://api.worldwidetechconnections.com/api/TextToSpeech?" + text + "&" + fromLanguage + "&" + vendor + "&" + token + "&" + voice;

        var callIdx = apiCallIdx;
        queueAPICall(callIdx, TYWI.API_CALL_TYPES.TTS, successCallback, errorCallback);

        // Create response to API Server
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url);
        xhr.responseType = 'arraybuffer';

        // noinspection JSUndefinedPropertyAssignment
        xhr.localItem = callIdx;
        xhr.onload = function() {
            if (this.status === 200) {
                var blob = new Blob([this.response], { type: 'audio/mp3' });
                DEBUG && console.log("WWTC.requestAudioTTS [resp] " + callIdx + "/" + xhr.localItem + " = ", blob);
                handleTYWIAPIResponse(xhr.localItem, blob);
            }
        };
        xhr.onerror = function(err) {
            if (errorCallback) errorCallback(err);
        };
        xhr.ontimeout = function(err) {
            if (errorCallback) errorCallback(err);
        };
        xhr.onabort = function(err) {
            if (errorCallback) errorCallback(err);
        };
        xhr.setRequestHeader('Authorization', apiKeyVendor);
        xhr.send();
        apiCallIdx++;
    }

    /**
     * Queues an API call so that it later can be matched to an API response.
     *
     * @param id The unique id of the API call.
     * @param type The type of API call.
     * @param successCB An optional success callback for the API call.
     * @param errorCB An optional error callback for the API call.
     */
    function queueAPICall(id, type, successCB, errorCB) {
        apiCallQueue.push({
            id: id,
            type: type,
            successCB: successCB,
            errorCB: errorCB,
            timestamp: new Date().getTime()
        });
    }

    /**
     * Runs continously when started, and processes the WWTC API call queue in the correct order.
     */
    function processTYWIAPIResponses() {
        if (started) {
            var interval = 100; // milliseconds

            try {
                if (apiCallQueue && apiCallQueue.length > 0) { // Are there anything to playback in the queue?

                    // Have we got a response yet for the first call?
                    if (apiCallQueue[0].response) {
                        var item = apiCallQueue.shift();
                        switch (item.type) {
                            case TYWI.API_CALL_TYPES.TRANSCRIBE:
                                DEBUG && console.log("WWTC.processTYWIAPIResponses - TRANSCRIBE", item.response);
                                // noinspection JSUnresolvedVariable
                                if (item.response.recognizedText &&
                                    item.response.recognizedText !== "") {

                                    if (item.successCB) {
                                        item.successCB(item.response.recognizedText);
                                    }
                                }
                                break;
                            case TYWI.API_CALL_TYPES.TTS:
                                DEBUG && console.log("WWTC.processTYWIAPIResponses - TTS", item.response);
                                if (item.successCB) {
                                    item.successCB(item.response);
                                }
                                break;
                            case TYWI.API_CALL_TYPES.TRANSLATE:
                                DEBUG && console.log("WWTC.processTYWIAPIResponses - TRANSLATE", item.response);
                                if (item.successCB) {
                                    item.successCB(item.response);
                                }
                                break;
                            default:
                                console.warn("WWTC.handleTYWIAPIResponse - Unsupported API call type: " + item.type);
                        }
                    } else {
                        // No response yet, check if timeout has occurred for this API call.
                        if (checkAPICallTimeOut(apiCallQueue[0])) {
                            console.error("WWTC.processTYWIAPIResponses - Timeout occurred", apiCallQueue[0]);
                            apiCallQueue.splice(0, 1); // Remove from queue so that we can process the next one.
                        }

                        // No response yet? Keep waiting
                        //console.log("processTYWIAPIResponses - No response yet for oldest item. Queue size: " + apiCallQueue.length);
                    }
                }


                // If there is at least one more ready response first in the queue, rerun immediately, else wait a while.
                if (apiCallQueue && apiCallQueue.length > 0 && apiCallQueue[0].response) {
                    interval = 0;
                }
            } catch (ex) {
                // Catch exceptions so that we don't exit the continuous call loop due to a single error.
                console.error("processTYWIAPIResponses exception", ex);
                interval = 500; // Set interval to more generous amount after errors occur.
            }

            setTimeout(processTYWIAPIResponses, interval);
        }
    }

    /**
     * Check if timeout has occurred when waiting for an API response.
     *
     * @param apiCallObj
     * @returns {boolean}
     */
    function checkAPICallTimeOut(apiCallObj) {
        return !!(apiCallObj.timestamp && ((apiCallObj.timestamp + API_CALL_TIMEOUT) < new Date().getTime()));
    }

    /**
     * Find the api call item with id, and set the response for it.
     *
     * @param id
     * @param response
     */
    function handleTYWIAPIResponse(id, response) {
        for (var i = 0; i < apiCallQueue.length; i++) {
            if (apiCallQueue[i].id === id) {
                apiCallQueue[i].response = response;
                apiCallQueue[i].responseTimestamp = new Date().getTime();
                break;
            }
        }
    }

    /**
     * Handles TYWI API errors responses to calls.
     *
     * @param id
     * @param error
     */
    function handleTYWIAPIResponseError(id, error) {
        if (id) { // This is a standard queued API call with an id
            for (var i = 0; i < apiCallQueue.length; i++) {
                if (apiCallQueue[i].id === id) {
                    console.error("WWTC.handleTYWIAPIResponseError for item " + id + ": " + error);
                    apiCallQueue[i].responseTimestamp = new Date().getTime();
                    if (apiCallQueue[i].errorCB) {
                        apiCallQueue[i].errorCB(error);
                    }
                    apiCallQueue.splice(i, 1); // Remove from queue
                    break;
                }
            }
        } else { // This is a special API call that hasn't been queued
            console.error("handleTYWIAPIResponseError: " + error);
        }
    }


    /**
     * Start processing API call queue for responses.
     */
    function start() {
        if (!isStarted()) {
            started = true;
            processTYWIAPIResponses();
        }
    }

    /**
     * Stop processing API call queue for responses and reset the call index to zero.
     */
    function stop() {
        started = false;
        apiCallQueue = [];
        apiCallIdx = 0;
    }

    /**
     * Is the API call queue processing started or not?
     *
     * @returns {boolean} True if started.
     */
    function isStarted() {
        return started;
    }


    // noinspection JSUnusedGlobalSymbols
    return {
        API_CALL_TYPES: API_CALL_TYPES,

        init: init,
        transcribeSpeech: transcribeSpeech,
        translateText: translateText,
        requestAudioTTS: requestAudioTTS,

        start: start,
        isStarted: isStarted,
        stop: stop
    };
}());