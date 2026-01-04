"use client";
import { useRef } from 'react';

import { Activity, Signal, Wifi, Settings } from 'lucide-react';
import VideoPlayer from './components/VideoPlayer';
import Joystick from './components/Joystick';
import StatusCard from './components/StatusCard';
import { useIoTConnection } from './context/IoTConnectionContext';
import { DetectionProvider, useDetection } from './context/DetectionContext';
import clsx from 'clsx';

import { ThemeToggle } from './components/ThemeToggle';
import { useKeyboardControls } from './hooks/use-keyboard-controls';

function DashboardContent() {
  const { isConnected, status, sendCommand, lastMessage } = useIoTConnection();
  const { detectionLogs } = useDetection();

  // Use the new keyboard controls hook
  useKeyboardControls({
    onMove: (command: string) => {
      console.log(`[Keyboard] Triggering API: ${command}`);
      sendCommand(command);
    }
  });

  // Ref to track the last sent joystick command to avoid spamming the API
  const lastJoystickCommand = useRef<string>('stop');

  const handleJoystickMove = (x: number, y: number) => {
    let command = 'stop';

    // Simple threshold logic for direction
    // Using 0.4 threshold for easier triggering
    if (y > 0.4) command = 'forward';
    else if (y < -0.4) command = 'backward';
    else if (x < -0.4) command = 'left';
    else if (x > 0.4) command = 'right';

    if (command !== lastJoystickCommand.current) {
      lastJoystickCommand.current = command;
      console.log(`[Joystick] Triggering API: ${command}`);
      sendCommand(command);
    }
  };

  // Format time for logs
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour12: false });
  };

  return (
    <main className="min-h-screen p-6 md:p-8 flex flex-col gap-6 max-w-[1600px] mx-auto transition-colors duration-300">
      {/* Header */}
      <header className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter text-foreground">
            PiBot<span className="text-cyan-500">.Control</span>
          </h1>
          <p className="text-neutral-500 text-sm font-mono mt-1">OPERATOR: ADMIN_01 // SESSION: ACTIVE</p>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border">
            <div className={clsx("w-2 h-2 rounded-full", isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500")} />
            <span className="text-xs font-mono font-bold uppercase text-neutral-400">
              {status === 'connected' ? 'SYSTEM ONLINE' : 'DISCONNECTED'}
            </span>
          </div>
          <button className="p-2 rounded-full bg-card border border-border hover:text-cyan-400 transition-colors text-foreground">
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* Top Grid: Video & Status */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-[500px]">
        {/* Main Video Stream */}
        <div className="lg:col-span-3 h-full">
          <VideoPlayer className="w-full h-full min-h-[400px]" />
        </div>

        {/* Right Sidebar: Status & Telemetry */}
        <div className="flex flex-col gap-4 h-full">
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-4">
            <StatusCard
              label="Signal"
              value="-42 dBm"
              icon={Wifi}
              status="normal"
            />
            <StatusCard
              label="CPU Load"
              value="12%"
              icon={Activity}
              status="normal"
            />
            <StatusCard
              label="Latency"
              value="24ms"
              icon={Signal}
              status="normal"
            />
          </div>

          {/* Mini Log / Console */}
          <div className="flex-1 bg-neutral-900/50 rounded-xl border border-neutral-800 p-4 font-mono text-xs text-neutral-400 overflow-hidden relative">
            <div className="absolute top-2 right-2 text-[10px] uppercase text-neutral-600">Syslog</div>
            <div className="flex flex-col gap-1 mt-4 max-h-[200px] overflow-y-auto">
              <span className="text-emerald-500/80">[10:42:01] System intialized</span>
              <span className="text-blue-500/80">[10:42:02] Connected to broker</span>
              <span className="text-neutral-500">[10:42:03] Video stream ready</span>
              <span className="text-neutral-500">[10:42:05] Telemetry active</span>
              {lastMessage && (
                <span className="text-cyan-500/80 font-bold flex items-center gap-2">
                  <span>{`> ${lastMessage}`}</span>
                </span>
              )}
              {/* Detection logs */}
              {detectionLogs.slice(0, 10).map((log, idx) => (
                <span key={idx} className="text-purple-400/80">
                  [{formatTime(log.timestamp)}] Detected: {log.objects.join(', ')}
                </span>
              ))}
            </div>
          </div>
          <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-6">
            <Joystick
              label="Movement"
              type="movement"
              onMove={handleJoystickMove}
            />
          </div>
        </div>
      </div>


    </main>
  );
}

export default function Home() {
  return (
    <DetectionProvider>
      <DashboardContent />
    </DetectionProvider>
  );
}
