import { useEffect, useState, type ComponentType } from "react";
import { signOut } from "@agent-native/core/client";
import {
  IconActivity,
  IconAddressBook,
  IconArrowUpRight,
  IconBattery3,
  IconBell,
  IconCamera,
  IconChevronDown,
  IconClock,
  IconCloud,
  IconCommand,
  IconDeviceDesktop,
  IconFile,
  IconFolder,
  IconLayoutDashboard,
  IconMapPin,
  IconMaximize,
  IconMessage,
  IconPhoto,
  IconPhoneCall,
  IconPlayerPlay,
  IconSearch,
  IconSettings,
  IconShieldCheck,
  IconSignal4g,
  IconVideo,
  IconVolume,
  IconWifi,
  IconX,
} from "@tabler/icons-react";
import {
  useDeviceSocket,
  type Device,
  type DeviceFeature,
  type FeatureRecord,
  type FeatureRequestResult,
  type GalleryItem,
} from "@/hooks/use-device-socket";

type PreviewTab = "Live screen" | "Live camera" | "Gallery & files";
type PanelState = { status: "idle" | "requesting" } | FeatureRequestResult;
type FeatureDefinition = {
  key: DeviceFeature;
  label: string;
  detail: string;
  color: string;
  icon: ComponentType<{ size?: number }>;
  tab?: PreviewTab;
};

const features: FeatureDefinition[] = [
  { key: "file-manager", label: "File manager", detail: "Browse device files", icon: IconFolder, color: "mint", tab: "Gallery & files" },
  { key: "camera", label: "Camera", detail: "Request camera access", icon: IconCamera, color: "blue", tab: "Live camera" },
  { key: "gallery", label: "Gallery", detail: "Browse device media", icon: IconPhoto, color: "violet", tab: "Gallery & files" },
  { key: "sms", label: "SMS", detail: "View permitted messages", icon: IconMessage, color: "green" },
  { key: "contacts", label: "Contacts", detail: "View permitted contacts", icon: IconAddressBook, color: "amber" },
  { key: "location", label: "Live location", detail: "Request location access", icon: IconMapPin, color: "mint" },
  { key: "live-camera", label: "Live camera view", detail: "Start a permitted stream", icon: IconVideo, color: "blue", tab: "Live camera" },
  { key: "live-screen", label: "Live screen monitoring", detail: "Start a permitted stream", icon: IconDeviceDesktop, color: "violet", tab: "Live screen" },
  { key: "notifications", label: "Notifications", detail: "View permitted activity", icon: IconBell, color: "amber" },
  { key: "call-log", label: "Call log", detail: "View permitted call history", icon: IconPhoneCall, color: "green" },
  { key: "device-health", label: "Device health", detail: "Battery and network status", icon: IconActivity, color: "mint" },
  { key: "alarm", label: "Alarm", detail: "Request an on-device alert", icon: IconVolume, color: "amber" },
];

const previewTabs: PreviewTab[] = ["Live screen", "Live camera", "Gallery & files"];

export function meta() {
  return [
    { title: "Device Console" },
    { name: "description", content: "Authorized device management console" },
  ];
}

