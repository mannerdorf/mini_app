import React from "react";
import { Globe, Mail, MapPin, Phone } from "lucide-react";
import { yandexMapEmbedUrl, yandexMapsOpenUrl } from "../../lib/yandexMaps";

export type HaulzWarehousePanelProps = {
  city: string;
  hours: string;
  address: string;
  phone: string;
  email: string;
  lat: number;
  lon: number;
  emailLabel?: string;
  websiteUrl?: string;
};

function normalizePhoneToTel(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? digits : `+${digits}`;
}

export function HaulzWarehousePanel({
  city,
  hours,
  address,
  phone,
  email,
  lat,
  lon,
  emailLabel,
  websiteUrl,
}: HaulzWarehousePanelProps) {
  const mailLabel = emailLabel ?? email;
  const mapSrc = yandexMapEmbedUrl({ lat, lon, address });
  const mapsHref = yandexMapsOpenUrl({ lat, lon, address });

  return (
    <article className="haulz-warehouse-panel">
      <div className="haulz-warehouse-panel__map">
        <iframe
          title={`Карта склада HAULZ — ${city}`}
          src={mapSrc}
          loading="lazy"
          allowFullScreen
        />
      </div>

      <div className="haulz-warehouse-panel__info">
        <div>
          <h3 className="haulz-warehouse-panel__city">{city}</h3>
          <p className="haulz-warehouse-panel__hours">{hours}</p>
        </div>

        <div className="haulz-warehouse-panel__actions" aria-label={`Контакты склада ${city}`}>
          <a
            className="haulz-warehouse-panel__action"
            href={`tel:${normalizePhoneToTel(phone)}`}
            aria-label={`Позвонить — ${city}`}
          >
            <Phone className="h-5 w-5" />
          </a>
          <a
            className="haulz-warehouse-panel__action"
            href={`mailto:${email}`}
            aria-label={`Написать — ${city}`}
          >
            <Mail className="h-5 w-5" />
          </a>
          <a
            className="haulz-warehouse-panel__action"
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Маршрут — ${city}`}
          >
            <MapPin className="h-5 w-5" />
          </a>
          {websiteUrl ? (
            <a
              className="haulz-warehouse-panel__action"
              href={websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Сайт HAULZ — ${city}`}
            >
              <Globe className="h-5 w-5" />
            </a>
          ) : null}
        </div>

        <div className="haulz-warehouse-panel__contacts">
          <p>{address}</p>
          <p>
            <a href={`tel:${normalizePhoneToTel(phone)}`}>{phone}</a>
          </p>
          <p>
            <a href={`mailto:${email}`}>{mailLabel}</a>
          </p>
        </div>
      </div>
    </article>
  );
}
