"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
// Backend URL - set NEXT_PUBLIC_BACKEND_URL in .env for deployment
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://svvciv2ub2.execute-api.eu-west-1.amazonaws.com';
import { useDetection, DetectedObject } from '../context/DetectionContext';

interface ObjectDetectionOverlayProps {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    isVideoReady: boolean;
}

interface ServerPrediction {
    class_name: string;
    score: number;
    bbox: [number, number, number, number];
}

export default function ObjectDetectionOverlay({ videoRef, isVideoReady }: ObjectDetectionOverlayProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const detectionLoopRef = useRef<NodeJS.Timeout | null>(null);
    const lastLogTimeRef = useRef<number>(0);
    const lastSaveTimeRef = useRef<number>(0);
    const predictionsRef = useRef<ServerPrediction[]>([]);
    const isDetectingRef = useRef<boolean>(false);

    const [backendStatus, setBackendStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');

    const { setDetectedObjects, addDetectionLog, targetClass } = useDetection();

    // Save detections to DynamoDB
    const saveDetectionToDynamoDB = useCallback(async (objects: DetectedObject[]) => {
        try {
            await fetch('/api/save-detection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ objects: objects.map(o => ({ class: o.class, score: o.score })) }),
            });
        } catch (error) {
            console.error('[DynamoDB] Error:', error);
        }
    }, []);

    // Create frame canvas on mount
    useEffect(() => {
        frameCanvasRef.current = document.createElement('canvas');
    }, []);

    // Check backend health on mount
    useEffect(() => {
        const checkHealth = async () => {
            try {
                const response = await fetch(`${BACKEND_URL}/health`);
                if (response.ok) {
                    setBackendStatus('connected');
                    console.log('[Detection] Python backend connected');
                } else {
                    setBackendStatus('error');
                }
            } catch (error) {
                console.log('[Detection] Waiting for Python backend...');
                setBackendStatus('connecting');
                // Retry in 2 seconds
                setTimeout(checkHealth, 2000);
            }
        };
        checkHealth();
    }, []);

    // Draw bounding boxes
    const drawDetections = useCallback(() => {
        if (!canvasRef.current || !videoRef.current) return;

        const canvas = canvasRef.current;
        const video = videoRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth || video.clientWidth;
            canvas.height = video.videoHeight || video.clientHeight;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const predictions = predictionsRef.current;

        for (const prediction of predictions) {
            const [x, y, boxWidth, boxHeight] = prediction.bbox;
            const isTarget = targetClass && prediction.class_name.toLowerCase().includes(targetClass.toLowerCase());

            ctx.strokeStyle = isTarget ? '#10b981' : '#06b6d4';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, boxWidth, boxHeight);

            const label = `${prediction.class_name} ${Math.round(prediction.score * 100)}%`;
            ctx.font = 'bold 14px monospace';
            const textWidth = ctx.measureText(label).width;

            ctx.fillStyle = isTarget ? 'rgba(16, 185, 129, 0.8)' : 'rgba(6, 182, 212, 0.8)';
            ctx.fillRect(x - 1, y - 22, textWidth + 8, 22);

            ctx.fillStyle = '#ffffff';
            ctx.fillText(label, x + 4, y - 6);
        }
    }, [targetClass, videoRef]);

    // Redraw on every animation frame for smooth visuals
    useEffect(() => {
        let rafId: number;
        const draw = () => {
            drawDetections();
            rafId = requestAnimationFrame(draw);
        };
        rafId = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(rafId);
    }, [drawDetections]);

    // Detection loop - sends frames to Python server
    useEffect(() => {
        if (!isVideoReady || backendStatus !== 'connected' || !videoRef.current || !frameCanvasRef.current) return;

        const video = videoRef.current;
        let isRunning = true;

        const sendFrameToServer = async () => {
            if (!isRunning || !frameCanvasRef.current || video.paused || video.ended) {
                if (isRunning) detectionLoopRef.current = setTimeout(sendFrameToServer, 300);
                return;
            }

            // Skip if still detecting
            if (isDetectingRef.current) {
                if (isRunning) detectionLoopRef.current = setTimeout(sendFrameToServer, 50);
                return;
            }

            isDetectingRef.current = true;

            try {
                const frameCanvas = frameCanvasRef.current;
                const width = video.videoWidth || 320;
                const height = video.videoHeight || 240;

                frameCanvas.width = width;
                frameCanvas.height = height;

                const ctx = frameCanvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(video, 0, 0, width, height);

                    // Convert to JPEG base64
                    const imageData = frameCanvas.toDataURL('image/jpeg', 0.6).split(',')[1];

                    // Send to Python server
                    const response = await fetch(`${BACKEND_URL}/detect`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ imageData, width, height }),
                    });

                    if (response.ok) {
                        const result = await response.json();
                        predictionsRef.current = result.predictions || [];

                        const detectedObjects: DetectedObject[] = predictionsRef.current.map(p => ({
                            class: p.class_name,
                            score: p.score,
                            bbox: p.bbox
                        }));

                        setDetectedObjects(detectedObjects);

                        const now = Date.now();
                        if (predictionsRef.current.length > 0 && now - lastLogTimeRef.current > 2000) {
                            lastLogTimeRef.current = now;
                            console.log(`[Detection] ${predictionsRef.current.map(p => p.class_name).join(', ')}`);
                            addDetectionLog(predictionsRef.current.map(p => p.class_name));
                        }

                        if (predictionsRef.current.length > 0 && now - lastSaveTimeRef.current > 5000) {
                            lastSaveTimeRef.current = now;
                            saveDetectionToDynamoDB(detectedObjects);
                        }
                    }
                }
            } catch (error) {
                console.error('[Detection] Server error:', error);
                setBackendStatus('error');
            }

            isDetectingRef.current = false;

            if (isRunning) {
                detectionLoopRef.current = setTimeout(sendFrameToServer, 200);
            }
        };

        sendFrameToServer();

        return () => {
            isRunning = false;
            if (detectionLoopRef.current) clearTimeout(detectionLoopRef.current);
        };
    }, [isVideoReady, backendStatus, videoRef, setDetectedObjects, addDetectionLog, saveDetectionToDynamoDB]);

    return (
        <>
            <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ objectFit: 'cover' }}
            />

            {backendStatus === 'connecting' && (
                <div className="absolute bottom-4 right-4 z-20 px-3 py-2 bg-yellow-500/70 rounded-lg flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-white font-mono">Connecting to AI Server...</span>
                </div>
            )}

            {backendStatus === 'error' && (
                <div className="absolute bottom-4 right-4 z-20 px-3 py-2 bg-red-500/70 rounded-lg">
                    <span className="text-xs text-white font-mono">AI Server Offline</span>
                </div>
            )}

            {backendStatus === 'connected' && (
                <div className="absolute bottom-4 right-4 z-20 px-3 py-2 bg-black/50 rounded-lg flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                    <span className="text-xs text-white font-mono">AI </span>
                </div>
            )}
        </>
    );
}
