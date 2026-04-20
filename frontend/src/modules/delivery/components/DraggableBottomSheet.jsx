import React from "react";
import { motion } from "framer-motion";

/**
 * Draggable Bottom Sheet Component
 * Allows delivery person to drag down to expand map to 75% of screen
 */
const DraggableBottomSheet = ({ 
  children, 
  sheetHeight, 
  onDrag, 
  onDragEnd,
  onDragStart 
}) => {
  return (
    <motion.div
      className="flex-1 bg-white rounded-t-3xl shadow-[0_-8px_30px_-5px_rgba(0,0,0,0.15)] relative overflow-hidden flex flex-col"
      style={{ height: `${sheetHeight}vh` }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.1}
      dragMomentum={false}
      onDragStart={onDragStart}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      animate={{ height: `${sheetHeight}vh` }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
    >
      {/* Drag Handle */}
      <div className="flex justify-center py-3 cursor-grab active:cursor-grabbing">
        <div className="w-12 h-1.5 bg-slate-300 rounded-full" />
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-32">
        {children}
      </div>
    </motion.div>
  );
};

export default DraggableBottomSheet;
