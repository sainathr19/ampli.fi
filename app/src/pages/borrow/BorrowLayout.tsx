import { useRef } from "react";
import { useLocation, useOutlet } from "react-router-dom";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useAtomiqSwap } from "@/hooks/useAtomiqSwap";
import { BorrowSwapProvider } from "@/context/BorrowSwapContext";

/** Freeze the outlet element so the exiting page keeps its content during AnimatePresence exit. */
function FrozenOutlet() {
  const outlet = useOutlet();
  const frozen = useRef(outlet);
  // Update ref only when outlet identity changes (new route match)
  if (outlet !== frozen.current && outlet !== null) {
    frozen.current = outlet;
  }
  return frozen.current;
}

export function BorrowLayout() {
  const swapResult = useAtomiqSwap();
  const location = useLocation();

  return (
    <BorrowSwapProvider value={swapResult}>
      <LayoutGroup>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            <FrozenOutlet />
          </motion.div>
        </AnimatePresence>
      </LayoutGroup>
    </BorrowSwapProvider>
  );
}
