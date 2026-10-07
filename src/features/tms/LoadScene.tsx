import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { LoadPlan, Vehicle, Placement } from "./model";
export const COLORS = [
  "#2563eb",
  "#059669",
  "#7c3aed",
  "#d97706",
  "#0891b2",
  "#db2777",
  "#4f46e5",
  "#65a30d",
];
const fmt = (n: number, d = 1) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: d });
export function LoadScene({
  plan,
  vehicle,
  estimatedTopLoadFactor = 2,
}: {
  plan: LoadPlan;
  vehicle: Vehicle;
  estimatedTopLoadFactor?: number;
}) {
  const host = useRef<HTMLDivElement>(null),
    sceneRef = useRef<{
      meshes: THREE.Mesh[];
      render: () => void;
      view: (v: string) => void;
    } | null>(null);
  const [active, setActive] = useState<string>(""),
    [cut, setCut] = useState(100),
    [shown, setShown] = useState(plan.placements.length);
  const [density, setDensity] = useState(false),
    [fullscreen, setFullscreen] = useState(false),
    [error, setError] = useState("");
  const maxHeight = Math.max(...vehicle.compartments.map((b) => b.height));
  const selected = plan.selected.find((c) => c.id === active);
  const estimated = plan.placements.some((p) => p.estimated);
  const center =
    plan.placements.reduce((s, p) => s + (p.z + p.height / 2) * p.weight, 0) /
    Math.max(
      1,
      plan.placements.reduce((s, p) => s + p.weight, 0),
    );
  useEffect(() => {
    setShown(plan.placements.length);
    setCut(100);
    setActive("");
  }, [plan]);
  useEffect(() => {
    if (!host.current) return;
    const el = host.current,
      scene = new THREE.Scene();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      setError("");
    } catch {
      setError(
        "3D недоступно в этом браузере. Ниже доступны координаты размещения.",
      );
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      "Интерактивный 3D-план загрузки",
    );
    renderer.domElement.tabIndex = 0;
    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 400);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 1;
    controls.maxDistance = 80;
    controls.listenToKeyEvents(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x475569, 2.5));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(5, 12, 8);
    scene.add(light);
    const offsets: number[] = [];
    let offset = 0;
    const dispose: Array<{ dispose: () => void }> = [];
    const geo = (l: number, h: number, w: number) => {
      const g = new THREE.BoxGeometry(l, h, w);
      dispose.push(g);
      return g;
    };
    vehicle.compartments.forEach((b) => {
      offsets.push(offset);
      const base = geo(b.length, 0.06, b.width),
        mat = new THREE.MeshStandardMaterial({
          color: 0xcbd5e1,
          roughness: 0.95,
        });
      dispose.push(mat);
      const floor = new THREE.Mesh(base, mat);
      floor.position.set(b.length / 2, -0.04, offset + b.width / 2);
      scene.add(floor);
      const wireGeo = new THREE.EdgesGeometry(geo(b.length, b.height, b.width));
      dispose.push(wireGeo);
      const wireMat = new THREE.LineBasicMaterial({
        color: 0x64748b,
        transparent: true,
        opacity: 0.5,
      });
      dispose.push(wireMat);
      const wire = new THREE.LineSegments(wireGeo, wireMat);
      wire.position.set(b.length / 2, b.height / 2, offset + b.width / 2);
      scene.add(wire);
      // A distinct door edge at the rear (x = length).
      const doorMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
      dispose.push(doorMat);
      const door = new THREE.Mesh(geo(0.055, 0.035, b.width), doorMat);
      door.position.set(b.length, 0.005, offset + b.width / 2);
      scene.add(door);
      offset += b.width + 1.2;
    });
    const meshes = plan.placements.map((p) => {
      const index = plan.selected.findIndex((c) => c.id === p.cargoId);
      const mat = new THREE.MeshStandardMaterial({
        color: COLORS[index % COLORS.length],
        roughness: 0.7,
        transparent: true,
        opacity: p.estimated ? 0.7 : 1,
      });
      dispose.push(mat);
      const mesh = new THREE.Mesh(
        geo(
          Math.max(0.005, p.length - 0.015),
          Math.max(0.005, p.height - 0.015),
          Math.max(0.005, p.width - 0.015),
        ),
        mat,
      );
      mesh.position.set(
        p.x + p.length / 2,
        p.z + p.height / 2,
        offsets[p.compartment] + p.y + p.width / 2,
      );
      mesh.userData.placement = p;
      const edgeGeo = new THREE.EdgesGeometry(mesh.geometry);
      dispose.push(edgeGeo);
      const edgeMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.6,
      });
      dispose.push(edgeMat);
      mesh.add(new THREE.LineSegments(edgeGeo, edgeMat));
      if (p.pallet) {
        const wood = new THREE.MeshStandardMaterial({
          color: 0xb58a54,
          roughness: 1,
        });
        dispose.push(wood);
        const deck = new THREE.Mesh(
          geo(
            Math.max(0.005, p.length - 0.015),
            Math.min(0.09, p.height * 0.15),
            Math.max(0.005, p.width - 0.015),
          ),
          wood,
        );
        deck.position.y = -p.height / 2 + Math.min(0.09, p.height * 0.15) / 2;
        mesh.add(deck);
      }
      scene.add(mesh);
      return mesh;
    });
    const length = Math.max(...vehicle.compartments.map((b) => b.length)),
      width = offset - 1.2;
    controls.target.set(length / 2, maxHeight * 0.35, width / 2);
    const render = () => renderer.render(scene, camera);
    let currentView = "3d";
    const view = (v: string) => {
      currentView = v;
      const center = controls.target;
      const direction = new THREE.Vector3(
        ...((v === "top"
          ? [0, 1, 0.001]
          : v === "side"
            ? [0, 0.001, 1]
            : v === "doors"
              ? [1, 0.001, 0]
              : [0.55, 0.65, 0.85]) as [number, number, number]),
      ).normalize();
      const right = new THREE.Vector3()
        .crossVectors(new THREE.Vector3(0, 1, 0), direction)
        .normalize();
      const up = new THREE.Vector3().crossVectors(direction, right).normalize();
      const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      let distance = 1;
      for (const x of [0, length])
        for (const y of [0, maxHeight])
          for (const z of [0, width]) {
            const point = new THREE.Vector3(x, y, z).sub(center);
            distance = Math.max(
              distance,
              Math.abs(point.dot(right)) / (tangent * camera.aspect) +
                point.dot(direction),
              Math.abs(point.dot(up)) / tangent + point.dot(direction),
            );
          }
      camera.up.set(0, 1, 0);
      camera.position.copy(center).addScaledVector(direction, distance * 1.12);
      controls.update();
      render();
    };
    sceneRef.current = { meshes, render, view };
    const resize = () => {
      camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
      view(currentView);
    };
    resize();
    view("3d");
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    controls.addEventListener("change", render);
    let down = [0, 0];
    const pointerDown = (e: PointerEvent) => {
      down = [e.clientX, e.clientY];
    };
    const pointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const rect = el.getBoundingClientRect(),
        ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      const hit = ray.intersectObjects(
        meshes.filter((m) => m.visible),
        false,
      )[0];
      setActive(
        hit ? (hit.object.userData.placement as Placement).cargoId : "",
      );
    };
    el.addEventListener("pointerdown", pointerDown);
    el.addEventListener("pointerup", pointerUp);
    return () => {
      sceneRef.current = null;
      observer.disconnect();
      controls.dispose();
      dispose.forEach((x) => x.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      el.removeEventListener("pointerdown", pointerDown);
      el.removeEventListener("pointerup", pointerUp);
    };
  }, [plan, vehicle, maxHeight]);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.meshes.forEach((m, i) => {
      const p = plan.placements[i],
        mat = m.material as THREE.MeshStandardMaterial;
      m.visible =
        i < shown && p.z + p.height <= (maxHeight * cut) / 100 + 0.00001;
      const index = plan.selected.findIndex((c) => c.id === p.cargoId);
      mat.color.set(
        density
          ? new THREE.Color().setHSL(
              0.58 - Math.min(1, p.density / 1000) * 0.58,
              0.8,
              0.48,
            )
          : COLORS[index % COLORS.length],
      );
      mat.opacity =
        active && active !== p.cargoId ? 0.18 : p.estimated ? 0.7 : 1;
      mat.emissive.set(active === p.cargoId ? 0x223344 : 0x000000);
    });
    scene.render();
  }, [plan, active, cut, shown, density, maxHeight]);
  useEffect(() => {
    if (!fullscreen) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [fullscreen]);
  return (
    <div className={`tms-scene ${fullscreen ? "tms-scene-full" : ""}`}>
      <div className="tms-section-heading">
        <div>
          <h3>Объёмный план загрузки</h3>
          <p className="tms-muted">
            {estimated
              ? `Предварительная модель · ${estimatedTopLoadFactor > 0 ? `нагрузка сверху до ${estimatedTopLoadFactor} масс места — допущение` : "расчётные места только на полу"}`
              : "Габариты мест введены вручную"}{" "}
            · верх не переворачиваем
          </p>
        </div>
        <button onClick={() => setFullscreen(!fullscreen)}>
          {fullscreen ? "Свернуть" : "На весь экран"}
        </button>
      </div>
      <div className="tms-scene-tools">
        <div className="tms-tabs">
          {[
            ["3d", "3D"],
            ["top", "Сверху"],
            ["side", "Сбоку"],
            ["doors", "От дверей"],
          ].map(([v, t]) => (
            <button key={v} onClick={() => sceneRef.current?.view(v)}>
              {t}
            </button>
          ))}
        </div>
        <label>
          <input
            type="checkbox"
            checked={density}
            onChange={(e) => setDensity(e.target.checked)}
          />{" "}
          По плотности
        </label>
      </div>
      <div className="tms-scene-canvas" ref={host}>
        {error && <p role="alert">{error}</p>}
      </div>
      <div className="tms-scene-controls">
        <label>
          Срез по высоте · {fmt((maxHeight * cut) / 100, 2)} м
          <input
            aria-label="Срез по высоте"
            type="range"
            min="0"
            max="100"
            value={cut}
            onChange={(e) => setCut(+e.target.value)}
          />
        </label>
        <label>
          Показано мест · {shown} / {plan.placements.length}
          <input
            aria-label="Показано мест"
            type="range"
            min="0"
            max={plan.placements.length}
            value={shown}
            onChange={(e) => setShown(+e.target.value)}
          />
        </label>
      </div>
      <div className="tms-scene-summary">
        <span>
          Центр массы по высоте <b>{fmt(center, 2)} м</b>
        </span>
        <span>
          На полу{" "}
          <b>{plan.placements.filter((p) => p.z < 0.00001).length} мест</b>
        </span>
        <span>
          Верхние ярусы{" "}
          <b>{plan.placements.filter((p) => p.z > 0.00001).length} мест</b>
        </span>
        <span>
          Двери <b style={{ color: "#d97706" }}>оранжевая кромка</b>
        </span>
      </div>
      <div className="tms-scene-summary">
        {vehicle.compartments.map((b, i) => {
          const rows = plan.placements.filter((p) => p.compartment === i),
            mass = rows.reduce((s, p) => s + p.weight, 0);
          const x =
            rows.reduce((s, p) => s + (p.x + p.length / 2) * p.weight, 0) /
            Math.max(1, mass);
          const front = rows.reduce(
            (s, p) =>
              s +
              (p.weight * Math.max(0, Math.min(p.length, b.length / 2 - p.x))) /
                p.length,
            0,
          );
          return (
            <span key={i}>
              Кузов {i + 1} · масса {fmt(mass)} кг
              <b>
                Перед / зад: {fmt(front)} / {fmt(mass - front)} кг
              </b>
              <small>
                Центр массы: {fmt(x, 2)} м от передней стенки. Это распределение
                груза, не нагрузка на оси.
              </small>
            </span>
          );
        })}
      </div>
      <p className="tms-muted">
        Вращайте мышью или пальцем, приближайте колёсиком или двумя пальцами.{" "}
        {density ? "Синий — малая плотность, красный — от 1000 кг/м³." : ""}
      </p>
      <div className="tms-scene-cargo">
        <label>
          Выделить перевозку{" "}
          <select value={active} onChange={(e) => setActive(e.target.value)}>
            <option value="">Все перевозки</option>
            {plan.selected.map((c) => (
              <option key={c.id} value={c.id}>
                {c.number} · {c.customer}
              </option>
            ))}
          </select>
        </label>
        {selected && (
          <p>
            <b>{selected.number}</b> · {selected.receiver} ·{" "}
            {fmt(selected.weight!)} кг ·{" "}
            {fmt(selected.weight! / selected.volume!)} кг/м³
          </p>
        )}
      </div>
      <details className="tms-unresolved">
        <summary>Координаты и опоры · {plan.placements.length} мест</summary>
        <div className="tms-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Перевозка / место</th>
                <th>Кузов</th>
                <th>X / Y / Z, м</th>
                <th>Д × Ш × В, м</th>
                <th>Масса / плотность</th>
                <th>Опора</th>
                <th>Сверху, кг</th>
              </tr>
            </thead>
            <tbody>
              {plan.placements.map((p) => (
                <tr key={p.unit}>
                  <td>
                    {plan.selected.find((c) => c.id === p.cargoId)?.number}
                    <small>
                      {p.unit.split("/").slice(-2).join(" / ")}
                      {p.estimated ? " · оценка" : ""}
                      {p.pallet ? " · палета" : ""}
                    </small>
                  </td>
                  <td>{p.compartment + 1}</td>
                  <td>{[p.x, p.y, p.z].map((x) => fmt(x, 2)).join(" / ")}</td>
                  <td>
                    {[p.length, p.width, p.height]
                      .map((x) => fmt(x, 2))
                      .join(" × ")}
                  </td>
                  <td>
                    {fmt(p.weight)} кг / {fmt(p.density)} кг/м³
                  </td>
                  <td>{p.support ? `Место ${p.support}` : "Пол"}</td>
                  <td>
                    {fmt(p.topLoad)} / {fmt(p.maxTopLoad)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="tms-muted">
        Проверены границы модели, пересечения, полная опора и заданная нагрузка
        сверху. Крепление, совместимость груза и нагрузки на оси требуют
        отдельной проверки.
      </p>
    </div>
  );
}
