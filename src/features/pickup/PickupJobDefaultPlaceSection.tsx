import React, { useMemo } from "react";
import type { Account } from "../../types";
import type { CityCode } from "../../../lib/haulzCalculator/types";
import type { City } from "../../../lib/pickup/model";
import type { DocumentsAuthScope } from "../../api/client/documentsOrder";
import {
  DocumentsOrderPvzSection,
  useDocumentsOrderPvzList,
  type PvzSelectionState,
} from "../documents/orders/DocumentsOrderPvzSection";
import { filterDocumentsOrderPvzByCity } from "../documents/orders/documentsOrderPvzFilter";
import { pickupCityToCode } from "./PickupJobAddressSection";

type Props = {
  account: Account;
  city: City;
  customerInn: string;
  customerName: string;
  state: PvzSelectionState;
  onChange: React.Dispatch<React.SetStateAction<PvzSelectionState>>;
};

export function PickupJobDefaultPlaceSection({
  account,
  city,
  customerInn,
  customerName,
  state,
  onChange,
}: Props) {
  const cityCode = pickupCityToCode(city);
  const ownerInn = customerInn.trim() || account.activeCustomerInn?.trim() || "";

  const authScope: DocumentsAuthScope = useMemo(
    () => ({
      login: account.login,
      password: account.password,
      inn: ownerInn,
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
      <p className="pk-hint">
        Куда по умолчанию везём груз после забора. Обычно это склад HAULZ в{" "}
        {city === "moscow" ? "Москве" : "Калининграде"}; можно выбрать другой
        пункт, как в заявках.
      </p>
      {!ownerInn && (
        <p className="pk-hint" role="status">
          Для выбора ПВЗ укажите заказчика — справочник фильтруется по ИНН.
        </p>
      )}
      <DocumentsOrderPvzSection
        title="Место по умолчанию"
        side="to"
        auth={auth}
        authScope={authScope}
        pvzList={scopedPvzList}
        pvzLoading={pvzLoading}
        pvzError={pvzError}
        pvzCatalogEmpty={!pvzLoading && !pvzError && pvzList.length === 0}
        pvzTotalCount={pvzList.length}
        state={state}
        onChange={onChange}
        defaultCity={cityCode}
      />
    </>
  );
}
