import { useEffect, useState } from "react";
import type { AuthData, CargoItem } from "../types";
import {
    buildNomenclatureSearchText,
    buildNomenclatureSearchTextFromCargoItem,
    fetchPerevozkaDetails,
} from "../lib/perevozkaDetails";

const NOMENCLATURE_CACHE = new Map<string, string>();
const MIN_QUERY_LEN = 2;
const MAX_FETCH_PER_QUERY = 80;
const CONCURRENCY = 4;

function normCargoKey(num: string): string {
    const s = String(num ?? "").trim().replace(/^0000-/, "");
    return s.replace(/^0+/, "") || s || "0";
}

type Options = {
    items: CargoItem[];
    searchText: string;
    auth: AuthData | null | undefined;
    useServiceRequest?: boolean;
    enabled?: boolean;
};

/**
 * При поиске в «Грузах» подгружает номенклатуру перевозок (штрихкод / наименование)
 * и отдаёт Map для cargoSearchTextByNumber.
 */
export function useCargoNomenclatureSearch({
    items,
    searchText,
    auth,
    useServiceRequest = false,
    enabled = true,
}: Options): { searchByNumber: Map<string, string>; loading: boolean } {
    const [searchByNumber, setSearchByNumber] = useState<Map<string, string>>(() => new Map(NOMENCLATURE_CACHE));
    const [loading, setLoading] = useState(false);

    const query = String(searchText ?? "").trim();

    useEffect(() => {
        if (!enabled || !auth?.login || !auth?.password || query.length < MIN_QUERY_LEN) {
            setLoading(false);
            return;
        }

        let cancelled = false;
        const timer = window.setTimeout(() => {
            void (async () => {
                setLoading(true);
                const candidates = items
                    .map((item) => {
                        const key = normCargoKey(String(item.Number ?? ""));
                        if (!key) return null;
                        const inline = buildNomenclatureSearchTextFromCargoItem(item);
                        if (inline) {
                            NOMENCLATURE_CACHE.set(key, inline);
                            return null;
                        }
                        if (NOMENCLATURE_CACHE.has(key)) return null;
                        return { item, key, number: String(item.Number ?? "").trim() };
                    })
                    .filter((x): x is { item: CargoItem; key: string; number: string } => x != null)
                    .slice(0, MAX_FETCH_PER_QUERY);

                if (candidates.length === 0) {
                    if (!cancelled) {
                        setSearchByNumber(new Map(NOMENCLATURE_CACHE));
                        setLoading(false);
                    }
                    return;
                }

                let cursor = 0;
                const worker = async () => {
                    while (!cancelled) {
                        const entry = candidates[cursor++];
                        if (!entry) break;
                        try {
                            const details = await fetchPerevozkaDetails(auth, entry.number, entry.item, {
                                forceServiceAuth: useServiceRequest,
                            });
                            const text = buildNomenclatureSearchText(details.nomenclature);
                            if (text) NOMENCLATURE_CACHE.set(entry.key, text);
                        } catch {
                            /* пропускаем единичные ошибки */
                        }
                    }
                };

                await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

                if (!cancelled) {
                    setSearchByNumber(new Map(NOMENCLATURE_CACHE));
                    setLoading(false);
                }
            })();
        }, 400);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [enabled, auth?.login, auth?.password, query, items, useServiceRequest]);

    return { searchByNumber, loading: query.length >= MIN_QUERY_LEN && loading };
}
