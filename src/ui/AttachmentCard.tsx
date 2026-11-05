import { FileText, Image, ScanLine } from "lucide-react";
import type { AttachmentPreview } from "../shared";
/** Local preview only: rendering never reads or submits the original file. */
export function AttachmentCard({ file }: { file: AttachmentPreview }) {
  const Icon =
    file.kind === "area" ? ScanLine : file.kind === "image" ? Image : FileText;
  return (
    <div className={`attachment-card attachment-${file.kind}`}>
      {file.thumbnail ? (
        <img
          className="attachment-thumbnail"
          src={file.thumbnail}
          alt={`Pratinjau ${file.name}`}
        />
      ) : (
        <div className="attachment-document" aria-hidden="true">
          <Icon size={20} />
          {file.excerpt && <span>{file.excerpt}</span>}
        </div>
      )}
      <span className="attachment-caption">
        <strong>{file.name}</strong>
        <small>
          {file.kind === "area"
            ? "Cuplikan layar"
            : file.kind === "pdf"
              ? "PDF"
              : file.kind === "image"
                ? "Gambar"
                : "Dokumen"}
        </small>
      </span>
    </div>
  );
}
