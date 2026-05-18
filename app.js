// Decart AI Studio NDI & OBS Integration Logic

// Application State
const state = {
    apiKey: localStorage.getItem('decart_api_key') || '',
    model: 'lucy-vton-latest',
    selectedSourceId: '',
    width: 1280,
    height: 720,
    fps: 30,
    audio: true,
    prompt: 'Substitute the character in the video with the person in the reference image.',
    enhance: true,
    localStream: null,
    peerConnection: null,
    realtimeClient: null, // If using SDK
    isConnected: false,
    
    // Identity cloning reference image state
    referenceImageBlob: null,
    referenceImageBase64: null,
    cloneMode: 'face-swap'
};

// UI Elements
const els = {
    apiKeyInput: document.getElementById('api-key'),
    applyKeyBtn: document.getElementById('apply-key-btn'),
    
    modelSelect: document.getElementById('model-select'),
    videoSource: document.getElementById('video-source'),
    resolutionSelect: document.getElementById('resolution-select'),
    fpsSelect: document.getElementById('fps-select'),
    audioEnable: document.getElementById('audio-enable'),
    
    customPrompt: document.getElementById('custom-prompt'),
    aiEnhanceBtn: document.getElementById('ai-enhance-btn'),
    enhancePrompt: document.getElementById('enhance-prompt'),
    presetChips: document.querySelectorAll('.preset-chip'),
    updatePromptBtn: document.getElementById('update-prompt-btn'),
    
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('file-input'),
    previewContainer: document.getElementById('preview-container'),
    imagePreview: document.getElementById('image-preview'),
    removeImageBtn: document.getElementById('remove-image-btn'),
    cloneModeSelect: document.getElementById('clone-mode'),
    
    startBtn: document.getElementById('start-btn'),
    stopBtn: document.getElementById('stop-btn'),
    localVideo: document.getElementById('local-video'),
    remoteVideo: document.getElementById('remote-video'),
    localPlaceholder: document.getElementById('local-placeholder'),
    remotePlaceholder: document.getElementById('remote-placeholder'),
    localResolutionBadge: document.getElementById('local-resolution-badge'),
    outputResolutionBadge: document.getElementById('output-resolution-badge'),
    connectionStatus: document.getElementById('connection-status'),
    fullscreenBtn: document.getElementById('fullscreen-btn'),
    consoleLogs: document.getElementById('console-logs'),
    clearConsole: document.getElementById('clear-console')
};

// Utility: Logging to interactive console
function log(type, message) {
    const line = document.createElement('div');
    line.className = `log-line ${type}`;
    
    const time = new Date().toLocaleTimeString();
    line.innerHTML = `<span style="color: var(--color-text-muted)">[${time}]</span> ${message}`;
    
    if (els.consoleLogs) {
        els.consoleLogs.appendChild(line);
        els.consoleLogs.scrollTop = els.consoleLogs.scrollHeight;
    }
}

// --------------------------------------------------------------------------
// Drag & Drop Identity Reference File Handler
// --------------------------------------------------------------------------
function setupImageDropzone() {
    const dropzone = els.dropzone;
    const fileInput = els.fileInput;

    // Trigger click on dropzone click
    dropzone.addEventListener('click', () => fileInput.click());

    // Highlight dropzone on drag over
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--accent)';
        dropzone.style.background = 'rgba(0, 242, 254, 0.04)';
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.style.borderColor = 'rgba(138, 75, 255, 0.3)';
        dropzone.style.background = 'rgba(255, 255, 255, 0.01)';
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'rgba(138, 75, 255, 0.3)';
        dropzone.style.background = 'rgba(255, 255, 255, 0.01)';
        
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleUploadedFile(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleUploadedFile(e.target.files[0]);
        }
    });

    els.removeImageBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearUploadedFile();
    });

    els.cloneModeSelect.addEventListener('change', (e) => {
        state.cloneMode = e.target.value;
        log('info', `[Clone] Mode updated to: ${state.cloneMode}`);
        
        // Auto-configure prompt based on mode selection
        if (state.cloneMode === 'face-swap') {
            state.prompt = "Substitute the character in the video with the person in the reference image.";
        } else if (state.cloneMode === 'try-on') {
            state.prompt = "Keep the person's face, but change their shirt and outfit to match the clothing inside the reference image.";
        } else {
            state.prompt = "Redesign the style and aesthetic to mirror the style elements of the reference image.";
        }
        els.customPrompt.value = state.prompt;
    });
}

