"use client";

import { createContext, useContext, useState, ReactNode, useCallback } from 'react';

export interface DetectedObject {
    class: string;
    score: number;
    bbox: [number, number, number, number]; // [x, y, width, height]
}

export interface DetectionLog {
    timestamp: Date;
    objects: string[];
}

interface DetectionContextType {
    detectedObjects: DetectedObject[];
    detectionLogs: DetectionLog[];
    targetClass: string;
    isTargetFound: boolean;
    isPaused: boolean;
    setDetectedObjects: (objects: DetectedObject[]) => void;
    setTargetClass: (target: string) => void;
    addDetectionLog: (objects: string[]) => void;
    setPaused: (paused: boolean) => void;
}

const DetectionContext = createContext<DetectionContextType | undefined>(undefined);

export function DetectionProvider({ children }: { children: ReactNode }) {
    const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
    const [detectionLogs, setDetectionLogs] = useState<DetectionLog[]>([]);
    const [targetClass, setTargetClass] = useState<string>('');
    const [isPaused, setPaused] = useState<boolean>(false);

    const isTargetFound = targetClass !== '' &&
        detectedObjects.some(obj =>
            obj.class.toLowerCase().includes(targetClass.toLowerCase())
        );

    const addDetectionLog = useCallback((objects: string[]) => {
        if (objects.length === 0) return;

        setDetectionLogs(prev => {
            const newLog = { timestamp: new Date(), objects };
            const updated = [newLog, ...prev].slice(0, 50);
            return updated;
        });
    }, []);

    return (
        <DetectionContext.Provider value={{
            detectedObjects,
            detectionLogs,
            targetClass,
            isTargetFound,
            isPaused,
            setDetectedObjects,
            setTargetClass,
            addDetectionLog,
            setPaused,
        }}>
            {children}
        </DetectionContext.Provider>
    );
}

export function useDetection() {
    const context = useContext(DetectionContext);
    if (!context) {
        throw new Error('useDetection must be used within a DetectionProvider');
    }
    return context;
}
