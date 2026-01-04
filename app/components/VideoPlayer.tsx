"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import { VideoOff, RefreshCw, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import ObjectDetectionOverlay from './ObjectDetectionOverlay';

interface VideoPlayerProps {
    className?: string;
}

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

interface KVSConfig {
    channelARN: string;
    channelName: string;
    region: string;
    endpoints: {
        WSS: string;
        HTTPS: string;
    };
    iceServers: Array<{
        Uris: string[];
        Username?: string;
        Password?: string;
        Ttl?: number;
    }>;
    credentials: {
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken?: string;
    };
}

export default function VideoPlayer({ className }: VideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const signalingClientRef = useRef<any>(null);

    const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
    const [errorMessage, setErrorMessage] = useState<string>('');

    const stopViewer = useCallback(() => {
        console.log('[WebRTC] Stopping viewer...');

        if (signalingClientRef.current) {
            signalingClientRef.current.close();
            signalingClientRef.current = null;
        }

        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, []);

    const startViewer = useCallback(async () => {
        try {
            setConnectionState('connecting');
            setErrorMessage('');
            console.log('[WebRTC] Starting viewer...');

            // Fetch signaling configuration from API
            const response = await fetch('/api/kvs-signaling');
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to get signaling configuration');
            }
            const config: KVSConfig = await response.json();
            console.log('[WebRTC] Got signaling config:', config.channelName);

            // Dynamically import the WebRTC SDK (browser only)
            const { SignalingClient, Role } = await import('amazon-kinesis-video-streams-webrtc');

            // Build ICE servers configuration
            const iceServers: RTCIceServer[] = [
                { urls: `stun:stun.kinesisvideo.${config.region}.amazonaws.com:443` },
            ];

            config.iceServers.forEach((server) => {
                iceServers.push({
                    urls: server.Uris,
                    username: server.Username,
                    credential: server.Password,
                });
            });

            // Create RTCPeerConnection
            const peerConnection = new RTCPeerConnection({
                iceServers,
                iceTransportPolicy: 'all',
            });
            peerConnectionRef.current = peerConnection;

            // Create signaling client
            const signalingClient = new SignalingClient({
                channelARN: config.channelARN,
                channelEndpoint: config.endpoints.WSS,
                role: Role.VIEWER,
                region: config.region,
                credentials: {
                    accessKeyId: config.credentials.accessKeyId,
                    secretAccessKey: config.credentials.secretAccessKey,
                    sessionToken: config.credentials.sessionToken,
                },
                clientId: `viewer-${Date.now()}`,
            });
            signalingClientRef.current = signalingClient;

            // Handle incoming tracks (video/audio from master)
            peerConnection.ontrack = (event) => {
                console.log('[WebRTC] Received track:', event.track.kind);
                if (videoRef.current && event.streams[0]) {
                    videoRef.current.srcObject = event.streams[0];
                }
            };

            // Handle ICE candidates
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log('[WebRTC] Sending ICE candidate');
                    signalingClient.sendIceCandidate(event.candidate);
                }
            };

            // Handle connection state changes
            peerConnection.onconnectionstatechange = () => {
                console.log('[WebRTC] Connection state:', peerConnection.connectionState);
                if (peerConnection.connectionState === 'connected') {
                    setConnectionState('connected');
                } else if (peerConnection.connectionState === 'failed' ||
                    peerConnection.connectionState === 'disconnected') {
                    setConnectionState('error');
                    setErrorMessage('Connection lost');
                }
            };

            // Signaling client event handlers
            signalingClient.on('open', async () => {
                console.log('[WebRTC] Signaling client connected');

                // Create and send SDP offer
                const offer = await peerConnection.createOffer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true,
                });
                await peerConnection.setLocalDescription(offer);
                console.log('[WebRTC] Sending SDP offer');
                if (peerConnection.localDescription) {
                    signalingClient.sendSdpOffer(peerConnection.localDescription);
                }
            });

            signalingClient.on('sdpAnswer', async (answer: RTCSessionDescriptionInit) => {
                console.log('[WebRTC] Received SDP answer');
                await peerConnection.setRemoteDescription(answer);
            });

            signalingClient.on('iceCandidate', async (candidate: RTCIceCandidateInit) => {
                console.log('[WebRTC] Received ICE candidate');
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            });

            signalingClient.on('close', () => {
                console.log('[WebRTC] Signaling client closed');
            });

            signalingClient.on('error', (error: Error) => {
                console.error('[WebRTC] Signaling error:', error);
                setConnectionState('error');
                setErrorMessage(error.message);
            });

            // Open signaling connection
            console.log('[WebRTC] Opening signaling connection...');
            signalingClient.open();

        } catch (error) {
            console.error('[WebRTC] Error starting viewer:', error);
            setConnectionState('error');
            setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
            stopViewer();
        }
    }, [stopViewer]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopViewer();
        };
    }, [stopViewer]);

    // Auto-start viewer on mount
    useEffect(() => {
        startViewer();
    }, [startViewer]);

    const handleRetry = () => {
        stopViewer();
        startViewer();
    };

    return (
        <div className={clsx("relative rounded-xl overflow-hidden bg-black border border-border shadow-2xl", className)}>
            <div className="absolute top-4 left-4 z-10 flex gap-2">
                <div className={clsx(
                    "px-2 py-1 text-white text-xs font-bold rounded",
                    connectionState === 'connected' ? "bg-red-500/80 animate-pulse" :
                        connectionState === 'connecting' ? "bg-yellow-500/80" : "bg-neutral-600/80"
                )}>
                    {connectionState === 'connected' ? 'LIVE' :
                        connectionState === 'connecting' ? 'CONNECTING' : 'OFFLINE'}
                </div>
                <div className="px-2 py-1 bg-black/60 text-white text-xs font-mono rounded border border-white/10">
                    CAM-01
                </div>
            </div>

            {/* Retry button */}
            {(connectionState === 'error' || connectionState === 'idle') && (
                <button
                    onClick={handleRetry}
                    className="absolute top-4 right-4 z-10 p-2 bg-cyan-500/80 hover:bg-cyan-400 text-white rounded-lg transition-colors"
                    title="Retry connection"
                >
                    <RefreshCw size={16} />
                </button>
            )}

            {/* Video element */}
            <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className={clsx(
                    "w-full h-full object-contain bg-black",
                    connectionState !== 'connected' && "hidden"
                )}
            />

            {/* Object Detection Overlay */}
            {connectionState === 'connected' && (
                <ObjectDetectionOverlay
                    videoRef={videoRef}
                    isVideoReady={connectionState === 'connected'}
                />
            )}

            {/* Loading/Error states */}
            {connectionState !== 'connected' && (
                <div className="w-full h-full min-h-[400px] flex flex-col items-center justify-center text-neutral-500 bg-neutral-900/50">
                    {connectionState === 'connecting' ? (
                        <>
                            <div className="w-20 h-20 rounded-full bg-neutral-800 flex items-center justify-center mb-4">
                                <Loader2 size={32} className="opacity-50 animate-spin" />
                            </div>
                            <p className="font-mono text-sm tracking-wider">CONNECTING</p>
                            <p className="text-xs text-neutral-600 mt-2">Establishing WebRTC connection...</p>
                        </>
                    ) : (
                        <>
                            <div className="w-20 h-20 rounded-full bg-neutral-800 flex items-center justify-center mb-4">
                                <VideoOff size={32} className="opacity-50" />
                            </div>
                            <p className="font-mono text-sm tracking-wider">
                                {connectionState === 'error' ? 'CONNECTION ERROR' : 'NO SIGNAL'}
                            </p>
                            <p className="text-xs text-neutral-600 mt-2 max-w-[300px] text-center">
                                {errorMessage || 'Waiting for WebRTC stream...'}
                            </p>
                        </>
                    )}
                </div>
            )}

            {/* Grid Overlay Effect */}
            <div className="absolute inset-0 pointer-events-none opacity-20"
                style={{ backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px)', backgroundSize: '50px 50px' }}>
            </div>
        </div>
    );
}
