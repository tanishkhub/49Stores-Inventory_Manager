import { useEffect, useRef, useState } from 'react';
import Modal from '../../components/ui/Modal';
import Alert from '../../components/ui/Alert';

// Live camera preview + JPEG capture via getUserMedia (requires HTTPS or localhost).
// onCapture receives a Blob; the caller uploads it like any other image source.
export default function CameraCapture({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stream;
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => setError('Camera is not available — check the browser permission and try again.'));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const scale = Math.min(1, 1200 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((b) => b && onCapture(b), 'image/jpeg', 0.85);
  }

  return (
    <Modal
      open
      title="Capture product image"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={capture}>Capture</button>
        </>
      }
    >
      <Alert>{error}</Alert>
      <video ref={videoRef} autoPlay playsInline muted className="aspect-square w-full rounded-xl bg-slate-900 object-cover" />
    </Modal>
  );
}
