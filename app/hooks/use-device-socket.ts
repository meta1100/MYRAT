import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { z } from "zod";

export const deviceFeatures = [
  "file-manager",
  "camera",
  "gallery",
  "sms",
  "contacts",
  "location",
  "live-camera",
  "live-screen",
  "notifications",
  "call-log",
  "device-health",
  "alarm",
] as const;

export type DeviceFeature = (typeof deviceFeatures)[number];

const DeviceSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(120),
  platform: z.string().min(1).max(64),
  online: z.boolean(),
  batteryPercent: z.number().int().min(0).max(100).nullable(),
  network: z.string().max(80).nullable(),
  ipAddress: z.string().max(64).nullable(),
});

const GalleryItemSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(255),
  mimeType: z.string().max(128),
  sizeBytes: z.number().nonnegative(),
  modifiedAt: z.string().datetime().nullable(),
});

const GallerySnapshotSchema = z.object({
  deviceId: z.string().min(1).max(128),
  items: z.array(GalleryItemSchema).max(500),
});

const ActivitySchema = z.object({
  id: z.string().min(1).max(128),
  deviceId: z.string().min(1).max(128),
  createdAt: z.string().datetime(),
  kind: z.enum(["connected", "disconnected", "permission", "feature", "error"]),
  message: z.string().max(240),
});

const FeatureRecordSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().max(200),
  detail: z.string().max(500).nullable().optional(),
  occurredAt: z.string().datetime().nullable().optional(),
});

const FeatureSnapshotSchema = z.object({
  deviceId: z.string().min(1).max(128),
  feature: z.enum(deviceFeatures),
  records: z.array(FeatureRecordSchema).max(100),
});

const FrameSchema = z.object({
  deviceId: z.string().min(1).max(128),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  bytes: z.instanceof(Uint8Array).refine((value) => value.byteLength > 0 && value.byteLength <= 1_500_000),
});

const FeatureAckSchema = z.object({
  status: z.enum(["ready", "permission_required", "denied", "unsupported", "offline", "error"]),
  message: z.string().max(240).optional(),
});

const FeatureStateSchema = FeatureAckSchema.extend({
  deviceId: z.string().min(1).max(128),
  feature: z.enum(deviceFeatures),
});

export type Device = z.infer<typeof DeviceSchema>;
export type GalleryItem = z.infer<typeof GalleryItemSchema>;
export type DeviceActivity = z.infer<typeof ActivitySchema>;
export type FeatureRecord = z.infer<typeof FeatureRecordSchema>;
export type FeatureRequestResult = z.infer<typeof FeatureAckSchema> | { status: "disconnected" | "timeout" };
type FeatureMap<T> = Record<string, T>;
type FrameSet = { screen: string | null; camera: string | null };

