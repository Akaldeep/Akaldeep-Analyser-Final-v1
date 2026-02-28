import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, subYears, startOfDay } from "date-fns";
import { CalendarIcon, Loader2, Search, TrendingUp, BarChart3, ChevronRight } from "lucide-react";
import { motion, AnimatePresence, useInView } from "framer-motion";

import { useCalculateBeta } from "@/hooks/use-beta";
import { ResultsSection } from "@/components/ResultsSection";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

const FACTS = [
  { stat: "4,700+", label: "Indian equities classified" },
  { stat: "5Y", label: "Maximum lookback window" },
  { stat: "Real-time", label: "USD → INR conversion" },
  { stat: "10", label: "Peer comparables analyzed" },
];

const LOADING_STAGES = [
  "Fetching historical price data…",
  "Running beta regression model…",
  "Identifying peer comparables…",
  "Converting financials to INR…",
  "Computing valuation multiples…",
  "Finalizing analysis output…",
];

function LoadingState() {
  const [stage, setStage] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const stageTimer = setInterval(() => {
      setStage(s => Math.min(s + 1, LOADING_STAGES.length - 1));
    }, 1800);
    const progressTimer = setInterval(() => {
      setProgress(p => Math.min(p + 1.2, 95));
    }, 100);
    return () => { clearInterval(stageTimer); clearInterval(progressTimer); };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col items-center justify-center py-20 space-y-8"
    >
      {/* Animated ring */}
      <div className="relative w-20 h-20">
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-primary/20"
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute inset-0 rounded-full border-t-2 border-primary"
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <BarChart3 className="w-7 h-7 text-primary/70" />
        </div>
      </div>

      {/* Stage text */}
      <div className="text-center space-y-2">
        <AnimatePresence mode="wait">
          <motion.p
            key={stage}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
            className="font-mono text-sm text-muted-foreground tracking-wide"
          >
            {LOADING_STAGES[stage]}
          </motion.p>
        </AnimatePresence>
        <p className="font-mono text-xs text-muted-foreground/50 tracking-widest uppercase">
          {Math.round(progress)}% Complete
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-64 h-px bg-border overflow-hidden rounded-full">
        <motion.div
          className="h-full bg-primary"
          style={{ width: `${progress}%` }}
          transition={{ duration: 0.1 }}
        />
      </div>

      {/* Stats ticker */}
      <div className="flex items-center gap-8">
        {FACTS.map((fact, i) => (
          <motion.div
            key={fact.stat}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 + 0.3 }}
            className="text-center"
          >
            <div className="font-display text-xl text-primary leading-none">{fact.stat}</div>
            <div className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-widest mt-1">{fact.label}</div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

const formSchema = z.object({
  ticker: z.string().min(1, "Ticker is required"),
  exchange: z.enum(["NSE", "BSE"]),
  period: z.enum(["1Y", "3Y", "5Y"]),
  endDate: z.date(),
});
type FormValues = z.infer<typeof formSchema>;

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } }
};
const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } }
};

