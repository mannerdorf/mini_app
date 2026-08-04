import { innMatchesSearchQuery, legalEntityNameMatchesQuery } from "../lib/userSearch";
import type { User } from "../types/adminUsers";

export const CUSTOMER_ALL_LABEL = "Доступ ко всем заказчикам";

type BuildGroupsParams = {
  users: User[];
  searchQuery: string;
};

export function buildAdminUsersCustomerGroups({ users, searchQuery }: BuildGroupsParams): Map<string, User[]> {
  const q = searchQuery.trim().toLowerCase();
  const groups = new Map<string, User[]>();

  const companyRowMatchesSearch = (c: { inn?: string; name?: string }) => {
    if (!q) return true;
    return innMatchesSearchQuery(c.inn, q) || legalEntityNameMatchesQuery(c.name || "", q);
  };

  const addToGroup = (label: string, user: User) => {
    const list = groups.get(label) ?? [];
    if (!list.some((x) => x.id === user.id)) list.push(user);
    groups.set(label, list);
  };

  for (const u of users) {
    if (u.access_all_inns || !!u.permissions?.service_mode) {
      addToGroup(CUSTOMER_ALL_LABEL, u);
      continue;
    }
    let placed = false;
    if (u.companies && u.companies.length > 0) {
      for (const c of u.companies) {
        if (!companyRowMatchesSearch(c)) continue;
        const label = c.name?.trim() ? `${c.name} (${c.inn})` : c.inn;
        addToGroup(label, u);
        placed = true;
      }
      if (!placed) addToGroup(CUSTOMER_ALL_LABEL, u);
    } else if (u.inn) {
      if (companyRowMatchesSearch({ inn: u.inn, name: u.company_name || "" })) {
        const label = u.company_name?.trim() ? `${u.company_name} (${u.inn})` : u.inn;
        addToGroup(label, u);
      } else {
        addToGroup(CUSTOMER_ALL_LABEL, u);
      }
    } else {
      addToGroup(CUSTOMER_ALL_LABEL, u);
    }
  }

  return groups;
}

export function sortAdminUsersCustomerGroupLabels(labels: string[]): string[] {
  return [...labels].sort((a, b) => (a === CUSTOMER_ALL_LABEL ? 1 : b === CUSTOMER_ALL_LABEL ? -1 : a.localeCompare(b)));
}

export function adminUsersCustomerGroupDisplayName(
  label: string,
  customerDirectoryMap: Record<string, string>,
): string {
  if (label === CUSTOMER_ALL_LABEL) return label;
  const inParens = /\((\d{10,12})\)$/.exec(label);
  const inn = inParens ? inParens[1] : /^\d{10,12}$/.test(label) ? label : null;
  if (inn && customerDirectoryMap[inn]) return `${customerDirectoryMap[inn]} (${inn})`;
  return label;
}
