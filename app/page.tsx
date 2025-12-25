"use client";

import Link from "next/link";
import React, { useState, useEffect, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  Menu,
  X,
  Thermometer,
  Radio,
  Camera,
  MapPin,
} from "lucide-react";
import { SiLinkedin, SiGithub } from "react-icons/si";

import { Slot } from "@radix-ui/react-slot";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";
import { ExternalLink } from "lucide-react";
import Scene3D from "./components/Scene3D";
import Logo from "./LogoV3.png";

// Simple helper for composing conditional class names
function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(" ");
}

// Design system primitives: button, inputs, labels, cards

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border border-primary-border",
        destructive:
          "bg-destructive text-destructive-foreground border border-destructive-border",
        outline:
          "border [border-color:var(--button-outline)] shadow-xs active:shadow-none bg-background/70 backdrop-blur-md",
        secondary:
          "border bg-secondary text-secondary-foreground border border-secondary-border",
        ghost: "border border-transparent",
      },
      size: {
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 rounded-md px-3 text-xs",
        lg: "min-h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-background/80 backdrop-blur-md px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-background/80 backdrop-blur-md px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
);

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "shadcn-card rounded-3xl border bg-card/80 border-card-border/70 text-card-foreground shadow-[0_32px_120px_rgba(0,0,0,0.55)] backdrop-blur-2xl",
      className
    )}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6 pb-4", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "text-sm font-semibold leading-none tracking-[0.22em] uppercase text-white",
      className
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

// Static copy and configuration used across the landing page

const equipment = [
  {
    icon: Thermometer,
    title: "Environmental Sensors",
    description:
      "High-precision temperature, pressure, and humidity sensors rated for extreme conditions.",
  },
  {
    icon: Radio,
    title: "Radio Transmitter",
    description:
      "434 MHz LoRa transmitter for real-time telemetry data transmission up to 700km range.",
  },
  {
    icon: Camera,
    title: "Imaging System",
    description:
      "4K camera with UV filter for stunning high-altitude photography and video.",
  },
  {
    icon: MapPin,
    title: "GPS Tracker",
    description:
      "Multi-constellation GNSS receiver for precise position tracking and recovery.",
  },
];

const specs = [
  { label: "Balloon Material", value: "Latex (1200g)" },
  { label: "Payload Weight", value: "1.5 kg max" },
  { label: "Max Altitude", value: "40+ km" },
  { label: "Ascent Rate", value: "5 m/s" },
  { label: "Flight Duration", value: "2-3 hours" },
  { label: "Burst Diameter", value: "10+ meters" },
];

const SCENE_LABELS = [
  "Weather Voyager",
  "Global Fleet",
  "Weather Layers",
  "Explore World",
  "Touchdown",
];

// Top navigation bar and mobile quick-links drawer

