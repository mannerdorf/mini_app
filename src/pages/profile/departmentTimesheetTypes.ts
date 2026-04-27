/** Строка истории выплат в табеле подразделения (ответ /api/my-department-timesheet). */
export type DepartmentTimesheetPayoutRow = {
    id: number;
    payoutDate: string;
    periodFrom: string;
    periodTo: string;
    amount: number;
    taxAmount: number;
    cooperationType: string;
    paidDates: string[];
    createdAt: string;
};
