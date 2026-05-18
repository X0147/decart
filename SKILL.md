---
name: decart-realtime-platform
description: Comprehensive SDK & WebRTC APIs for Decart's Lucy-2.1 realtime video restyling, try-on, and image editing models.
version: 1.0.0
tags: [decart, webrtc, realtime-ai, video-transformation]
---

# Decart Realtime AI Platform Integration Skill

This skill contains precise guidelines, specifications, and code patterns for integrating applications with **Decart's Realtime Video Transformation API (Lucy)**. Use these patterns when designing client-side WebRTC pipelines or server-side NDI-to-NDI media streams.

---

## 🚀 1. Realtime JavaScript SDK Integration

The JS client-side library operates on standard browser `MediaStream` tracks using WebRTC signaling protocols.

### CDN ESM Imports
```javascript
import { createDecartClient, models } from "https://esm.sh/@decartai/sdk";
```

### Complete WebRTC Handshake Pattern
```javascript
// 1. Initialize Realtime Model
const model = models.realtime("lucy-latest"); // or "lucy-2.1", "lucy-restyle-2"

// 2. Query Webcam Stream with precise constraints
const stream = await navigator.mediaDevices.getUserMedia({
    video: {
        frameRate: model.fps,
        width: model.width,
        height: model.height
    },
    audio: true
});

// 3. Instantiate and Connect Client
const client = createDecartClient({ apiKey: "your-api-key-here" });
const realtimeClient = await client.realtime.connect(stream, {
    model,
    onRemoteStream: (transformedStream) => {
        // Output transformed Webrtc stream to video player
        document.getElementById("output-video").srcObject = transformedStream;
    },
    onError: (err) => console.error("WebRTC Error:", err),
    onDisconnect: (reason) => console.log("Connection closed:", reason),
    initialState: {
        prompt: {
            text: "Change the character's clothing to a futuristic spacesuit",
            enhance: true
        }
    }
});

// 4. Update Prompts on-the-fly without disconnecting
await realtimeClient.setPrompt("A highly detailed Japanese anime style painting");
```

---

## 🐍 2. Python SDK Realtime Integration

Pipes offline streams, media tracks, or local files into Decart's queue or realtime WebRTC clients.

### Python WebRTC Client Pattern
```python
import asyncio
from decart import DecartClient, models
from decart.realtime import RealtimeClient, RealtimeConnectOptions
from decart.types import ModelState, Prompt

async def main():
    client = DecartClient(api_key="your-api-key")
    model = models.realtime("lucy-2.1")
    
    # local_track must be a subclass of aiortc.MediaStreamTrack
    realtime_client = await RealtimeClient.connect(
        base_url=client.base_url,
        api_key=client.api_key,
        local_track=my_custom_aiortc_video_track,
        options=RealtimeConnectOptions(
            model=model,
            on_remote_stream=lambda transformed_stream: (
                # transformed_stream.video is returned as an aiortc MediaStreamTrack
                handle_transformed_track(transformed_stream.video)
            ),
            initial_state=ModelState(
                prompt=Prompt(text="Retro 1980s neon style", enhance=True),
            ),
        ),
    )
    
    # Update prompt dynamically
    await realtime_client.set_prompt("A sculpture made of polished white marble")
```

---

## 🛠️ 3. Native WebRTC Signaling Handshake (Direct HTTP Fallback)

If the standard SDK is unavailable, establish a direct WebRTC connection with the Decart gateway.

### Handshake Steps
1. Create a native `RTCPeerConnection` locally.
2. Bind target camera tracks using `.addTrack()`.
3. Generate local SDP Offer using `.createOffer()`.
4. Perform HTTP POST Handshake to gateway.
5. Set returned Answer SDP as the remote description.

```javascript
const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const peerConnection = new RTCPeerConnection(configuration);

// Add tracks from user's local stream
localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

// Set up remote stream capture event
peerConnection.ontrack = (e) => {
    if (e.streams && e.streams[0]) {
        document.getElementById("output-video").srcObject = e.streams[0];
    }
};

// Create local SDP Offer
const offer = await peerConnection.createOffer();
await peerConnection.setLocalDescription(offer);

// Perform handshake
const response = await fetch("https://api.decart.ai/v1/realtime/connect", {
    method: "POST",
    headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
    },
    body: JSON.stringify({
        model: "lucy-2.1",
        sdp: offer.sdp,
        initial_state: {
            prompt: {
                text: "Studio Ghibli animation",
                enhance: true
            }
        }
    })
});

const data = await response.json();

// Set returned Answer SDP
const answer = new RTCSessionDescription({ type: 'answer', sdp: data.sdp });
await peerConnection.setRemoteDescription(answer);
```

---

## 🎬 4. Non-Realtime Video & Image Editing APIs

For queue-based, high-fidelity offline rendering and styling.

### Queue-based Video Restyling
```javascript
import { createDecartClient, models } from "@decartai/sdk";
import { readFileSync, writeFileSync } from "fs";

const client = createDecartClient({ apiKey: process.env.DECART_API_KEY });
const sourceBlob = new Blob([readFileSync("input.mp4")], { type: "video/mp4" });

const result = await client.queue.submitAndPoll({
    model: models.video("lucy-latest"),
    data: sourceBlob,
    prompt: "Transform this video into oil painting style",
    onStatusChange: (job) => console.log(`Job status: ${job.status}`),
});

if (result.status === "completed") {
    const buffer = Buffer.from(await result.data.arrayBuffer());
    writeFileSync("styled_output.mp4", buffer);
}
```

### Static Image Styling & Restyling
```javascript
import { createDecartClient, models } from "@decartai/sdk";
import { readFileSync } from "fs";

const client = createDecartClient({ apiKey: process.env.DECART_API_KEY });
const imageBlob = new Blob([readFileSync("input.jpg")], { type: "image/jpeg" });

const result = await client.process({
    model: models.image("lucy-image-2"),
    prompt: "A gorgeous watercolor painting",
    data: imageBlob,
    resolution: "720p"
});

document.querySelector("img").src = URL.createObjectURL(result);
```