export default function HomeRoute() {
  const socket = useDeviceSocket();
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [activeTab, setActiveTab] = useState<PreviewTab>("Live screen");
  const [selectedFeature, setSelectedFeature] = useState<DeviceFeature | null>(null);
  const [panelState, setPanelState] = useState<PanelState>({ status: "idle" });

  const selectedDevice = socket.devices.find((device) => device.id === selectedDeviceId) ?? null;
  const selectedFeatureDefinition = features.find((feature) => feature.key === selectedFeature) ?? null;

  useEffect(() => {
    if (selectedDeviceId && socket.devices.some((device) => device.id === selectedDeviceId)) return;
    setSelectedDeviceId(socket.devices[0]?.id ?? "");
  }, [socket.devices, selectedDeviceId]);

  function openFeature(feature: FeatureDefinition) {
    if (selectedFeature && selectedDevice) socket.stopFeature(selectedDevice.id, selectedFeature);
    setSelectedFeature(feature.key);
    setPanelState({ status: "idle" });
    if (feature.tab) setActiveTab(feature.tab);
  }

  function closeFeature() {
    if (selectedFeature && selectedDevice) socket.stopFeature(selectedDevice.id, selectedFeature);
    setSelectedFeature(null);
    setPanelState({ status: "idle" });
  }

  function selectDevice(deviceId: string) {
    if (selectedFeature && selectedDevice) socket.stopFeature(selectedDevice.id, selectedFeature);
    setSelectedDeviceId(deviceId);
    setSelectedFeature(null);
    setPanelState({ status: "idle" });
  }

  async function requestFeature() {
    if (!selectedDevice || !selectedFeature) return;
    if (socket.connection !== "connected") {
      setPanelState({ status: "disconnected" });
      return;
    }
    if (!selectedDevice.online) {
      setPanelState({ status: "offline" });
      return;
    }
    setPanelState({ status: "requesting" });
    setPanelState(await socket.requestFeature(selectedDevice.id, selectedFeature));
  }

  const connectionCopy: Record<typeof socket.connection, string> = {
    unconfigured: "Server URL required",
    connecting: "Connecting",
    connected: "Connected",
    reconnecting: "Reconnecting",
    disconnected: "Disconnected",
    misconfigured: "Invalid server URL",
  };

  const frameSet = selectedDevice ? socket.frames[selectedDevice.id] : undefined;
  const currentFrame = activeTab === "Live screen" ? frameSet?.screen : frameSet?.camera;
  const galleryItems = selectedDevice ? socket.gallery[selectedDevice.id] ?? [] : [];
  const deviceActivity = selectedDevice ? socket.activities[selectedDevice.id] ?? [] : [];
  const records = selectedDevice && selectedFeature
    ? socket.featureRecords[selectedDevice.id]?.[selectedFeature] ?? []
    : [];
  const visiblePanelState = selectedDevice && selectedFeature
    ? socket.featureStates[selectedDevice.id]?.[selectedFeature] ?? panelState
    : panelState;

  return (
    <main className="console-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><IconCommand size={20} stroke={1.8} /></div><span>relay<span className="brand-dot">.</span></span><span className="brand-label">CONSOLE</span></div>
        <div className="workspace-switch"><div className="workspace-glyph"><IconShieldCheck size={16} /></div><div className="workspace-copy"><strong>Device workspace</strong><span>Secure session</span></div><IconChevronDown size={15} /></div>
        <div className="side-label">WORKSPACE</div>
        <nav className="side-nav">
          <a className="side-link selected" href="#overview"><IconLayoutDashboard size={18} /> Overview <span className="nav-shortcut">⌘ 1</span></a>
          <a className="side-link" href="#devices"><IconDeviceDesktop size={18} /> Devices <span className="nav-count">{socket.devices.length}</span></a>
          <a className="side-link" href="#activity"><IconActivity size={18} /> Activity</a>
        </nav>
        <div className="side-label devices-label">ENROLLED DEVICES <button aria-label="Search devices"><IconSearch size={14} /></button></div>
        <div className="device-list" id="devices">
          {socket.devices.map((device) => <button className={`device-row ${selectedDeviceId === device.id ? "active-device" : ""}`} key={device.id} onClick={() => selectDevice(device.id)}><span className="device-icon"><IconDeviceGlyph /></span><span className="device-copy"><strong>{device.name}</strong><small><i className={device.online ? "online-dot" : "offline-dot"} /> {device.online ? "Online" : "Offline"} · {device.platform}</small></span>{device.online && <span className="device-status-dot" />}</button>)}
          {!socket.devices.length && <p className="sidebar-empty">No enrolled devices</p>}
        </div>
        <div className="sidebar-spacer" />
        <div className="privacy-card"><div className="privacy-icon"><IconShieldCheck size={17} /></div><div><strong>Permission-aware</strong><p>Device features require on-device permission.</p></div></div>
        <button className="profile-button" onClick={() => signOut()}><span className="profile-avatar"><IconSettings size={15} /></span><span className="profile-copy"><strong>Sign out</strong><small>End this secure session</small></span></button>
      </aside>

      <section className="main-area" id="overview">
        <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>Overview</strong></div><div className="topbar-right"><span className={`connection-pill ${socket.connection}`}><span />{connectionCopy[socket.connection]}</span><button className="icon-button" aria-label="Activity" onClick={() => document.getElementById("activity")?.scrollIntoView({ behavior: "smooth" })}><IconBell size={18} /></button><span className="topbar-divider" /><span className="help-button">Socket.io v1 protocol <IconArrowUpRight size={14} /></span></div></header>

        <div className="content-wrap">
          <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> DEVICE MANAGEMENT <span className="heading-date">AUTHORIZED DEVICES</span></div><h1>Device control, <em>with consent.</em></h1><p>Choose an enrolled device and open a feature to continue.</p></div><select className="device-select" aria-label="Select enrolled device" value={selectedDeviceId} onChange={(event) => selectDevice(event.target.value)}><option value="">Select a device</option>{socket.devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}</select></div>

          {socket.connection !== "connected" && <div className={`connection-banner ${socket.connection}`} role="status"><IconCloud size={17} /><div><strong>{connectionCopy[socket.connection]}</strong><span>{socket.connection === "unconfigured" ? "Set VITE_DEVICE_SOCKET_URL to your HTTPS Socket.io endpoint." : socket.connection === "misconfigured" ? "Use an HTTPS endpoint; HTTP is allowed only on localhost." : socket.connection === "connecting" || socket.connection === "reconnecting" ? "Waiting for the authenticated server session." : "Live device actions are paused until the server reconnects."}</span></div></div>}

          <div className="stats-row">
            <article className="stat-card"><div className="stat-label">CONNECTION STATUS <span className="stat-icon green"><IconActivity size={16} /></span></div><div className="stat-value"><span className={`large-online-dot ${selectedDevice?.online && socket.connection === "connected" ? "" : "offline"}`} />{selectedDevice ? selectedDevice.online && socket.connection === "connected" ? "Connected" : "Unavailable" : "No device selected"}</div><div className="stat-foot">{selectedDevice ? selectedDevice.name : "Connect the server and select an enrolled device"}</div></article>
            <article className="stat-card"><div className="stat-label">BATTERY <span className="stat-icon amber"><IconBattery3 size={16} /></span></div><div className="stat-value">{selectedDevice?.batteryPercent ?? "—"}<span className="stat-unit">{selectedDevice?.batteryPercent == null ? "" : "%"}</span></div><div className="stat-foot">{selectedDevice ? "Reported by enrolled device" : "No device data"}</div></article>
            <article className="stat-card"><div className="stat-label">NETWORK <span className="stat-icon blue"><IconWifi size={16} /></span></div><div className="stat-value network-value">{selectedDevice?.network ?? "—"}</div><div className="stat-foot"><IconSignal4g size={14} /> {selectedDevice?.ipAddress ?? "No network data"}</div></article>
            <article className="stat-card"><div className="stat-label">DEVICE DETAILS <span className="stat-icon violet"><IconCloud size={16} /></span></div><div className="stat-value details-value">{selectedDevice?.platform ?? "—"}</div><div className="stat-foot">{selectedDevice ? selectedDevice.name : "No device selected"}</div></article>
          </div>

          <section className="monitor-card">
            <div className="monitor-header"><div className="tab-list" role="tablist" aria-label="Device panels">{previewTabs.map((tab) => <button key={tab} role="tab" aria-selected={activeTab === tab} className={`monitor-tab ${activeTab === tab ? "tab-active" : ""}`} onClick={() => setActiveTab(tab)}>{tab === "Live screen" ? <IconDeviceDesktop size={16} /> : tab === "Live camera" ? <IconCamera size={16} /> : <IconFolder size={16} />}{tab}</button>)}</div><div className="monitor-actions"><span className={`preview-live ${currentFrame ? "streaming" : ""}`}><i />{currentFrame ? "STREAMING" : "NO STREAM"}</span><button className="icon-button small" aria-label="Expand preview" onClick={() => document.querySelector(".preview-stage")?.requestFullscreen()}><IconMaximize size={16} /></button></div></div>
            {activeTab === "Gallery & files" ? <GalleryPanel items={galleryItems} selectedDevice={selectedDevice} onOpenFeature={() => openFeature(features[0])} /> : <div className={`preview-stage ${activeTab === "Live camera" ? "camera-stage" : "screen-stage"}`}>
              <div className="preview-grid" />
              <div className="preview-topline"><span className="preview-device"><span className="preview-device-icon"><IconDeviceDesktop size={13} /></span>{selectedDevice?.name ?? "No device selected"}<span className="preview-sep">/</span>{activeTab === "Live screen" ? "Screen stream" : "Camera stream"}</span><span className="preview-resolution">{currentFrame ? "Live frame" : "Waiting for stream"}</span></div>
              {currentFrame ? <img className="live-frame" src={currentFrame} alt={`${selectedDevice?.name ?? "Device"} ${activeTab.toLowerCase()} stream`} /> : <div className="camera-placeholder"><div className="camera-orbit">{activeTab === "Live camera" ? <IconCamera size={28} stroke={1.4} /> : <IconDeviceDesktop size={28} stroke={1.4} />}</div><strong>{activeTab === "Live camera" ? "Camera stream not active" : "Screen stream not active"}</strong><span>{selectedDevice ? "Open the capability card and request access on the device." : "Connect the server and select an enrolled device."}</span><button disabled={!selectedDevice || !selectedDevice.online || socket.connection !== "connected"} onClick={() => openFeature(features.find((feature) => feature.key === (activeTab === "Live camera" ? "live-camera" : "live-screen"))!)}>{activeTab === "Live camera" ? "Open camera controls" : "Open screen controls"}<IconArrowUpRight size={14} /></button></div>}
              <div className="preview-bottomline"><span><IconShieldCheck size={14} /> Authorized session</span><span><IconClock size={14} /> {socket.connection === "connected" ? "Socket connected" : "Waiting for connection"}</span></div>
            </div>}
          </section>

          <section className="features-section"><div className="section-heading"><div><h2>Device capabilities</h2><p>Click any capability to open its controls</p></div><span className="feature-access-note">ON-DEVICE PERMISSION REQUIRED</span></div><div className="feature-grid">{features.map((feature) => { const Icon = feature.icon; return <button className={`feature-card ${selectedFeature === feature.key ? "feature-card-selected" : ""}`} key={feature.key} aria-pressed={selectedFeature === feature.key} onClick={() => openFeature(feature)}><span className={`feature-icon ${feature.color}`}><Icon size={18} /></span><span className="feature-copy"><strong>{feature.label}</strong><small>{feature.detail}</small></span><IconArrowUpRight className="feature-arrow" size={15} /></button>; })}</div></section>

          {selectedFeatureDefinition && <FeaturePanel
            feature={selectedFeatureDefinition}
            device={selectedDevice}
            state={visiblePanelState}
            records={records}
            galleryItems={galleryItems}
            frame={selectedFeature === "live-screen" ? frameSet?.screen ?? null : selectedFeature === "camera" || selectedFeature === "live-camera" ? frameSet?.camera ?? null : null}
            connection={socket.connection}
            onRequest={requestFeature}
            onClose={closeFeature}
          />}

          <section className="activity-panel" id="activity"><div className="section-heading"><div><h2>Device activity</h2><p>Events reported by the selected device</p></div><span className="activity-count">{deviceActivity.length}</span></div><div className="activity-list">{deviceActivity.length ? deviceActivity.slice(0, 8).map((event) => <div className="activity-item" key={event.id}><span className={`activity-indicator ${event.kind === "error" ? "amber" : event.kind === "connected" ? "green" : "blue"}`} /><span className="activity-text">{event.message}</span><time>{new Date(event.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div>) : <div className="activity-empty">No activity reported by this device</div>}</div><div className="activity-connection"><span><i /> {selectedDevice ? selectedDevice.name : "No device selected"}</span><span>{socket.connection === "connected" ? "Live updates enabled" : "Updates paused"}</span></div></section>
          <footer className="page-footer"><span>RELAY CONSOLE <i>·</i> DEVICE CONTROL, MADE CLEAR.</span><span><IconShieldCheck size={13} /> Permission-gated access</span></footer>
        </div>
      </section>
    </main>
  );
}

function GalleryPanel({ items, selectedDevice, onOpenFeature }: { items: GalleryItem[]; selectedDevice: Device | null; onOpenFeature: () => void }) {
  return <div className="gallery-panel"><div className="gallery-toolbar"><div><h2>{selectedDevice ? `${selectedDevice.name} files` : "Device files"}</h2><p>{items.length} files available</p></div><button className="folder-button" onClick={onOpenFeature} disabled={!selectedDevice}>Request file access <IconArrowUpRight size={14} /></button></div>{items.length ? <div className="gallery-grid">{items.map((item) => <article className="file-card" key={item.id}><div className={`file-art ${item.mimeType.startsWith("image/") ? "image-file" : item.mimeType.startsWith("video/") ? "video-file" : "other-file"}`}>{item.mimeType.startsWith("video/") ? <span className="play-disc"><IconPlayerPlay size={17} fill="currentColor" /></span> : item.mimeType.startsWith("image/") ? <IconPhoto size={24} /> : <IconFile size={24} />}</div><div className="file-info"><span className="file-type-icon">{item.mimeType.startsWith("image/") ? <IconPhoto size={14} /> : item.mimeType.startsWith("video/") ? <IconVideo size={14} /> : <IconFile size={14} />}</span><div className="file-name-wrap"><strong>{item.name}</strong><small>{formatBytes(item.sizeBytes)} <span>·</span> {item.modifiedAt ? new Date(item.modifiedAt).toLocaleString() : "Date unavailable"}</small></div><button className="download-button" aria-label={`Open file access details for ${item.name}`} onClick={onOpenFeature} disabled={!selectedDevice}><IconFolder size={15} /></button></div></article>)}</div> : <div className="gallery-empty"><IconFolder size={24} /><strong>No files loaded</strong><span>{selectedDevice ? "Request file access from the enrolled device to load its permitted files." : "Select an enrolled device to view files."}</span></div>}</div>;
}

function FeaturePanel({ feature, device, state, records, galleryItems, frame, connection, onRequest, onClose }: { feature: FeatureDefinition; device: Device | null; state: PanelState; records: FeatureRecord[]; galleryItems: GalleryItem[]; frame: string | null; connection: string; onRequest: () => void; onClose: () => void }) {
  const Icon = feature.icon;
  const isStreamingFeature = feature.key === "live-screen" || feature.key === "live-camera" || feature.key === "camera";
  const statusMessage: Record<PanelState["status"], string> = {
    idle: "Access is requested only after you continue. Android may show its permission prompt.",
    requesting: "Waiting for the enrolled device to respond…",
    ready: "Permission granted by the device. Waiting for permitted data.",
    permission_required: "The device must grant this feature permission before it can continue.",
    denied: "The device user denied this permission. No data was requested.",
    unsupported: "This Android device does not support the requested feature.",
    offline: "The enrolled device is offline.",
    disconnected: "The authenticated Socket.io connection is not available.",
    timeout: "The device did not respond in time. Try again when it is online.",
    error: "The device could not complete this request.",
  };
  const buttonLabel = state.status === "requesting" ? "Waiting for device…" : state.status === "ready" ? "Request again" : "Request on device";
  const canRequest = !!device && device.online && connection === "connected" && state.status !== "requesting";

  return <section className="feature-detail" aria-live="polite"><div className="feature-detail-head"><span className={`feature-icon ${feature.color}`}><Icon size={19} /></span><div className="feature-detail-title"><h2>{feature.label}</h2><span>{device?.name ?? "No device selected"}</span></div><button className="icon-button small" aria-label="Close feature details" onClick={onClose}><IconX size={16} /></button></div><div className="feature-detail-body"><div className={`request-status ${state.status}`}><span className="request-status-dot" />{"message" in state && state.message ? state.message : statusMessage[state.status]}</div>{frame && isStreamingFeature ? <img className="detail-frame" src={frame} alt={`${feature.label} from ${device?.name ?? "device"}`} /> : feature.key === "gallery" || feature.key === "file-manager" ? <div className="detail-summary">{galleryItems.length ? `${galleryItems.length} permitted files loaded.` : "No permitted files loaded yet."}</div> : <FeatureRecords records={records} />}</div><div className="feature-detail-footer"><span><IconShieldCheck size={14} /> Android permission and server authorization required</span><button className="request-button" disabled={!canRequest} onClick={onRequest}>{buttonLabel}</button></div></section>;
}

function FeatureRecords({ records }: { records: FeatureRecord[] }) {
  if (!records.length) return <div className="records-empty">No permitted records loaded.</div>;
  return <div className="feature-records">{records.map((record) => <article className="feature-record" key={record.id}><strong>{record.title}</strong>{record.detail && <span>{record.detail}</span>}{record.occurredAt && <time>{new Date(record.occurredAt).toLocaleString()}</time>}</article>)}</div>;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function IconDeviceGlyph() {
  return <IconDeviceDesktop size={17} />;
}
