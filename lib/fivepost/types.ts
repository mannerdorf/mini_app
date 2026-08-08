export type FivepostRoute = "mow_kgd" | "kgd_mow";

export type FivepostParsedRow = {
  clientOrderNo: string;
  partnerOrderNo: string;
  teBarcode: string;
  placesCount: number;
  omniBarcode: string;
  itemName: string;
  unitCost: number | null;
  totalCost: number | null;
  weightG: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
};

export type FivepostShipmentRow = FivepostParsedRow & {
  lineNo: number;
  itemNameRu: string;
};

export type FivepostImportBatch = {
  id: number;
  login: string;
  filename: string;
  route: FivepostRoute;
  status: string;
  rowCount: number;
  translatedCount: number;
  createdAt: string;
};
