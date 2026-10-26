import { useRef } from 'react';

export function useTwoFingerSwipe({ onSwipeLeft, onSwipeRight, disabled = false }) {
  const touchStartRef = useRef({ x: 0, y: 0, touches: 0 });

  const handleTouchStart = (e) => {
    touchStartRef.current = {
      x: e.touches.length === 2 
        ? (e.touches[0].clientX + e.touches[1].clientX) / 2 
        : e.touches[0].clientX,
      y: e.touches.length === 2 
        ? (e.touches[0].clientY + e.touches[1].clientY) / 2 
        : e.touches[0].clientY,
      touches: e.touches.length
    };
  };

  const handleTouchEnd = (e) => {
    if (disabled) return;
    if (touchStartRef.current.touches !== 2) return;

    const touchList = e.changedTouches;
    const endX = touchList.length >= 2 
      ? (touchList[0].clientX + touchList[1].clientX) / 2 
      : touchList[0].clientX;
    const endY = touchList.length >= 2 
      ? (touchList[0].clientY + touchList[1].clientY) / 2 
      : touchList[0].clientY;

    const deltaX = endX - touchStartRef.current.x;
    const deltaY = endY - touchStartRef.current.y;

    if (Math.abs(deltaX) > 55 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
      if (deltaX < 0 && onSwipeLeft) {
        onSwipeLeft();
      } else if (deltaX > 0 && onSwipeRight) {
        onSwipeRight();
      }
    }
  };

  return { onTouchStart: handleTouchStart, onTouchEnd: handleTouchEnd };
}