export function useDeviceSocket() {
  const socketRef = useRef<Socket | null>(null);
  const frameUrlsRef = useRef(new Map<string, string>());
  const lastFrameAtRef = useRef(0);
  const pendingFrameRef = useRef<{ kind: "screen" | "camera"; payload: z.infer<typeof FrameSchema> } | null>(null);
  const frameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connection, setConnection] = useState<"unconfigured" | "connecting" | "connected" | "reconnecting" | "disconnected" | "misconfigured">("unconfigured");
  const [devices, setDevices] = useState<Device[]>([]);
  const [gallery, setGallery] = useState<FeatureMap<GalleryItem[]>>({});
  const [activities, setActivities] = useState<FeatureMap<DeviceActivity[]>>({});
  const [frames, setFrames] = useState<FeatureMap<FrameSet>>({});
  const [featureRecords, setFeatureRecords] = useState<FeatureMap<Partial<Record<DeviceFeature, FeatureRecord[]>>>>({});
  const [featureStates, setFeatureStates] = useState<FeatureMap<Partial<Record<DeviceFeature, FeatureRequestResult>>>>({});
  
  const url = import.meta.env.VITE_DEVICE_SOCKET_URL?.trim();

  function clearFrames() {
    if (frameTimerRef.current) clearTimeout(frameTimerRef.current);
    frameTimerRef.current = null;
    pendingFrameRef.current = null;
    frameUrlsRef.current.forEach((frameUrl) => URL.revokeObjectURL(frameUrl));
    frameUrlsRef.current.clear();
    setFrames({});
  }

  function applyFrame(kind: "screen" | "camera", payload: z.infer<typeof FrameSchema>) {
    const key = `${payload.deviceId}:${kind}`;
    const previousUrl = frameUrlsRef.current.get(key);
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    const buffer = payload.bytes.buffer.slice(payload.bytes.byteOffset, payload.bytes.byteOffset + payload.bytes.byteLength);
    const frameUrl = URL.createObjectURL(new Blob([buffer], { type: payload.mimeType }));
    frameUrlsRef.current.set(key, frameUrl);
    lastFrameAtRef.current = Date.now();
    setFrames((current) => ({
      ...current,
      [payload.deviceId]: {
        screen: kind === "screen" ? frameUrl : current[payload.deviceId]?.screen ?? null,
        camera: kind === "camera" ? frameUrl : current[payload.deviceId]?.camera ?? null,
      },
    }));
  }

  function storeFrame(kind: "screen" | "camera", payload: z.infer<typeof FrameSchema>) {
    const remaining = 100 - (Date.now() - lastFrameAtRef.current);
    if (remaining <= 0) {
      applyFrame(kind, payload);
      return;
    }
    pendingFrameRef.current = { kind, payload };
    if (frameTimerRef.current) return;
    frameTimerRef.current = setTimeout(() => {
      frameTimerRef.current = null;
      const pending = pendingFrameRef.current;
      pendingFrameRef.current = null;
      if (pending) applyFrame(pending.kind, pending.payload);
    }, remaining);
  }

  useEffect(() => {
    if (!url) {
      setConnection("unconfigured");
      return;
    }

    let endpoint: URL;
    try {
      endpoint = new URL(url);
    } catch {
      setConnection("misconfigured");
      return;
    }
    const localHttp = endpoint.protocol === "http:" && ["localhost", "127.0.0.1"].includes(endpoint.hostname);
    if (endpoint.protocol !== "https:" && !localHttp) {
      setConnection("misconfigured");
      return;
    }

    setConnection("connecting");
    
    // সকেট কনফিগারেশন আপডেট করা হয়েছে (path এবং transports সহ)
    const socket = io(url, {
      path: "/socket.io/",
      autoConnect: false,
      withCredentials: true,
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: 8000,
      auth: { protocol: "device-console.v1" },
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnection("connected");
      socket.emit("device:v1:inventory:request");
    });
    socket.on("disconnect", () => {
      setConnection("disconnected");
      clearFrames();
    });
    socket.on("connect_error", () => setConnection("reconnecting"));
    socket.io.on("reconnect_attempt", () => setConnection("reconnecting"));
    
    socket.on("device:v1:inventory:snapshot", (payload: unknown) => {
      const parsed = z.array(DeviceSchema).max(100).safeParse(payload);
      if (parsed.success) setDevices(parsed.data);
    });
    socket.on("device:v1:gallery:snapshot", (payload: unknown) => {
      const parsed = GallerySnapshotSchema.safeParse(payload);
      if (parsed.success) setGallery((current) => ({ ...current, [parsed.data.deviceId]: parsed.data.items }));
    });
    socket.on("device:v1:activity:snapshot", (payload: unknown) => {
      const parsed = z.array(ActivitySchema).max(100).safeParse(payload);
      if (parsed.success) {
        setActivities(parsed.data.reduce<FeatureMap<DeviceActivity[]>>((grouped, event) => {
          (grouped[event.deviceId] ??= []).push(event);
          return grouped;
        }, {}));
      }
    });
    socket.on("device:v1:activity:event", (payload: unknown) => {
      const parsed = ActivitySchema.safeParse(payload);
      if (parsed.success) setActivities((current) => ({
        ...current,
        [parsed.data.deviceId]: [parsed.data, ...(current[parsed.data.deviceId] ?? [])].slice(0, 100),
      }));
    });
    socket.on("device:v1:screen:frame", (payload: unknown) => {
      const parsed = FrameSchema.safeParse(payload);
      if (parsed.success) storeFrame("screen", parsed.data);
    });
    socket.on("device:v1:camera:frame", (payload: unknown) => {
      const parsed = FrameSchema.safeParse(payload);
      if (parsed.success) storeFrame("camera", parsed.data);
    });
    socket.on("device:v1:feature:snapshot", (payload: unknown) => {
      const parsed = FeatureSnapshotSchema.safeParse(payload);
      if (parsed.success) setFeatureRecords((current) => ({
        ...current,
        [parsed.data.deviceId]: { ...current[parsed.data.deviceId], [parsed.data.feature]: parsed.data.records },
      }));
    });
    socket.on("device:v1:feature:state", (payload: unknown) => {
      const parsed = FeatureStateSchema.safeParse(payload);
      if (parsed.success) setFeatureStates((current) => ({
        ...current,
        [parsed.data.deviceId]: { ...current[parsed.data.deviceId], [parsed.data.feature]: parsed.data },
      }));
    });

    socket.connect();
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      if (frameTimerRef.current) clearTimeout(frameTimerRef.current);
      frameTimerRef.current = null;
      pendingFrameRef.current = null;
      frameUrlsRef.current.forEach((frameUrl) => URL.revokeObjectURL(frameUrl));
      frameUrlsRef.current.clear();
      socketRef.current = null;
    };
  }, [url]);

  const requestFeature = useCallback((deviceId: string, feature: DeviceFeature): Promise<FeatureRequestResult> => {
    const socket = socketRef.current;
    if (!socket?.connected) return Promise.resolve({ status: "disconnected" });

    return new Promise((resolve) => {
      socket.timeout(10_000).emit(
        "device:v1:feature:request",
        { protocol: "device-console.v1", deviceId, feature },
        (error: Error | null, response: unknown) => {
          if (error) {
            resolve({ status: "timeout" });
            return;
          }
          const parsed = FeatureAckSchema.safeParse(response);
          resolve(parsed.success ? parsed.data : { status: "error" });
        },
      );
    });
  }, []);

  const stopFeature = useCallback((deviceId: string, feature: DeviceFeature) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit("device:v1:feature:stop", { protocol: "device-console.v1", deviceId, feature });
  }, []);

  return { connection, devices, gallery, activities, frames, featureRecords, featureStates, requestFeature, stopFeature };
}