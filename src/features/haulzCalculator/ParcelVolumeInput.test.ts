import React, { useState } from "react";
import { act, create } from "react-test-renderer";
import { expect, it } from "vitest";
import { ParcelPlaceEditor } from "./ParcelPlaceEditor";
import type { ParcelPlace } from "../../../lib/haulzCalculator/types";
import { parseParcelPlaces } from "../../../lib/haulzCalculator/parsePlaces";
import { summarizePlaces } from "../../../lib/haulzCalculator/chargeableWeight";

it("edits volume with a comma through the shared calculator/order editor and resets it on dimension edit", () => {
  let saved: ParcelPlace[] = [];
  function Form() {
    const [places, setPlaces] = useState<ParcelPlace[]>([{weightKg: 10, volumeM3: 0.08, lengthCm: 40, widthCm: 40, heightCm: 50}]);
    saved = places;
    return React.createElement(ParcelPlaceEditor, { places, onChange: setPlaces, activePresetIdx: {}, onPresetIdxChange: () => {} });
  }
  let root!: ReturnType<typeof create>;
  act(() => { root = create(React.createElement(Form)); });
  const volume = () => root.root.findByProps({ inputMode: "decimal" });
  for (const text of ["", "0", "0,", "0,75"]) {
    act(() => volume().props.onChange({target:{value:text}}));
    expect(volume().props.value).toBe(text);
  }
  expect(saved[0]).toMatchObject({volumeM3: 0.75, volumeMode: "manual"});
  expect(summarizePlaces(parseParcelPlaces(JSON.parse(JSON.stringify(saved)))).chargeableWeightKg).toBe(150);
  act(() => root.root.findAllByType("input")[0].props.onChange({target:{value:"100"}}));
  expect(volume().props.value).toBe("0.2");
  expect(saved[0].volumeMode).toBeUndefined();
  act(() => root.unmount());
});
