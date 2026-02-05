"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Trash2 } from "lucide-react";

interface SwipeableItemProps {
  children: React.ReactNode;
  onDelete: () => void;
}

const DELETE_THRESHOLD = -80;
const DELETE_ACTION_WIDTH = 72;

export function SwipeableItem({ children, onDelete }: SwipeableItemProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    currentXRef.current = translateX;
    setIsDragging(true);
  }, [translateX]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;

    const diff = e.touches[0].clientX - startXRef.current;
    const newTranslate = Math.min(0, Math.max(-DELETE_ACTION_WIDTH - 20, currentXRef.current + diff));
    setTranslateX(newTranslate);
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);

    if (translateX < DELETE_THRESHOLD) {
      setTranslateX(-DELETE_ACTION_WIDTH);
    } else {
      setTranslateX(0);
    }
  }, [translateX]);

  const handleDelete = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.style.transition = 'all 0.3s ease-out';
      containerRef.current.style.opacity = '0';
      containerRef.current.style.maxHeight = '0';
      containerRef.current.style.marginBottom = '0';
      containerRef.current.style.padding = '0';
    }
    setTimeout(onDelete, 300);
  }, [onDelete]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node) && translateX !== 0) {
        setTranslateX(0);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [translateX]);

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-lg"
    >
      {/* Delete action behind */}
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-red-500/90 rounded-r-lg transition-opacity"
        style={{
          width: DELETE_ACTION_WIDTH,
          opacity: translateX < -10 ? 1 : 0,
        }}
      >
        <button
          onClick={handleDelete}
          className="flex flex-col items-center justify-center w-full h-full text-white"
        >
          <Trash2 className="size-5" />
          <span className="text-xs mt-1">Remove</span>
        </button>
      </div>

      {/* Main content */}
      <div
        className="relative bg-card border rounded-lg touch-pan-y"
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isDragging ? 'none' : 'transform 0.2s ease-out',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
