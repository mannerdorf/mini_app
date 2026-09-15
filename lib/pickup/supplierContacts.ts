import { randomUUID } from "node:crypto";
import type { Contact } from "./model.js";

export function contactPhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function isPersistablePickupContact(contact: Contact): boolean {
  return contactPhoneDigits(contact.phone).length >= 7;
}

type DbLike = {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
};

/** Upsert contacts from a saved pickup job into the sender's directory. */
export async function upsertPickupSupplierContacts(
  db: DbLike,
  senderInn: string,
  contacts: Contact[],
): Promise<void> {
  const inn = senderInn.trim();
  if (!inn) return;
  for (const c of contacts) {
    if (!isPersistablePickupContact(c)) continue;
    const phoneDigits = contactPhoneDigits(c.phone);
    await db.query(
      `INSERT INTO pickup_supplier_contacts(id,sender_inn,phone_digits,name,phone,extension,purpose)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (sender_inn,phone_digits) DO UPDATE SET
         name=EXCLUDED.name,
         phone=EXCLUDED.phone,
         extension=EXCLUDED.extension,
         purpose=EXCLUDED.purpose,
         updated_at=now()`,
      [
        randomUUID(),
        inn,
        phoneDigits,
        c.name,
        c.phone,
        c.extension,
        c.purpose || "Звонки",
      ],
    );
  }
}
