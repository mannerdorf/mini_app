import React, { useMemo } from "react";
import type { Account } from "../../types";
import type { CityCode } from "../../../lib/haulzCalculator/types";
import type { City, JobData } from "../../../lib/pickup/model";
import type { DocumentsAuthScope } from "../../api/client/documentsOrder";
import {
  DocumentsOrderPvzSection,
  useDocumentsOrderPvzList,
  type PvzSelectionState,
} from "../documents/orders/DocumentsOrderPvzSection";
import { filterDocumentsOrderPvzByCity } from "../documents/orders/documentsOrderPvzFilter";
import { Field } from "./Forms";

export function pickupCityToCode(city: City): CityCode {
  return city;
}

type Props = {
  account: Account;
  city: City;
  customerInn: string;
  customerName: string;
  data: JobData;
  addressState: PvzSelectionState;
  onAddressStateChange: React.Dispatch<React.SetStateAction<PvzSelectionState>>;
  onJobPatch: (patch: Partial<JobData>) => void;
  num: (v: string) => number | null;
};

export function PickupJobAddressSection({
  account,
  city,
  customerInn,
  customerName,
  data,
  addressState,
  onAddressStateChange,
  onJobPatch,
  num,
}: Props) {
  const cityCode = pickupCityToCode(city);
  const ownerInn = customerInn.trim() || account.activeCustomerInn?.trim() || "";

  const authScope: DocumentsAuthScope = useMemo(
    () => ({
      login: account.login,
      password: account.password,
      inn: ownerInn || undefined,
      customerName: customerName.trim() || account.customer,
    }),
    [account.login, account.password, account.customer, ownerInn, customerName],
  );

  const auth = useMemo(
    () => ({
      login: account.login,
      password: account.password,
      id: account.id,
    }),
    [account.login, account.password, account.id],
  );

  const { pvzList, pvzLoading, pvzError } = useDocumentsOrderPvzList(
    authScope,
    Boolean(account.login && account.password),
  );

  const scopedPvzList = useMemo(
    () => filterDocumentsOrderPvzByCity(pvzList, cityCode, ownerInn),
    [pvzList, cityCode, ownerInn],
  );

  return (
    <>
      {!ownerInn && (
        <p className="pk-hint" role="status">
          Сначала выберите заказчика — адреса ПВЗ фильтруются по его ИНН, как в заявках.
        </p>
      )}
      <DocumentsOrderPvzSection
        title="Адрес и время"
        side="from"
        auth={auth}
        authScope={authScope}
        pvzList={scopedPvzList}
        pvzLoading={pvzLoading}
        pvzError={pvzError}
        pvzCatalogEmpty={!pvzLoading && !pvzError && pvzList.length === 0}
        pvzTotalCount={pvzList.length}
        state={addressState}
        onChange={onAddressStateChange}
        defaultCity={cityCode}
      />
      <div className="pk-grid pk-address-times">
        <Field
          label="Забрать с"
          type="time"
          value={data.windowFrom}
          onChange={(v) => onJobPatch({ windowFrom: v })}
          required
        />
        <Field
          label="Забрать до"
          type="time"
          value={data.windowTo}
          onChange={(v) => onJobPatch({ windowTo: v })}
          required
        />
        <Field
          label="Погрузка, минут"
          type="number"
          min="0"
          value={data.serviceMinutes}
          onChange={(v) => onJobPatch({ serviceMinutes: num(v) })}
        />
      </div>
    </>
  );
}
