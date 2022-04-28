var DEBUG = true; // For showing console logs for this component.

var GENDER = {
    MALE: 'male',
    FEMALE: 'female'
};

var CALL_TYPE = {
    NOT_AVAILABLE: 0,
    INCOMING: 1,
    OUTGOING: 2
};

// DAROWS configuration for processing the Local microphone audio
var speechCaptureCfgLocal = {
    audioResultType: DAROWS.AUDIO_RESULT_TYPE.WAV_BLOB,
    sampleRate: 16000,
    speechDetectionThreshold: 20,
    speechDetectionMinimum: 10,
    speechDetectionMaximum: 6000,
    speechDetectionAllowedDelay: 200,
    analysisChunkLength: 100,
    compressPauses: false,
    detectOnly: false,
    debugAlerts: false,
    debugConsole: false
};

// DAROWS configuration for processing the Remote call audio
var speechCaptureCfgRemote = {
    audioResultType: DAROWS.AUDIO_RESULT_TYPE.WAV_BLOB,
    sampleRate: 16000,
    speechDetectionThreshold: 20,
    speechDetectionMinimum: 10,
    speechDetectionMaximum: 6000,
    speechDetectionAllowedDelay: 200,
    analysisChunkLength: 100,
    compressPauses: false,
    detectOnly: false,
    debugAlerts: false,
    debugConsole: false
};

var processAudioToCallInterval = 100; // milliseconds

var darowsLocal,
    darowsRemote,
    callProvider,
    callProviderId,
    localConfiguration,
    outputVolumeBar,
    inputVolumeBar,
    volumeIndicators,
    bilingual,
    translateLocalSwitch,
    translateRemoteSwitch,
    translateLocalSpeech = false,
    translateRemoteSpeech = false,
    connection,
    localStream,
    remoteStream,
    audioContext,
    localMediaStreamForPlayback,
    audioPlaybackSource,
    localPlaybackPrepared = false,

    // Audio to call queue
    audioToCallQueue = [],
    audioToCallIsPlaying = false,
    callInProgress = false,
    callType = CALL_TYPE.NOT_AVAILABLE,

    // For test/debugging purposes
    audioLogEnabled,

    // Translation and TTS related configuration
    translationCfg = {
        localLanguage: 'en-US',
        remoteLanguage: 'en-US',
        ttsVoice: 'Mark',
        ttsGender: GENDER.MALE
    };

