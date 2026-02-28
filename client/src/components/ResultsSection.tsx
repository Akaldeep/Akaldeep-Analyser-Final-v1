import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useInView, useMotionValue, useSpring } from "framer-motion";
import { type CalculateBetaResponse } from "@shared/schema";
import {
  TrendingUp, TrendingDown, Minus, Info, Download, Settings2,
  ArrowUpRight, ArrowDownRight, Activity, BarChart2, Target, Layers
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface ResultsSectionProps { data: CalculateBetaResponse; }

// Animated number counter
function AnimatedNumber({ value, format }: { value: number; format: (v: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { duration: 800, bounce: 0 });
  const inView = useInView(ref, { once: true });
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (inView) motionVal.set(value);
  }, [inView, value, motionVal]);

  useEffect(() => {
    const unsub = spring.on("change", (v) => setDisplay(format(v)));
    return unsub;
  }, [spring, format]);

  return <span ref={ref}>{display}</span>;
}

const METRICS_CONFIG = [
  { id: "marketCap", label: "Mkt Cap", category: "Size", format: (v: number) => `₹${(v / 10000000).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr` },
  { id: "revenue", label: "Revenue", category: "Size", format: (v: number) => `₹${(v / 10000000).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr` },
  { id: "enterpriseValue", label: "EV", category: "Size", format: (v: number) => `₹${(v / 10000000).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr` },
  { id: "evRevenueMultiple", label: "EV/Rev", category: "Valuation", format: (v: number) => `${v.toFixed(2)}x` },
  { id: "peRatio", label: "P/E", category: "Valuation", format: (v: number) => `${v.toFixed(1)}x` },
  { id: "pbRatio", label: "P/B", category: "Valuation", format: (v: number) => `${v.toFixed(2)}x` },
  { id: "dividendYield", label: "Div Yield", category: "Income", format: (v: number) => `${(v * 100).toFixed(2)}%` },
  { id: "ebitda", label: "EBITDA", category: "Profit", format: (v: number) => `₹${(v / 10000000).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr` },
  { id: "debtToEquity", label: "D/E", category: "Risk", format: (v: number) => v.toFixed(2) },
  { id: "profitMargin", label: "Margin", category: "Profit", format: (v: number) => `${(v * 100).toFixed(1)}%` },
  { id: "volatility", label: "Volatility", category: "Risk", format: (v: number) => `${(v * 100).toFixed(1)}%` },
  { id: "rSquared", label: "R²", category: "Risk", format: (v: number) => v.toFixed(3) },
];

const MetricInfo = ({ title, def }: { title: string; def: string }) => (
  <TooltipProvider>
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <button className="ml-1 text-muted-foreground/40 hover:text-primary transition-colors">
          <Info className="w-3 h-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[200px] p-3">
        <p className="text-[10px] font-mono font-medium text-primary uppercase tracking-wider mb-1">{title}</p>
        <p className="text-[10px] text-muted-foreground leading-relaxed">{def}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

function getBetaConfig(beta: number | null) {
  if (beta === null) return { label: "N/A", color: "text-muted-foreground", bg: "bg-muted/50", icon: Minus, ring: "ring-border" };
  if (beta > 1.2) return { label: "Aggressive", color: "text-red-500", bg: "bg-red-500/8", icon: TrendingUp, ring: "ring-red-500/30" };
  if (beta < 0.8) return { label: "Defensive", color: "text-emerald-500", bg: "bg-emerald-500/8", icon: TrendingDown, ring: "ring-emerald-500/30" };
  return { label: "Neutral", color: "text-primary", bg: "bg-primary/8", icon: Minus, ring: "ring-primary/30" };
}

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } }
};
const slideUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } }
};

