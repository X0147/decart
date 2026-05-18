#!/usr/bin/env python3
"""
Decart AI NDI Bridge - Process-Isolated Architecture
Avoids macOS dynamic library collision between PyAV (libavdevice) and NDI HX Driver 
by segregating Capture, WebRTC, and Broadcast into independent piped subprocesses.
"""

import sys
import os
import time
import argparse

def main():
    parser = argparse.ArgumentParser(description="Decart AI Realtime NDI Bridge")
    parser.add_argument("--mode", choices=["auto", "capture", "webrtc", "broadcast"], default="auto", help="Internal process mode")
    parser.add_argument("--api-key", help="Decart API Key")
    parser.add_argument("--source", help="Name of NDI Source to capture (e.g. 'OBS')")
    parser.add_argument("--prompt", default="Change the person's shirt to red", help="AI transformation prompt")
    parser.add_argument("--model", default="lucy-vton-latest", help="Decart realtime model name")
    parser.add_argument("--width", type=int, default=1280, help="Stream width")
    parser.add_argument("--height", type=int, default=720, help="Stream height")
    parser.add_argument("--fps", type=int, default=30, help="Stream FPS")

    args, unknown = parser.parse_known_args()

    # ---------------------------------------------------------
    # Mode: auto (Process Orchestrator / Entry Point)
    # ---------------------------------------------------------
    if args.mode == "auto":
        import subprocess
        print("[System] Initializing Decart NDI Bridge in Multi-Process Isolation Mode...")
        print(f"[System] Specifications: {args.width}x{args.height} @ {args.fps} FPS")
        print(f"[System] AI Transformation Prompt: '{args.prompt}'")
        
        # Build the command arguments to pass down to child processes
        cmd_args = []
        if args.api_key:
            cmd_args += ["--api-key", args.api_key]
        if args.source:
            cmd_args += ["--source", args.source]
        if args.prompt:
            cmd_args += ["--prompt", args.prompt]
        if args.model:
            cmd_args += ["--model", args.model]
        cmd_args += ["--width", str(args.width)]
        cmd_args += ["--height", str(args.height)]
        cmd_args += ["--fps", str(args.fps)]

        cmd_capture = [sys.executable, __file__, "--mode", "capture"] + cmd_args
        cmd_webrtc = [sys.executable, __file__, "--mode", "webrtc"] + cmd_args
        cmd_broadcast = [sys.executable, __file__, "--mode", "broadcast"] + cmd_args

        # Launch capture, WebRTC sender, and NDI broadcaster in a piped chain
        p_capture = subprocess.Popen(cmd_capture, stdout=subprocess.PIPE)
        p_webrtc = subprocess.Popen(cmd_webrtc, stdin=p_capture.stdout, stdout=subprocess.PIPE)
        p_broadcast = subprocess.Popen(cmd_broadcast, stdin=p_webrtc.stdout)

        # Allow stdout to link between processes
        p_capture.stdout.close()
        p_webrtc.stdout.close()

        try:
            p_broadcast.wait()
        except KeyboardInterrupt:
            print("\n[System] Gracefully shutting down subprocesses...")
        finally:
            p_capture.terminate()
            p_webrtc.terminate()
            p_broadcast.terminate()
        sys.exit(0)

    # ---------------------------------------------------------
    # Mode: capture (Pure NDI Capture - NO PyAV or WebRTC)
    # ---------------------------------------------------------
    elif args.mode == "capture":
        # Force stderr output for logging so stdout remains clean for frame byte pipes
        def log(msg):
            print(msg, file=sys.stderr, flush=True)

        try:
            import NDIlib as ndi
            import numpy as np
        except ImportError as e:
            log(f"[Error] Failed to load capture dependencies: {e}")
            sys.exit(1)

        if not ndi.initialize():
            log("[Error] Failed to initialize NDI library.")
            sys.exit(1)

        target_name = args.source or "Router"
        log(f"[NDI Capture] Scanning local network for active source matching '{target_name}'...")
        find = ndi.find_create_v2()
        if find is None:
            log("[Error] Failed to create NDI finder.")
            sys.exit(1)

        selected_source = None
        while selected_source is None:
            ndi.find_wait_for_sources(find, 2000)
            sources = ndi.find_get_current_sources(find)
            
            discovered_names = []
            if sources:
                for s in sources:
                    discovered_names.append(s.ndi_name)
                    # Exclude self-loopback Decart stream outputs to prevent feedback cascades!
                    if "decart ai transformed" in s.ndi_name.lower():
                        continue
                    if not args.source or args.source.lower() in s.ndi_name.lower():
                        selected_source = s
                        break
            
            if selected_source is None:
                log(f"[NDI Capture] Source '{target_name}' not active. Discovered on network: {discovered_names or 'None'}. Retrying in 2s...")
                log(f"[Instruction] Please verify NDI Output is turned ON in OBS (Tools -> DistroAV NDI Settings -> Main Output enabled).")
                time.sleep(2)

        log(f"[NDI Capture] Discovered target source: {selected_source.ndi_name}")
        log(f"[NDI Capture] Binding to source: {selected_source.ndi_name}")

        recv_opts = ndi.RecvCreateV3()
        recv_opts.color_format = ndi.RECV_COLOR_FORMAT_BGRX_BGRA
        ndi_recv = ndi.recv_create_v3(recv_opts)
        if ndi_recv is None:
            log("[Error] Failed to create NDI receiver.")
            ndi.find_destroy(find)
            sys.exit(1)

        ndi.recv_connect(ndi_recv, selected_source)
        ndi.find_destroy(find)

        log("[NDI Capture] Connected! Streaming uncompressed frames to pipeline...")

        try:
            while True:
                t, v, a, _ = ndi.recv_capture_v2(ndi_recv, 33)
                if t == ndi.FRAME_TYPE_VIDEO:
                    # Got an uncompressed frame, copy BGR buffer
                    img_data = np.copy(v.data)
                    bgr_bytes = img_data[:, :, :3].tobytes()
                    # Pipe BGR bytes directly to stdout
                    sys.stdout.buffer.write(bgr_bytes)
                    sys.stdout.buffer.flush()
                    # Free the buffer
                    ndi.recv_free_video_v2(ndi_recv, v)
        except KeyboardInterrupt:
            pass
        finally:
            ndi.recv_destroy(ndi_recv)
            ndi.destroy()
            sys.exit(0)

    # ---------------------------------------------------------
    # Mode: webrtc (Pure WebRTC Client - NO NDIlib)
    # ---------------------------------------------------------
    elif args.mode == "webrtc":
        def log(msg):
            print(msg, file=sys.stderr, flush=True)

        try:
            import asyncio
            from aiortc import MediaStreamTrack
            from av import VideoFrame
            import numpy as np
            from decart import models
            from decart.realtime import RealtimeClient, RealtimeConnectOptions
            from decart.types import ModelState, Prompt
        except ImportError as e:
            log(f"[Error] Failed to load WebRTC dependencies: {e}")
            sys.exit(1)

        class StdinVideoTrack(MediaStreamTrack):
            kind = "video"

            def __init__(self, width=1280, height=720, fps=30):
                super().__init__()
                self.width = width
                self.height = height
                self.frame_size = width * height * 3
                self.fps = fps

            async def recv(self):
                loop = asyncio.get_event_loop()
                raw_bytes = await loop.run_in_executor(None, self.read_frame)
                if not raw_bytes or len(raw_bytes) < self.frame_size:
                    await asyncio.sleep(1)
                    raise Exception("End of stream or incomplete frame on stdin")

                # Convert raw BGR bytes to numpy BGR frame
                bgr_array = np.frombuffer(raw_bytes, dtype=np.uint8).reshape((self.height, self.width, 3))
                
                # Create PyAV frame from numpy BGR frame
                pyav_frame = VideoFrame.from_ndarray(bgr_array, format="bgr24")
                pyav_frame.pts = int(time.time() * 90000)
                pyav_frame.time_base = "1/90000"
                return pyav_frame

            def read_frame(self):
                return sys.stdin.buffer.read(self.frame_size)

        async def run_pipeline():
            log("[WebRTC] Initializing connection manager...")
            try:
                model = models.realtime(args.model)
            except Exception:
                log(f"[Warning] Model '{args.model}' not found in registry. Using dynamic fallback model definition.")
                class FallbackModel:
                    def __init__(self, name):
                        self.name = name
                        self.url_path = "/v1/stream"
                        self.fps = 30
                model = FallbackModel(args.model)

            while True:
                log("[WebRTC] Establishing secure connection to Decart Realtime AI Platform...")
                video_track = StdinVideoTrack(width=args.width, height=args.height, fps=args.fps)
                stream_ended = asyncio.Event()

                async def handle_remote_stream(transformed_track):
                    log("[WebRTC] AI transformed track received! Writing to output pipe...")
                    try:
                        while True:
                            pyav_frame = await transformed_track.recv()
                            # Extract transformed BGR bytes and write to stdout
                            bgr24_data = pyav_frame.to_ndarray(format="bgr24").tobytes()
                            sys.stdout.buffer.write(bgr24_data)
                            sys.stdout.buffer.flush()
                    except Exception as e:
                        log(f"[WebRTC] Inbound streaming session ended: {e}")
                    finally:
                        stream_ended.set()

                realtime_client = None
                try:
                    realtime_client = await RealtimeClient.connect(
                        base_url="https://api.decart.ai",
                        api_key=args.api_key,
                        local_track=video_track,
                        options=RealtimeConnectOptions(
                            model=model,
                            initial_state=ModelState(
                                prompt=Prompt(text=args.prompt),
                            ),
                            on_remote_stream=lambda track: asyncio.create_task(handle_remote_stream(track)),
                        )
                    )

                    log("[WebRTC] Session established successfully!")
                    # Wait for stream track to end/error, then trigger a reconnect
                    await stream_ended.wait()
                    log("[WebRTC] Stream ended. Restarting session in 2s...")
                except Exception as e:
                    log(f"[WebRTC] Connection or session failed: {e}. Retrying in 2s...")
                
                # Cleanup client session before retrying
                if realtime_client:
                    try:
                        await realtime_client.close()
                    except Exception:
                        pass
                await asyncio.sleep(2)

        try:
            asyncio.run(run_pipeline())
        except KeyboardInterrupt:
            pass
        sys.exit(0)

    # ---------------------------------------------------------
    # Mode: broadcast (Pure NDI Broadcast - NO PyAV or WebRTC)
    # ---------------------------------------------------------
    elif args.mode == "broadcast":
        def log(msg):
            print(msg, file=sys.stderr, flush=True)

        try:
            import NDIlib as ndi
            import numpy as np
        except ImportError as e:
            log(f"[Error] Failed to load broadcast dependencies: {e}")
            sys.exit(1)

        if not ndi.initialize():
            log("[Error] Failed to initialize NDI library.")
            sys.exit(1)

        send_opts = ndi.SendCreate()
        send_opts.ndi_name = f"Decart AI Transformed ({os.getpid()})"
        ndi_send = ndi.send_create(send_opts)
        if ndi_send is None:
            import random
            send_opts.ndi_name = f"Decart AI Output {random.randint(100, 999)}"
            ndi_send = ndi.send_create(send_opts)
            if ndi_send is None:
                log("[Error] Failed to create NDI sender.")
                sys.exit(1)

        log(f"[NDI Broadcast] Created NDI output stream: '{send_opts.ndi_name}'")
        
        frame_size = args.width * args.height * 3
        ndi_frame = ndi.VideoFrameV2()
        ndi_frame.xres = args.width
        ndi_frame.yres = args.height
        ndi_frame.FourCC = ndi.FOURCC_VIDEO_TYPE_BGRX
        ndi_frame.frame_rate_N = args.fps
        ndi_frame.frame_rate_D = 1

        try:
            while True:
                raw_bytes = sys.stdin.buffer.read(frame_size)
                if not raw_bytes or len(raw_bytes) < frame_size:
                    break

                # Convert incoming transformed BGR bytes to NDI BGRX format
                bgr_array = np.frombuffer(raw_bytes, dtype=np.uint8).reshape((args.height, args.width, 3))
                bgrx_array = np.dstack([bgr_array, np.zeros((args.height, args.width), dtype=np.uint8)])

                ndi_frame.data = bgrx_array
                ndi.send_send_video_v2(ndi_send, ndi_frame)
        except KeyboardInterrupt:
            pass
        finally:
            ndi.send_destroy(ndi_send)
            ndi.destroy()
            sys.exit(0)

if __name__ == "__main__":
    main()