function Navigation({ scrollProgress }: { scrollProgress: number }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const hasScrolled = scrollProgress > 0.02;

  const scrollToSection = (href: string) => {
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setMobileMenuOpen(false);
  };

  const quickLinks = [
    {
      label: "Go to Balloon Explorer",
      href: "/windmap",
      testId: "menu-explorer",
    },
    {
      label: "LinkedIn",
      href: "https://linkedin.com/in/tejaskoti",
      testId: "menu-linkedin",
    },
    {
      label: "GitHub",
      href: "https://github.com/tejaskoti",
      testId: "menu-github",
    },
  ];

  return (
    <>
      <motion.header
        className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.3 }}
      >
        <div className="w-full max-w-7xl px-6 pt-6">
          <div
            className={cn(
              "pointer-events-auto flex items-center justify-between rounded-full border backdrop-blur-xl px-5 sm:px-7 py-3 transition-all",
              hasScrolled
                ? "bg-white/10 border-white/30 shadow-[0_18px_80px_rgba(0,0,0,0.7)]"
                : "bg-white/8 border-white/20 shadow-[0_22px_90px_rgba(0,0,0,0.85)]"
            )}
          >
            <button
              onClick={() => scrollToSection("#hero")}
              className="flex items-center gap-3"
              data-testid="link-logo"
            >
              <div className="w-9 h-9 rounded-full bg-white/15 backdrop-blur flex items-center justify-center overflow-hidden">
                <img
                  src={Logo.src}
                  alt="WeatherVoyager logo"
                  className="w-7 h-7 object-contain"
                />
              </div>
              <span className="font-sans font-extrabold text-white text-xs sm:text-sm tracking-[0.26em] uppercase">
                WEATHER·VOYAGER
              </span>
            </button>

            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white hover:bg-white/20 transition-colors"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              data-testid="button-mobile-menu"
            >
              {mobileMenuOpen ? (
                <X className="w-4 h-4" />
              ) : (
                <Menu className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </motion.header>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            className="fixed inset-0 z-40 flex items-start justify-center pt-24 bg-black/40 backdrop-blur-3xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileMenuOpen(false)}
          >
            <motion.div
              className="w-full max-w-3xl mx-4 rounded-3xl border border-white/30 bg-white/10 backdrop-blur-2xl p-8 text-white shadow-[0_32px_120px_rgba(0,0,0,0.85)]"
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-[10px] tracking-[0.35em] uppercase text-white/60 mb-4">
                Quick Links
              </div>

              <div>
                {quickLinks.map((link) => {
                  const isExternal = link.href.startsWith("http");

                  if (isExternal) {
                    return (
                      <a
                        key={link.label}
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        data-testid={link.testId}
                        className="block mb-3 last:mb-0"
                      >
                        <button className="w-full flex items-center justify-between rounded-2xl bg-white/10 hover:bg-white/20 border border-white/25 px-5 py-4 text-sm transition-colors">
                          <span className="font-medium text-white/90">
                            {link.label}
                          </span>
                          <ExternalLink className="w-4 h-4 text-white/60 shrink-0" />
                        </button>
                      </a>
                    );
                  }

                  return (
                    <Link
                      key={link.label}
                      href={link.href}
                      data-testid={link.testId}
                      className="block mb-3 last:mb-0"
                    >
                      <button className="w-full flex items-center justify-between rounded-2xl bg-white/10 hover:bg-white/20 border border-white/25 px-5 py-4 text-sm transition-colors">
                        <span className="font-medium text-white/90">
                          {link.label}
                        </span>
                        <ExternalLink className="w-4 h-4 text-white/60 shrink-0" />
                      </button>
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// Reusable animated glass info block used in multiple sections

function InfoCard({
  title,
  children,
  direction = "left",
  delay = 0,
  className = "",
}: {
  title: string;
  children: ReactNode;
  direction?: "left" | "right";
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={cn(
        "relative max-w-xl rounded-3xl bg-white/8 border border-white/35 shadow-[0_40px_120px_rgba(0,0,0,0.7)] backdrop-blur-2xl p-8 text-left overflow-hidden",
        className
      )}
      initial={{
        opacity: 0,
        x: direction === "left" ? -50 : 50,
      }}
      whileInView={{
        opacity: 1,
        x: 0,
      }}
      transition={{
        duration: 0.8,
        delay,
        ease: "easeOut",
      }}
      viewport={{ once: true, amount: 0.6 }}
    >
      <div className="relative z-10">
        <h3 className="text-sm font-semibold text-white/90 mb-4 tracking-[0.25em] uppercase">
          {title}
        </h3>
        <div className="text-white/90 text-base leading-relaxed">{children}</div>
      </div>
    </motion.div>
  );
}

// Right-hand altitude rail that reflects scroll progress through scenes

function AltitudeRail({ scrollProgress }: { scrollProgress: number }) {
  const activeIndex = Math.round(scrollProgress * (SCENE_LABELS.length - 1));

  const scrollToSection = (id: string) => {
    const el = document.querySelector(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const sectionIds = [
    "#hero",
    "#troposphere",
    "#stratosphere",
    "#mesosphere",
    "#thermosphere",
  ];

  return (
    <div className="fixed right-6 lg:right-10 top-1/2 -translate-y-1/2 z-40 flex flex-col items-end gap-4">
      <div className="flex flex-col items-end gap-4 text-xs text-white/60">
        <div className="flex items-center gap-3">
          <div className="flex flex-col justify-between h-64 mr-1">
            {SCENE_LABELS.map((label, idx) => {
              const isActive = idx === activeIndex;
              return (
                <button
                  key={label}
                  onClick={() => scrollToSection(sectionIds[idx])}
                  className={cn(
                    "text-right transition-colors",
                    isActive ? "text-white font-medium" : "text-white/50"
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="relative h-64 w-px bg-white/20 rounded-full overflow-hidden">
            <motion.div
              className="absolute left-0 bottom-0 w-full bg-white rounded-full"
              style={{
                height: `${(1 - scrollProgress) * 100}%`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// LinkedIn call-to-action pill that appears after you reach the bottom

function LinkedInFooterPill({ scrollProgress }: { scrollProgress: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    if (scrollProgress >= 0.99) {
      if (!visible) {
        timeout = setTimeout(() => {
          setVisible(true);
        }, 1000);
      }
    } else {
      if (visible) {
        setVisible(false);
      }
    }

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [scrollProgress, visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-x-0 bottom-4 z-50 flex justify-center pointer-events-none"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
        >
          <a
            href="https://linkedin.com/in/tejaskoti"
            target="_blank"
            rel="noreferrer"
            className="pointer-events-auto inline-flex items-center gap-3 rounded-full bg-white text-slate-900 px-5 py-3 shadow-[0_20px_60px_rgba(15,23,42,0.85)] border border-slate-200"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-white">
              <SiLinkedin className="w-3.5 h-3.5" />
            </span>
            <div className="flex flex-col">
              <span className="text-[10px] tracking-[0.3em] uppercase font-semibold">
                Connect
              </span>
              <span className="text-xs font-medium">LinkedIn · Tejas Koti</span>
            </div>
          </a>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Root landing page tying together the 3D scene and scroll-driven story

export default function LandingPage() {
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const scrollHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollHeight > 0 ? window.scrollY / scrollHeight : 0;
      setScrollProgress(Math.min(Math.max(progress, 0), 1));
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    html.classList.add("no-scrollbar");
    body.classList.add("no-scrollbar");

    return () => {
      html.classList.remove("no-scrollbar");
      body.classList.remove("no-scrollbar");
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function warmBalloonHistory() {
      try {
        const res = await fetch("/api/balloon-history");
        if (!res.ok) throw new Error(`API returned ${res.status}`);

        await res.json();

        if (!cancelled) {
          console.log("[Landing] Preloaded balloon history");
        }
      } catch (err) {
        console.error("[Landing] Warmup failed", err);
      }
    }

    warmBalloonHistory();

    return () => {
      cancelled = true;
    };
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.querySelector(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen">
      <Scene3D scrollProgress={scrollProgress} />
      <Navigation scrollProgress={scrollProgress} />
      <AltitudeRail scrollProgress={scrollProgress} />

      <main className="relative z-10">
        <section
          id="hero"
          className="min-h-screen flex items-center justify-center px-4"
        >
          <div className="text-center max-w-4xl">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.5 }}
            >
              <span className="inline-block text-white/70 text-xs tracking-[0.4em] uppercase mb-4">
                Live Balloon Network
              </span>
            </motion.div>

            <motion.h1
              className="font-serif text-5xl md:text-7xl lg:text-7xl font-bold mb-6 leading-tight drop-shadow-[0_0_40px_rgba(0,0,0,0.7)]"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.7 }}
            >
              <span className="bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
                Weather Exploration
              </span>
              <br />
              <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                From the Edge of Space
              </span>
            </motion.h1>

            <motion.p
              className="text-xl md:text-2xl text-white/85 max-w-2xl mx-auto mb-12 drop-shadow-[0_0_30px_rgba(0,0,0,0.6)]"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.9 }}
            >
              Follow WindBorne&apos;s high-altitude weather balloons as they
              drift across the globe in real time. Live positions, altitudes,
              and atmosphere data, all choreographed with this descent from
              space back to the weather we feel.
            </motion.p>

              <motion.button
                onClick={() => {
                  const el = document.querySelector("#troposphere");
                  if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                  }
                }}
                className="group flex flex-col items-center gap-3 mx-auto text-white"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1, delay: 1.3 }}
                data-testid="button-begin-descent"
              >
              <span className="text-[11px] tracking-[0.35em] uppercase">
                Begin Descent
              </span>
              <div className="px-6 py-3 rounded-full bg-white/10 border border-white/30 backdrop-blur-md group-hover:bg-white/20 transition-colors">
                <span className="text-xs tracking-[0.3em] uppercase">
                  Scroll to Explore
                </span>
              </div>
              <motion.div
                animate={{ y: [0, 8, 0] }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <ChevronDown className="w-4 h-4 opacity-80" />
              </motion.div>
            </motion.button>
          </div>
        </section>

        <section
          id="troposphere"
          className="min-h-[160vh] flex items-center px-4 py-32"
        >
          <div className="max-w-7xl mx-auto w-full grid md:grid-cols-2 gap-10 items-center">
            <div>
              <motion.span
                className="text-white/60 text-xs tracking-[0.35em] uppercase mb-3 block"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
              >
                Global Fleet
              </motion.span>

              <motion.h2
                className="font-serif text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 drop-shadow-[0_0_40px_rgba(0,0,0,0.8)]"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                viewport={{ once: true }}
              >
                Global Balloon Tracking
              </motion.h2>

              <motion.p
                className="text-white/85 text-lg md:text-xl leading-relaxed mb-8 max-w-xl"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                viewport={{ once: true }}
              >
                The interface visualizes the live positions of WindBorne&apos;s
                global weather balloon constellation. Each balloon reports
                latitude, longitude, and altitude on a fixed cadence, and the
                platform stitches those points into smooth, explorable 24-hour
                tracks.
              </motion.p>

              <motion.ul
                className="space-y-4 text-sm text-white/75"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                viewport={{ once: true }}
              >
                <li className="flex gap-3">
                  <span className="mt-1 h-5 w-5 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-[10px]">
                    1
                  </span>
                  <div>
                    <p className="font-medium text-white">
                      Live constellation overview
                    </p>
                    <p className="text-white/70">
                      See balloons moving across continents, oceans, and
                      atmospheric layers as the 3D scene glides from space
                      toward the weather.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-5 w-5 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-[10px]">
                    2
                  </span>
                  <div>
                    <p className="font-medium text-white">
                      Reconstructed 24-hour history
                    </p>
                    <p className="text-white/70">
                      Each track is smoothed for clarity so you can follow how a
                      balloon surfed the winds over the last day.
                    </p>
                  </div>
                </li>
              </motion.ul>
            </div>

            <div className="grid gap-5">
              <InfoCard title="Live Balloons in View" direction="right">
                <p className="font-mono text-4xl font-bold mb-2">1,200+</p>
                <p className="text-sm text-white/70">
                  Active points in the WindBorne network rendered in a single
                  viewport.
                </p>
              </InfoCard>

              <InfoCard title="Track History" direction="right" delay={0.1}>
                <p className="font-mono text-4xl font-bold mb-2">24 h</p>
                <p className="text-sm text-white/70">
                  Each path shows a full day of motion, reconstructed into
                  smooth, high-signal trails.
                </p>
              </InfoCard>

              <InfoCard title="Update Cadence" direction="right" delay={0.2}>
                <p className="font-mono text-4xl font-bold mb-2">Hourly</p>
                <p className="text-sm text-white/70">
                  Positions update on a fixed schedule, keeping the scene alive
                  without overwhelming the map.
                </p>
              </InfoCard>
            </div>
          </div>
        </section>

        <section
          id="stratosphere"
          className="min-h-[160vh] flex items-center px-4 py-32"
        >
          <div className="max-w-7xl mx-auto w-full grid md:grid-cols-2 gap-10 items-center">
            <div className="md:order-2">
              <motion.span
                className="text-white/60 text-xs tracking-[0.35em] uppercase mb-3 block"
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
              >
                Weather Layers
              </motion.span>

              <motion.h2
                className="font-serif text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 drop-shadow-[0_0_40px_rgba(0,0,0,0.8)]"
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                viewport={{ once: true }}
              >
                Atmospheric Weather Integration
              </motion.h2>

              <motion.p
                className="text-white/85 text-lg md:text-xl leading-relaxed mb-8 max-w-xl"
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                viewport={{ once: true }}
              >
                Every balloon is enriched with fresh weather data: temperature,
                wind speed, and wind direction pulled from high-resolution
                global models. The system batches lookups, caches results in
                Redis, and keeps the UI snappy even at scale.
              </motion.p>

              <motion.ul
                className="space-y-4 text-sm text-white/75"
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                viewport={{ once: true }}
              >
                <li className="flex gap-3">
                  <span className="mt-1 h-5 w-5 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-[10px]">
                    WX
                  </span>
                  <div>
                    <p className="font-medium text-white">
                      High-resolution weather fields
                    </p>
                    <p className="text-white/70">
                      Each coordinate is paired with modelled temperature, wind
                      speed, and direction for the balloon&apos;s exact slice of
                      atmosphere.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-5 w-5 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-[10px]">
                    API
                  </span>
                  <div>
                    <p className="font-medium text-white">
                      Clustered API access
                    </p>
                    <p className="text-white/70">
                      Balloon locations are clustered and fetched in batches so
                      global weather calls stay fast and within rate limits.
                    </p>
                  </div>
                </li>
              </motion.ul>
            </div>

            <div className="space-y-6 md:order-1">
              <InfoCard title="Weather Enrichment" direction="left">
                <p className="text-sm text-white/75 mb-4">
                  Weather data is attached at ingest time, so every trail point
                  already knows the conditions it travelled through.
                </p>
                <div className="grid grid-cols-3 gap-3 text-center text-xs">
                  <div className="rounded-2xl bg-blue-500/15 border border-white/20 py-4">
                    <p className="font-mono text-xl font-semibold">Temp</p>
                    <p className="text-white/60 mt-1">°C at altitude</p>
                  </div>
                  <div className="rounded-2xl bg-emerald-500/15 border border-white/20 py-4">
                    <p className="font-mono text-xl font-semibold">Wind</p>
                    <p className="text-white/60 mt-1">Speed &amp; dir</p>
                  </div>
                  <div className="rounded-2xl bg-purple-500/15 border border-white/20 py-4">
                    <p className="font-mono text-xl font-semibold">Layers</p>
                    <p className="text-white/60 mt-1">Stacked views</p>
                  </div>
                </div>
              </InfoCard>

              <InfoCard title="Caching & Latency" direction="left" delay={0.15}>
                <p className="text-sm text-white/75 mb-3">
                  Redis keeps the hottest balloon + weather pairs in memory, so
                  the UI can feel instantaneous even when the data behind it
                  isn&apos;t.
                </p>
                <p className="font-mono text-3xl font-bold mb-1">ms, not s</p>
                <p className="text-xs text-white/60">
                  Requests are batched, deduped, and safely retried behind the
                  scenes.
                </p>
              </InfoCard>
            </div>
          </div>
        </section>

        <section
          id="mesosphere"
          className="min-h-[160vh] flex items-center px-4 py-32"
        >
          <div className="max-w-4xl mx-auto w-full text-center">
            <motion.span
              className="text-white/60 text-xs tracking-[0.35em] uppercase mb-3 block"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              Explore The World
            </motion.span>
            <motion.h2
              className="font-serif text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 drop-shadow-[0_0_40px_rgba(0,0,0,0.8)]"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              viewport={{ once: true }}
            >
              Immersive 3D &amp; 2D Exploration
            </motion.h2>
            <motion.p
              className="text-white/85 text-lg md:text-xl leading-relaxed mb-12 max-w-2xl mx-auto"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              viewport={{ once: true }}
            >
              Switch between a fully interactive 3D globe and a clean 2D map.
              Click a balloon to isolate it, replay its 24-hour track, and
              inspect the atmosphere it travelled through — all in the same
              dark, glassy interface.
            </motion.p>

            <div className="grid md:grid-cols-3 gap-6 mt-4">
              <InfoCard
                title="3D Globe"
                direction="left"
                className="text-center mx-auto"
              >
                <p className="text-sm text-white/75">
                  Rotate, zoom, and tilt around a lit Earth while the balloon
                  constellation orbits in real time.
                </p>
              </InfoCard>

              <InfoCard
                title="2D Map"
                direction="left"
                delay={0.1}
                className="text-center mx-auto"
              >
                <p className="text-sm text-white/75">
                  A pared-back map view for dense debugging and quick scanning,
                  perfectly in sync with the 3D scene.
                </p>
              </InfoCard>

              <InfoCard
                title="Focused Balloon"
                direction="left"
                delay={0.2}
                className="text-center mx-auto"
              >
                <p className="text-sm text-white/75">
                  Click a balloon to lock onto it, follow its trail, and read
                  its live weather profile over time.
                </p>
              </InfoCard>
            </div>
          </div>
        </section>

        <section
          id="thermosphere"
          className="min-h-screen flex items-center px-4 py-32"
        >
          <div className="max-w-7xl mx-auto w-full grid md:grid-cols-2 gap-12 items-center">
            <div>
              <motion.span
                className="text-white/60 text-xs tracking-[0.35em] uppercase mb-3 block"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
              >
                Touchdown
              </motion.span>

              <motion.h2
                className="font-serif text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 drop-shadow-[0_0_40px_rgba(0,0,0,0.8)]"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                viewport={{ once: true }}
              >
                Scalable, Data-Driven Architecture
              </motion.h2>

              <motion.p
                className="text-white/85 text-lg md:text-xl leading-relaxed mb-8 max-w-xl"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                viewport={{ once: true }}
              >
                Behind the visuals, the system ingests raw WindBorne snapshots,
                cleans malformed entries, clusters geographic cells, and
                orchestrates weather lookups with careful rate-limit handling.
                Next.js and Redis keep the whole experience smooth even as
                thousands of balloons come online.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                viewport={{ once: true }}
                className="space-y-4"
              >
                <a href="/windmap">
                  <button className="inline-flex items-center gap-3 rounded-full px-10 py-4 bg-white text-slate-950 text-xs font-semibold tracking-[0.3em] uppercase shadow-[0_24px_80px_rgba(15,23,42,0.9)] hover:bg-slate-100 transition-colors">
                    <span>Launch Live Balloon Explorer</span>
                  </button>
                </a>

                <p className="mt-4 text-xs text-white/60 max-w-sm">
                  This landing platform is where the 3D journey meets the real
                  product: live data, real balloons, and a stack tuned for both
                  reliability and play.
                </p>
              </motion.div>
            </div>

            <div className="space-y-6">
              <InfoCard title="Ingest & Cleaning" direction="right">
                <p className="text-sm text-white/75 mb-3">
                  Incoming &quot;treasure&quot; snapshots are validated,
                  cleaned, and deduped before they ever touch the UI.
                </p>
                <div className="grid grid-cols-3 gap-3 text-xs text-center">
                  <div className="rounded-2xl bg-emerald-500/10 border border-emerald-300/30 py-4">
                    <p className="font-mono text-xl font-semibold">✓</p>
                    <p className="text-white/60 mt-1">Malformed rows fixed</p>
                  </div>
                  <div className="rounded-2xl bg-blue-500/10 border border-blue-300/30 py-4">
                    <p className="font-mono text-xl font-semibold">Clusters</p>
                    <p className="text-white/60 mt-1">Geocell grouping</p>
                  </div>
                  <div className="rounded-2xl bg-purple-500/10 border border-purple-300/30 py-4">
                    <p className="font-mono text-xl font-semibold">Backoff</p>
                    <p className="text-white/60 mt-1">Safe rate-limits</p>
                  </div>
                </div>
              </InfoCard>

              <InfoCard title="Runtime Stack" direction="right" delay={0.15}>
                <p className="text-sm text-white/75 mb-3">
                  Next.js for the front-end, Redis for fast lookups, and a
                  pipeline that&apos;s designed for real-time feel without
                  real-time stress.
                </p>
                <p className="font-mono text-3xl font-bold mb-1">Thousands</p>
                <p className="text-xs text-white/60">
                  of balloon data points processed while the UI stays
                  butter-smooth.
                </p>
              </InfoCard>
            </div>
          </div>
        </section>
      </main>

      <LinkedInFooterPill scrollProgress={scrollProgress} />
    </div>
  );
}