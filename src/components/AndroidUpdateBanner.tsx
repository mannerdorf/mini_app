import React from "react";
import type { AndroidReleaseManifest } from "../constants/androidRelease";

type Props = {
  manifest: AndroidReleaseManifest;
  onDismiss?: () => void;
};

export function AndroidUpdateBanner({ manifest, onDismiss }: Props) {
  return (
    <div className="android-update-banner" role="status">
      <div className="android-update-banner__text">
        <strong>Доступна версия {manifest.versionName}</strong>
        {manifest.releaseNotes ? <span>{manifest.releaseNotes}</span> : null}
      </div>
      <div className="android-update-banner__actions">
        <a className="android-update-banner__button" href={manifest.apkUrl} target="_blank" rel="noopener noreferrer">
          Скачать
        </a>
        {onDismiss ? (
          <button type="button" className="android-update-banner__dismiss" onClick={onDismiss}>
            Позже
          </button>
        ) : null}
      </div>
    </div>
  );
}
