import { useState, useEffect, useRef } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { Overlay } from "./Overlay";
import "../../styles/overlay.css";

type PluginMessage =
  | { type: "show"; hook_id?: string; stop_movement?: boolean }
  | { type: "hide" }
  | { type: "animation"; name: string }
  | { type: "progress"; text: string };

type OverlayState = {
  visible: boolean;
  animationName: string;
  progressText: string;
};

type MovementState = {
  direction: "horizontal" | "vertical" | "none";
  speed: number;
  initialX: number;
  initialY: number;
  currentX: number;
  currentY: number;
  moving: boolean;
};

const WIN_W = 320;
const WIN_H = 180;
const MARGIN = 20;
const DEFAULT_SPEED = 4; // pixels per frame

async function moveToRandomPosition() {
  const monitor = await currentMonitor();
  if (!monitor) return { x: 0, y: 0 };

  const { width, height } = monitor.size;
  const scale = monitor.scaleFactor;
  const winWPx = WIN_W * scale;
  const winHPx = WIN_H * scale;

  const maxX = Math.max(0, width - winWPx - MARGIN * scale);
  const maxY = Math.max(0, height - winHPx - MARGIN * scale);
  const x = monitor.position.x + Math.floor(Math.random() * maxX);
  const y = monitor.position.y + Math.floor(Math.random() * maxY);

  await getCurrentWindow().setPosition(new PhysicalPosition(x, y));
  return { x, y };
}

export function OverlayApp() {
  const [state, setState] = useState<OverlayState>({
    visible: false,
    animationName: "",
    progressText: "",
  });
  // Track whether the window has been given an initial random position.
  // After the first show, subsequent shows (from different hooks) reuse the
  // current position so the window doesn't jump around. If the user drags the
  // window, its OS position is updated automatically and will be preserved too.
  const hasPositionedRef = useRef(false);
  // When true, startMovement will refuse to run even if !moving.
  // Set synchronously by stopMovement(); cleared synchronously when an active
  // (non-stop) show is received — before any awaits, so concurrent handlers
  // that were already suspended see the correct value when they resume.
  const movementFrozenRef = useRef(false);
  const movementStateRef = useRef<MovementState>({
    direction: "none",
    speed: DEFAULT_SPEED,
    initialX: 0,
    initialY: 0,
    currentX: 0,
    currentY: 0,
    moving: false,
  });
  const animationFrameRef = useRef<number | null>(null);

  // Load movement direction from hook config
  const loadMovementConfig = async (hookId?: string) => {
    try {
      if (!hookId) {
        movementStateRef.current.direction = "none";
        movementStateRef.current.speed = DEFAULT_SPEED;
        return;
      }

      const [opencodeConfig, ccConfig] = await Promise.all([
        invoke<Record<string, { movement_direction?: string; movement_speed?: number }>>("get_hook_config", { client: "opencode" }),
        invoke<Record<string, { movement_direction?: string; movement_speed?: number }>>("get_hook_config", { client: "cc" }),
      ]);

      const hookAssignment = opencodeConfig[hookId] || ccConfig[hookId];
      
      if (hookAssignment?.movement_direction != null) {
        movementStateRef.current.direction = hookAssignment.movement_direction as "horizontal" | "vertical" | "none";
      }
      
      if (hookAssignment?.movement_speed != null && 
          hookAssignment.movement_speed >= 1 && 
          hookAssignment.movement_speed <= 8) {
        movementStateRef.current.speed = hookAssignment.movement_speed;
      } else {
        movementStateRef.current.speed = DEFAULT_SPEED;
      }
    } catch (e) {
      console.error("[OverlayApp] failed to load movement config:", e);
      movementStateRef.current.direction = "none";
      movementStateRef.current.speed = DEFAULT_SPEED;
    }
  };

  // Start movement animation
  const startMovement = async () => {
    // Guard against concurrent calls and frozen state.
    // Both checks must happen synchronously before any await.
    if (movementStateRef.current.moving) {
      return;
    }
    if (movementFrozenRef.current) {
      return;
    }
    movementStateRef.current.moving = true;

    const monitor = await currentMonitor();
    if (!monitor) {
      movementStateRef.current.moving = false;
      return;
    }

    const { width, height } = monitor.size;
    const scale = monitor.scaleFactor;
    const winWPx = WIN_W * scale;
    const winHPx = WIN_H * scale;

    const maxX = Math.max(0, width - winWPx - MARGIN * scale);
    const maxY = Math.max(0, height - winHPx - MARGIN * scale);

    const movement = movementStateRef.current;

    const win = getCurrentWindow();
    const animate = () => {
      if (!movement.moving) return;

      let newX = movement.currentX;
      let newY = movement.currentY;

      if (movement.direction === "horizontal") {
        newX += movement.speed;
        if (newX >= monitor.position.x + maxX) {
          newX = movement.initialX;
        }
      } else if (movement.direction === "vertical") {
        newY += movement.speed;
        if (newY >= monitor.position.y + maxY) {
          newY = movement.initialY;
        }
      }

      if (newX !== movement.currentX || newY !== movement.currentY) {
        movement.currentX = newX;
        movement.currentY = newY;
        win.setPosition(new PhysicalPosition(newX, newY));
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
  };

  // Stop movement animation
  const stopMovement = () => {
    movementFrozenRef.current = true;
    movementStateRef.current.moving = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  };

  useEffect(() => {
    const unlisten = listen<PluginMessage>("plugin-message", async ({ payload }) => {
      const win = getCurrentWindow();

      switch (payload.type) {
        case "show":
          setState((s) => ({ ...s, visible: true }));

          if (payload.stop_movement) {
            stopMovement();
            win.show();
            break;
          }

          // Unfreeze synchronously (before any await) so that if stopMovement()
          // was called by a concurrent handler while we are suspended below,
          // startMovement will correctly see the frozen flag when we resume.
          movementFrozenRef.current = false;

          // Load movement configuration for this hook
          await loadMovementConfig(payload.hook_id);
          
          // If direction is "none" and we're currently moving, stop movement
          if (movementStateRef.current.direction === "none" && movementStateRef.current.moving) {
            stopMovement();
            win.show();
            break;
          }
          
          if (!hasPositionedRef.current) {
            hasPositionedRef.current = true;
            const pos = await moveToRandomPosition();
            movementStateRef.current.initialX = pos.x;
            movementStateRef.current.initialY = pos.y;
            movementStateRef.current.currentX = pos.x;
            movementStateRef.current.currentY = pos.y;
            win.show();
            
            // Start movement if direction is not "none"
            if (movementStateRef.current.direction !== "none") {
              startMovement();
            }
          } else {
            win.show();
            
            // Resume movement if direction is not "none"
            if (movementStateRef.current.direction !== "none" && !movementStateRef.current.moving) {
              startMovement();
            }
          }
          break;
        case "hide":
          setState((s) => ({ ...s, visible: false, progressText: "" }));
          stopMovement();
          win.hide();
          break;
        case "animation":
          setState((s) => ({ ...s, animationName: payload.name }));
          break;
        case "progress":
          setState((s) => ({ ...s, progressText: payload.text }));
          break;
      }
    });

    // Notify the backend that listeners are registered and ready to receive events
    emit("overlay-ready", {});

    return () => {
      stopMovement();
      unlisten.then((fn) => fn());
    };
  }, []);

  if (!state.visible) {
    return null;
  }

  return (
    <Overlay
      animationName={state.animationName}
      progressText={state.progressText}
    />
  );
}
