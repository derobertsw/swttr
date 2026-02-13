"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Trash2, Ban, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SwipeAction {
  icon: React.ReactNode;
  label: string;
  color: string;
  onClick: () => void;
}

interface SwipeableItemProps {
  children: React.ReactNode;
  onDelete: () => void;
  onClick?: () => void;
  onToggleDisabled?: () => void;
  isDisabled?: boolean;
}

const ACTION_WIDTH = 64;
const SWIPE_THRESHOLD = -60;

export function SwipeableItem({
  children,
  onDelete,
  onClick,
  onToggleDisabled,
  isDisabled = false,
}: SwipeableItemProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);

  const hasToggle = !!onToggleDisabled;
  // When disabled, only show Enable button (single width)
  // When not disabled, show both Disable and Remove buttons (double width)
  const totalActionWidth = hasToggle && isDisabled ? ACTION_WIDTH : hasToggle ? ACTION_WIDTH * 2 : ACTION_WIDTH;

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      startXRef.current = e.touches[0].clientX;
      currentXRef.current = translateX;
      setIsDragging(true);
    },
    [translateX]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging) return;

      const diff = e.touches[0].clientX - startXRef.current;
      const newTranslate = Math.min(
        0,
        Math.max(-totalActionWidth - 20, currentXRef.current + diff)
      );
      setTranslateX(newTranslate);
    },
    [isDragging, totalActionWidth]
  );

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);

    if (translateX < SWIPE_THRESHOLD) {
      setTranslateX(-totalActionWidth);
    } else {
      setTranslateX(0);
    }
  }, [translateX, totalActionWidth]);

  const handleDelete = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.style.transition = "all 0.3s ease-out";
      containerRef.current.style.opacity = "0";
      containerRef.current.style.maxHeight = "0";
      containerRef.current.style.marginBottom = "0";
      containerRef.current.style.padding = "0";
    }
    setTimeout(onDelete, 300);
  }, [onDelete]);

  const handleToggleDisabled = useCallback(() => {
    setTranslateX(0);
    onToggleDisabled?.();
  }, [onToggleDisabled]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        translateX !== 0
      ) {
        setTranslateX(0);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [translateX]);

  return (
    <div ref={containerRef} className="relative overflow-hidden rounded-lg">
      {/* Actions behind */}
      <div
        className="absolute inset-y-0 right-0 flex items-stretch transition-opacity"
        style={{
          width: totalActionWidth,
          opacity: translateX < -10 ? 1 : 0,
        }}
      >
        {/* Toggle disabled action */}
        {hasToggle && (
          <button
            onClick={handleToggleDisabled}
            className={`flex flex-col items-center justify-center text-white ${
              isDisabled ? "bg-emerald-600/90 rounded-r-lg" : "bg-amber-500/90"
            }`}
            style={{ width: ACTION_WIDTH }}
          >
            {isDisabled ? (
              <Check className="size-5" />
            ) : (
              <Ban className="size-5" />
            )}
            <span className="text-[10px] mt-1">
              {isDisabled ? "Enable" : "Disable"}
            </span>
          </button>
        )}

        {/* Delete action - only show when not disabled */}
        {!isDisabled && (
          <button
            onClick={handleDelete}
            className="flex flex-col items-center justify-center bg-red-500/90 text-white rounded-r-lg"
            style={{ width: ACTION_WIDTH }}
          >
            <Trash2 className="size-5" />
            <span className="text-[10px] mt-1">Remove</span>
          </button>
        )}
      </div>

      {/* Main content */}
      <div
        className={cn(
          "relative rounded-xl border border-white/45 bg-[linear-gradient(120deg,rgba(246,251,255,0.86),rgba(232,241,249,0.8))] shadow-[0_6px_16px_rgba(11,20,35,0.14)] backdrop-blur-[1px] touch-pan-y",
          onClick ? "cursor-pointer" : "cursor-default"
        )}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isDragging ? "none" : "transform 0.2s ease-out",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => {
          if (translateX === 0 && onClick) {
            onClick();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
