import React from "react";
import { ArrowRight, Ship, Truck } from "lucide-react";
import { Button } from "../../components/shadcn/button";
import { cn } from "../../lib/cn";
import {
  GUEST_ROUTE_DIRECTIONS,
  type GuestRouteId,
} from "./guestRouteContent";

type Props = {
  onCalculator: () => void;
};

export function GuestRoutesSection({ onCalculator }: Props) {
  const [activeId, setActiveId] = React.useState<GuestRouteId>("mow_kgd");
  const [activeStageId, setActiveStageId] = React.useState(
    GUEST_ROUTE_DIRECTIONS[0].stages[0].id,
  );

  const route = GUEST_ROUTE_DIRECTIONS.find((item) => item.id === activeId) ?? GUEST_ROUTE_DIRECTIONS[0];
  const activeStage =
    route.stages.find((stage) => stage.id === activeStageId) ?? route.stages[0];

  const selectDirection = (id: GuestRouteId) => {
    setActiveId(id);
    const next = GUEST_ROUTE_DIRECTIONS.find((item) => item.id === id);
    if (next) setActiveStageId(next.stages[0].id);
  };

  return (
    <section className="guest-home-routes" aria-label="Направления HAULZ">
      <div className="guest-routes">
        <div className="guest-routes__intro">
          <p className="guest-section-title">Направления</p>
          <h2 className="guest-section-heading sm:text-2xl">Коридор Москва ↔ Калининград</h2>
          <p className="guest-section-lead guest-routes__lead">
            Один маршрут — два направления. Выберите сторону движения и пройдите этапы от забора до выдачи.
          </p>
        </div>

        <div className="guest-routes__switch" role="tablist" aria-label="Направление перевозки">
          {GUEST_ROUTE_DIRECTIONS.map((item) => {
            const selected = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={cn("guest-routes__switch-btn", selected && "is-active")}
                onClick={() => selectDirection(item.id)}
              >
                <span className="guest-routes__switch-codes">
                  {item.fromCode}
                  <ArrowRight className="h-3.5 w-3.5 opacity-70" aria-hidden />
                  {item.toCode}
                </span>
                <span className="guest-routes__switch-label">
                  {item.from} → {item.to}
                </span>
                <span className="guest-routes__switch-meta">{item.corridorLabel}</span>
              </button>
            );
          })}
        </div>

        <div className="guest-routes__board" data-direction={route.id}>
          <div className="guest-routes__map" aria-hidden>
            <div className="guest-routes__map-glow" />
            <div className="guest-routes__endpoint guest-routes__endpoint--from">
              <span className="guest-routes__endpoint-code">{route.fromCode}</span>
              <span className="guest-routes__endpoint-name">{route.from}</span>
            </div>
            <div className="guest-routes__spine">
              <span className="guest-routes__spine-line" />
              <span className="guest-routes__spine-pulse" />
              <span className="guest-routes__spine-modes">
                <Truck className="h-4 w-4" />
                <Ship className="h-4 w-4" />
              </span>
            </div>
            <div className="guest-routes__endpoint guest-routes__endpoint--to">
              <span className="guest-routes__endpoint-code">{route.toCode}</span>
              <span className="guest-routes__endpoint-name">{route.to}</span>
            </div>
          </div>

          <div className="guest-routes__body">
            <div className="guest-routes__focus">
              <p className="guest-routes__focus-text">{route.focus}</p>
              <p className="guest-routes__summary">{route.summary}</p>
              <div className="guest-routes__chips" aria-label="Режимы перевозки">
                {route.modes.map((mode) => (
                  <span key={mode} className="guest-routes__chip guest-routes__chip--mode">
                    {mode}
                  </span>
                ))}
              </div>
              <div className="guest-routes__chips" aria-label="Типы грузов">
                {route.cargo.map((item) => (
                  <span key={item} className="guest-routes__chip">
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="guest-routes__stages" role="tablist" aria-label="Этапы маршрута">
              {route.stages.map((stage, index) => {
                const selected = stage.id === activeStage.id;
                return (
                  <button
                    key={stage.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    className={cn("guest-routes__stage", selected && "is-active")}
                    onClick={() => setActiveStageId(stage.id)}
                  >
                    <span className="guest-routes__stage-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className="guest-routes__stage-title">{stage.title}</span>
                  </button>
                );
              })}
            </div>

            <div className="guest-routes__stage-panel" role="tabpanel">
              <h3 className="guest-routes__stage-panel-title">{activeStage.title}</h3>
              <p className="guest-routes__stage-panel-text">{activeStage.detail}</p>
              <ul className="guest-routes__features">
                {route.features.slice(0, 4).map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <Button className="guest-routes__cta" onClick={onCalculator}>
                Рассчитать это направление
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
