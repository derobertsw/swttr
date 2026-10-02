"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Trash2, Ban, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface SwipeableItemProps {
  children: React.ReactNode;
  onDelete: () => void;
  onClick?: () => void;
  onToggleDisabled?: () => void;
  isDisabled?: boolean;
  onSwipeOpen?: () => void;
}

const ACTION_WIDTH = 64;
const SWIPE_THRESHOLD = -60;

export function SwipeableItem({
  children,
  onDelete,
  onClick,
  onToggleDisabled,
  isDisabled = false,
  onSwipeOpen,
}: SwipeableItemProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);

  const hasToggle = !!onToggleDisabled;
  // Paused items only need a single re-include action.
  // Active items expose both pause and remove actions.
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
      onSwipeOpen?.();
    } else {
      setTranslateX(0);
    }
  }, [translateX, totalActionWidth, onSwipeOpen]);

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
    <div ref={containerRef} className="relative overflow-hidden rounded-card">
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
            className={cn(
              "flex flex-col items-center justify-center",
              isDisabled
                ? "rounded-r-card bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            )}
            style={{ width: ACTION_WIDTH }}
          >
            {isDisabled ? (
              <Check className="size-5" />
            ) : (
              <Ban className="size-5" />
            )}
            <span className="mt-1 text-xs font-medium">
              {isDisabled ? "Include" : "Pause"}
            </span>
          </button>
        )}

        {/* Delete action - only show when not disabled */}
        {!isDisabled && (
          <button
            onClick={handleDelete}
            className="flex flex-col items-center justify-center rounded-r-card bg-destructive text-destructive-foreground"
            style={{ width: ACTION_WIDTH }}
          >
            <Trash2 className="size-5" />
            <span className="mt-1 text-xs font-medium">Remove</span>
          </button>
        )}
      </div>

      {/* Main content */}
      <div
        className={cn(
          "relative touch-pan-y rounded-card border border-border bg-card text-card-foreground",
          onClick ? "cursor-pointer hover:border-input" : "cursor-default"
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