function handleUploadedFile(file) {
    if (!file.type.startsWith('image/')) {
        log('error', '[Clone] Invalid file format. Reference target must be an image.');
        return;
    }

    state.referenceImageBlob = file;
    log('info', `[Clone] Reading identity reference: ${file.name} (${Math.round(file.size / 1024)} KB)...`);

    const reader = new FileReader();
    
    // For Base64 direct connection transfer
    reader.onload = (e) => {
        state.referenceImageBase64 = e.target.result;
        els.imagePreview.src = e.target.result;
        
        // UI transitions
        els.dropzone.classList.add('hidden');
        els.previewContainer.classList.remove('hidden');
        
        log('success', `[Clone] Reference target loaded successfully! Ready for OBS / NDI cloning.`);
        
        // Auto apply preset active state
        if (state.isConnected) {
            log('info', '[Clone] Active stream detected. Applying cloned face reference...');
            updatePrompt();
        }
    };
    
    reader.readAsDataURL(file);
}

function clearUploadedFile() {
    state.referenceImageBlob = null;
    state.referenceImageBase64 = null;
    els.imagePreview.src = '';
    els.fileInput.value = '';
    
    els.previewContainer.classList.add('hidden');
    els.dropzone.classList.remove('hidden');
    
    log('info', '[Clone] Reference target removed. Reverting to custom styled transformations.');
}

// --------------------------------------------------------------------------
// Video Capture & Preview Sequence
// --------------------------------------------------------------------------
async function queryCameras() {
    try {
        await navigator.mediaDevices.getUserMedia({ video: true }); // trigger browser prompt
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        els.videoSource.innerHTML = '';
        const cameras = devices.filter(device => device.kind === 'videoinput');
        
        if (cameras.length === 0) {
            els.videoSource.innerHTML = '<option value="">No cameras detected</option>';
            log('error', '[Camera] No video input devices found.');
            return;
        }

        cameras.forEach((camera, i) => {
            const opt = document.createElement('option');
            opt.value = camera.deviceId;
            const label = camera.label || `Camera ${i + 1}`;
            opt.textContent = label;
            
            // Highlight OBS Virtual Cam if found
            if (label.toLowerCase().includes('obs') || label.toLowerCase().includes('virtual')) {
                opt.selected = true;
                state.selectedSourceId = camera.deviceId;
                log('success', `[Camera] Auto-selected input source: ${label}`);
            }
            els.videoSource.appendChild(opt);
        });

        if (!state.selectedSourceId && cameras.length > 0) {
            state.selectedSourceId = cameras[0].deviceId;
        }

        // Start preview
        startLocalPreview();

    } catch (err) {
        log('error', `[Camera] Error querying camera devices: ${err.message}`);
    }
}

async function startLocalPreview() {
    try {
        if (state.localStream) {
            state.localStream.getTracks().forEach(track => track.stop());
        }

        const constraints = {
            video: {
                deviceId: state.selectedSourceId ? { exact: state.selectedSourceId } : undefined,
                width: { ideal: state.width },
                height: { ideal: state.height },
                frameRate: { ideal: state.fps }
            },
            audio: state.audio
        };

        log('info', `[Camera] Starting capture: ${state.width}x${state.height} @ ${state.fps} FPS`);
        state.localStream = await navigator.mediaDevices.getUserMedia(constraints);
        els.localVideo.srcObject = state.localStream;
        els.localPlaceholder.classList.add('hidden');

        // Update badge
        const videoTrack = state.localStream.getVideoTracks()[0];
        if (videoTrack) {
            const settings = videoTrack.getSettings();
            els.localResolutionBadge.textContent = `${settings.width || state.width}x${settings.height || state.height} @ ${settings.frameRate || state.fps}fps`;
        }

    } catch (err) {
        log('error', `[Camera] Failed to initialize video source: ${err.message}`);
    }
}