export function ResultsSection({ data }: ResultsSectionProps) {
  const [visibleMetrics, setVisibleMetrics] = useState<string[]>(["marketCap", "revenue", "enterpriseValue", "evRevenueMultiple", "peRatio", "volatility"]);

  const toggleMetric = (id: string) => {
    setVisibleMetrics(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  };

  const exportToCSV = () => {
    const active = METRICS_CONFIG.filter(m => visibleMetrics.includes(m.id));
    const headers = ["#", "Company", "Ticker", "Industry", "Beta", ...active.map(m => m.label)];
    const rows = [
      ["0", data.name || data.ticker, data.ticker, "Target", data.beta.toFixed(3), ...active.map(m => {
        const v = (data as any)[m.id];
        return v != null ? m.format(v).replace(/[₹,]/g, '') : "-";
      })],
      ...data.peers.map((peer, i) => [
        (i + 1).toString(), peer.name, peer.ticker,
        peer.sector?.split(" > ")[1] || "N/A",
        peer.beta !== null ? peer.beta.toFixed(3) : "-",
        ...active.map(m => {
          const v = (peer as any)[m.id];
          return v != null ? m.format(v).replace(/[₹,]/g, '') : "-";
        })
      ])
    ];
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: `akaldeep_${data.ticker}_${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const validBetas = data.peers.map(p => p.beta).filter((b): b is number => b !== null);
  const avgBeta = validBetas.length > 0 ? validBetas.reduce((a, b) => a + b, 0) / validBetas.length : null;
  const sortedBetas = [...validBetas].sort((a, b) => a - b);
  const mid = Math.floor(sortedBetas.length / 2);
  const medianBeta = sortedBetas.length === 0 ? null : sortedBetas.length % 2 !== 0 ? sortedBetas[mid] : (sortedBetas[mid - 1] + sortedBetas[mid]) / 2;
  const betaCfg = getBetaConfig(data.beta);
  const BetaIcon = betaCfg.icon;
  const [, targetIndustry] = data.peers[0] ? (data.peers[0].sector || "").split(" > ") : ["", ""];

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5">

      {/* === PRIMARY CARD === */}
      <motion.div variants={slideUp} className="card-premium">
        {/* Header bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.18em]">Primary Asset</span>
          </div>
          <span className="font-mono text-[10px] text-muted-foreground/60 bg-muted px-2 py-0.5 rounded">{data.ticker}</span>
        </div>

        <div className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-start gap-8">
            {/* Company identity */}
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-3xl md:text-4xl text-foreground leading-none tracking-wide">
                  {(data.name || data.ticker).toUpperCase()}
                </h2>
                {data.sourceUrl && (
                  <a
                    href={data.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-full hover:bg-primary/10 text-muted-foreground/40 hover:text-primary transition-colors"
                    title="View on Yahoo Finance"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                  </a>
                )}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider">
                  vs {data.marketIndex}
                </span>
                <span className="w-1 h-1 rounded-full bg-border" />
                <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider">
                  {data.period || "5Y"} Daily
                </span>
              </div>
            </div>

            {/* BETA — hero number */}
            <div className={`flex items-center gap-5 px-6 py-5 rounded-lg border ring-1 ${betaCfg.bg} border-current/10 ${betaCfg.ring}`}>
              <div className={`font-display text-6xl md:text-7xl leading-none tracking-tight ${betaCfg.color} metric-glow`}>
                {data.beta.toFixed(3)}
              </div>
              <div className="flex flex-col gap-1">
                <div className={`flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest ${betaCfg.color}`}>
                  <BetaIcon className="w-3.5 h-3.5" />
                  {betaCfg.label}
                </div>
                <span className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-wider">Beta Coefficient</span>
              </div>
            </div>
          </div>

          {/* Metrics grid */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Market Cap", key: "marketCap", fmt: (v: number) => `₹${(v/10000000).toLocaleString('en-IN',{maximumFractionDigits:0})} Cr`, tip: "Total market value of outstanding shares." },
              { label: "Revenue (TTM)", key: "revenue", fmt: (v: number) => `₹${(v/10000000).toLocaleString('en-IN',{maximumFractionDigits:0})} Cr`, tip: "Trailing 12-month total revenue, converted to INR." },
              { label: "Enterprise Value", key: "enterpriseValue", fmt: (v: number) => `₹${(v/10000000).toLocaleString('en-IN',{maximumFractionDigits:0})} Cr`, tip: "Market cap + debt - cash." },
              { label: "Volatility (Ann.)", key: "volatility", fmt: (v: number) => `${(v*100).toFixed(1)}%`, tip: "Annualized standard deviation of daily returns." },
              { label: "Alpha (Daily)", key: "alpha", fmt: (v: number) => v.toFixed(5), tip: "Excess return vs CAPM prediction. Positive = outperformance." },
              { label: "R² Coefficient", key: "rSquared", fmt: (v: number) => v.toFixed(3), tip: "Proportion of price movement explained by the index." },
            ].map(({ label, key, fmt, tip }) => (
              <div key={key} className="bg-muted/30 rounded-md px-3 py-3 border border-border/50 hover:border-primary/20 transition-colors group">
                <div className="flex items-center text-[9px] font-mono text-muted-foreground/60 uppercase tracking-wider mb-1.5">
                  {label} <MetricInfo title={label} def={tip} />
                </div>
                <div className="font-mono text-sm font-medium text-foreground">
                  {(data as any)[key] != null ? fmt((data as any)[key]) : "—"}
                </div>
              </div>
            ))}
          </div>

          {/* Secondary metrics row */}
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Correlation", key: "correlation", fmt: (v: number) => v.toFixed(4) },
              { label: "P/E Ratio", key: "peRatio", fmt: (v: number) => `${v.toFixed(1)}x` },
              { label: "P/B Ratio", key: "pbRatio", fmt: (v: number) => `${v.toFixed(2)}x` },
              { label: "EBITDA", key: "ebitda", fmt: (v: number) => `₹${(v/10000000).toLocaleString('en-IN',{maximumFractionDigits:0})} Cr` },
            ].map(({ label, key, fmt }) => (
              <div key={key} className="flex items-center justify-between px-3 py-2.5 bg-muted/20 rounded-md border border-border/40">
                <span className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-wider">{label}</span>
                <span className="font-mono text-xs text-foreground font-medium">
                  {(data as any)[key] != null ? fmt((data as any)[key]) : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* === INDUSTRY BENCHMARK === */}
      <motion.div variants={slideUp} className="card-premium">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.18em]">Industry Benchmark</span>
          </div>
          {targetIndustry && (
            <span className="text-[9px] font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-sm uppercase tracking-wider">
              {targetIndustry}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
          {[
            {
              label: "Average Beta", value: avgBeta, desc: `Mean across ${data.peers.length} peers`,
              icon: <ArrowUpRight className="w-4 h-4" />,
              vs: avgBeta !== null ? (data.beta > avgBeta ? "above" : "below") : null,
            },
            {
              label: "Median Beta", value: medianBeta, desc: "Industry midpoint",
              icon: <Target className="w-4 h-4" />,
              vs: medianBeta !== null ? (data.beta > medianBeta ? "above" : "below") : null,
            }
          ].map(({ label, value, desc, icon, vs }) => (
            <div key={label} className="p-8 flex flex-col items-center gap-3">
              <span className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-[0.18em]">{label}</span>
              <div className="font-display text-5xl text-foreground">
                {value !== null ? value!.toFixed(3) : "—"}
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-[9px] font-mono text-muted-foreground/50">{desc}</span>
                {vs && (
                  <span className={`text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full ${vs === "above" ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-500"}`}>
                    Target is {vs} industry {label.split(" ")[0].toLowerCase()}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Beta distribution bar */}
        {validBetas.length > 0 && (
          <div className="px-6 pb-5 border-t border-border pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-wider">Peer Beta Distribution</span>
              <span className="text-[9px] font-mono text-muted-foreground/50">
                {Math.min(...validBetas).toFixed(2)} — {Math.max(...validBetas).toFixed(2)}
              </span>
            </div>
            <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
              {validBetas.map((b, i) => {
                const min = Math.min(...validBetas, data.beta) - 0.1;
                const max = Math.max(...validBetas, data.beta) + 0.1;
                const pct = ((b - min) / (max - min)) * 100;
                return (
                  <motion.div
                    key={i}
                    className="absolute top-0 w-0.5 h-full bg-border rounded-full"
                    style={{ left: `${pct}%` }}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ delay: i * 0.04 }}
                  />
                );
              })}
              {/* Target marker */}
              <motion.div
                className="absolute top-0 w-1 h-full bg-primary rounded-full z-10"
                style={{ left: `${((data.beta - (Math.min(...validBetas, data.beta) - 0.1)) / ((Math.max(...validBetas, data.beta) + 0.1) - (Math.min(...validBetas, data.beta) - 0.1))) * 100}%` }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ delay: 0.5, type: "spring" }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[8px] font-mono text-muted-foreground/40">Defensive</span>
              <span className="text-[8px] font-mono text-primary/60">▲ {data.ticker}</span>
              <span className="text-[8px] font-mono text-muted-foreground/40">Aggressive</span>
            </div>
          </div>
        )}
      </motion.div>

      {/* === PEER TABLE === */}
      <motion.div variants={slideUp} className="card-premium">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.18em]">
              Peer Comparables
            </span>
            <span className="text-[9px] font-mono text-muted-foreground/40 bg-muted px-1.5 py-0.5 rounded">
              {data.peers.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-[9px] font-mono uppercase tracking-wider gap-1.5 border-border bg-transparent hover:bg-muted/50">
                  <Settings2 className="w-3 h-3" /> Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">Visible Metrics</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {METRICS_CONFIG.map(m => (
                  <DropdownMenuCheckboxItem key={m.id} checked={visibleMetrics.includes(m.id)} onCheckedChange={() => toggleMetric(m.id)} className="text-xs font-mono">
                    {m.label} <span className="ml-auto text-[9px] text-muted-foreground/50">{m.category}</span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={exportToCSV} className="h-7 text-[9px] font-mono uppercase tracking-wider gap-1.5 border-border bg-transparent hover:bg-muted/50">
              <Download className="w-3 h-3" /> CSV
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table className="premium-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="w-9 pl-5 py-3 text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50">#</TableHead>
                <TableHead className="min-w-[180px] py-3 text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50">Company</TableHead>
                <TableHead className="text-right py-3 text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50">Beta</TableHead>
                <TableHead className="text-right py-3 text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50">Alpha</TableHead>
                {METRICS_CONFIG.filter(m => visibleMetrics.includes(m.id)).map(m => (
                  <TableHead key={m.id} className="text-right py-3 text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50 whitespace-nowrap">
                    {m.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.peers.map((peer, idx) => {
                const cfg = getBetaConfig(peer.beta);
                return (
                  <motion.tr
                    key={peer.ticker}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.04, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors cursor-default group"
                  >
                    <TableCell className="pl-5 py-3.5 font-mono text-[10px] text-muted-foreground/40 tabular-nums">
                      {idx + 1}
                    </TableCell>
                    <TableCell className="py-3.5">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground leading-tight">{peer.name}</span>
                          {peer.sourceUrl && (
                            <a
                              href={peer.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground/30 hover:text-primary transition-colors"
                            >
                              <ArrowUpRight className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-[9px] text-muted-foreground/50 uppercase tracking-wider">{peer.ticker}</span>
                          {peer.sector?.split(" > ")[1] && (
                            <span className="text-[8px] font-mono px-1 py-px bg-muted rounded-sm text-muted-foreground/50 uppercase tracking-wide">
                              {peer.sector.split(" > ")[1]}
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <span className={`font-mono text-sm font-medium ${cfg.color} tabular-nums`}>
                          {peer.beta !== null ? peer.beta.toFixed(3) : "—"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right py-3.5">
                      <span className="font-mono text-xs text-muted-foreground/70 tabular-nums">
                        {peer.alpha !== null && peer.alpha !== undefined ? peer.alpha.toFixed(5) : "—"}
                      </span>
                    </TableCell>
                    {METRICS_CONFIG.filter(m => visibleMetrics.includes(m.id)).map(m => (
                      <TableCell key={m.id} className="text-right py-3.5">
                        <span className="font-mono text-xs text-muted-foreground/70 tabular-nums whitespace-nowrap">
                          {(peer as any)[m.id] != null ? m.format((peer as any)[m.id]) : "—"}
                        </span>
                      </TableCell>
                    ))}
                  </motion.tr>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Footer note */}
        <div className="px-5 py-3 border-t border-border bg-muted/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[9px] font-mono text-muted-foreground/40 leading-relaxed">
              Statistical metrics derived from top "{data.peers.length}" peers in the "{targetIndustry || "Industry"}" industry by market cap proximity.
            </p>
            <p className="text-[9px] font-mono text-muted-foreground/40 leading-relaxed">
              Data sourced from Yahoo Finance API · Financials: TTM (Trailing Twelve Months) where applicable · Non-INR figures converted at live Yahoo Finance FX rates · Sorted by market cap
            </p>
          </div>
          <p className="text-[9px] font-mono text-muted-foreground/30 whitespace-nowrap">
            Methodology: Damodaran Industry Classification & Beta Estimation
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