export default function Home() {
  const [showResults, setShowResults] = useState(false);
  const { mutate, isPending, data, error, reset: resetMutation } = useCalculateBeta();
  const heroRef = useRef(null);
  const heroInView = useInView(heroRef, { once: true });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { ticker: "", exchange: "NSE", period: "5Y", endDate: new Date() },
  });

  const onSubmit = (values: FormValues) => {
    setShowResults(false);
    resetMutation();
    const end = startOfDay(values.endDate);
    const years = parseInt(values.period[0]);
    const start = subYears(end, years);
    mutate(
      { ticker: values.ticker.toUpperCase(), exchange: values.exchange, period: values.period, startDate: start.toISOString(), endDate: end.toISOString() },
      { onSuccess: () => setShowResults(true) }
    );
  };

  return (
    <div className="min-h-screen">
      {/* Hero — only shown before first search */}
      <AnimatePresence>
        {!data && !isPending && (
          <motion.div
            ref={heroRef}
            variants={stagger}
            initial="hidden"
            animate={heroInView ? "show" : "hidden"}
            exit={{ opacity: 0, y: -30, transition: { duration: 0.35 } }}
            className="relative overflow-hidden border-b border-border"
          >
            {/* Background decoration */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full bg-primary/5 blur-3xl" />
              <div className="absolute top-0 left-1/3 w-px h-full bg-gradient-to-b from-transparent via-border to-transparent" />
              <div className="absolute top-0 left-2/3 w-px h-full bg-gradient-to-b from-transparent via-border to-transparent opacity-50" />
            </div>

            <div className="relative max-w-6xl mx-auto px-6 py-16 md:py-20">
              <motion.div variants={fadeUp} className="mb-3 flex items-center gap-2">
                <span className="h-px w-8 bg-primary" />
                <span className="text-[10px] font-mono text-primary uppercase tracking-[0.2em]">
                  Indian Equity Analytics
                </span>
              </motion.div>

              <motion.h2 variants={fadeUp} className="font-display text-5xl md:text-7xl lg:text-8xl text-foreground leading-none mb-6">
                INSTITUTIONAL<br />
                <span className="gold-shimmer">RISK INTELLIGENCE</span>
              </motion.h2>

              <motion.p variants={fadeUp} className="max-w-xl text-sm text-muted-foreground leading-relaxed mb-10 font-sans">
                Beta regression, peer discovery, and valuation multiples for 4,700+ listed Indian equities.
                Powered by real-time market data with live currency conversion.
              </motion.p>

              <motion.div variants={stagger} className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { val: "β", label: "Beta Regression", desc: "vs NIFTY 50 / SENSEX" },
                  { val: "4.7K+", label: "Peer Discovery", desc: "Damodaran classification" },
                  { val: "TTM", label: "Financials", desc: "Trailing 12-month data" },
                  { val: "FX", label: "USD → INR", desc: "Real-time conversion" },
                ].map((item) => (
                  <motion.div
                    key={item.val}
                    variants={fadeUp}
                    className="card-premium p-4 group cursor-default hover:border-primary/30 transition-all duration-300"
                  >
                    <div className="font-display text-3xl text-primary mb-1 group-hover:metric-glow transition-all">{item.val}</div>
                    <div className="text-xs font-semibold text-foreground mb-0.5">{item.label}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">{item.desc}</div>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">

        {/* Input Panel */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: data ? 0 : 0.4 }}
        >
          <div className="card-premium gradient-border">
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border bg-muted/30">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.18em]">
                Analysis Configuration
              </span>
            </div>
            <div className="p-5">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-wrap gap-4 items-end">
                  
                  <FormField control={form.control} name="ticker" render={({ field }) => (
                    <FormItem className="min-w-[160px] flex-1 space-y-1.5">
                      <FormLabel className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Stock Ticker</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                          <Input
                            placeholder="RELIANCE"
                            className="pl-8 h-9 font-mono text-sm font-medium uppercase input-premium bg-muted/40 border-border"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="exchange" render={({ field }) => (
                    <FormItem className="min-w-[120px] space-y-1.5">
                      <FormLabel className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Exchange</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-9 font-mono text-sm input-premium bg-muted/40 border-border">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="NSE" className="font-mono">NSE</SelectItem>
                          <SelectItem value="BSE" className="font-mono">BSE</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="period" render={({ field }) => (
                    <FormItem className="min-w-[140px] space-y-1.5">
                      <FormLabel className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Period</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-9 font-mono text-sm input-premium bg-muted/40 border-border">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1Y" className="font-mono">1 Year Daily</SelectItem>
                          <SelectItem value="3Y" className="font-mono">3 Year Daily</SelectItem>
                          <SelectItem value="5Y" className="font-mono">5 Year Daily</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="endDate" render={({ field }) => (
                    <FormItem className="min-w-[160px] flex-1 space-y-1.5">
                      <FormLabel className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground">End Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button variant="outline" className={cn(
                              "w-full h-9 justify-start font-mono text-sm input-premium bg-muted/40 border-border hover:bg-muted/60",
                              !field.value && "text-muted-foreground"
                            )}>
                              <CalendarIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground/60" />
                              {field.value ? format(field.value, "dd MMM yyyy") : "Select date"}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(d) => d > new Date()} initialFocus />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <Button
                    type="submit"
                    disabled={isPending}
                    className="h-9 px-6 bg-primary hover:bg-primary/90 text-primary-foreground font-mono text-[11px] uppercase tracking-[0.15em] font-medium transition-all duration-200 active:scale-[0.97] gap-2"
                  >
                    {isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>Run Analysis <ChevronRight className="h-3.5 w-3.5" /></>
                    )}
                  </Button>
                </form>
              </Form>
            </div>
          </div>
        </motion.div>

        {/* States */}
        <AnimatePresence mode="wait">
          {isPending && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <LoadingState />
            </motion.div>
          )}

          {error && !isPending && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-start gap-3 p-4 bg-destructive/8 border border-destructive/20 rounded-lg"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-destructive mt-1.5 shrink-0" />
              <div>
                <p className="text-xs font-mono font-medium text-destructive uppercase tracking-wide">Analysis Failed</p>
                <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
              </div>
            </motion.div>
          )}

          {showResults && data && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <ResultsSection data={data} />
            </motion.div>
          )}

          {!showResults && !isPending && !data && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-40 border border-dashed border-border rounded-lg"
            >
              <TrendingUp className="h-8 w-8 text-muted-foreground/30 mb-3" />
              <p className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-[0.2em]">
                Enter a ticker to begin analysis
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
