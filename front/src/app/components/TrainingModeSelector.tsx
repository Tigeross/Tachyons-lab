"use client";

import React from "react";
import { TrainingMode } from "../types/cardTypes";

interface TrainingModeSelectorProps {
    mode: TrainingMode;
    onChange: (mode: TrainingMode) => void;
    className?: string;
}

export default function TrainingModeSelector({
    mode,
    onChange,
    className = "",
}: TrainingModeSelectorProps) {
    return (
        <div className={`w-full ${className}`}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="text-xl">⚙️</span>
                    <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                        Gameplay Mode
                    </h4>
                </div>
                <span
                    className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-colors duration-200 ${
                        mode === "independent"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700"
                            : "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 border border-blue-300 dark:border-blue-700"
                    }`}
                >
                    {mode === "independent" ? "⚡ Auto / AFK Active" : "🎮 Manual Active"}
                </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Manual Mode Card */}
                <button
                    type="button"
                    onClick={() => onChange("manual")}
                    className={`relative flex items-start gap-3.5 p-4 rounded-xl border-2 transition-all duration-200 text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
                        mode === "manual"
                            ? "border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 dark:border-blue-400 shadow-md scale-[1.01]"
                            : "border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50/80 dark:hover:bg-gray-750"
                    }`}
                >
                    <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 transition-colors ${
                            mode === "manual"
                                ? "bg-blue-500 text-white shadow-md shadow-blue-500/30"
                                : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                        }`}
                    >
                        🎮
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-base text-gray-900 dark:text-white">
                                Manual Training
                            </span>
                            {mode === "manual" && (
                                <span className="bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                                    CURRENT
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                            Standard manual gameplay. Optimized for multi-rainbow stacking, risk and stamina management, and deep scenario mechanics to achieve maximum stat ceilings.
                        </p>
                    </div>
                </button>

                {/* Independent Training (Auto/AFK) Card */}
                <button
                    type="button"
                    onClick={() => onChange("independent")}
                    className={`relative flex items-start gap-3.5 p-4 rounded-xl border-2 transition-all duration-200 text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
                        mode === "independent"
                            ? "border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 dark:border-emerald-400 shadow-md scale-[1.01]"
                            : "border-gray-200 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50/80 dark:hover:bg-gray-750"
                    }`}
                >
                    <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 transition-colors ${
                            mode === "independent"
                                ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/30"
                                : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                        }`}
                    >
                        ⚡
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-base text-gray-900 dark:text-white">
                                Independent Training (Auto/AFK)
                            </span>
                            {mode === "independent" && (
                                <span className="bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                                    CURRENT
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                            Background game simulation (自主トレ). Prioritizes run stability and bot error-proofing: Pal/Friend cards (energy), high Initial Stats, Race Bonus, and hints for Priority Skills / parent farming.
                        </p>
                    </div>
                </button>
            </div>
        </div>
    );
}
