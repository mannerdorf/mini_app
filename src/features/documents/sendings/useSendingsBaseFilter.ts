import { useMemo, type Dispatch, type SetStateAction } from "react";
import type { RouteFilterKey, TypeFilterKey } from "../../../lib/sharedListFilters";
import {
  buildSendingsForTransportOptions,
  filterSendingsByTransport,
  type BuildSendingsForTransportOptionsParams,
} from "./sendingsBaseFilter";
import {
  buildTransportOptionsFromSendings,
  useSendingsTransportFilterSync,
} from "./sendingsTransportOptions";

type Params = BuildSendingsForTransportOptionsParams & {
  transportFilter: string;
  transportLinkedCargoNumbers: Set<string> | undefined;
  setTransportFilter: Dispatch<SetStateAction<string>>;
};

export function useSendingsBaseFilter({
  transportFilter,
  transportLinkedCargoNumbers,
  setTransportFilter,
  ...buildParams
}: Params) {
  const sendingsForTransportOptions = useMemo(
    () => buildSendingsForTransportOptions(buildParams),
    [
      buildParams.sendingsItems,
      buildParams.sendingsLoading,
      buildParams.effectiveActiveInn,
      buildParams.customerFilter,
      buildParams.typeFilterSet,
      buildParams.routeFilterSet,
      buildParams.effectiveSearchText,
      buildParams.sortBy,
      buildParams.sortOrder,
      buildParams.normalizeTransportDisplay,
      buildParams.dateFrom,
      buildParams.dateTo,
    ],
  );

  const transportOptionsCurrentSection = useMemo(
    () =>
      buildTransportOptionsFromSendings(
        sendingsForTransportOptions,
        buildParams.normalizeTransportDisplay,
      ),
    [sendingsForTransportOptions, buildParams.normalizeTransportDisplay],
  );

  useSendingsTransportFilterSync(
    transportFilter,
    transportOptionsCurrentSection,
    setTransportFilter,
  );

  const filteredSendings = useMemo(
    () =>
      filterSendingsByTransport(
        sendingsForTransportOptions,
        transportFilter,
        transportLinkedCargoNumbers,
      ),
    [sendingsForTransportOptions, transportFilter, transportLinkedCargoNumbers],
  );

  return {
    sendingsForTransportOptions,
    transportOptionsCurrentSection,
    filteredSendings,
  };
}

export type { BuildSendingsForTransportOptionsParams };
