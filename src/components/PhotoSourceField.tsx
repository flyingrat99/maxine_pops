import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { isLocalPhotoReference, uploadLocalPhoto } from "../photoStorage";

interface PhotoSourceFieldProps {
  value: string;
  onChange: (value: string) => void;
  inputName?: string;
  className?: string;
}

function fileSize(size: number): string {
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
}

export function PhotoSourceField({ value, onChange, inputName, className = "" }: PhotoSourceFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const hasUploadedPhoto = isLocalPhotoReference(value);

  const choosePhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const { reference, photo } = await uploadLocalPhoto(file);
      onChange(reference);
      setMessage(`Photo ready · ${photo.width}×${photo.height} · ${fileSize(photo.blob.size)}`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "The photo could not be uploaded.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className={`photo-source-field ${className}`.trim()}>
      <label className="photo-url-label">
        <span>Image or product page URL</span>
        <input
          name={inputName}
          type="url"
          value={hasUploadedPhoto ? "" : value}
          disabled={hasUploadedPhoto || busy}
          onChange={(event) => { onChange(event.target.value); setMessage(""); setError(""); }}
          placeholder={hasUploadedPhoto ? "A photo from this computer is selected" : "Paste an Amazon, Funko, PriceCharting, retailer, or image URL"}
        />
      </label>
      <div className="photo-source-actions">
        <input
          ref={inputRef}
          className="photo-file-input"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/*"
          onChange={(event) => void choosePhoto(event.target.files?.[0])}
        />
        <button className="button secondary photo-upload-button" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <LoaderCircle className="spin" size={15} /> : <ImagePlus size={15} />}
          {busy ? "Preparing photo…" : hasUploadedPhoto ? "Replace photo" : "Upload photo"}
        </button>
        {value && (
          <button className="button ghost photo-remove-button" type="button" disabled={busy} onClick={() => { onChange(""); setMessage("Photo removed from this Pop. Save to keep the change."); setError(""); }}>
            <Trash2 size={14} /> {hasUploadedPhoto ? "Remove photo" : "Clear URL"}
          </button>
        )}
        <span className="photo-storage-note">Saved in the app’s user-images folder · included in full backups</span>
      </div>
      {message && <small className="photo-message success" role="status">{message}</small>}
      {error && <small className="photo-message error" role="alert">{error}</small>}
      <small className="field-help">Upload a JPG, PNG, or WebP from the computer or phone. Large photos are resized automatically. Product-page URLs can still supply information and a preview image.</small>
    </div>
  );
}
