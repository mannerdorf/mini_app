import type { SendingsSectionViewProps } from "./sendingsSectionProps";

export type SendingsTableExpandedRowProps = SendingsSectionViewProps & {
  row: any;
  rowKey: string;
  parcelsToRender: any[];
  hasParcelSearchMatches: boolean;
  sendingsAnalyticsExtraColCount: number;
  plannedArrivalDate: Date | null;
};
