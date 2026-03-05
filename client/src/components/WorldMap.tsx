import { useEffect, useRef, useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Graticule,
  Sphere,
  ZoomableGroup,
} from "react-simple-maps";
import { motion, AnimatePresence } from "framer-motion";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// India center and bbox
const INDIA_CENTER: [number, number] = [78.9629, 22.5937];
const WORLD_CENTER: [number, number] = [20, 10];

interface WorldMapProps {
  zoomed: boolean;
  analyzing: boolean;
  companyName?: string;
}

// Reticle that targets India
function TargetReticle({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, scale: 1.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="absolute pointer-events-none"
          style={{
            // India's approximate position in the default map
            left: "66%",
            top: "38%",
            transform: "translate(-50%, -50%)",
          }}
        >
          {/* Outer ring */}
          <motion.div
            className="absolute rounded-full border border-primary/60"
            style={{ width: 64, height: 64, top: -32, left: -32 }}
            animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.3, 0.6] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          {/* Inner ring */}
          <motion.div
            className="absolute rounded-full border-2 border-primary"
            style={{ width: 32, height: 32, top: -16, left: -16 }}
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          />
          {/* Crosshair lines */}
          {[0, 90, 180, 270].map((deg) => (
            <motion.div
              key={deg}
              className="absolute bg-primary/80"
              style={{
                width: 12, height: 1,
                top: 0, left: 6,
                transformOrigin: "left center",
                transform: `rotate(${deg}deg)`,
              }}
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: deg / 360 }}
            />
          ))}
          {/* Center dot */}
          <motion.div
            className="absolute w-1.5 h-1.5 rounded-full bg-primary"
            style={{ top: -3, left: -3 }}
            animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// HUD coordinate display
function HudOverlay({ zoomed, analyzing, companyName }: WorldMapProps) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(p => p + 1), 80);
    return () => clearInterval(t);
  }, []);

  const scanChar = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"][tick % 8];

  return (
    <div className="absolute inset-0 pointer-events-none font-mono select-none">
      {/* Top-left: coordinates */}
      <div className="absolute top-3 left-3 text-[9px] text-primary/40 space-y-0.5">
        <div>LAT {zoomed ? "20.5937°N" : "00.0000°N"}</div>
        <div>LON {zoomed ? "78.9629°E" : "00.0000°E"}</div>
        <div className="mt-1 text-primary/30">PROJ: NATURAL EARTH</div>
      </div>

      {/* Top-right: status */}
      <div className="absolute top-3 right-3 text-[9px] text-right space-y-0.5">
        {analyzing ? (
          <div className="text-primary flex items-center gap-1 justify-end">
            <span>{scanChar}</span>
            <span>ANALYZING TARGET</span>
          </div>
        ) : zoomed ? (
          <div className="text-emerald-400/60">TARGET ACQUIRED</div>
        ) : (
          <div className="text-primary/30">GLOBAL SCAN ACTIVE</div>
        )}
        <div className="text-primary/20">NSE / BSE INDICES</div>
        <div className="text-primary/20">REGION: SOUTH ASIA</div>
      </div>

      {/* Bottom-left: mission tag */}
      <div className="absolute bottom-3 left-3 text-[8px] text-primary/25 space-y-0.5">
        <div>AKALDEEP RISK INTEL v1.0</div>
        <div>DAMODARAN CLASSIFICATION ENGINE</div>
      </div>

      {/* Bottom-right: scale indicator */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1.5 text-[8px] text-primary/25">
        <div className="w-8 h-px bg-primary/25" />
        <span>{zoomed ? "500 KM" : "5000 KM"}</span>
      </div>

      {/* Scanning grid lines that sweep */}
      {analyzing && (
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent"
            animate={{ top: ["0%", "100%"] }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          />
        </motion.div>
      )}

      {/* Company name tag when zoomed */}
      <AnimatePresence>
        {zoomed && companyName && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 1 }}
            className="absolute text-[9px] text-primary/70 uppercase tracking-[0.2em]"
            style={{ left: "66%", top: "calc(38% + 40px)", transform: "translateX(-50%)" }}
          >
            ▲ {companyName}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function WorldMap({ zoomed, analyzing, companyName }: WorldMapProps) {
  const [mapCenter, setMapCenter] = useState<[number, number]>(WORLD_CENTER);
  const [mapZoom, setMapZoom] = useState(1);

  useEffect(() => {
    if (zoomed) {
      // Delay so user sees the transition
      const t = setTimeout(() => {
        setMapCenter(INDIA_CENTER);
        setMapZoom(4.5);
      }, 300);
      return () => clearTimeout(t);
    } else {
      setMapCenter(WORLD_CENTER);
      setMapZoom(1);
    }
  }, [zoomed]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Dark scanline overlay */}
      <div
        className="absolute inset-0 z-10 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, #000 2px, #000 4px)",
        }}
      />

      {/* Vignette */}
      <div
        className="absolute inset-0 z-10 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, transparent 40%, hsl(240,10%,4%) 90%)",
        }}
      />

      <ComposableMap
        projection="geoNaturalEarth1"
        projectionConfig={{ scale: 155, center: [0, 0] }}
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup
          center={mapCenter}
          zoom={mapZoom}
          // @ts-ignore — framer-motion style on SVG group
          style={{ transition: "all 1.8s cubic-bezier(0.16, 1, 0.3, 1)" }}
        >
          {/* Ocean */}
          <Sphere id="ocean-sphere" fill="hsl(240,15%,5%)" stroke="transparent" />

          {/* Lat/lon grid */}
          <Graticule stroke="hsl(240,8%,14%)" strokeWidth={0.4} />

          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const isIndia = geo.id === 356 || geo.properties?.name === "India";
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={isIndia ? "hsl(38,70%,22%)" : "hsl(240,8%,9%)"}
                    stroke={isIndia ? "hsl(38,92%,50%)" : "hsl(240,6%,18%)"}
                    strokeWidth={isIndia ? 0.8 : 0.3}
                    style={{
                      default: { outline: "none" },
                      hover: { outline: "none", fill: isIndia ? "hsl(38,80%,28%)" : "hsl(240,8%,13%)" },
                      pressed: { outline: "none" },
                    }}
                  />
                );
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>

      {/* India glow — positioned absolute over map */}
      <motion.div
        className="absolute pointer-events-none z-5"
        style={{
          left: "63%", top: "35%",
          width: 120, height: 100,
          background: "radial-gradient(ellipse at center, hsl(38,92%,50%,0.15) 0%, transparent 70%)",
          transform: "translate(-50%, -50%)",
        }}
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      <TargetReticle visible={zoomed || analyzing} />
      <HudOverlay zoomed={zoomed} analyzing={analyzing} companyName={companyName} />
    </div>
  );
}