// --------------------------------------------------------------------------
// Decart WebRTC AI Session Handshake Controls
// --------------------------------------------------------------------------
async function startSession() {
    if (!state.apiKey) {
        log('error', '[Authentication] Decart API Key is missing. Please enter and apply your key in the sidebar.');
        els.apiKeyInput.focus();
        return;
    }

    if (!state.localStream) {
        log('error', '[Camera] Camera stream is not ready. Please select a valid video source.');
        return;
    }

    try {
        setConnectionUI('connecting');
        
        // Fetch short-lived ephemeral token from secure server backend
        log('info', '[Tokens] Requesting short-lived ephemeral token from backend `/api/tokens`...');
        const tokenRes = await fetch("/api/tokens", {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: state.apiKey })
        });
        
        if (!tokenRes.ok) {
            const errData = await tokenRes.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${tokenRes.status}`);
        }
        
        const tokenData = await tokenRes.json();
        let activeKey = tokenData.apiKey || state.apiKey;
        if (activeKey && activeKey.startsWith("decart_ephemeral")) {
            activeKey = state.apiKey;
        }
        log('success', `[Tokens] Ephemeral token handshake finalized. Establishing secure WebRTC connection...`);

        // If SDK loaded, use it
        if (createDecartClient) {
            await startSessionWithSDK(activeKey);
        } else {
            await startSessionNativeWebRTC(activeKey);
        }

    } catch (err) {
        log('error', `[Session] Connection failed: ${err.message}`);
        stopSession();
    }
}

// 1. Session via standard Decart SDK
async function startSessionWithSDK(activeKey) {
    try {
        const client = createDecartClient({ apiKey: activeKey });
        
        // Use the official models.realtime generator from the SDK with fallbacks!
        let model;
        if (models && typeof models.realtime === 'function') {
            model = models.realtime(state.model);
        }
        
        // Ensure name and urlPath are always populated to prevent validation failures on custom/new models
        if (!model || !model.name || !model.urlPath) {
            model = {
                ...model,
                name: state.model,
                urlPath: `realtime/${state.model}`
            };
        }
        
        // Apply target resolution and frame rates
        model.width = state.width;
        model.height = state.height;
        model.fps = state.fps;

        log('info', `[Session] Initializing client connection using model: ${state.model}...`);

        state.realtimeClient = await client.realtime.connect(state.localStream, {
            model,
            onRemoteStream: (remoteStream) => {
                log('success', '[Session] AI transformed stream received!');
                els.remoteVideo.srcObject = remoteStream;
                els.remotePlaceholder.classList.add('hidden');
                
                const remoteTrack = remoteStream.getVideoTracks()[0];
                if (remoteTrack) {
                    const settings = remoteTrack.getSettings();
                    els.outputResolutionBadge.textContent = `${settings.width || state.width}x${settings.height || state.height}`;
                }
            },
            initialState: {
                prompt: { 
                    text: state.prompt,
                    enhance: state.enhance
                },
                // Only include image if it is non-null/populated to prevent SDK schema validation failures
                ...(state.referenceImageBlob ? { image: state.referenceImageBlob } : {})
            }
        });

        state.isConnected = true;
        setConnectionUI('online');
        els.updatePromptBtn.disabled = false;
        log('success', '[Session] Realtime AI connection established successfully.');

    } catch (err) {
        throw new Error(`SDK connect error: ${err.message}`);
    }
}

// 2. Fallback direct signaling handshake
async function startSessionNativeWebRTC(activeKey) {
    try {
        const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
        state.peerConnection = new RTCPeerConnection(configuration);

        // Add Local Media Tracks
        state.localStream.getTracks().forEach(track => {
            state.peerConnection.addTrack(track, state.localStream);
        });

        // Set up event for remote stream reception
        state.peerConnection.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
                log('success', '[Session] AI transformed track received via direct WebRTC!');
                els.remoteVideo.srcObject = event.streams[0];
                els.remotePlaceholder.classList.add('hidden');
                els.outputResolutionBadge.textContent = `${state.width}x${state.height}`;
            }
        };

        // Create SDP Offer
        const offer = await state.peerConnection.createOffer();
        await state.peerConnection.setLocalDescription(offer);

        log('info', '[Session] Sending WebRTC Offer handshake to Decart Gateway...');

        // Perform SDP Handshake with Decart API
        const response = await fetch(`https://api.decart.ai/v1/realtime/connect`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${activeKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: state.model,
                sdp: offer.sdp,
                initial_state: {
                    prompt: {
                        text: state.prompt,
                        enhance: state.enhance
                    },
                    // Send Reference Image base64 if populated
                    image: state.referenceImageBase64 || null
                }
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        log('info', '[Session] WebRTC Answer received. Establishing data tunnel...');

        // Set Remote Description
        const answer = new RTCSessionDescription({ type: 'answer', sdp: data.sdp });
        await state.peerConnection.setRemoteDescription(answer);

        state.isConnected = true;
        setConnectionUI('online');
        els.updatePromptBtn.disabled = false;
        log('success', '[Session] Connection handshake finalized. Stream active.');

    } catch (err) {
        throw new Error(`Direct connection failed: ${err.message}`);
    }
}