/* jshint expr: true */
$(function() {

    // Gender select box
    document.getElementById("gender").onchange = function() {
        var e = document.getElementById("gender");
        translationCfg.ttsGender = e.options[e.selectedIndex].value;
        DEBUG && console.log("Gender changed to: " + translationCfg.ttsGender);
        setTTSVoiceForRemoteLanguage();
    };
    translationCfg.ttsGender = $('#gender').find(":selected").val();

    // Local language select box
    document.getElementById("language_selection_local").onchange = function() {
        var e = document.getElementById("language_selection_local");
        translationCfg.localLanguage = e.options[e.selectedIndex].value;
        DEBUG && console.log("Local language changed to: " + translationCfg.localLanguage);
    };
    translationCfg.localLanguage = $('#language_selection_local').find(":selected").val();

    // Remote language select box
    document.getElementById("language_selection_remote").onchange = function() {
        var e = document.getElementById("language_selection_remote");
        translationCfg.remoteLanguage = e.options[e.selectedIndex].value;
        DEBUG && console.log("Remote language changed to: " + translationCfg.remoteLanguage);
        setTTSVoiceForRemoteLanguage();
    };
    translationCfg.localLanguage = $('#language_selection_remote').find(":selected").val();

    // Init default language settings
    setTTSVoiceForRemoteLanguage();

    /**
     * Initializes the GUI
     */
    function initGUI() {
        outputVolumeBar = $('#output-volume');
        inputVolumeBar = $('#input-volume');
        volumeIndicators = $('#volume-indicators');

        // Ready button
        $('#ready-button').on('click', function() {
            $('#ready-button').hide();
            init();
        });

        // Hangup call
        $('#button-hangup').on('click', function() {
            if (callProvider) {
                callProvider.hangup();
            }
        });

        // Make outgoing call
        $('#button-call').on('click', function() {
            var callTo = document.getElementById('phone-number').value;

            if (!isAValidPhoneNumber(callTo)) {
                alert("Please enter a valid phone number in international format starting with + character");
            } else {
                DEBUG && console.log('Calling ' + callTo + '...');

                if (callProvider) {
                    callProvider.call(callTo);
                    callType = CALL_TYPE.OUTGOING;
                }
            }
        });

        // Switch for turning bilingual on/off
        bilingual = $('#Bilingual');

        bilingual.change(function() {
            this.checked = true;
        });


        // Switch for turning translation of local speech translation on/off
        translateLocalSwitch = $('#translateLocal');

        translateLocalSwitch.change(function() {
            setTranslateLocalSpeech(this.checked);
        });

        // Switch for turning translation of remote speech translation on/off
        translateRemoteSwitch = $('#translateRemote');

        translateRemoteSwitch.change(function() {
            setTranslateRemoteSpeech(this.checked);
        });
    }

    /**
     * Initializes the web app. Should only be called from a user interaction to enable audio on the web page.
     */
    function init() {
        var errorMsg = "You must create a file named 'local-configuration.json' in the project root.";

        // First we load the local-configuration file, so that each developer can use his own configuration.
        $.getJSON("local-configuration.json", function(localCfg) {
            // Create a Web Audio context if one doesn't already exist.
            if (!audioContext) {
                /* jshint -W056 */
                // noinspection JSUnresolvedVariable
                audioContext = new(window.AudioContext || window.webkitAudioContext)();
            }

            speechCaptureCfgLocal.audioContext = audioContext;
            speechCaptureCfgRemote.audioContext = audioContext;

            DEBUG && console.log("Loaded local configuration", localCfg);
            localConfiguration = localCfg;

            // Create a DAROWS instance for processing the audio coming from the remote participant (phone call).
            darowsRemote = new DAROWS();

            // Create a DAROWS instance for processing the audio coming from the
            // local participant (web browser/microphone).
            darowsLocal = new DAROWS();

            // Initialize TYWI integration
            // noinspection JSUnresolvedVariable
            TYWI.init(localConfiguration.TYWI, log);

            // Initialize the selected CallProvider
            // noinspection JSUnresolvedVariable
            initCallProvider(localConfiguration.useCallProvider);

            setTranslateLocalSpeech(translateLocalSwitch.is(":checked"));
            setTranslateRemoteSpeech(translateRemoteSwitch.is(":checked"));

            // If audio log with the captured audio should be shown on screen. (debug)
            // noinspection JSUnresolvedVariable
            if (localConfiguration.audioLog) {
                // Show log for captured audio from the local microphone.
                $('#localAudioLog').fadeIn(500);

                // Show log for captured audio from the phone call.
                $('#audioLog').fadeIn();
                audioLogEnabled = true;
            }
        }).catch(function(ex) {
            console.error(ex);
            alert(errorMsg);
        });
    }

    /**
     * Initializes the chosen Call Provider (see: js/CallProviders/)
     *
     * @param id - The identification of the CallProvider. Currently 'twilio' and 'plivo' are supported.
     */
    function initCallProvider(id) {

        // Prepare object with callbacks that will be used by the CallProvider to communicate with our app.
        var callbacksObj = {
            ready: callProviderReady,
            error: callProviderError,
            connected: callProviderConnected,
            disconnected: callProviderDisconnected,
            incoming: callProviderIncoming,
            ringing: callProviderRinging,
            exception: callProviderException,
            volume: callProviderVolume
        };

        id = id.toLowerCase();

        switch (id) {
            case "twilio":
                callProviderId = 'twilio';
                callProvider = new CallProviderTwilio();
                break;
            case "plivo":
                callProviderId = 'plivo';
                callProvider = new CallProviderPlivo();
                break;
            default:
                callProviderId = null;
                if (id) {
                    log("CallProvider '" + id + "' is not supported! Use 'twilio' or 'plivo' instead.");
                } else {
                    log("No callProvider (useCallProvider) set in the local configuration!");
                }
                return;
        }

        // noinspection JSUnresolvedVariable
        DEBUG && console.info("CallProvider used: [" + callProviderId + "]", localConfiguration.callProviders);

        // noinspection JSUnresolvedVariable
        if (localConfiguration && localConfiguration.callProviders && localConfiguration.callProviders.hasOwnProperty(callProviderId)) {
            // noinspection JSUnresolvedVariable
            callProvider.init(localConfiguration.callProviders[callProviderId], callbacksObj, log);
            log("CallProvider init: " + callProviderId);
        } else {
            console.error("initTwilio ex: No call provider configuration provided for: " + callProviderId);
        }
    }

    /**
     *
     * @param twilioConnection
     * @param twilioLocalStream
     * @param twilioRemoteStream
     */
    function prepareLocalPlayback(twilioConnection, twilioLocalStream, twilioRemoteStream) {
        connection = twilioConnection;

        // todo: Could use twilioConnection.direction (OUTGOING|INCOMING) instead for setting the callType
        if (callType === CALL_TYPE.OUTGOING) {
            setTimeout(function() {
                DEBUG && console.log('prepareLocalPlayback [outgoing-call]', twilioConnection, twilioConnection.getLocalStream(), twilioConnection.getRemoteStream());
                localStream = twilioConnection.getLocalStream();
                remoteStream = twilioConnection.getRemoteStream();
                startRemoteSpeechCapture(twilioConnection.getRemoteStream());
                setLocalPlayback(isTranslateLocalSpeech());
                startLocalSpeechCapture();
            }, 1000);
        } else {
            DEBUG && console.log('prepareLocalPlayback [incoming-call]', twilioConnection, twilioLocalStream, twilioRemoteStream);
            localStream = twilioLocalStream;
            remoteStream = twilioRemoteStream;
            startRemoteSpeechCapture(remoteStream);
            setLocalPlayback(isTranslateLocalSpeech());
            startLocalSpeechCapture();
        }
    }

    /**
     * Sets everything up for playing of audio files back to the call instead of using the microphone.
     *
     * todo: Currently playback of mp3 files are only supported using Twilio as the CallProvider.
     *
     * @param active
     */
    function setLocalPlayback(active) {
        DEBUG && console.log("setLocalPlayback for provider " + callProviderId + ": " + active);

        if (!localPlaybackPrepared) {
            if (active) {
                if (callProviderId === 'twilio') {
                    // Mute the Twilio stream for the local microphone, since we instead want to playback audio files to the call.
                    muteMicrophone(true);

                    // If no MediaStreamDestination exists, create one.
                    if (!localMediaStreamForPlayback) {
                        localMediaStreamForPlayback = audioContext.createMediaStreamDestination();
                    }

                    // For getting the MediaStreamTrack if needed.
                    //var mediaStreamTrack = localMediaStreamForPlayback.stream.getAudioTracks()[0];

                    // Force the Twilio PeerConnection to use our custom stream in addition to the microphone stream.
                    connection.mediaStream.setInputTracksFromStream(localMediaStreamForPlayback.stream);

                    // Ensure that the track for audio playback is enabled (not muted).
                    // The Twilio stream should now have two tracks, one from the microphone (muted) and one from the
                    // localMediaStreamForPlayback which we created, which is not muted.
                    localMediaStreamForPlayback.stream.getAudioTracks()[0].enabled = true;

                    localPlaybackPrepared = true;
                } else {
                    console.warn('Playing files back to the call is only possible with Twilio as the CallProvider.');
                }
            } else {
                muteMicrophone(false);
            }
        }
    }

    /**
     *
     * @param active
     */
    function setTranslateLocalSpeech(active) {
        if (active !== translateLocalSpeech) {
            translateLocalSpeech = active;
            DEBUG && console.log("Translation of local speech from microphone: " + translateLocalSpeech);

            if (connection) {
                setLocalPlayback(translateLocalSpeech);
            }
        }
    }

    /**
     *
     * @param active
     */
    function setTranslateRemoteSpeech(active) {
        if (active !== translateRemoteSpeech) {
            translateRemoteSpeech = active;
            DEBUG && console.log("Translation of remote speech from call: " + translateRemoteSpeech);
        }
    }

    /**
     *
     * @returns {boolean}
     */
    function isTranslateLocalSpeech() {
        return translateLocalSpeech;
    }

    /**
     *
     * @returns {boolean}
     */
    function isTranslateRemoteSpeech() {
        return translateRemoteSpeech;
    }

    /**
     * Resets local playback
     */
    function resetLocalPlayback() {
        DEBUG && console.log("resetLocalPlayback");

        connection = null;
        localStream = null;
        remoteStream = null;
        localPlaybackPrepared = false;

        // If the last audio exists, stop it.
        if (audioPlaybackSource) {
            audioPlaybackSource.stop();
            audioPlaybackSource = null;
        }
    }

    /**
     * Mutes the local microphone
     *
     * @param shouldMute
     */
    function muteMicrophone(shouldMute) {
        DEBUG && console.log("muteMicrophone: " + shouldMute);
        if (connection && connection.mediaStream) {
            connection.mediaStream.mute(shouldMute);
        }
    }

    /**
     * Plays the specified Web Audio AudioBuffer to the call.
     * The audio will only be heard by the remote party.
     *
     * @param message An object containing audio (Web Audio buffer), originalMessage (String) and translatedMessage (String).
     */
    function playbackAudioToCall(message) {
        if (localPlaybackPrepared && localMediaStreamForPlayback) {
            audioToCallIsPlaying = true;
            var audioBuffer = message.audio;
            var originalMessage = message.originalMessage;
            var translatedMessage = message.translatedMessage;

            DEBUG && console.log("playbackAudioToCall - START [" + originalMessage + "] -> [" + translatedMessage + "] -> [" + audioBuffer.length + "]");
            audioPlaybackSource = audioContext.createBufferSource();
            audioPlaybackSource.buffer = audioBuffer;
            audioPlaybackSource.connect(localMediaStreamForPlayback);
            audioPlaybackSource.onended = function() {
                audioToCallIsPlaying = false;
                DEBUG && console.log("playbackAudioToCall - END [" + originalMessage + "] -> [" + translatedMessage + "] -> [" + audioBuffer.length + "]");
            };
            var languagename = document.getElementById("language_selection_remote");
            languagename = languagename.options[languagename.selectedIndex].innerText;
            languagename = languagename.split(",");

            if (Bilingual.checked) {
                //on then set bilingual
                logLocalSpeech(originalMessage, languagename[0] + ": " + translatedMessage);
            } else {
                //if the toggle is on/off 
                logLocalSpeech(originalMessage);
            }

            audioPlaybackSource.start();
        }
    }

    /**
     * Activity log
     *
     * @param message
     */
    function log(message) {
        if (message) {
            var logDiv = document.getElementById('log');
            logDiv.innerHTML += '<p>&gt;&nbsp;' + message + '</p>';
            logDiv.scrollTop = logDiv.scrollHeight;
        }
    }

    /**
     * Starts DAROWS audio chunking for the local microphone.
     */
    function startLocalSpeechCapture() {
        darowsLocal.start(speechCaptureCfgRemote, handleSpeechCaptureResultLocal, handleSpeechCaptureErrorLocal, handleSpeechCaptureEventLocal);
        DEBUG && console.log("Local SpeechCapture started.");
    }

    /**
     * Stop capturing audio from the local microphone.
     */
    function stopLocalSpeechCapture() {
        DEBUG && console.log("stopLocalSpeechCapture");
        darowsLocal.stop();
    }

    /**
     * Start capturing and chunking audio from the incoming call (remote) using DAROWS
     *
     * @param stream - The audio stream from the call.
     */
    function startRemoteSpeechCapture(stream) {
        DEBUG && console.log("startRemoteSpeechCapture");
        darowsRemote.start(speechCaptureCfgLocal, handleSpeechCaptureResultRemote, handleSpeechCaptureErrorRemote, handleSpeechCaptureEventRemote, stream);
    }

    /**
     * Stop capturing the audio from the call
     */
    function stopRemoteSpeechCapture() {
        DEBUG && console.log("stopRemoteSpeechCapture");
        darowsRemote.stop();
    }


    /**
     * Called whenever speech has been captured.
     * WAV_BLOB type is used for speech recognition
     *
     * @param audioData - The captured audio.
     * @param type - Should always be DAROWS.AUDIO_RESULT_TYPE.WAV_BLOB in this case.
     */
    function handleSpeechCaptureResultLocal(audioData, type) {
        switch (type) {
            case DAROWS.AUDIO_RESULT_TYPE.WAV_BLOB:
                if (audioLogEnabled) {
                    appendWAVAudioBufferLocal(audioData);
                }

                if (isTranslateLocalSpeech()) {
                    translateLocalSpeechTTS(audioData);
                } else {
                    var fileReader = new FileReader();
                    fileReader.onload = function(event) {
                        // noinspection JSUnresolvedVariable
                        var arrayBuffer = event.target.result;
                        audioContext.decodeAudioData(arrayBuffer).then(function(buffer) {
                            DEBUG && console.log("handleSpeechCaptureResultLocal.decodeAudioData", buffer);

                            // Push the audio to the outgoing audio queue that will be played to the phone call.
                            audioToCallQueue.push({
                                audio: buffer,
                                originalMessage: null,
                                translatedMessage: null
                            });
                        });
                    };
                    fileReader.readAsArrayBuffer(audioData);
                }
                break;
            default:
                console.warn("handleSpeechCaptureResultLocal: Results of type " + type + " is not supported!");
                break;
        }
    }

    /**
     * Show errors raised by the speech capture.
     *
     * @param error
     */
    function handleSpeechCaptureErrorLocal(error) {
        console.error("handleSpeechCaptureErrorLocal", error);
    }

    /**
     * Handles speech capture events from the local microphone. Should probably only be used for debugging purposes and
     * then removed in production.
     *
     * todo: Remove in final version?
     *
     * @param code - The error code.
     */
    function handleSpeechCaptureEventLocal(code) {
        DEBUG && logSpeechCaptureEvent(code, "* handleSpeechCaptureEventLocal: ");
    }

    /**
     *
     * @param code
     * @param prefix
     */
    function logSpeechCaptureEvent(code, prefix) {
        switch (code) {
            case DAROWS.STATUS.CAPTURE_STARTED:
                console.log(prefix + "Capture Started!");
                break;
            case DAROWS.STATUS.CAPTURE_STOPPED:
                console.log(prefix + "Capture Stopped!");
                break;
            case DAROWS.STATUS.SPEECH_STARTED:
                console.log(prefix + "Speech Started!");
                break;
            case DAROWS.STATUS.ENCODING_ERROR:
                console.log(prefix + "Encoding Error!");
                break;
            case DAROWS.STATUS.CAPTURE_ERROR:
                console.log(prefix + "Capture Error!");
                break;
            case DAROWS.STATUS.SPEECH_ERROR:
                console.log(prefix + "Speech Error!");
                break;
            case DAROWS.STATUS.SPEECH_MAX_LENGTH:
                console.log(prefix + "Max Speech length!");
                break;
            case DAROWS.STATUS.SPEECH_MIN_LENGTH:
                console.log(prefix + "Min Speech length!");
                break;
            case DAROWS.STATUS.SPEECH_STOPPED:
                console.log(prefix + "Speech Stopped!");
                break;
            default:
                console.warn(prefix + "Unknown status occurred", code);
                break;
        }
    }


    /**
     * Append the captured microphone audio to the on-screen audio log.
     *
     * @param audioBuffer
     */
    function appendWAVAudioBufferLocal(audioBuffer) {
        try {
            var reader = new FileReader();
            reader.onload = function(evt) {
                var audio = document.createElement("AUDIO");
                audio.controls = true;
                // noinspection JSUnresolvedVariable
                audio.src = evt.target.result;
                audio.type = "audio/wav";
                document.getElementById("localAudioLog").appendChild(audio);
            };
            reader.readAsDataURL(audioBuffer);
        } catch (ex) {
            console.error("appendWAVAudioBufferLocal ex: " + ex);
        }
    }


    /**
     * Called whenever speech has been captured from the remote call.
     * WAV_BLOB type is used for speech recognition
     *
     * @param audioData - The captured audio from the remote call.
     * @param type - Should always be DAROWS.AUDIO_RESULT_TYPE.WAV_BLOB in this case.
     */
    function handleSpeechCaptureResultRemote(audioData, type) {
        switch (type) {
            case DAROWS.AUDIO_RESULT_TYPE.WAV_BLOB:
                if (audioLogEnabled) {
                    appendWAVAudioBufferRemote(audioData);
                }

                if (isTranslateRemoteSpeech()) {
                    translateRemoteSpeechText(audioData, function(text) {
                        logRemoteCaller(text);
                    }, function(error) {
                        console.error("handleSpeechCaptureResultRemote", error);
                    });
                }

                break;
            default:
                console.warn("handleSpeechCaptureResultRemote: Results of type " + type + " is not supported!");
                break;
        }
    }

    /**
     * Show remote speech on log screen.
     *
     * @param text
     */
    function logRemoteCaller(text) {
        var logDiv = document.getElementById('log');
        text = "CALLER: " + text;
        logDiv.innerHTML += '<p style="color: white">&gt;&nbsp;' + text + '</p>';
        logDiv.scrollTop = logDiv.scrollHeight;

    }

    /**
     * Show local speech on log screen.
     *
     * @param text
     */
    function logLocalSpeech(text, text2) {
        text2 = text2 || 0;
        if (text) {
            var logDiv = document.getElementById('log');
            text = "YOU: " + text;
            if (text2 !== 0)
                logDiv.innerHTML += '<p style="color: #8fff00">&gt;&nbsp;' + text + '</p> ' + '<p style="color: #16ff35">&gt;&nbsp;' + text2 + '</p>';
            else
                logDiv.innerHTML += '<p style="color: #8fff00">&gt;&nbsp;' + text + '</p> ';
            logDiv.scrollTop = logDiv.scrollHeight;
        }
    }

    /**
     * Handle errors raised by the speech capture of the remote call.
     *
     * @param error - The error code.
     */
    function handleSpeechCaptureErrorRemote(error) {
        console.error("handleSpeechCaptureErrorRemote", error);
    }

    /**
     * Handles speech capture events from the remote call. Should probably only be used for debugging purposes and then
     * removed in production.
     *
     * todo: Remove in final version?
     *
     * @param code
     */
    function handleSpeechCaptureEventRemote(code) {
        DEBUG && logSpeechCaptureEvent(code, "* handleSpeechCaptureEventRemote: ");
    }

    /**
     * Append the captured audio from the remote phone call to the on-screen audio log.
     *
     * @param audioBuffer
     */
    function appendWAVAudioBufferRemote(audioBuffer) {
        try {
            var reader = new FileReader();
            reader.onload = function(evt) {
                var audio = document.createElement("AUDIO");
                audio.controls = true;
                // noinspection JSUnresolvedVariable
                audio.src = evt.target.result;
                audio.type = "audio/wav";
                document.getElementById("audioLog").appendChild(audio);
            };
            reader.readAsDataURL(audioBuffer);
        } catch (ex) {
            console.error("appendWAVAudioBufferRemote ex: " + ex);
        }
    }

    /**
     * Called when the selected CallProvider is ready to accept incoming calls.
     */
    function callProviderReady() {
        log('CallProvider - Ready to accept incoming calls!');
        document.getElementById('call-controls').style.display = 'block';
        $('#button-call').show();
        $('#button-hangup').hide();
    }

    /**
     * Show errors from the CallProvider.
     *
     * @param err
     */
    function callProviderError(err) {
        log('CallProvider - Error: ' + err);
    }

    /**
     * Called when the CallProvider has connected the call.
     *
     * @param remoteStream - The audio stream from the phone call.
     * @param localStream - The audio stream from the local microphone.
     * @param connection - The call connection.
     */
    function callProviderConnected(remoteStream, localStream, connection) {
        log('CallProvider - Call connected!', remoteStream, localStream, connection);
        $('#button-call').hide();
        $('#button-hangup').show();
        if (callProvider.supportsVolumeIndicators) {
            volumeIndicators.show();
        }
        TYWI.start();
        callInProgress = true;
        audioToCallQueue = [];
        audioToCallIsPlaying = false;
        localPlaybackPrepared = false;
        processAudioToCallQueue();
        prepareLocalPlayback(connection, localStream, remoteStream);
    }

    /**
     * Called when the CallProvider has disconnected an active call.
     */
    function callProviderDisconnected() {
        log('CallProvider - Call ended!');
        TYWI.stop();
        callInProgress = false;
        callType = CALL_TYPE.NOT_AVAILABLE;
        $('#button-call').show();
        $('#button-hangup').hide();
        volumeIndicators.hide();
        stopLocalSpeechCapture();
        stopRemoteSpeechCapture();
        resetLocalPlayback();
    }

    /**
     * Called when there is an incoming call.
     *
     * @param from - Should contain the number of the calling party.
     */
    function callProviderIncoming(from) {
        log('CallProvider - Incoming call from: ' + from);

        callType = CALL_TYPE.INCOMING;

        // Automatically answer the call.
        callProvider.answer();
    }

    /**
     * Called when the CallProvider indicates ring tone. Only called when calling from the web app to a number?
     *
     * @param call
     */
    function callProviderRinging(call) {
        log('CallProvider - Ringing: ' + call);
    }

    /**
     * Used to indicate volume of input and output. Only some CallProviders support this.
     *
     * @param inputVolume
     * @param outputVolume
     */
    function callProviderVolume(inputVolume, outputVolume) {
        var inputColor = 'red';
        if (inputVolume < 0.50) {
            inputColor = 'green';
        } else if (inputVolume < 0.75) {
            inputColor = 'yellow';
        }

        inputVolumeBar.css("width", Math.floor(inputVolume * 300) + 'px');
        inputVolumeBar.css("background", inputColor);

        var outputColor = 'red';
        if (outputVolume < 0.50) {
            outputColor = 'green';
        } else if (outputVolume < 0.75) {
            outputColor = 'yellow';
        }

        outputVolumeBar.css("width", Math.floor(outputVolume * 300) + 'px');
        outputVolumeBar.css("background", outputColor);
    }

    /**
     * Called when there is an unhandled exception in the CallProvider code.
     *
     * @param ex - The exception message.
     */
    function callProviderException(ex) {
        log('CallProvider - Exception: ' + ex);
        $('#button-hangup').hide();
    }

    /**
     * Transcribes, translates, requests synthetic speech for the specified local audio and then queues it to play to the
     * incoming call using translationCfg object.
     *
     * @param speechWAV The audio to transcribe, translate and get synthetic speech for.
     */
    function translateLocalSpeechTTS(speechWAV) {
        console.log("translateLocalSpeechTTS");
        var transcribedMessage = null;
        var translatedMessage = null;

        TYWI.transcribeSpeech(
            speechWAV,
            translationCfg.localLanguage,
            function(transcribedSpeechText) {
                console.log("translateLocalSpeechTTS.transcribeSpeech", transcribedSpeechText);
                transcribedMessage = transcribedSpeechText;
                TYWI.translateText(
                    transcribedSpeechText,
                    getLocalLanguageShort(),
                    getRemoteLanguageShort(),
                    function(translatedText) {
                        console.log("translateLocalSpeechTTS.translateText", translatedText);
                        translatedMessage = translatedText;
                        TYWI.requestAudioTTS(
                            translatedText,
                            getRemoteLanguageShort(),
                            translationCfg.ttsVoice,
                            function(mp3Blob) {
                                console.log("translateLocalSpeechTTS.requestAudioTTS", mp3Blob);
                                var fileReader = new FileReader();
                                fileReader.onload = function(event) {
                                    // noinspection JSUnresolvedVariable
                                    var arrayBuffer = event.target.result;
                                    audioContext.decodeAudioData(arrayBuffer).then(function(buffer) {
                                        console.log("translateLocalSpeechTTS.decodeAudioData", buffer);

                                        // Push the audio to the outgoing audio queue that will be played to the phone call.
                                        audioToCallQueue.push({
                                            audio: buffer,
                                            originalMessage: transcribedMessage,
                                            translatedMessage: translatedMessage
                                        });
                                    });
                                };
                                fileReader.readAsArrayBuffer(mp3Blob);

                            },
                            function(error) {
                                console.error("translateLocalSpeechTTS.requestAudioTTS error", error);
                            });
                    },
                    function(error) {
                        console.error("translateLocalSpeechTTS.translateText error", error);
                    });

            },
            function(error) {
                console.error("translateLocalSpeechTTS.transcribeSpeech error", error);
            });
    }

    /**
     * Transcribes, translates the specified speech textually using translationCfg object.
     *
     * @param speechWAV
     * @param successCB
     * @param errorCB
     */
    function translateRemoteSpeechText(speechWAV, successCB, errorCB) {
        console.log("translateRemoteSpeechText");
        TYWI.transcribeSpeech(
            speechWAV,
            getRemoteLanguageLong(),
            function(transcribedSpeechText) {
                console.log("translateRemoteSpeechText - transcribeSpeech successful: ", transcribedSpeechText);
                TYWI.translateText(
                    transcribedSpeechText,
                    getRemoteLanguageShort(),
                    getLocalLanguageShort(),
                    function(translatedText) {
                        console.log("translateRemoteSpeechText - translateText successful: ", translatedText);
                        if (successCB) successCB(translatedText);
                    },
                    function(error) {
                        console.error("translateRemoteSpeechText - translateText error: ", error);
                        if (errorCB) errorCB(error);
                    });

            },
            function(error) {
                console.error("translateRemoteSpeechText - transcribeSpeech error: ", error);
                if (errorCB) errorCB(error);
            });
    }

    /**
     * Processes the audio queue
     */
    function processAudioToCallQueue() {
        if (callInProgress) { // Is a call in progress?
            if (!audioToCallIsPlaying) { // Only playback if there is no audio currently playing
                if (audioToCallQueue && audioToCallQueue.length > 0) { // Are there anything to playback in the queue?
                    var nextAudioToPlay = audioToCallQueue.shift();
                    playbackAudioToCall(nextAudioToPlay);
                }
            }
            setTimeout(processAudioToCallQueue, processAudioToCallInterval);
        }
    }

    // noinspection JSUnusedLocalSymbols
    /**
     *
     * @returns {string}
     */
    function getLocalLanguageLong() {
        return translationCfg.localLanguage;
    }

    /**
     *
     * @returns {string}
     */
    function getLocalLanguageShort() {
        return translationCfg.localLanguage.split("-")[0];
    }

    /**
     *
     * @returns {string}
     */
    function getRemoteLanguageLong() {
        return translationCfg.remoteLanguage;
    }

    /**
     *
     * @returns {string}
     */
    function getRemoteLanguageShort() {
        return translationCfg.remoteLanguage.split("-")[0];
    }

    /**
     *
     * @param number
     * @returns {boolean}
     */
    function isAValidPhoneNumber(number) {
        return /^\+(?:[0-9] ?){6,14}[0-9]$/.test(number);
    }

    function setTTSVoiceForRemoteLanguage() {
        var voiceId = getTTSVoiceIdForLanguage(translationCfg.remoteLanguage, translationCfg.ttsGender);

        console.log("setTTSVoiceForRemoteLanguage " + translationCfg.remoteLanguage + "/" + translationCfg.ttsGender + " -> " + voiceId);

        translationCfg.ttsVoice = voiceId;
    }

    /**
     *
     * @param languageCode
     * @param gender
     */
    function getTTSVoiceIdForLanguage(languageCode, gender) {
        languageCode = languageCode.toLowerCase();

        // Check if we have defined a voice for the language-dialect code.
        if (TTS[languageCode]) {
            return TTS[languageCode][gender].voice;
        }
        // If none is defined, check if we have a default for main language without dialect.
        else if (TTS[languageCode.split("-")[0]]) {
            console.warn("No voice found for language-dialect " + languageCode + " using default for main language instead voice: " + TTS[languageCode.split("-")[0]][gender].voice);
            return TTS[languageCode.split("-")[0]][gender].voice;
        } else {
            console.warn("No voice found for language " + languageCode + " using default male voice: " + TTS['en-us'].male.voice);
            // Default is en_us male
            return TTS['en-us'].male.voice;
        }
    }

    // Initialize the user interface.
    initGUI();
});