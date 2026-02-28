import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/use-theme";
import { ThemeToggle } from "@/components/ThemeToggle";
import Home from "@/pages/Home";
import NotFound from "@/pages/not-found";
import { motion } from "framer-motion";
import { Activity, Zap } from "lucide-react";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="akaldeep-theme">
        <TooltipProvider>
          <div className="flex flex-col min-h-screen w-full bg-background transition-colors duration-300">
            {/* Premium Header */}
            <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card/80 backdrop-blur-lg z-50 shrink-0 sticky top-0">
              <motion.div
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center gap-3"
              >
                <div className="w-7 h-7 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center">
                  <Activity className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="flex flex-col">
                  <span className="font-display text-base leading-none tracking-wider text-foreground">
                    AKALDEEP
                  </span>
                  <span className="text-[9px] font-mono text-muted-foreground tracking-[0.15em] uppercase leading-none mt-0.5">
                    Risk Intelligence Terminal
                  </span>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center gap-4"
              >
                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[9px] font-mono text-green-500 tracking-wider uppercase">Live</span>
                </div>
                <div className="hidden md:flex items-center gap-1 text-[9px] font-mono text-muted-foreground tracking-widest uppercase">
                  <Zap className="w-3 h-3 text-primary" />
                  v1.0
                </div>
                <ThemeToggle />
              </motion.div>
            </header>

            <main className="flex-1 overflow-y-auto">
              <Router />
            </main>
            <Toaster />
          </div>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
