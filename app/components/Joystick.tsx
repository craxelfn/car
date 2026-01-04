"use client";

import { useRef, useCallback, useEffect } from 'react';
import { Crosshair } from 'lucide-react';
import clsx from 'clsx';

interface JoystickProps {
    label: string;
    type: 'movement' | 'camera';
    onMove?: (x: number, y: number) => void;
    className?: string;
}

export default function Joystick({ label, type, onMove, className }: JoystickProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const stickRef = useRef<HTMLDivElement>(null);
    const isActiveRef = useRef(false);
    const positionRef = useRef({ x: 0, y: 0 });
    const rafRef = useRef<number | null>(null);
    const maxRadius = 60;

    // Direct position update - no interpolation for instant response
    const updatePosition = useCallback((x: number, y: number) => {
        positionRef.current = { x, y };
        if (stickRef.current) {
            stickRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        }
    }, []);

    // Smooth spring-back animation when released
    const animateBack = useCallback(() => {
        const current = positionRef.current;

        // Fast spring back
        current.x *= 0.75;
        current.y *= 0.75;

        // Snap to zero if close
        if (Math.abs(current.x) < 1 && Math.abs(current.y) < 1) {
            current.x = 0;
            current.y = 0;
        }

        if (stickRef.current) {
            stickRef.current.style.transform = `translate3d(${current.x}px, ${current.y}px, 0)`;
        }

        if (current.x !== 0 || current.y !== 0) {
            rafRef.current = requestAnimationFrame(animateBack);
        } else {
            rafRef.current = null;
        }
    }, []);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        isActiveRef.current = true;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);

        // Cancel any ongoing animation
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }

        if (containerRef.current) {
            containerRef.current.style.borderColor = 'rgb(6 182 212)';
            containerRef.current.style.boxShadow = '0 0 20px rgba(6, 182, 212, 0.3)';
        }
    }, []);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isActiveRef.current || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        let x = e.clientX - centerX;
        let y = e.clientY - centerY;

        const distance = Math.sqrt(x * x + y * y);
        if (distance > maxRadius) {
            const angle = Math.atan2(y, x);
            x = Math.cos(angle) * maxRadius;
            y = Math.sin(angle) * maxRadius;
        }

        // Instant update - no delay
        updatePosition(x, y);

        const normX = x / maxRadius;
        const normY = -(y / maxRadius);
        onMove?.(normX, normY);
    }, [onMove, updatePosition]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        isActiveRef.current = false;
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);

        if (containerRef.current) {
            containerRef.current.style.borderColor = '';
            containerRef.current.style.boxShadow = '';
        }

        // Start spring-back animation
        rafRef.current = requestAnimationFrame(animateBack);
        onMove?.(0, 0);
    }, [onMove, animateBack]);

    useEffect(() => {
        return () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, []);

    return (
        <div className={clsx("flex flex-col items-center gap-4 select-none", className)}>
            <div
                ref={containerRef}
                className="w-48 h-48 rounded-full border-4 border-neutral-700 flex items-center justify-center relative touch-none bg-neutral-900/50"
                style={{ transition: 'border-color 0.15s, box-shadow 0.15s' }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onPointerCancel={handlePointerUp}
            >
                <div
                    ref={stickRef}
                    style={{
                        transform: 'translate3d(0px, 0px, 0)',
                        willChange: 'transform',
                        backfaceVisibility: 'hidden'
                    }}
                    className={clsx(
                        "w-20 h-20 rounded-full shadow-xl flex items-center justify-center pointer-events-none",
                        type === 'movement'
                            ? "bg-gradient-to-br from-cyan-500 to-blue-700 text-white"
                            : "bg-gradient-to-br from-purple-500 to-indigo-700 text-white"
                    )}
                >
                    {type === 'movement' ? <Crosshair size={24} /> : <div className="w-3 h-3 bg-white rounded-full" />}
                </div>
            </div>

            <span className="font-mono text-xs uppercase tracking-widest text-neutral-400">
                {label}
            </span>
        </div>
    );
}