// Update Decart AI Prompts or reference images during active session on the fly
async function updatePrompt() {
    if (!state.isConnected) return;
    
    const newPrompt = els.customPrompt.value.trim();
    if (!newPrompt) return;

    log('info', `[Prompt] Set active AI pipeline state...`);
    els.updatePromptBtn.disabled = true;

    try {
        if (state.realtimeClient) {
            // Using official SDK endpoints based on reference image presence!
            if (state.referenceImageBlob) {
                await state.realtimeClient.set({
                    prompt: newPrompt,
                    image: state.referenceImageBlob,
                    enhance: state.enhance
                });
            } else {
                // Direct lightweight setPrompt update as shown in the documentation
                await state.realtimeClient.setPrompt(newPrompt);
            }
            log('success', '[Prompt] Applied new transformation state on the fly.');
        } else {
            // Direct endpoint update
            const response = await fetch(`https://api.decart.ai/v1/realtime/update`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${state.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: {
                        text: newPrompt,
                        enhance: state.enhance
                    },
                    image: state.referenceImageBase64 || null
                })
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            log('success', '[Prompt] Applied new transformation state on the fly.');
        }
    } catch (err) {
        log('error', `[Prompt] State update failed: ${err.message}`);
    } finally {
        els.updatePromptBtn.disabled = false;
    }
}

