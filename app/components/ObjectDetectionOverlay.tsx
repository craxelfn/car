"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';
import { useDetection, DetectedObject } from '../context/DetectionContext';

interface ObjectDetectionOverlayProps {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    isVideoReady: boolean;
}

export default function ObjectDetectionOverlay({ videoRef, isVideoReady }: ObjectDetectionOverlayProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const modelRef = useRef<cocoSsd.ObjectDetection | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const lastLogTimeRef = useRef<number>(0);
    const lastSaveTimeRef = useRef<number>(0);

    const [isModelLoading, setIsModelLoading] = useState(true);
    const [modelError, setModelError] = useState<string | null>(null);

    const { setDetectedObjects, addDetectionLog, targetClass } = useDetection();

    // Save detections to DynamoDB
    const saveDetectionToDynamoDB = useCallback(async (objects: DetectedObject[]) => {
        try {
            const response = await fetch('/api/save-detection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    objects: objects.map(o => ({ class: o.class, score: o.score }))
                }),
            });

            if (response.ok) {
                const result = await response.json();
                console.log(`[DynamoDB] Saved detection: ${result.detectionId}`);
            } else {
                const error = await response.json();
                console.error('[DynamoDB] Failed to save:', error.error);
            }
        } catch (error) {
            console.error('[DynamoDB] Error saving detection:', error);
        }
    }, []);

    // Load the COCO-SSD model
    useEffect(() => {
        let isMounted = true;

        const loadModel = async () => {
            try {
                console.log('[Detection] Loading COCO-SSD model...');
                const model = await cocoSsd.load({
                    base: 'lite_mobilenet_v2' // Faster, lighter model
                });

                if (isMounted) {
                    modelRef.current = model;
                    setIsModelLoading(false);
                    console.log('[Detection] COCO-SSD model loaded successfully');
                }
            } catch (error) {
                console.error('[Detection] Failed to load model:', error);
                if (isMounted) {
                    setModelError(error instanceof Error ? error.message : 'Failed to load model');
                    setIsModelLoading(false);
                }
            }
        };

        loadModel();

        return () => {
            isMounted = false;
        };
    }, []);

    // Draw bounding boxes on canvas
    const drawDetections = useCallback((predictions: cocoSsd.DetectedObject[], ctx: CanvasRenderingContext2D, width: number, height: number) => {
        ctx.clearRect(0, 0, width, height);

        predictions.forEach((prediction) => {
            const [x, y, boxWidth, boxHeight] = prediction.bbox;
            const isTarget = targetClass !== '' &&
                prediction.class.toLowerCase().includes(targetClass.toLowerCase());

            // Draw bounding box
            ctx.strokeStyle = isTarget ? '#10b981' : '#06b6d4'; // Green for target, cyan for others
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, boxWidth, boxHeight);

            // Draw label background
            const label = `${prediction.class} ${Math.round(prediction.score * 100)}%`;
            ctx.font = 'bold 14px monospace';
            const textMetrics = ctx.measureText(label);
            const textHeight = 18;
            const padding = 4;

            ctx.fillStyle = isTarget ? 'rgba(16, 185, 129, 0.8)' : 'rgba(6, 182, 212, 0.8)';
            ctx.fillRect(
                x - 1,
                y - textHeight - padding,
                textMetrics.width + padding * 2,
                textHeight + padding
            );

            // Draw label text
            ctx.fillStyle = '#ffffff';
            ctx.fillText(label, x + padding, y - padding - 2);
        });
    }, [targetClass]);

    // Run detection loop
    useEffect(() => {
        if (!isVideoReady || isModelLoading || !modelRef.current || !videoRef.current || !canvasRef.current) {
            return;
        }

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let isRunning = true;

        const detectFrame = async () => {
            if (!isRunning || !modelRef.current || video.paused || video.ended) {
                animationFrameRef.current = requestAnimationFrame(detectFrame);
                return;
            }

            try {
                // Ensure canvas matches video dimensions
                if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                    canvas.width = video.videoWidth || video.clientWidth;
                    canvas.height = video.videoHeight || video.clientHeight;
                }

                // Run detection
                const predictions = await modelRef.current.detect(video);

                // Convert to our format
                const detectedObjects: DetectedObject[] = predictions.map(p => ({
                    class: p.class,
                    score: p.score,
                    bbox: p.bbox as [number, number, number, number]
                }));

                // Update context
                setDetectedObjects(detectedObjects);

                // Draw bounding boxes
                drawDetections(predictions, ctx, canvas.width, canvas.height);

                // Log detections (throttled to every 2 seconds)
                const now = Date.now();
                if (predictions.length > 0 && now - lastLogTimeRef.current > 2000) {
                    lastLogTimeRef.current = now;
                    const objectNames = predictions.map(p => `${p.class} (${Math.round(p.score * 100)}%)`);
                    console.log(`[Detection] Detected: ${objectNames.join(', ')}`);
                    addDetectionLog(predictions.map(p => p.class));
                }

                // Save to DynamoDB (throttled to every 5 seconds)
                if (predictions.length > 0 && now - lastSaveTimeRef.current > 5000) {
                    lastSaveTimeRef.current = now;
                    saveDetectionToDynamoDB(detectedObjects);
                }
            } catch (error) {
                console.error('[Detection] Error during detection:', error);
            }

            // Continue detection loop (throttle to ~5 FPS for performance)
            setTimeout(() => {
                if (isRunning) {
                    animationFrameRef.current = requestAnimationFrame(detectFrame);
                }
            }, 200);
        };

        animationFrameRef.current = requestAnimationFrame(detectFrame);

        return () => {
            isRunning = false;
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [isVideoReady, isModelLoading, videoRef, drawDetections, setDetectedObjects, addDetectionLog, saveDetectionToDynamoDB]);

    return (
        <>
            {/* Detection overlay canvas */}
            <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ objectFit: 'cover' }}
            />

            {/* Model loading indicator */}
            {isModelLoading && (
                <div className="absolute bottom-4 right-4 z-20 px-3 py-2 bg-black/70 rounded-lg flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-white font-mono">Loading AI Model...</span>
                </div>
            )}

            {/* Model error indicator */}
            {modelError && (
                <div className="absolute bottom-4 right-4 z-20 px-3 py-2 bg-red-500/70 rounded-lg">
                    <span className="text-xs text-white font-mono">AI Error: {modelError}</span>
                </div>
            )}

            {/* Model ready indicator */}
            {!isModelLoading && !modelError && (
                <div className="absolute bottom-4 right-4 z-20 px-3 py-2 bg-black/50 rounded-lg flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                    <span className="text-xs text-white font-mono">AI Detection Active</span>
                </div>
            )}
        </>
    );
}
