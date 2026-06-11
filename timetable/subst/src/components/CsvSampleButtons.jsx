import { useRef } from "react";

export default function CsvSampleButtons({ onDownload, onUploadFile, downloadLabel = "Download sample", uploadLabel = "Upload sample" }) {
  const inputRef = useRef(null);

  return (
    <div className="csv-sample-btns">
      <button type="button" className="btn btn-ghost btn--sm" onClick={onDownload}>
        {downloadLabel}
      </button>
      <button type="button" className="btn btn-ghost btn--sm" onClick={() => inputRef.current?.click()}>
        {uploadLabel}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="csv-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUploadFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