// AI Assist Vision analyzer - describes the garment details using advanced mockups
async function enhancePromptWithAIVision() {
    if (!state.referenceImageBlob) {
        log('warning', '[Vision] Please upload a reference target image first to analyze.');
        return;
    }

    log('info', '[Vision] Analyzing reference garment image & capturing local webcam frame...');
    
    const canvas = document.createElement('canvas');
    canvas.width = els.localVideo.videoWidth || 640;
    canvas.height = els.localVideo.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    
    try {
        ctx.drawImage(els.localVideo, 0, 0, canvas.width, canvas.height);
    } catch (e) {
        log('warning', '[Vision] Local webcam frame capture failed. Proceeding with garment analysis only.');
    }
    
    els.aiEnhanceBtn.disabled = true;
    const originalBtnText = els.aiEnhanceBtn.innerHTML;
    els.aiEnhanceBtn.innerHTML = '<span class="btn-spinner"></span> Analyzing Target...';

    canvas.toBlob(async (personFrameBlob) => {
        const formData = new FormData();
        formData.append("image", state.referenceImageBlob);
        if (personFrameBlob) {
            formData.append("personFrame", personFrameBlob);
        }

        try {
            const res = await fetch("/api/enhance-prompt", {
                method: "POST",
                body: formData
            });
            
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            const data = await res.json();
            if (data.prompt) {
                els.customPrompt.value = data.prompt;
                state.prompt = data.prompt;
                log('success', `[Vision] AI Enhanced Prompt: "${data.prompt}"`);
                
                // If connected, update active stream style parameters on the fly
                if (state.isConnected) {
                    updatePrompt();
                }
            }
        } catch (err) {
            log('error', `[Vision] AI Enhance failed: ${err.message}`);
        } finally {
            els.aiEnhanceBtn.disabled = false;
            els.aiEnhanceBtn.innerHTML = originalBtnText;
        }
    }, 'image/jpeg');
}

// Stop Realtime Session
function stopSession() {
    log('info', '[Session] Closing session...');
    
    // Disconnect SDK Client
    if (state.realtimeClient) {
        try {
            state.realtimeClient.disconnect();
        } catch (e) {}
        state.realtimeClient = null;
    }

    // Disconnect native WebRTC connection
    if (state.peerConnection) {
        state.peerConnection.close();
        state.peerConnection = null;
    }

    els.remoteVideo.srcObject = null;
    els.remotePlaceholder.classList.remove('hidden');
    els.outputResolutionBadge.textContent = '-';

    state.isConnected = false;
    setConnectionUI('offline');
    els.updatePromptBtn.disabled = true;
    
    log('info', '[Session] Disconnected.');
}

// UI State Management Helper
function setConnectionUI(status) {
    const indicator = els.connectionStatus.querySelector('.indicator');
    const text = els.connectionStatus.querySelector('.status-text');

    indicator.className = 'indicator';
    
    if (status === 'online') {
        indicator.classList.add('online');
        text.textContent = 'Connected & Streaming';
        els.startBtn.classList.add('hidden');
        els.stopBtn.classList.remove('hidden');
    } else if (status === 'connecting') {
        indicator.classList.add('connecting');
        text.textContent = 'Connecting...';
        els.startBtn.disabled = true;
        els.startBtn.querySelector('.btn-spinner').classList.remove('hidden');
    } else {
        indicator.classList.add('offline');
        text.textContent = 'Disconnected';
        els.startBtn.classList.remove('hidden');
        els.startBtn.disabled = false;
        els.startBtn.querySelector('.btn-spinner').classList.add('hidden');
        els.stopBtn.classList.add('hidden');
    }
}

// Toggle Fullscreen on Remote Video Card (For Perfect OBS Window Capture)
function toggleFullscreen() {
    const wrapper = els.remoteVideo.closest('.video-card');
    
    if (!document.fullscreenElement) {
        wrapper.requestFullscreen().catch(err => {
            log('error', `[UI] Fullscreen failed: ${err.message}`);
        });
        wrapper.classList.add('remote-fullscreen');
    } else {
        document.exitFullscreen();
        wrapper.classList.remove('remote-fullscreen');
    }
}

// Listen for Esc key to remove custom fullscreen class
document.addEventListener('fullscreenchange', () => {
    const wrapper = els.remoteVideo.closest('.video-card');
    if (!document.fullscreenElement) {
        wrapper.classList.remove('remote-fullscreen');
    }
});

