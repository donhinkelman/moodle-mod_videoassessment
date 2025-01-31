// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Video assessment
 *
 * @package    mod_videoassessment
 * @copyright  2024 Don Hinkleman (hinkelman@mac.com)
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later.
 */

define(['jquery', 'core/yui', 'core/str', 'core_form/changechecker', 'mod_videoassessment/getHTMLMediaElement'], function ($, Y, Str, FormChangeChecker, HTMLMediaElement) {
    return {
        reCord: function () {
            var params = {},
                r = /([^&=]+)=?([^&]*)/g;

            function d(s) {
                return decodeURIComponent(s.replace(/\+/g, ' '));
            }

            var match, search = window.location.search;
            while (match = r.exec(search.substring(1))) {
                params[d(match[1])] = d(match[2]);

                if (d(match[2]) === 'true' || d(match[2]) === 'false') {
                    params[d(match[1])] = d(match[2]) === 'true' ? true : false;
                }
            }

            window.params = params;


            function addStreamStopListener(stream, callback) {
                stream.addEventListener('ended', function () {
                    callback();
                    callback = function () {
                    };
                }, false);
                stream.addEventListener('inactive', function () {
                    callback();
                    callback = function () {
                    };
                }, false);
                stream.getTracks().forEach(function (track) {
                    track.addEventListener('ended', function () {
                        callback();
                        callback = function () {
                        };
                    }, false);
                    track.addEventListener('inactive', function () {
                        callback();
                        callback = function () {
                        };
                    }, false);
                });
            }
            var video = document.createElement('video');
            video.controls = false;
            var myMediaElement = require("mod_videoassessment/getHTMLMediaElement");
            var newMediaElement = new myMediaElement();
            var mediaElement = newMediaElement.getHTMLMediaElement(video, {
                title: 'Recording status: inactive',
                buttons: [],
                showOnMouseEnter: false,
                width: 360,
                onTakeSnapshot: function () {
                    var canvas = document.createElement('canvas');
                    canvas.width = mediaElement.clientWidth;
                    canvas.height = mediaElement.clientHeight;
                    var context = canvas.getContext('2d');
                    context.drawImage(recordingPlayer, 0, 0, canvas.width, canvas.height);
                    window.open(canvas.toDataURL('image/png'));
                }
            });

            document.getElementById('record-content-div').appendChild(mediaElement);

            var div = document.createElement('section');
            mediaElement.media.parentNode.appendChild(div);
            mediaElement.media.muted = false;
            mediaElement.media.autoplay = true;
            mediaElement.media.playsinline = true;
            div.appendChild(mediaElement.media);

            var recordingPlayer = mediaElement.media;
            var mimeType = 'video/webm';
            var fileExtension = 'webm';
            var type = 'video';
            var recorderType;
            var defaultWidth;
            var defaultHeight;

            var btnStartRecording = document.querySelector('#btn-start-recording');

            window.onbeforeunload = function () {
                btnStartRecording.disabled = false;
            };

            btnStartRecording.onclick = function (event) {
                var button = btnStartRecording;

                if (button.innerHTML === 'Stop Recording') {
                    btnPauseRecording.style.display = 'none';
                    btnStartRecording.style.display = 'none';
                    button.disabled = true;
                    button.disableStateWaiting = true;
                    setTimeout(function () {
                        button.disableStateWaiting = false;
                    }, 2000);

                    button.innerHTML = 'Start Recording';
                    function stopStream() {
                        if (button.stream && button.stream.stop) {
                            button.stream.stop();
                            button.stream = null;
                        }
                        if (button.stream instanceof Array) {
                            button.stream.forEach(function (stream) {
                                stream.stop();
                            });
                            button.stream = null;
                        }
                        videoBitsPerSecond = null;
                        var html = 'Recording status: stopped';
                        html += '<br>Size: ' + bytesToSize(button.recordRTC.getBlob().size);
                        recordingPlayer.parentNode.parentNode.querySelector('h2').innerHTML = html;
                    }

                    if (button.recordRTC) {
                        if (button.recordRTC.length) {
                            button.recordRTC[0].stopRecording(function (url) {
                                if (!button.recordRTC[1]) {
                                    button.recordingEndedCallback(url);
                                    stopStream();
                                    saveToDiskOrOpenNewTab(button.recordRTC[0]);
                                    return;
                                }
                                button.recordRTC[1].stopRecording(function (url) {
                                    button.recordingEndedCallback(url);
                                    stopStream();
                                });
                            });
                        } else {
                            button.recordRTC.stopRecording(function (url) {
                                if (button.blobs && button.blobs.length) {
                                    var blob = new File(button.blobs, getFileName(fileExtension), {
                                        type: mimeType
                                    });
                                    button.recordRTC.getBlob = function () {
                                        return blob;
                                    };
                                }

                                button.recordingEndedCallback(url);
                                stopStream();
                                saveToDiskOrOpenNewTab(button.recordRTC);
                            });
                        }
                    }

                    return;
                }

                if (!event) return;

                button.disabled = true;

                var commonConfig = {
                    onMediaCaptured: function (stream) {
                        button.stream = stream;
                        if (button.mediaCapturedCallback) {
                            button.mediaCapturedCallback();
                        }
                        button.innerHTML = 'Stop Recording';
                        button.disabled = false;
                    },
                    onMediaStopped: function () {
                        button.innerHTML = 'Start Recording';
                        if (!button.disableStateWaiting) {
                            button.disabled = false;
                        }
                    },
                    onMediaCapturingFailed: function (error) {
                        console.error('onMediaCapturingFailed:', error);
                        if (error.toString().indexOf('no audio or video tracks available') !== -1) {
                            alert('RecordRTC failed to start because there are no audio or video tracks available.');
                        }

                        if (error.name === 'PermissionDeniedError' && DetectRTC.browser.name === 'Firefox') {
                            alert('Firefox requires version >= 52. Firefox also requires HTTPs.');
                        }
                        commonConfig.onMediaStopped();
                    }
                };


                // mediaContainerFormat.value === 'defult'

                    mimeType = 'video/webm';
                    fileExtension = 'webm';
                    recorderType = null;
                    type = 'video';


                //if (recordingMedia.value === 'record-audio-plus-video') {
                    captureAudioPlusVideo(commonConfig);
                    button.mediaCapturedCallback = function () {
                        if(typeof MediaRecorder === 'undefined') { // opera or chrome etc.
                            console.log('opera or chrome etc');
                            button.recordRTC = [];

                            if(!params.bufferSize) {
                                // it fixes audio issues whilst recording 720p
                                params.bufferSize = 16384;
                            }

                            var options = {
                                type: 'audio', // hard-code to set "audio"
                                leftChannel: params.leftChannel || false,
                                disableLogs: params.disableLogs || false,
                                video: recordingPlayer
                            };

                            if(params.sampleRate) {
                                options.sampleRate = parseInt(params.sampleRate);
                            }

                            if(params.bufferSize) {
                                options.bufferSize = parseInt(params.bufferSize);
                            }

                            if(params.frameInterval) {
                                options.frameInterval = parseInt(params.frameInterval);
                            }

                            if(recorderType) {
                                options.recorderType = recorderType;
                            }

                            if(videoBitsPerSecond) {
                                options.videoBitsPerSecond = videoBitsPerSecond;
                            }

                            options.ignoreMutedMedia = false;
                            var audioRecorder = RecordRTC(button.stream, options);

                            options.type = type;
                            var videoRecorder = RecordRTC(button.stream, options);

                            // to sync audio/video playbacks in browser!
                            videoRecorder.initRecorder(function() {
                                audioRecorder.initRecorder(function() {
                                    audioRecorder.startRecording();
                                    videoRecorder.startRecording();
                                    btnPauseRecording.style.display = '';
                                });
                            });

                            button.recordRTC.push(audioRecorder, videoRecorder);

                            button.recordingEndedCallback = function() {
                                var audio = new Audio();
                                audio.src = audioRecorder.toURL();
                                audio.controls = true;
                                audio.autoplay = true;

                                recordingPlayer.parentNode.appendChild(document.createElement('hr'));
                                recordingPlayer.parentNode.appendChild(audio);

                                if(audio.paused) audio.play();
                            };
                            return;
                        }
                        console.log('not opera or chrome etc');
                        var options = {
                            type: type,
                            mimeType: mimeType,
                            disableLogs: params.disableLogs || false,
                            getNativeBlob: false, // enable it for longer recordings
                            recorderType: DetectRTC.browser.name === 'Edge' ? StereoAudioRecorder : null
                        };

                        if (recorderType) {
                            options.recorderType = recorderType;
                        }

                        if (videoBitsPerSecond) {
                            options.videoBitsPerSecond = videoBitsPerSecond;
                        }

                        options.ignoreMutedMedia = false;
                        button.recordRTC = RecordRTC(button.stream, options);

                        button.recordingEndedCallback = function (url) {
                            setVideoURL(url);
                        };

                        button.recordRTC.startRecording();
                        btnPauseRecording.style.display = '';
                    };
            };

            function captureAudioPlusVideo(config) {
                console.log('captureAudioPlusVideo start');
                captureUserMedia({video: true, audio: true}, function (audioVideoStream) {
                    config.onMediaCaptured(audioVideoStream);

                    if (audioVideoStream instanceof Array) {
                        audioVideoStream.forEach(function (stream) {
                            addStreamStopListener(stream, function () {
                                config.onMediaStopped();
                            });
                        });
                        return;
                    }

                    addStreamStopListener(audioVideoStream, function () {
                        config.onMediaStopped();
                    });
                }, function (error) {
                    config.onMediaCapturingFailed(error);
                });
                console.log('captureAudioPlusVideo end');
            }

            var videoBitsPerSecond;

            function setVideoBitrates() {
                videoBitsPerSecond = 128000;
            }

            function getFrameRates(mediaConstraints) {
                return mediaConstraints;
            }

            function getVideoResolutions(mediaConstraints) {
                return mediaConstraints;
            }

            function captureUserMedia(mediaConstraints, successCallback, errorCallback) {
                console.log('captureUserMedia start');
                if (mediaConstraints.video == true) {
                    mediaConstraints.video = {};
                }
                setVideoBitrates();

                var isBlackBerry = !!(/BB10|BlackBerry/i.test(navigator.userAgent || ''));
                if (isBlackBerry && !!(navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia)) {
                    navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
                    navigator.getUserMedia(mediaConstraints, successCallback, errorCallback);
                    return;
                }

                navigator.mediaDevices.getUserMedia(mediaConstraints).then(function (stream) {
                    successCallback(stream);

                    setVideoURL(stream, true);
                }).catch(function (error) {
                    if (error && (error.name === 'ConstraintNotSatisfiedError' || error.name === 'OverconstrainedError')) {
                        alert('Your camera or browser does NOT supports selected resolutions or frame-rates. \n\nPlease select "default" resolutions.');
                    } else if (error && error.message) {
                        alert(error.message);
                    } else {
                        alert('Unable to make getUserMedia request. Please check browser console logs.');
                    }

                    errorCallback(error);
                });
                console.log('captureUserMedia end');
            }

            function stringify(obj) {
                var result = '';
                Object.keys(obj).forEach(function (key) {
                    if (typeof obj[key] === 'function') {
                        return;
                    }

                    if (result.length) {
                        result += ',';
                    }

                    result += key + ': ' + obj[key];
                });

                return result;
            }

            function mediaRecorderToStringify(mediaRecorder) {
                var result = '';
                result += 'mimeType: ' + mediaRecorder.mimeType;
                result += ', state: ' + mediaRecorder.state;
                result += ', audioBitsPerSecond: ' + mediaRecorder.audioBitsPerSecond;
                result += ', videoBitsPerSecond: ' + mediaRecorder.videoBitsPerSecond;
                if (mediaRecorder.stream) {
                    result += ', streamid: ' + mediaRecorder.stream.id;
                    result += ', stream-active: ' + mediaRecorder.stream.active;
                }
                return result;
            }

            function getFailureReport() {
                var info = 'RecordRTC seems failed. \n\n' + stringify(DetectRTC.browser) + '\n\n' + DetectRTC.osName + ' ' + DetectRTC.osVersion + '\n';

                if (typeof recorderType !== 'undefined' && recorderType) {
                    info += '\nrecorderType: ' + recorderType.name;
                }

                if (typeof mimeType !== 'undefined') {
                    info += '\nmimeType: ' + mimeType;
                }

                Array.prototype.slice.call(document.querySelectorAll('select')).forEach(function (select) {
                    info += '\n' + (select.id || select.className) + ': ' + select.value;
                });

                if (btnStartRecording.recordRTC) {
                    info += '\n\ninternal-recorder: ' + btnStartRecording.recordRTC.getInternalRecorder().name;

                    if (btnStartRecording.recordRTC.getInternalRecorder().getAllStates) {
                        info += '\n\nrecorder-states: ' + btnStartRecording.recordRTC.getInternalRecorder().getAllStates();
                    }
                }

                if (btnStartRecording.stream) {
                    info += '\n\naudio-tracks: ' + getTracks(btnStartRecording.stream, 'audio').length;
                    info += '\nvideo-tracks: ' + getTracks(btnStartRecording.stream, 'video').length;
                    info += '\nstream-active? ' + !!btnStartRecording.stream.active;

                    btnStartRecording.stream.getTracks().forEach(function (track) {
                        info += '\n' + track.kind + '-track-' + (track.label || track.id) + ': (enabled: ' + !!track.enabled + ', readyState: ' + track.readyState + ', muted: ' + !!track.muted + ')';

                        if (track.getConstraints && Object.keys(track.getConstraints()).length) {
                            info += '\n' + track.kind + '-track-getConstraints: ' + stringify(track.getConstraints());
                        }

                        if (track.getSettings && Object.keys(track.getSettings()).length) {
                            info += '\n' + track.kind + '-track-getSettings: ' + stringify(track.getSettings());
                        }
                    });
                }

                if (btnStartRecording.recordRTC && btnStartRecording.recordRTC.getInternalRecorder() && btnStartRecording.recordRTC.getInternalRecorder().getInternalRecorder && btnStartRecording.recordRTC.getInternalRecorder().getInternalRecorder()) {
                    info += '\n\ngetInternalRecorder: ' + mediaRecorderToStringify(btnStartRecording.recordRTC.getInternalRecorder().getInternalRecorder());
                }

                return info;
            }

            function saveToDiskOrOpenNewTab(recordRTC) {
                if(!recordRTC.getBlob().size) {
                    var info = getFailureReport();
                    console.log('blob', recordRTC.getBlob());
                    console.log('recordrtc instance', recordRTC);
                    console.log('report', info);
                }
                $('.upload-progress').show();

                var fileName = getFileName(fileExtension);
                // upload to PHP server
                if(!recordRTC) return alert('No recording found.');
                this.disabled = true;

                uploadToPHPServer(fileName, recordRTC, function(progress, fileURL) {});
            }
            function uploadToPHPServer(fileName, recordRTC, callback) {
                var blob = recordRTC instanceof Blob ? recordRTC : recordRTC.getBlob();
                blob = new File([blob], getFileName(fileExtension), {
                    type: mimeType
                });
                var fileType = blob.type.split('/')[0] || 'audio';
                var fileName = (Math.random() * 1000).toString().replace('.', '');

                if (fileType === 'audio') {
                    fileName += '.' + (!!navigator.mozGetUserMedia ? 'ogg' : 'wav');
                } else {
                    fileName += '.webm';
                }
                var formData = new FormData($("#mform")[0]);
                formData.append('isRecordVideo', 1);
                formData.append(fileType + '-filename', fileName);
                formData.append(fileType, blob);


                var url = $("#mform").attr("action");
                var id = formData.get('id');
                var request = new XMLHttpRequest();
                /*M.core_formchangechecker.reset_form_dirty_state();*/
                FormChangeChecker.resetAllFormDirtyStates();
                request.onreadystatechange = function() {
                    if (request.readyState == 4 && request.status == 200) {
                        window.location.href= url+"?id="+id;
                    }
                };
                request.open('POST', url);
                request.send(formData);

            }

            function getRandomString() {
                if (window.crypto && window.crypto.getRandomValues && navigator.userAgent.indexOf('Safari') === -1) {
                    var a = window.crypto.getRandomValues(new Uint32Array(3)),
                        token = '';
                    for (var i = 0, l = a.length; i < l; i++) {
                        token += a[i].toString(36);
                    }
                    return token;
                } else {
                    return (Math.random() * new Date().getTime()).toString(36).replace(/\./g, '');
                }
            }

            function getFileName(fileExtension) {
                var d = new Date();
                var year = d.getUTCFullYear();
                var month = d.getUTCMonth();
                var date = d.getUTCDate();
                return 'RecordRTC-' + year + month + date + '-' + getRandomString() + '.' + fileExtension;
            }

            function getURL(arg) {
                var url = arg;

                if (arg instanceof Blob || arg instanceof File) {
                    url = URL.createObjectURL(arg);
                }

                if (arg instanceof RecordRTC || arg.getBlob) {
                    url = URL.createObjectURL(arg.getBlob());
                }

                if (arg instanceof MediaStream || arg.getTracks) {
                    // url = URL.createObjectURL(arg);
                }

                return url;
            }

            function setVideoURL(arg, forceNonImage) {
                console.log('setVideoURL start');
                var url = getURL(arg);

                var parentNode = recordingPlayer.parentNode;
                parentNode.removeChild(recordingPlayer);
                parentNode.innerHTML = '';

                var elem = 'video';
                if (type == 'gif' && !forceNonImage) {
                    elem = 'img';
                }
                if (type == 'audio') {
                    elem = 'audio';
                }

                recordingPlayer = document.createElement(elem);

                if (arg instanceof MediaStream) {
                    recordingPlayer.muted = true;
                }

                recordingPlayer.poster = '';

                if (arg instanceof MediaStream) {
                    recordingPlayer.srcObject = arg;
                } else {
                    recordingPlayer.src = url;
                }

                if (typeof recordingPlayer.play === 'function') {
                    recordingPlayer.play();
                }

                recordingPlayer.addEventListener('ended', function () {
                    url = getURL(arg);

                    if (arg instanceof MediaStream) {
                        recordingPlayer.srcObject = arg;
                    } else {
                        recordingPlayer.src = url;
                    }
                });

                parentNode.appendChild(recordingPlayer);
                console.log('setVideoURL end');
            }



            var btnPauseRecording = document.querySelector('#btn-pause-recording');
            btnPauseRecording.onclick = function () {
                if (!btnStartRecording.recordRTC) {
                    btnPauseRecording.style.display = 'none';
                    return;
                }

                btnPauseRecording.disabled = true;
                if (btnPauseRecording.innerHTML === 'Pause') {
                    btnStartRecording.disabled = true;
                    btnStartRecording.style.fontSize = '15px';
                    btnStartRecording.recordRTC.pauseRecording();
                    recordingPlayer.parentNode.parentNode.querySelector('h2').innerHTML = 'Recording status: paused';
                    recordingPlayer.pause();

                    btnPauseRecording.style.fontSize = 'inherit';
                    setTimeout(function () {
                        btnPauseRecording.innerHTML = 'Resume Recording';
                        btnPauseRecording.disabled = false;
                    }, 2000);
                }

                if (btnPauseRecording.innerHTML === 'Resume Recording') {
                    btnStartRecording.disabled = false;
                    btnStartRecording.style.fontSize = 'inherit';
                    btnStartRecording.recordRTC.resumeRecording();
                    recordingPlayer.play();

                    btnPauseRecording.style.fontSize = '15px';
                    btnPauseRecording.innerHTML = 'Pause';
                    setTimeout(function () {
                        btnPauseRecording.disabled = false;
                    }, 2000);
                }
            };
        }

    };

});





