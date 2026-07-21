"use client";

import { useState } from "react";

export interface Slide {
  title: string;
  bullets: string[];
  speaker_note?: string;
}

export default function SlideViewer({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0);

  if (!slides || slides.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--slate)" }}>
        No slides for this session.
      </p>
    );
  }

  const slide = slides[index];

  return (
    <div className="flex flex-col gap-4">
      <div
        className="relative rounded-sm border px-10 py-12 flex flex-col justify-center min-h-[280px]"
        style={{ borderColor: "var(--line)", background: "#ffffff" }}
      >
        <span
          className="font-mono-tab absolute top-4 left-6 text-[11px]"
          style={{ color: "var(--brass)" }}
        >
          SLIDE {String(index + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}
        </span>
        <h3
          className="text-2xl mb-5"
          style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}
        >
          {slide.title}
        </h3>
        <ul className="space-y-2">
          {slide.bullets.map((b, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-snug">
              <span style={{ color: "var(--brass)" }}>—</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>

      {slide.speaker_note && (
        <div
          className="text-sm italic px-4 py-3 rounded-sm"
          style={{ background: "#EFEBE0", color: "var(--slate)" }}
        >
          Say: “{slide.speaker_note}”
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="font-mono-tab text-xs px-3 py-2 border rounded-sm disabled:opacity-30"
          style={{ borderColor: "var(--line)" }}
        >
          ← PREV
        </button>
        <div className="flex gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Go to slide ${i + 1}`}
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: i === index ? "var(--brass)" : "var(--line)",
              }}
            />
          ))}
        </div>
        <button
          onClick={() => setIndex((i) => Math.min(slides.length - 1, i + 1))}
          disabled={index === slides.length - 1}
          className="font-mono-tab text-xs px-3 py-2 border rounded-sm disabled:opacity-30"
          style={{ borderColor: "var(--line)" }}
        >
          NEXT →
        </button>
      </div>
    </div>
  );
}
