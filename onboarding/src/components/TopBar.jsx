import { Globe } from "lucide-react";
import { motion } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LANGS = ["English", "\u0939\u093f\u0928\u094d\u0926\u0940", "Espa\u00f1ol", "Fran\u00e7ais", "Deutsch", "\u65e5\u672c\u8a9e"];

export const TopBar = ({ onLogoClick }) => {
  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-6 py-6 sm:px-10"
    >
      <button
        onClick={onLogoClick}
        className="wordmark text-2xl text-foreground/95 transition-opacity hover:opacity-80"
        aria-label="Vinaya home"
      >
        Vinaya
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="icon-btn grid h-10 w-10 place-items-center rounded-full text-foreground/80 hover:bg-foreground/10 hover:text-foreground"
            aria-label="Choose language"
          >
            <Globe className="h-5 w-5" strokeWidth={1.6} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-44 border-white/10 bg-popover/95 text-popover-foreground backdrop-blur-xl"
        >
          <DropdownMenuLabel className="text-muted-foreground">Language</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-white/10" />
          {LANGS.map((l) => (
            <DropdownMenuItem
              key={l}
              className="cursor-pointer focus:bg-primary/20 focus:text-foreground"
            >
              {l}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </motion.header>
  );
};
