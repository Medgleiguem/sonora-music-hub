'use client';
import { useEffect } from 'react';
export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').then((registration) => registration.update()).catch(() => {});
  }, []);
  return null;
}
