import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 10px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 24px -6px hsl(var(--glow) / 0.5)",
        "glow-lg": "0 0 50px -10px hsl(var(--glow) / 0.55)",
        "glow-sm": "0 0 14px -4px hsl(var(--glow) / 0.45)",
      },
      backgroundImage: {
        "gradient-brand": "linear-gradient(120deg, var(--g-purple), var(--g-magenta) 55%, var(--g-pink))",
        "gradient-ai": "linear-gradient(120deg, var(--g-purple), var(--g-blue) 50%, var(--g-cyan))",
        "gradient-radial": "radial-gradient(circle at center, var(--tw-gradient-stops))",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        indeterminate: {
          "0%": { transform: "translateX(-100%) scaleX(0.4)" },
          "50%": { transform: "translateX(20%) scaleX(0.7)" },
          "100%": { transform: "translateX(220%) scaleX(0.4)" },
        },
        "gradient-pan": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "glow-breathe": {
          "0%, 100%": { opacity: "0.5" },
          "50%": { opacity: "0.9" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(16px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        drift: {
          "0%, 100%": { transform: "translate3d(0, 0, 0) scale(1)" },
          "33%": { transform: "translate3d(2.5%, -3%, 0) scale(1.04)" },
          "66%": { transform: "translate3d(-2.5%, 2%, 0) scale(0.97)" },
        },
        "float-y": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.3s cubic-bezier(0.22, 1, 0.36, 1) both",
        "scale-in": "scale-in 0.22s cubic-bezier(0.22, 1, 0.36, 1) both",
        indeterminate: "indeterminate 1.5s ease-in-out infinite",
        "gradient-pan": "gradient-pan 6s ease infinite",
        "glow-breathe": "glow-breathe 3.5s ease-in-out infinite",
        "slide-up": "slide-up 0.28s cubic-bezier(0.22, 1, 0.36, 1) both",
        "slide-in-right": "slide-in-right 0.28s cubic-bezier(0.22, 1, 0.36, 1) both",
        drift: "drift 14s ease-in-out infinite",
        "float-y": "float-y 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
