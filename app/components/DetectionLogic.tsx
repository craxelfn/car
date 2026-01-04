"use client";

import { Search, Target } from 'lucide-react';
import { useDetection } from '../context/DetectionContext';

export default function DetectionLogic() {
    const {
        detectedObjects,
        targetClass,
        setTargetClass,
        isTargetFound
    } = useDetection();

    // Get highest confidence detection
    const topDetection = detectedObjects.length > 0
        ? detectedObjects.reduce((max, obj) => obj.score > max.score ? obj : max, detectedObjects[0])
        : null;

    // Get unique detected classes
    const uniqueClasses = [...new Set(detectedObjects.map(obj => obj.class))];

    return (
        <></>
    );
}