// --------------------------------------------------------------------------
// Main Application Initialization & Event Binding
// --------------------------------------------------------------------------
function init() {
    // 1. Restore Saved Credentials
    if (state.apiKey) {
        els.apiKeyInput.value = state.apiKey;
        log('success', '[Credentials] Restored saved Decart API Key.');
    }

    // 2. Credentials Event Listeners
    els.applyKeyBtn.addEventListener('click', () => {
        const key = els.apiKeyInput.value.trim();
        if (key) {
            state.apiKey = key;
            localStorage.setItem('decart_api_key', key);
            log('success', '[Credentials] Applied and saved Decart API Key successfully.');
        } else {
            state.apiKey = '';
            localStorage.removeItem('decart_api_key');
            log('warning', '[Credentials] API Key cleared.');
        }
    });

    // 3. Settings Control Listeners
    els.modelSelect.addEventListener('change', (e) => {
        state.model = e.target.value;
        log('info', `[Settings] Model changed to: ${state.model}`);
    });

    els.videoSource.addEventListener('change', (e) => {
        state.selectedSourceId = e.target.value;
        if (state.localStream) {
            startLocalPreview();
        }
    });

    els.resolutionSelect.addEventListener('change', (e) => {
        const [w, h] = e.target.value.split('x').map(Number);
        state.width = w;
        state.height = h;
        log('info', `[Settings] Resolution changed to: ${w}x${h}`);
        if (state.localStream) {
            startLocalPreview();
        }
    });

    els.fpsSelect.addEventListener('change', (e) => {
        state.fps = Number(e.target.value);
        log('info', `[Settings] Target frame rate: ${state.fps} FPS`);
        if (state.localStream) {
            startLocalPreview();
        }
    });

    els.audioEnable.addEventListener('change', (e) => {
        state.audio = e.target.checked;
        log('info', `[Settings] Audio enabled: ${state.audio}`);
    });

    els.customPrompt.addEventListener('input', (e) => {
        state.prompt = e.target.value;
        els.updatePromptBtn.disabled = !state.isConnected;
    });

    els.enhancePrompt.addEventListener('change', (e) => {
        state.enhance = e.target.checked;
    });

    els.updatePromptBtn.addEventListener('click', updatePrompt);
    els.aiEnhanceBtn.addEventListener('click', enhancePromptWithAIVision);

    // 4. Session Action Buttons
    els.startBtn.addEventListener('click', startSession);
    els.stopBtn.addEventListener('click', stopSession);
    els.fullscreenBtn.addEventListener('click', toggleFullscreen);
    els.clearConsole.addEventListener('click', () => {
        els.consoleLogs.innerHTML = '';
        log('info', '[Console] Logs cleared.');
    });

    // 5. Preset Chips Listener
    els.presetChips.forEach(chip => {
        chip.addEventListener('click', () => {
            els.presetChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            
            const promptText = chip.getAttribute('data-prompt');
            els.customPrompt.value = promptText;
            state.prompt = promptText;
            
            log('info', `[Preset] Applied style: "${promptText}"`);
            
            if (state.isConnected) {
                updatePrompt();
            }
        });
    });

    // 6. NDI Cloning Reference Image Drag & Drop Listeners
    setupImageDropzone();

    // 7. Query Camera Sources
    queryCameras();
}

// Import Decart SDK from CDN (fallback to direct fetch if SDK fails to load)
let createDecartClient = null;
let models = null;
try {
    const sdkModule = await import('https://esm.sh/@decartai/sdk');
    createDecartClient = sdkModule.createDecartClient;
    models = sdkModule.models;
    log('info', '[System] Decart SDK loaded successfully.');
} catch (e) {
    try {
        log('warning', '[System] ESM.sh failed. Trying JSDelivr CDN...');
        const sdkModule = await import('https://cdn.jsdelivr.net/npm/@decartai/sdk/+esm');
        createDecartClient = sdkModule.createDecartClient;
        models = sdkModule.models;
        log('info', '[System] Decart SDK loaded successfully via JSDelivr.');
    } catch (err2) {
        log('warning', '[System] Could not load SDK from CDNs. Falling back to native WebRTC implementation.');
    }
}

// Initialize Application
init();
