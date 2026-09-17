import type { City } from '../../../lib/pickup/model';
const key = (login: string) => `haulz.pickup.city:${login.trim().toLowerCase()}`;
export function readDriverCity(login: string): City | undefined {
  try { const city = localStorage.getItem(key(login)); return city === 'moscow' || city === 'kaliningrad' ? city : undefined; } catch { return undefined; }
}
export function saveDriverCity(login: string, city: City) {
  try { localStorage.setItem(key(login), city); } catch { /* Selection still works without storage. */ }
}
