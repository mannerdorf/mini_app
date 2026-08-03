export const CLAIM_STATUS_LABELS: Record<string, string> = {
    draft: "Черновик",
    new: "Новая",
    under_review: "На рассмотрении",
    waiting_docs: "Ожидает документы",
    in_progress: "В работе",
    awaiting_leader: "Ожидает решения руководителя",
    sent_to_accounting: "Передана в бухгалтерию",
    approved: "Удовлетворена",
    rejected: "Отказ",
    paid: "Выплачено",
    offset: "Зачтено",
    closed: "Закрыта",
};

export const CLAIM_STATUS_BADGE: Record<string, { bg: string; color: string }> = {
    draft: { bg: "rgba(107,114,128,0.15)", color: "#6b7280" },
    new: { bg: "rgba(107,114,128,0.15)", color: "#6b7280" },
    under_review: { bg: "rgba(245,158,11,0.18)", color: "#b45309" },
    waiting_docs: { bg: "rgba(245,158,11,0.18)", color: "#b45309" },
    in_progress: { bg: "rgba(59,130,246,0.15)", color: "#2563eb" },
    awaiting_leader: { bg: "rgba(59,130,246,0.15)", color: "#2563eb" },
    sent_to_accounting: { bg: "rgba(59,130,246,0.15)", color: "#2563eb" },
    approved: { bg: "rgba(16,185,129,0.15)", color: "#059669" },
    paid: { bg: "rgba(16,185,129,0.15)", color: "#059669" },
    offset: { bg: "rgba(16,185,129,0.15)", color: "#059669" },
    rejected: { bg: "rgba(239,68,68,0.15)", color: "#dc2626" },
    closed: { bg: "rgba(107,114,128,0.15)", color: "#6b7280" },
};
