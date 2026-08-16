import React from "react";
import { ArrowLeft, Check, FileCheck2, Network, Route, ShieldCheck } from "lucide-react";
import { HaulzWarehousePanel } from "../components/haulz/HaulzWarehousePanel";
import { HAULZ_WEBSITE_URL } from "../constants/brand";
import { GUEST_ILLUSTRATIONS } from "../constants/guestIllustrations";
import { GUEST_WAREHOUSE_ITEMS } from "./guest/guestWarehouseContent";

type Props = {
    onBack: () => void;
    /** Подпись email в UI (без домена в гостевой зоне). */
    emailLabel?: string;
    showWarehouses?: boolean;
};

export function AboutCompanyPage({ onBack, emailLabel, showWarehouses = true }: Props) {
    const advantages = [
        {
            icon: Route,
            title: "Специализация на направлении",
            text: "Выстроенная логистика между Москвой и Калининградом для сборных и комплектных грузов.",
        },
        {
            icon: ShieldCheck,
            title: "Контроль на каждом этапе",
            text: "От забора и складской обработки до магистральной перевозки и вручения получателю.",
        },
        {
            icon: FileCheck2,
            title: "Документы без задержек",
            text: "Счета, УПД и закрывающие документы доступны в цифровом виде и собраны в одном месте.",
        },
        {
            icon: Network,
            title: "Интеграция с бизнесом",
            text: "API и электронный документооборот помогают встроить перевозки во внутренние процессы компании.",
        },
    ] as const;

    return (
        <div className="w-full guest-animate-in">
            <div className="mb-4 flex items-center gap-3">
                <button
                    type="button"
                    onClick={onBack}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#111827]"
                    aria-label="Назад"
                >
                    <ArrowLeft className="h-5 w-5" />
                </button>
                <span className="text-sm font-semibold text-[#374151]">О компании</span>
            </div>

            <section className="about-company-hero overflow-hidden rounded-[1.75rem]">
                <div className="grid items-center gap-8 px-6 py-10 sm:px-10 sm:py-14 lg:grid-cols-[1.2fr_0.8fr] lg:px-14 lg:py-16">
                    <div>
                        <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-blue-200">
                            HAULZ · B2B-логистика
                        </p>
                        <h1 className="max-w-3xl text-3xl font-bold leading-[1.08] tracking-[-0.035em] sm:text-5xl lg:text-6xl">
                            Соединяем бизнес Москвы и Калининграда
                        </h1>
                        <p className="mt-6 max-w-2xl text-base leading-relaxed text-blue-100 sm:text-lg">
                            Берём на себя всю цепочку перевозки — от первого расчёта и забора груза до доставки,
                            контроля статусов и закрывающих документов.
                        </p>
                        <div className="mt-8 flex flex-wrap gap-2">
                            {["Сборные и комплектные грузы", "Цифровые документы", "Прозрачные статусы"].map((item) => (
                                <span
                                    key={item}
                                    className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white"
                                >
                                    <Check className="h-4 w-4 text-blue-200" />
                                    {item}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="mx-auto w-full max-w-sm rounded-[1.5rem] bg-white p-3 lg:max-w-md">
                        <img
                            src={GUEST_ILLUSTRATIONS.logistics}
                            alt=""
                            className="aspect-square w-full rounded-[1.1rem] object-cover"
                        />
                    </div>
                </div>
            </section>

            <section className="grid gap-4 py-6 sm:grid-cols-3">
                {[
                    ["Москва ↔ Калининград", "ключевое направление"],
                    ["B2B", "логистика для бизнеса"],
                    ["Единое окно", "перевозка и документы"],
                ].map(([value, label]) => (
                    <div key={value} className="rounded-2xl bg-white px-6 py-5">
                        <div className="text-lg font-bold text-[#111827] sm:text-xl">{value}</div>
                        <div className="mt-1 text-sm text-[#6b7280]">{label}</div>
                    </div>
                ))}
            </section>

            <section className="rounded-[1.75rem] bg-white px-6 py-10 sm:px-10 sm:py-12">
                <div className="max-w-4xl">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2563eb]">Что мы делаем</p>
                    <h2 className="mt-3 text-2xl font-bold tracking-[-0.025em] text-[#111827] sm:text-4xl">
                        Логистика, которая работает как часть вашего бизнеса
                    </h2>
                    <p className="mt-5 text-base leading-relaxed text-[#4b5563] sm:text-lg">
                        HAULZ организует перевозки между двумя важными деловыми регионами России. Мы объединяем
                        транспорт, складские операции, сопровождение и электронные документы в управляемый процесс,
                        чтобы команда клиента тратила меньше времени на координацию и быстрее получала результат.
                    </p>
                </div>

                <div className="mt-9 grid gap-4 md:grid-cols-2">
                    {advantages.map(({ icon: Icon, title, text }) => (
                        <article key={title} className="rounded-2xl bg-[#f3f4f6] p-6">
                            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#2563eb] text-white">
                                <Icon className="h-5 w-5" />
                            </span>
                            <h3 className="mt-5 text-lg font-bold text-[#111827]">{title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-[#6b7280]">{text}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section className="my-6 rounded-[1.75rem] bg-[#dbeafe] px-6 py-10 sm:px-10 sm:py-12">
                <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-start">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1d4ed8]">Наш подход</p>
                        <h2 className="mt-3 text-2xl font-bold tracking-[-0.025em] text-[#111827] sm:text-3xl">
                            Один партнёр на всём пути груза
                        </h2>
                    </div>
                    <div className="grid gap-3">
                        {[
                            "Рассчитываем перевозку и согласовываем условия",
                            "Организуем забор, обработку и магистральную доставку",
                            "Показываем актуальные статусы движения груза",
                            "Формируем финансовые и закрывающие документы",
                        ].map((item, index) => (
                            <div key={item} className="flex items-start gap-4 rounded-2xl bg-white/70 p-4">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2563eb] text-sm font-bold text-white">
                                    {index + 1}
                                </span>
                                <p className="pt-1 text-sm font-semibold leading-relaxed text-[#1f2937] sm:text-base">{item}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {showWarehouses ? (
                <>
                    <h2 className="mb-4 text-2xl font-bold text-[#111827]">Склады HAULZ</h2>

                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "0.75rem" }}>
                        {GUEST_WAREHOUSE_ITEMS.map((warehouse) => (
                            <HaulzWarehousePanel
                                key={warehouse.city}
                                {...warehouse}
                                emailLabel={emailLabel}
                                websiteUrl={HAULZ_WEBSITE_URL}
                            />
                        ))}
                    </div>
                </>
            ) : null}
        </div>
    );
}
