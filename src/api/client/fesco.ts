import { apiFetchJson } from '../../utils';
import { documentsAuthHeaders, type DocumentsAuth } from './documentsAuth';
export type TrackingEvent = { id: string; date?: string; type?: string; operation?: string; location?: string; transport?: string; totalDistance?: number; remainingDistance?: number };
export type TrackingSegment = { id: string; segmentType?: string; departureLocation?: string; destinationLocation?: string; countryOfDepartureLocation?: string; countryOfDestinationLocation?: string; departureDate?: string; destinationDate?: string; planingDepartureDate?: string; planingDestinationDate?: string; currentSegment?: boolean; completed?: boolean; inProgress?: boolean; plan?: boolean; prebooking?: boolean; telex?: boolean; remainingDistance?: number; transport?: { name?: string; nameLatin?: string; voyageNumber?: string } };
export type TrackingContainer = { containerNumber?: string; billId?: string; type?: string; unavailable?: boolean; order?: { orderId?: string; rootOrderId?: string | number; type?: string; customCode?: number; ownerShip?: string; bills?: string[] }; events?: { data?: TrackingEvent[]; lastEventId?: string }; segments?: TrackingSegment[] };
export function fetchFescoTracking(auth: DocumentsAuth, ferryId: number, number: string) {
  return apiFetchJson<{ ok?: boolean; error?: string; data?: TrackingContainer[]; fetchedAt?: string }>(`/api/fesco-tracking?${new URLSearchParams({ ferryId: String(ferryId), number })}`, { headers: documentsAuthHeaders(auth) });
}
