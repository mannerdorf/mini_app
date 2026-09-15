import { textValue, type Contact, type JobData, type Place } from "./model.js";

/** Данные для нового забора на основе существующего (без id/version на уровне Job). */
export function cloneJobDataForCopy(data: JobData): JobData {
  const contacts: Contact[] = (Array.isArray(data.contacts) ? data.contacts : [])
    .slice(0, 10)
    .map((c) => ({
      name: textValue(c?.name, 150),
      phone: textValue(c?.phone, 60),
      extension: textValue(c?.extension, 30),
      purpose: textValue(c?.purpose, 100) || "Звонки",
    }));
  if (!contacts.length) {
    contacts.push({ name: "", phone: "", extension: "", purpose: "Звонки" });
  }

  const places: Place[] = (Array.isArray(data.places) ? data.places : []).map(
    (p) => ({
      kind: textValue(p?.kind, 100),
      count: typeof p?.count === "number" && p.count > 0 ? p.count : 1,
      lengthCm: p?.lengthCm ?? null,
      widthCm: p?.widthCm ?? null,
      heightCm: p?.heightCm ?? null,
    }),
  );
  if (!places.length) {
    places.push({
      kind: "",
      count: 1,
      lengthCm: null,
      widthCm: null,
      heightCm: null,
    });
  }

  return {
    customerInn: textValue(data.customerInn, 20),
    customerName: textValue(data.customerName, 300),
    senderInn: textValue(data.senderInn, 20),
    senderName: textValue(data.senderName, 300),
    address: textValue(data.address),
    instructions: textValue(data.instructions, 3000),
    directionsUrl: textValue(data.directionsUrl, 2000),
    contacts,
    documents: (Array.isArray(data.documents) ? data.documents : []).map(
      (d) => ({
        number: textValue(d?.number, 150),
        date: textValue(d?.date, 10),
      }),
    ),
    places,
    weightKg: data.weightKg ?? null,
    volumeM3: data.volumeM3 ?? null,
    windowFrom: textValue(data.windowFrom, 5) || "10:00",
    windowTo: textValue(data.windowTo, 5) || "17:00",
    warehouseHours: textValue(data.warehouseHours),
    serviceMinutes:
      typeof data.serviceMinutes === "number" && data.serviceMinutes > 0
        ? data.serviceMinutes
        : 20,
    zayavkaNumber: textValue(data.zayavkaNumber, 100),
    cargoNumber: textValue(data.cargoNumber, 100),
    priceRub: data.priceRub ?? null,
    payment: textValue(data.payment, 100) || "Не указано",
    mkadKm: data.mkadKm ?? null,
    requirements: textValue(data.requirements),
    note: textValue(data.note, 3000),
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    deliveryMode: data.deliveryMode === "point" ? "point" : "courier",
    addressKind: data.addressKind === "custom" ? "custom" : "pvz",
    pvzRef: textValue(data.pvzRef, 80),
    defaultPlaceAddress: textValue(data.defaultPlaceAddress),
    defaultPlaceLatitude: data.defaultPlaceLatitude ?? null,
    defaultPlaceLongitude: data.defaultPlaceLongitude ?? null,
    defaultPlaceMode: data.defaultPlaceMode === "courier" ? "courier" : "point",
    defaultPlaceKind: data.defaultPlaceKind === "custom" ? "custom" : "pvz",
    defaultPlacePvzRef: textValue(data.defaultPlacePvzRef, 80),
    scheduleMode:
      data.scheduleMode === "periodic"
        ? "periodic"
        : data.scheduleMode === "once"
          ? "once"
          : "",
    schedulePattern:
      data.schedulePattern === "dates"
        ? "dates"
        : data.schedulePattern === "weekdays"
          ? "weekdays"
          : "",
    scheduleGroupId: textValue(data.scheduleGroupId, 80),
    scheduleWeekdays: textValue(data.scheduleWeekdays),
    scheduleUntil: textValue(data.scheduleUntil, 10),
    scheduleDates: textValue(data.scheduleDates),
  };
}
