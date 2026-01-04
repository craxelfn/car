"use client";
import { useRef, useState, useEffect } from 'react';

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
  const [systemStats, setSystemStats] = useState<{ cpu: number; ram: number } | null>(null);

  // Poll system stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/system-stats');
        if (res.ok) {
          const data = await res.json();
          if (data.cpu !== undefined) {
            setSystemStats({ cpu: data.cpu, ram: data.ram });
          }
        }
      } catch (e) {
        console.error("Failed to fetch stats", e);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
  }, []);

  useKeyboardControls({
    onMove: (command: string) => {
      console.log(`[Keyboard] Triggering API: ${command}`);
      sendCommand(command);
    }
  });

  const lastJoystickCommand = useRef<string>('stop');

  const handleJoystickMove = (x: number, y: number) => {
    let command = 'stop';

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

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour12: false });
  };

  return (
    <main className="h-screen w-screen p-3 flex flex-col overflow-hidden bg-background">
      {/* Header - Fixed height */}
      <header className="flex items-center justify-between py-2 shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter text-foreground">
            PiBot<span className="text-cyan-500">.Control</span>
          </h1>
          <p className="text-neutral-500 text-xs font-mono">OPERATOR: ADMIN_01</p>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border">
            <div className={clsx("w-2 h-2 rounded-full", isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500")} />
            <span className="text-xs font-mono font-bold uppercase text-neutral-400">
              {status === 'connected' ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
          <button className="p-2 rounded-full bg-card border border-border hover:text-cyan-400 transition-colors text-foreground">
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* Content Grid - Fills remaining space */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-3 min-h-0">
        {/* Main Video Stream - Takes 4/5 width */}
        <div className="lg:col-span-4 min-h-0">
          <VideoPlayer className="w-full h-full" />
        </div>

        {/* Right Sidebar - Takes 1/5 width */}
        <div className="flex flex-col gap-2 min-h-0 overflow-hidden">
          {/* Status Cards - Compact */}
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-2 shrink-0">
            <StatusCard
              label="CPU Load"
              value={systemStats ? `${systemStats.cpu}%` : '--%'}
              icon={Activity}
              status={systemStats && systemStats.cpu > 80 ? 'warning' : 'normal'}
            />
            <StatusCard
              label="RAM Usage"
              value={systemStats ? `${systemStats.ram}%` : '--%'}
              icon={Signal}
              status="normal"
            />
          </div>

          {/* Log Console - Fills available space */}
          <div className="flex-1 bg-neutral-900/50 rounded-lg border border-neutral-800 p-2 font-mono text-[10px] text-neutral-400 overflow-hidden min-h-0">
            <div className="text-[8px] uppercase text-neutral-600 mb-1">Syslog</div>
            <div className="flex flex-col gap-0.5 h-full overflow-y-auto">
              <span className="text-emerald-500/80">[SYS] Initialized</span>
              <span className="text-blue-500/80">[MQTT] Connected</span>
              {lastMessage && (
                <span className="text-cyan-500/80">&gt; {lastMessage}</span>
              )}
              {detectionLogs.slice(0, 5).map((log, idx) => (
                <span key={idx} className="text-purple-400/80 truncate">
                  [{formatTime(log.timestamp).slice(0, 5)}] {log.objects.slice(0, 2).join(', ')}
                </span>
              ))}
            </div>
          </div>

          {/* Joystick - Fixed size at bottom */}
          <div className="bg-neutral-900/30 border border-neutral-800 rounded-lg p-2 flex justify-center shrink-0">
            <Joystick
              label="Move"
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
