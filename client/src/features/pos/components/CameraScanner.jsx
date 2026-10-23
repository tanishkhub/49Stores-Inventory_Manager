import { useEffect, useRef, useState } from 'react';
import Modal from '../../../components/ui/Modal';
import Alert from '../../../components/ui/Alert';

// Optional camera scanning via ZXing (loaded on demand). Works on localhost / HTTPS where the browser
// allows camera access; USB scanners and manual typing remain available as fallbacks.
export default function CameraScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const [error, setError] = useState('');
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const detectedRef = useRef(onDetected);
  useEffect(() => {
    detectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    let controls;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is not available in this browser (it needs localhost or HTTPS).');
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromVideoDevice(deviceId || undefined, videoRef.current, (result) => {
          if (result && !cancelled) {
            cancelled = true;
            controls?.stop();
            detectedRef.current(result.getText());
          }
        });
        if (cancelled) controls.stop();
        const list = await BrowserMultiFormatReader.listVideoInputDevices();
        if (!cancelled) setDevices(list);
      } catch (err) {
        if (!cancelled) setError(err.name === 'NotAllowedError' ? 'Camera permission was denied.' : err.message || 'Could not start the camera.');
      }
    })();
    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [deviceId]);

  return (
    <Modal open title="Scan with camera" onClose={onClose} footer={<button type="button" className="btn-secondary" onClick={onClose}>Close</button>}>
      <Alert>{error}</Alert>
      {!error && (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.9)]" />
          </div>
          {devices.length > 1 && (
            <select className="input" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} aria-label="Camera">
              <option value="">Default camera</option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>
              ))}
            </select>
          )}
          <p className="text-xs text-slate-500">Hold the barcode inside the frame. The product is added as soon as it is read.</p>
        </div>
      )}
    </Modal>
  );
}
