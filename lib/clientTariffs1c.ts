import { SERVICE_AUTH } from './oneCServiceAuth.js';

// Same HAULZ cabinet authorization as the existing GETTarifs integration.
const LEGACY_TARIFFS_AUTH = "Basic Info@haulz.pro:Y2ME42XyI_";
export function clientTariffs1cHeaders() {
  return { Auth: process.env.POSTB_HAULZ_AUTH?.trim() || LEGACY_TARIFFS_AUTH, Authorization: SERVICE_AUTH };
}
export async function fetchClientTariffsFrom1c(url:string,onResponse?:(status:number)=>Promise<void>) {
  const response = await fetch(url,{method:'GET',headers:clientTariffs1cHeaders(),signal:AbortSignal.timeout(45000)});
  await onResponse?.(response.status);
  if (!response.ok) throw new Error(`1C HTTP ${response.status}`);
  const data = await response.json();
  if (data?.Success === false) throw new Error('1C rejected tariff request');
  return data;
}
