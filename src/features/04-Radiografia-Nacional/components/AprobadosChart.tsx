import { useEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";
import { hexbin as d3Hexbin } from "d3-hexbin";
import type { Hexbin, HexbinBin } from "d3-hexbin";

type Region = "approved" | "not";
type ExtendedBin = HexbinBin<[number, number]> & { region: Region };

export const AprobadosChart = () => {
  // ===== Config (ajusta a tus datos reales) =====
  const size = 600;     // tamaño base del SVG (para cálculo de posiciones)
  const hexSize = 10;   // tamaño de cada hexágono
  const totalAprobados = 2_224_200;
  const totalNoAprobados = 1_075_800;

  // proporción interior (aprobados)
  const approvedRatio = totalAprobados / (totalAprobados + totalNoAprobados);

  // Colores de los HEXÁGONOS
  const colors = useMemo(
    () => ({
      approved: "#D6F0A1", // interior (aprobados)
      not: "#A0579B",      // anillo (desaprobados)
      stroke: "#0d1321",   // borde de cada hex
    }),
    []
  );

  // ===== Refs / state =====
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);

  // ¿el mouse está dentro del SVG?
  const [inside, setInside] = useState(false);

  const [tooltip, setTooltip] = useState<{
    show: boolean;
    x: number;
    y: number;
    region: Region | null;
  }>({ show: false, x: 0, y: 0, region: null });

  const [tipSize, setTipSize] = useState<{ w: number; h: number }>({ w: 180, h: 56 });

  // Re-medir tooltip para clamping
  useEffect(() => {
    if (tooltip.show && tipRef.current) {
      const { offsetWidth, offsetHeight } = tipRef.current;
      if (offsetWidth && offsetHeight && (offsetWidth !== tipSize.w || offsetHeight !== tipSize.h)) {
        setTipSize({ w: offsetWidth, h: offsetHeight });
      }
    }
  }, [tooltip, tipSize.w, tipSize.h]);

  // ===== Dibujo D3 =====
  useEffect(() => {
    const cx = size / 2;
    const cy = size / 2;
    const circleR = size * 0.45;

    const svg = d3
      .select(svgRef.current)
      .attr("viewBox", `0 0 ${size} ${size}`); // sin background -> transparente

    const hexbin: Hexbin<[number, number]> = d3Hexbin<[number, number]>()
      .radius(hexSize)
      .extent([[0, 0], [size, size]]);

    // Malla regular
    const dx = Math.sqrt(3) * hexSize;
    const dy = 1.5 * hexSize;
    const rows = Math.ceil((circleR * 2) / dy);
    const cols = Math.ceil((circleR * 2) / dx);

    const points: [number, number][] = [];
    for (let row = -rows; row <= rows; row++) {
      const y = cy + row * dy;
      const offset = row % 2 !== 0 ? dx / 2 : 0;
      for (let col = -cols; col <= cols; col++) {
        const x = cx + col * dx + offset;
        const dx0 = x - cx, dy0 = y - cy;
        if (dx0 * dx0 + dy0 * dy0 <= (circleR - hexSize * 0.9) ** 2) {
          points.push([x, y]);
        }
      }
    }

    const binsBase = hexbin(points);
    // Orden del centro hacia afuera
    binsBase.sort((a, b) => {
      const da = (a.x - cx) ** 2 + (a.y - cy) ** 2;
      const db = (b.x - cx) ** 2 + (b.y - cy) ** 2;
      return da - db;
    });

    const approvedCount = Math.floor(binsBase.length * approvedRatio);
    const bins: ExtendedBin[] = binsBase.map((b, i) =>
      Object.assign(b, { region: i < approvedCount ? "approved" as const : "not" as const })
    );

    svg.selectAll("*").remove();
    const g = svg.append("g");

    // Eventos de entrada/salida del SVG (para alternar labels estáticos/dinámicos)
    svg
      .on("mouseenter", () => {
        setInside(true);
      })
      .on("mouseleave", () => {
        setInside(false);
        setTooltip(t => ({ ...t, show: false, region: null }));
      });

    const onEnter = (event: MouseEvent, d: ExtendedBin) => {
      const wrap = wrapRef.current; if (!wrap) return;
      const [px, py] = d3.pointer(event, wrap);
      setTooltip({ show: true, x: px, y: py, region: d.region });
    };
    const onMove = (event: MouseEvent, d: ExtendedBin) => {
      const wrap = wrapRef.current; if (!wrap) return;
      const [px, py] = d3.pointer(event, wrap);
      setTooltip(t => ({ ...t, x: px, y: py, region: d.region }));
    };
    const onLeaveHex = () => {
      setTooltip(t => ({ ...t, show: false, region: null }));
    };

    g.selectAll("path")
      .data(bins)
      .join("path")
      .attr("d", hexbin.hexagon())
      .attr("transform", d => `translate(${d.x},${d.y})`)
      .attr("fill", d => (d.region === "approved" ? colors.approved : colors.not))
      .attr("stroke", colors.stroke)
      .attr("stroke-width", 0.75)
      .attr("shape-rendering", "crispEdges")
      .on("mouseenter", onEnter)
      .on("mousemove", onMove)
      .on("mouseleave", onLeaveHex);

  }, [size, hexSize, approvedRatio, colors]);

  // ===== Tooltip dinámico (cuando el mouse está dentro) =====
  const nf = new Intl.NumberFormat("es-PE");
  const isApproved = tooltip.region === "approved";
  const labelValue = isApproved ? nf.format(totalAprobados) : nf.format(totalNoAprobados);
  const labelText  = isApproved ? "de aprobados" : "de desaprobados";

  // Medidas actuales del wrapper (por si el SVG se escala por CSS)
  const WRAP_W = wrapRef.current?.clientWidth ?? size;
  const WRAP_H = wrapRef.current?.clientHeight ?? size;
  const OFFSET = 12;

  // clamping dentro del wrapper (label dinámico)
  let left = tooltip.x + OFFSET;
  let top  = tooltip.y + OFFSET;
  const tipW = tipSize.w, tipH = tipSize.h;
  if (left + tipW > WRAP_W) left = WRAP_W - tipW - 2;
  if (left < 0) left = 0;
  if (top + tipH > WRAP_H) top = WRAP_H - tipH - 2;
  if (top < 0) top = 0;

  // ===== Posiciones de labels estáticos (cuando el mouse está fuera) =====
  // Círculo ideal en coordenadas base
  const cx = size / 2;
  const cy = size / 2;
  const r  = size * 0.45;

  // Factor de escala por si el SVG se redimensiona via CSS
  const sx = WRAP_W / size;
  const sy = WRAP_H / size;

  const marginOutside = 12; // px que saca el label fuera del borde del círculo

  // Aprobados: a la izquierda, un poco abajo
  const staticApproved = {
    left: (cx - r - marginOutside) * sx,
    top:  (cy + r * 0.10) * sy,
    transform: "translate(-100%, -50%)" as const, // anclamos borde derecho al punto
  };

  // Desaprobados: a la derecha, un poco arriba
  const staticNot = {
    left: (cx + r + marginOutside) * sx,
    top:  (cy - r * 0.10) * sy,
    transform: "translate(0, -50%)" as const, // anclamos borde izquierdo al punto
  };

  return (
    // importante para permitir que los labels salgan del SVG
    <div ref={wrapRef} className="relative overflow-visible">
      <svg
        ref={svgRef}
        width={size}
        height={size}
        className="max-w-full h-auto block bg-transparent"
        aria-label="Aprobados (interior) y no aprobados (anillo exterior)"
      />

      {/* === Labels estáticos cuando el mouse está fuera del SVG (pueden sobresalir) === */}
      {!inside && (
        <>
          <div
            className="absolute pointer-events-none"
            style={{ left: staticApproved.left, top: staticApproved.top, transform: staticApproved.transform }}
          >
            <div className="rounded-xl bg-pink-500 text-white shadow-[0_6px_0_#a94c6d]">
              <div className="font-bold text-lg px-4 pt-2">{nf.format(totalAprobados)}</div>
              <div className="text-sm px-4 pb-2 opacity-90">de aprobados</div>
            </div>
          </div>

          <div
            className="absolute pointer-events-none"
            style={{ left: staticNot.left, top: staticNot.top, transform: staticNot.transform }}
          >
            <div className="rounded-xl bg-white text-pink-600 shadow-[0_6px_0_#6db0d1]">
              <div className="font-bold text-lg px-4 pt-2">{nf.format(totalNoAprobados)}</div>
              <div className="text-sm px-4 pb-2 opacity-90">de desaprobados</div>
            </div>
          </div>
        </>
      )}

      {/* === Label dinámico cuando el mouse está dentro y sobre un hex === */}
      {inside && tooltip.show && tooltip.region && (
        <div
          ref={tipRef}
          className="absolute pointer-events-none"
          style={{ left, top, whiteSpace: "nowrap" }}
        >
          {isApproved ? (
            <div className="rounded-xl bg-pink-500 text-white shadow-[0_6px_0_#a94c6d]">
              <div className="font-bold text-lg px-4 pt-2">{labelValue}</div>
              <div className="text-sm px-4 pb-2 opacity-90">{labelText}</div>
            </div>
          ) : (
            <div className="rounded-xl bg-white text-pink-600 shadow-[0_6px_0_#6db0d1]">
              <div className="font-bold text-lg px-4 pt-2">{labelValue}</div>
              <div className="text-sm px-4 pb-2 opacity-90">{labelText}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AprobadosChart;
