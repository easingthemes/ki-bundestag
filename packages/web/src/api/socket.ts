import { io, type Socket } from "socket.io-client";
import type { SimulationEvent, SimulationStatus } from "./types";

type SimStatusHandler = (status: SimulationStatus) => void;
type SimEventsHandler = (events: SimulationEvent[]) => void;
type NotificationRefreshHandler = () => void;

let socket: Socket | null = null;
let connected = false;

const statusHandlers = new Set<SimStatusHandler>();
const eventsHandlers = new Set<SimEventsHandler>();
const notificationHandlers = new Set<NotificationRefreshHandler>();

function getSocket(): Socket {
  if (!socket) {
    // In dev, Vite proxies /socket.io to the API server.
    // In prod, the API serves both REST and WS on the same origin.
    socket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 2_000,
      reconnectionDelayMax: 10_000,
    });

    socket.on("connect", () => {
      connected = true;
    });

    socket.on("disconnect", () => {
      connected = false;
    });

    socket.on("sim:status", (data: SimulationStatus) => {
      for (const h of statusHandlers) h(data);
    });

    socket.on("sim:events", (data: SimulationEvent[]) => {
      for (const h of eventsHandlers) h(data);
    });

    socket.on("notifications:refresh", () => {
      for (const h of notificationHandlers) h();
    });
  }
  return socket;
}

/** Whether the WebSocket is currently connected */
export function isSocketConnected(): boolean {
  return connected;
}

/** Subscribe to simulation status updates. Returns unsubscribe function. */
export function onSimStatus(handler: SimStatusHandler): () => void {
  getSocket(); // ensure connected
  statusHandlers.add(handler);
  return () => { statusHandlers.delete(handler); };
}

/** Subscribe to new simulation events. Returns unsubscribe function. */
export function onSimEvents(handler: SimEventsHandler): () => void {
  getSocket();
  eventsHandlers.add(handler);
  return () => { eventsHandlers.delete(handler); };
}

/** Subscribe to notification refresh signals. Returns unsubscribe function. */
export function onNotificationRefresh(handler: NotificationRefreshHandler): () => void {
  getSocket();
  notificationHandlers.add(handler);
  return () => { notificationHandlers.delete(handler); };
}
